"""test_schoology_sync_section.py -- unit tests for the P2 orchestration module.

Covers:
  - Scope resolution from an inline schedule-like dict
  - First run: plans N creates + M grade pushes
  - Second run (state populated): 0 creates + 0 pushes (idempotency)
  - Dry-run: no state mutation
  - Grades fixture: maps to the right cells

Runnable standalone:
    python tests/test_schoology_sync_section.py

ASCII only. LF line endings.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import types
import unittest

# ---------------------------------------------------------------------------
# Path setup -- reach the tools directory from wherever this file lives
# ---------------------------------------------------------------------------

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TESTS_DIR)
TOOLS_DIR = os.path.join(REPO_ROOT, "tools")
sys.path.insert(0, TOOLS_DIR)

import schoology_sync_lib as lib
from schoology_sync_section import (
    LocalJsonStateStore,
    PERIOD_LETTER,
    SECTION_FORCE_MP_DATE,
    SECTION_TO_COURSE_ID,
    StateStore,
    build_scope,
    sync_section,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

MINI_SCHEDULE = {
    "lessons": {
        "6.1": {"unit": 6, "worksheetKey": "1", "periods": {"B": "2026-03-02", "E": "2026-03-06"},
                "items": [{"itemId": "6.1", "source": "try-it"}]},
        "6.2": {"unit": 6, "worksheetKey": "2", "periods": {"B": "2026-03-02", "E": "2026-03-06"},
                "items": [{"itemId": "6.2", "source": "try-it"}]},
        "7.1": {"unit": 7, "worksheetKey": "1", "periods": {"B": None, "E": None}},
    },
    "topicAssessments": [
        {"itemId": "TA:U6", "source": "topic-assessment", "unit": 6, "periods": {"B": "2026-04-01", "E": "2026-04-03"}},
        {"itemId": "BL-U6-L1-DESK_DONE", "source": "flashcard", "unit": 6, "periods": {"B": "2026-04-05", "E": "2026-04-07"}},
    ],
}

# Expected scope for PeriodB from MINI_SCHEDULE:
# 6.1, 6.2 (lessons), TA:U6 (progress_check), BL-U6-L1-DESK_DONE (poster) = 4 items --
# PC/Poster keys share the component-mode PC:U{n}/POSTER:U{n} form.
EXPECTED_B_KEYS = {"6.1", "6.2", "TA:U6", "BL-U6-L1-DESK_DONE"}
EXPECTED_B_COUNT = 4


# ---------------------------------------------------------------------------
# Fake StateStore (in-memory, no file I/O)
# ---------------------------------------------------------------------------

class FakeStateStore(StateStore):
    def __init__(self):
        self._assignments = {}   # (section, key) -> dict
        self._last_synced = {}   # (student_id, assignment_key) -> value
        self.runs = []

    def get_assignment(self, section, lesson_key):
        return self._assignments.get((section, lesson_key))

    def upsert_assignment(self, section, lesson_key, fields):
        key = (section, lesson_key)
        existing = self._assignments.get(key, {})
        existing.update(fields)
        self._assignments[key] = existing

    def get_last_synced(self, student_id, assignment_key):
        return self._last_synced.get((student_id, assignment_key))

    def set_last_synced(self, student_id, assignment_key, value):
        self._last_synced[(student_id, assignment_key)] = value

    def log_run(self, summary):
        self.runs.append(summary)


# ---------------------------------------------------------------------------
# Fake ops module (simulates schoology_ops without CDP)
# ---------------------------------------------------------------------------

class FakeOps:
    """Injectable stand-in for schoology_ops.

    Records all write calls for assertions.  Returns plausible success
    payloads.  Uses a simple counter to generate assignment ids.
    """

    def __init__(
        self,
        students=None,
        existing_titles=None,
        marking_periods=None,
        add_ok=True,
        add_returns_id=True,
    ):
        # students: list of {studentId, rowIndex, name}
        self._students = students or [
            {"studentId": "S1", "rowIndex": 0, "name": "Alice"},
            {"studentId": "S2", "rowIndex": 1, "name": "Bob"},
        ]
        # existing_titles: set of titles already in Schoology (pre-existing)
        self._existing_titles = existing_titles or set()
        self._marking_periods = (
            {"MP1": {"start": "2026-01-01", "end": "2026-06-30"}}
            if marking_periods is None else marking_periods
        )
        self._add_ok = add_ok
        self._add_returns_id = add_returns_id
        self._id_counter = 100
        self.current_page = None
        self.page_history = []

        # Recorded calls (for assertions)
        self.created_assignments = []    # list of kwargs dicts
        self.written_grades = []         # list of (column_key, row_index, value)
        self.cdp = None                  # pretend cdp handle

    # -- CDP lifecycle (no-ops in tests) -----------------------------------
    def connect(self, reuse=True):
        return self.cdp

    def navigate(self, cdp, url):
        if url.endswith("/grades"):
            self.current_page = "gradebook"
        else:
            self.current_page = url
        self.page_history.append(self.current_page)

    def inject_helpers(self, cdp):
        pass

    def detect_login_state(self, cdp):
        self._require_page("gradebook", "detect_login_state")
        return "authenticated"

    def _require_page(self, page, operation):
        if self.current_page != page:
            raise AssertionError(
                f"{operation} requires {page}; current_page={self.current_page!r}"
            )

    # -- live-data reads ---------------------------------------------------
    def gradebook_url(self, course_id):
        return f"https://schoology.example.com/course/{course_id}/grades"

    def list_categories(self, cdp, course_id):
        self.current_page = "gradesetup"
        self.page_history.append(self.current_page)
        return {
            "Assignments": "CAT_LESSON",
            "Assessments": "CAT_QUIZ",
            "Posters": "CAT_POSTER",
            "Engagement": "CAT_BLOOKET",
            "Assessments": "CAT_PC",
        }

    def list_marking_periods(self, cdp, course_id):
        self.current_page = "add_form"
        self.page_history.append(self.current_page)
        return self._marking_periods

    def list_students(self, cdp):
        self._require_page("gradebook", "list_students")
        return self._students

    def list_assignments(self, cdp):
        self._require_page("gradebook", "list_assignments")
        return []

    # -- write operations --------------------------------------------------
    def find_assignment_id_by_title(self, cdp, title):
        self._require_page("gradebook", "find_assignment_id_by_title")
        if title in self._existing_titles:
            return f"EXISTING_{title.replace(' ', '_')}"
        return None

    def add_assignment(self, cdp, course_id, *, title, points=100, category_id,
                       grading_period_id, due_date=None, publish_scores=True,
                       sync_to_sis=True):
        self.current_page = "add_form"
        self.page_history.append(self.current_page)
        self._id_counter += 1
        assignment_id = f"ASGN_{self._id_counter}"
        self.created_assignments.append({
            "title": title,
            "course_id": course_id,
            "category_id": category_id,
            "grading_period_id": grading_period_id,
            "due_date": due_date,
            "assignment_id": assignment_id,
        })
        # Register so find_assignment_id_by_title returns it next time
        self._existing_titles.add(title)
        return {
            "ok": self._add_ok,
            "assignment_id": assignment_id if self._add_returns_id else None,
            "error": None if self._add_ok else "create not confirmed",
        }

    def read_grade_from_cell(self, cdp, column_key, row_index):
        self._require_page("gradebook", "read_grade_from_cell")
        return None

    def write_grade_to_cell(self, cdp, column_key, row_index, value):
        self._require_page("gradebook", "write_grade_to_cell")
        self.written_grades.append((column_key, row_index, value))
        return {"ok": True}


# ---------------------------------------------------------------------------
# Helper: build a tiny schedule file on disk for schedule-loading tests
# ---------------------------------------------------------------------------

def _write_schedule(tmpdir, schedule=None):
    path = os.path.join(tmpdir, "test-schedule.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(schedule or MINI_SCHEDULE, f)
    return path


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------

class TestBuildScope(unittest.TestCase):
    """build_scope correctly resolves scope from schedule data."""

    def test_periodB_item_count(self):
        items = build_scope(MINI_SCHEDULE, "PeriodB")
        keys = {item["key"] for item in items}
        self.assertEqual(keys, EXPECTED_B_KEYS)
        self.assertEqual(len(items), EXPECTED_B_COUNT)

    def test_periodE_includes_same_items_different_dates(self):
        items_b = build_scope(MINI_SCHEDULE, "PeriodB")
        items_e = build_scope(MINI_SCHEDULE, "PeriodE")
        keys_b = {item["key"] for item in items_b}
        keys_e = {item["key"] for item in items_e}
        # Same keys -- schedule has E dates for the same items
        self.assertEqual(keys_b, keys_e)
        # Dates differ
        dates_b = {item["key"]: item["due_date"] for item in items_b}
        dates_e = {item["key"]: item["due_date"] for item in items_e}
        self.assertNotEqual(dates_b["6.1"], dates_e["6.1"])

    def test_no_date_items_excluded(self):
        # 7.1 has null dates; 7.PC has null dates -> excluded
        items = build_scope(MINI_SCHEDULE, "PeriodB")
        keys = {item["key"] for item in items}
        self.assertNotIn("7.1", keys)
        self.assertNotIn("PC:U7", keys)

    def test_item_kinds_correct(self):
        items = build_scope(MINI_SCHEDULE, "PeriodB")
        by_key = {item["key"]: item for item in items}
        self.assertEqual(by_key["6.1"]["kind"], "try_it")
        self.assertEqual(by_key["TA:U6"]["kind"], "topic_assessment")
        self.assertEqual(by_key["BL-U6-L1-DESK_DONE"]["kind"], "flashcard")

    def test_items_sorted_by_date_then_key(self):
        items = build_scope(MINI_SCHEDULE, "PeriodB")
        dates = [item["due_date"] for item in items]
        self.assertEqual(dates, sorted(dates))


class TestFirstRunCreatesAssignments(unittest.TestCase):
    """First run: all scope items are in the 'create' bucket."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.schedule_path = _write_schedule(self.tmpdir)
        self.state = FakeStateStore()
        self.ops = FakeOps()

    def test_creates_all_scope_items(self):
        summary = sync_section(
            "PeriodB", "7945275782",
            dry_run=False,
            state=self.state,
            grades={},
            ops=self.ops,
            schedule_path=self.schedule_path,
        )
        self.assertEqual(summary["assignments_created"], EXPECTED_B_COUNT)
        self.assertEqual(len(self.ops.created_assignments), EXPECTED_B_COUNT)

    def test_assignments_recorded_in_state(self):
        sync_section(
            "PeriodB", "7945275782",
            dry_run=False,
            state=self.state,
            grades={},
            ops=self.ops,
            schedule_path=self.schedule_path,
        )
        for key in EXPECTED_B_KEYS:
            row = self.state.get_assignment("PeriodB", key)
            self.assertIsNotNone(row, f"state missing entry for key={key}")
            self.assertIsNotNone(row.get("schoology_assignment_id"))

    def test_run_summary_logged(self):
        sync_section(
            "PeriodB", "7945275782",
            dry_run=False,
            state=self.state,
            grades={},
            ops=self.ops,
            schedule_path=self.schedule_path,
        )
        self.assertEqual(len(self.state.runs), 1)
        self.assertEqual(self.state.runs[0]["section"], "PeriodB")


class TestIdempotencySecondRun(unittest.TestCase):
    """Second run with the same inputs: 0 creates + 0 grade pushes."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.schedule_path = _write_schedule(self.tmpdir)
        self.state = FakeStateStore()
        self.ops = FakeOps()

        # Grades fixture: two students, one lesson each
        self.grades = {
            ("S1", "6.1"): 88.0,
            ("S2", "6.2"): 75.0,
        }

    def _run(self):
        return sync_section(
            "PeriodB", "7945275782",
            dry_run=False,
            state=self.state,
            grades=self.grades,
            ops=self.ops,
            schedule_path=self.schedule_path,
        )

    def test_idempotency(self):
        # First run
        s1 = self._run()
        self.assertEqual(s1["assignments_created"], EXPECTED_B_COUNT)
        self.assertEqual(s1["grades_pushed"], 2)
        self.assertEqual(s1["grades_skipped"], 0)

        # Second run -- fresh ops to confirm no new CDP writes
        self.ops = FakeOps(
            existing_titles={a["title"] for a in self.ops.created_assignments}
        )
        s2 = self._run()

        self.assertEqual(s2["assignments_created"], 0,
                         "Second run must not create any assignments")
        self.assertEqual(s2["grades_pushed"], 0,
                         "Second run must not re-push identical grades")
        self.assertEqual(s2["grades_skipped"], 2,
                         "Second run must skip the already-pushed grades")

    def test_idempotency_no_new_cdp_writes_on_second_run(self):
        self._run()
        fresh_ops = FakeOps(
            existing_titles={a["title"] for a in self.ops.created_assignments}
        )
        self.ops = fresh_ops
        self._run()
        self.assertEqual(len(fresh_ops.created_assignments), 0)
        self.assertEqual(len(fresh_ops.written_grades), 0)


class TestDryRunNoStateMutation(unittest.TestCase):
    """Dry-run must not mutate state or perform any CDP writes."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.schedule_path = _write_schedule(self.tmpdir)
        self.state = FakeStateStore()
        self.ops = FakeOps()
        self.grades = {("S1", "6.1"): 90.0}

    def test_dry_run_no_assignments_created(self):
        summary = sync_section(
            "PeriodB", "7945275782",
            dry_run=True,
            state=self.state,
            grades=self.grades,
            ops=self.ops,
            schedule_path=self.schedule_path,
        )
        # ops records zero real CDP writes
        self.assertEqual(len(self.ops.created_assignments), 0)
        self.assertEqual(len(self.ops.written_grades), 0)

    def test_dry_run_no_state_mutation(self):
        sync_section(
            "PeriodB", "7945275782",
            dry_run=True,
            state=self.state,
            grades=self.grades,
            ops=self.ops,
            schedule_path=self.schedule_path,
        )
        # State store untouched
        self.assertEqual(self.state._assignments, {})
        self.assertEqual(self.state._last_synced, {})
        self.assertEqual(self.state.runs, [])

    def test_dry_run_summary_shows_zero_creates(self):
        summary = sync_section(
            "PeriodB", "7945275782",
            dry_run=True,
            state=self.state,
            grades=self.grades,
            ops=self.ops,
            schedule_path=self.schedule_path,
        )
        # assignments_created reflects what would have been created only after
        # actual creation; dry-run returns 0
        self.assertEqual(summary["assignments_created"], 0)


class TestLivePageNavigation(unittest.TestCase):
    """Live ops readers must be called from the page they scrape."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.schedule_path = _write_schedule(self.tmpdir)

    def test_reloads_gradebook_after_setup_readers(self):
        state = FakeStateStore()
        ops = FakeOps()
        sync_section(
            "PeriodB", "7945275782",
            dry_run=False,
            state=state,
            grades={},
            ops=ops,
            schedule_path=self.schedule_path,
            limit=1,
        )
        self.assertGreaterEqual(ops.page_history.count("gradebook"), 3)
        self.assertEqual(ops.current_page, "gradebook")


class TestMissingMarkingPeriod(unittest.TestCase):
    """A dated sync item with no matching MP must not submit a create form."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.schedule_path = _write_schedule(self.tmpdir)

    def test_missing_marking_period_skips_create(self):
        state = FakeStateStore()
        ops = FakeOps(marking_periods={
            "OLD": {"start": "2025-01-01", "end": "2025-06-30"},
        })
        summary = sync_section(
            "PeriodB", "7945275782",
            dry_run=False,
            state=state,
            grades={},
            ops=ops,
            schedule_path=self.schedule_path,
            limit=1,
        )
        self.assertEqual(summary["assignments_created"], 0)
        self.assertEqual(len(ops.created_assignments), 0)
        self.assertTrue(any("No grading_period_id" in e for e in summary["errors"]))


class TestBestEffortCreateConfirmation(unittest.TestCase):
    """A false negative create confirmation should reconcile by title."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.schedule_path = _write_schedule(self.tmpdir)

    def test_false_negative_create_records_visible_column(self):
        state = FakeStateStore()
        ops = FakeOps(add_ok=False, add_returns_id=False)
        summary = sync_section(
            "PeriodB", "7945275782",
            dry_run=False,
            state=state,
            grades={},
            ops=ops,
            schedule_path=self.schedule_path,
            limit=1,
        )
        row = state.get_assignment("PeriodB", "6.1")
        self.assertEqual(summary["assignments_created"], 1)
        self.assertEqual(summary["errors"], [])
        self.assertIsNotNone(row)
        self.assertEqual(row["schoology_assignment_id"], "EXISTING_6.1")


class TestGradesFixtureCellMapping(unittest.TestCase):
    """Grades fixture maps (student_id, lesson_key) to the right column + row."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.schedule_path = _write_schedule(self.tmpdir)
        self.state = FakeStateStore()
        self.ops = FakeOps(students=[
            {"studentId": "S1", "rowIndex": 0, "name": "Alice"},
            {"studentId": "S2", "rowIndex": 1, "name": "Bob"},
        ])
        self.grades = {
            ("S1", "6.1"): 95.0,
            ("S2", "6.1"): 82.0,
            ("S1", "6.2"): 78.0,
        }

    def test_correct_cells_written(self):
        sync_section(
            "PeriodB", "7945275782",
            dry_run=False,
            state=self.state,
            grades=self.grades,
            ops=self.ops,
            schedule_path=self.schedule_path,
        )
        # All three grade targets should have been pushed
        self.assertEqual(len(self.ops.written_grades), 3)

        # Row indices must match the student roster
        written_rows = {row_index for _, row_index, _ in self.ops.written_grades}
        self.assertIn(0, written_rows)   # S1
        self.assertIn(1, written_rows)   # S2

    def test_grade_values_correct(self):
        sync_section(
            "PeriodB", "7945275782",
            dry_run=False,
            state=self.state,
            grades=self.grades,
            ops=self.ops,
            schedule_path=self.schedule_path,
        )
        written_values = [v for _, _, v in self.ops.written_grades]
        self.assertIn(95.0, written_values)
        self.assertIn(82.0, written_values)
        self.assertIn(78.0, written_values)

    def test_last_synced_recorded_after_push(self):
        sync_section(
            "PeriodB", "7945275782",
            dry_run=False,
            state=self.state,
            grades=self.grades,
            ops=self.ops,
            schedule_path=self.schedule_path,
        )
        self.assertEqual(self.state.get_last_synced("S1", "6.1"), 95.0)
        self.assertEqual(self.state.get_last_synced("S2", "6.1"), 82.0)
        self.assertEqual(self.state.get_last_synced("S1", "6.2"), 78.0)


class TestLocalJsonStateStore(unittest.TestCase):
    """LocalJsonStateStore persists and reloads correctly."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.state_path = os.path.join(self.tmpdir, "state.json")

    def _fresh_store(self):
        from schoology_sync_section import LocalJsonStateStore as LJSS
        return LJSS(path=self.state_path)

    def test_assignment_roundtrip(self):
        s = self._fresh_store()
        s.upsert_assignment("PeriodB", "6.1", {"schoology_assignment_id": "X42"})

        # Reload from disk
        s2 = self._fresh_store()
        row = s2.get_assignment("PeriodB", "6.1")
        self.assertIsNotNone(row)
        self.assertEqual(row["schoology_assignment_id"], "X42")

    def test_last_synced_roundtrip(self):
        s = self._fresh_store()
        s.set_last_synced("S1", "6.1", 88.0)

        s2 = self._fresh_store()
        self.assertEqual(s2.get_last_synced("S1", "6.1"), 88.0)

    def test_log_run_appends(self):
        s = self._fresh_store()
        s.log_run({"assignments_created": 2})
        s.log_run({"assignments_created": 0})

        s2 = self._fresh_store()
        self.assertEqual(len(s2._data["runs"]), 2)

    def test_upsert_merges_fields(self):
        s = self._fresh_store()
        s.upsert_assignment("PeriodB", "6.1", {"schoology_assignment_id": "X1"})
        s.upsert_assignment("PeriodB", "6.1", {"title": "Topic 6.1"})

        row = s.get_assignment("PeriodB", "6.1")
        # Both fields present after merge
        self.assertEqual(row["schoology_assignment_id"], "X1")
        self.assertEqual(row["title"], "Topic 6.1")


class TestSupabaseStateStoreStub(unittest.TestCase):
    """SupabaseStateStore raises NotImplementedError with a helpful message."""

    def setUp(self):
        from schoology_sync_section import SupabaseStateStore
        self.store = SupabaseStateStore()

    def _check_raises(self, method, *args):
        with self.assertRaises(NotImplementedError) as ctx:
            method(*args)
        self.assertIn("0010_schoology_sync.sql", str(ctx.exception))

    def test_get_assignment_raises(self):
        self._check_raises(self.store.get_assignment, "PeriodB", "6.1")

    def test_upsert_assignment_raises(self):
        self._check_raises(self.store.upsert_assignment, "PeriodB", "6.1", {})

    def test_get_last_synced_raises(self):
        self._check_raises(self.store.get_last_synced, "S1", "6.1")

    def test_set_last_synced_raises(self):
        self._check_raises(self.store.set_last_synced, "S1", "6.1", 90.0)

    def test_log_run_raises(self):
        self._check_raises(self.store.log_run, {})


class TestLimitFlag(unittest.TestCase):
    """--limit caps the scope without breaking idempotency."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.schedule_path = _write_schedule(self.tmpdir)

    def test_limit_caps_scope(self):
        state = FakeStateStore()
        ops = FakeOps()
        summary = sync_section(
            "PeriodB", "7945275782",
            dry_run=False,
            state=state,
            grades={},
            ops=ops,
            schedule_path=self.schedule_path,
            limit=2,
        )
        self.assertEqual(summary["scope_items"], 2)
        self.assertEqual(len(ops.created_assignments), 2)


# ---------------------------------------------------------------------------
# Summer mock-grading: PeriodY config + forced marking period (-> MP4)
# ---------------------------------------------------------------------------

# A single lesson dated in SY26-27 (Sept 2026). Its own due-date falls in the
# FALL marking period, NOT MP4 -- which is exactly why the summer mock needs the
# force override to land it in MP4.
SUMMER_SCHEDULE = {
    "schemaVersion": 2,
    "lessons": {
        "1.2": {
            "unit": 1,
            "topicKey": "1.2",
            "worksheetKey": "1-2",
            "periods": {"B": "2026-09-15", "E": "2026-09-17"},
        },
    },
    "progressChecks": {},
    "posters": {},
}

# Two live marking periods: the fall MP that COVERS the Sept lesson date, and MP4
# (4/11/26-6/30/26, per the teacher). The force date 2026-05-15 lands in MP4.
MP_RANGES_FALL_AND_MP4 = {
    "GP_FALL": {"start": "2026-09-01", "end": "2026-11-13"},
    "GP_MP4":  {"start": "2026-04-11", "end": "2026-06-30"},
}


class TestForceMarkingPeriod(unittest.TestCase):
    """PeriodY routes to Period B's course + forces every assignment into MP4."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.schedule_path = _write_schedule(self.tmpdir, SUMMER_SCHEDULE)
        self.state = FakeStateStore()

    def test_periodY_targets_periodB_course_and_dates(self):
        # Cutover seam #1: PeriodY -> Period B's real course, Period B's dates.
        # PeriodY always follows PeriodB (fall cutover 2026-09-04 repointed both to SY26-27 Section 1).
        self.assertEqual(SECTION_TO_COURSE_ID["PeriodY"], SECTION_TO_COURSE_ID["PeriodB"])
        self.assertEqual(SECTION_TO_COURSE_ID["PeriodY"], SECTION_TO_COURSE_ID["PeriodB"])
        self.assertEqual(PERIOD_LETTER["PeriodY"], "B")

    def test_force_date_is_inside_mp4(self):
        # The forced date must sit inside MP4 (4/11/26-6/30/26) or it would file
        # the mock into the wrong period.
        d = SECTION_FORCE_MP_DATE["PeriodY"]
        self.assertTrue("2026-04-11" <= d <= "2026-06-30", f"force date {d!r} not in MP4")

    def test_without_force_uses_the_due_date_marking_period(self):
        # Baseline: a normal section files the Sept lesson into the FALL MP
        # (proving the force test below actually changes behavior).
        ops = FakeOps(marking_periods=MP_RANGES_FALL_AND_MP4)
        sync_section(
            "PeriodB", "7945275782",
            dry_run=False, state=self.state, grades={},
            ops=ops, schedule_path=self.schedule_path,
        )
        self.assertEqual(len(ops.created_assignments), 7)
        self.assertEqual(ops.created_assignments[0]["grading_period_id"], "GP_FALL")
        self.assertEqual(ops.created_assignments[0]["due_date"], "2026-09-15")

    def test_force_routes_assignment_into_mp4(self):
        # The summer mock: force_mp_date overrides the Sept due-date, filing the
        # assignment into MP4 and dating it inside MP4.
        ops = FakeOps(marking_periods=MP_RANGES_FALL_AND_MP4)
        sync_section(
            "PeriodY", "7945275782",
            dry_run=False, state=self.state, grades={},
            ops=ops, schedule_path=self.schedule_path,
            force_mp_date="2026-05-15",
        )
        self.assertEqual(len(ops.created_assignments), 7)
        self.assertEqual(ops.created_assignments[0]["grading_period_id"], "GP_MP4")
        self.assertEqual(ops.created_assignments[0]["due_date"], "2026-05-15")

    def test_force_dry_run_creates_nothing(self):
        # Dry-run still resolves the MP (so the printed plan shows MP4) but writes
        # nothing.
        ops = FakeOps(marking_periods=MP_RANGES_FALL_AND_MP4)
        summary = sync_section(
            "PeriodY", "7945275782",
            dry_run=True, state=self.state, grades={},
            ops=ops, schedule_path=self.schedule_path,
            force_mp_date="2026-05-15",
        )
        self.assertEqual(summary["assignments_created"], 0)
        self.assertEqual(len(ops.created_assignments), 0)


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# SY2627 (teacher 2026-09-03): Schoology shows ONLY due work -- the --through gate
# ---------------------------------------------------------------------------

from datetime import datetime  # noqa: E402
from schoology_sync_section import filter_scope_through, today_school_date, _eastern_offset_hours  # noqa: E402


class TestThroughGate(unittest.TestCase):
    """Columns for future lessons are neither created nor graded until their day."""

    def test_filter_keeps_only_due_items_and_drops_undated(self):
        items = [
            {"key": "6.1", "due_date": "2026-03-02"},
            {"key": "6.2", "due_date": "2026-03-03"},
            {"key": "6.3", "due_date": "2026-03-05"},
            {"key": "9.9", "due_date": None},
        ]
        kept = filter_scope_through(items, "2026-03-03")
        self.assertEqual([i["key"] for i in kept], ["6.1", "6.2"])

    def test_filter_disabled_when_through_is_none(self):
        items = [{"key": "a", "due_date": "2099-01-01"}, {"key": "b", "due_date": None}]
        self.assertEqual(filter_scope_through(items, None), items)

    def test_today_school_date_is_iso(self):
        self.assertRegex(today_school_date(), r"^\d{4}-\d{2}-\d{2}$")

    def test_sync_section_creates_only_due_assignments(self):
        tmpdir = tempfile.mkdtemp()
        schedule_path = _write_schedule(tmpdir)
        state = FakeStateStore()
        ops = FakeOps()
        all_items = build_scope(MINI_SCHEDULE, "PeriodB")
        first_date = min(i["due_date"] for i in all_items if i["due_date"])
        expected = len([i for i in all_items if i["due_date"] and i["due_date"] <= first_date])
        self.assertLess(expected, len(all_items))
        summary = sync_section(
            "PeriodB", "7945275782",
            dry_run=False,
            state=state,
            grades={},
            ops=ops,
            schedule_path=schedule_path,
            through_date=first_date,
        )
        self.assertEqual(summary["assignments_created"], expected)
        self.assertEqual(len(ops.created_assignments), expected)

    def test_eastern_offset_fallback_handles_dst(self):
        self.assertEqual(_eastern_offset_hours(datetime(2026, 9, 9, 12)), -4)   # EDT
        self.assertEqual(_eastern_offset_hours(datetime(2027, 1, 12, 12)), -5)  # EST
        self.assertEqual(_eastern_offset_hours(datetime(2026, 11, 1, 5)), -4)   # 1am EDT, before fall-back
        self.assertEqual(_eastern_offset_hours(datetime(2026, 11, 1, 7)), -5)   # after fall-back

    def test_grade_targets_for_future_columns_are_deferred_not_errors(self):
        tmpdir = tempfile.mkdtemp()
        schedule_path = _write_schedule(tmpdir)
        state = FakeStateStore()
        ops = FakeOps()
        all_items = build_scope(MINI_SCHEDULE, "PeriodB")
        dated = sorted(i["due_date"] for i in all_items if i["due_date"])
        first_date = dated[0]
        last_key = next(i["key"] for i in all_items if i["due_date"] == dated[-1])
        summary = sync_section(
            "PeriodB", "7945275782",
            dry_run=True,
            state=state,
            grades={("stu-1", last_key): 88.0},   # a future column -- must be deferred
            ops=ops,
            schedule_path=schedule_path,
            through_date=first_date,
        )
        self.assertEqual(summary["grades_deferred"], 1)
        self.assertEqual(summary["grades_pushed"], 0)
        self.assertFalse(any("No scope item" in e for e in summary["errors"]))


# ---------------------------------------------------------------------------
# PC / Poster key parity across granularities (SY2627 new-unit numbering)
# ---------------------------------------------------------------------------

import schoology_components as components  # noqa: E402
from schoology_sync_section import build_component_scope  # noqa: E402

# A SY2627-shaped schedule: lessons carry OLD units (the 9-unit lesson band),
# progressChecks/posters are keyed by the NEW CED unit (1-5).
SY2627_SCHEDULE = {
    "lessons": {
        "1.1": {"unit": 1, "topicKey": "1.1", "worksheetKey": "1",
                "periods": {"B": "2026-09-08", "E": "2026-09-09"}},
        "6.1": {"unit": 6, "topicKey": "6.1", "worksheetKey": "1",
                "periods": {"B": "2026-11-20", "E": "2026-11-23"}},
    },
    "progressChecks": {
        str(u): {"unit": u, "kind": "pc",
                 "periods": {"B": "2026-1%d-01" % (u % 3), "E": "2026-1%d-03" % (u % 3)},
                 "adminDay2": {"B": "2026-1%d-02" % (u % 3), "E": "2026-1%d-05" % (u % 3)}}
        for u in (1, 2, 3, 4, 5)
    },
    "posters": {
        str(u): {"unit": u, "kind": "flashcard",
                 "periods": {"B": "2026-1%d-04" % (u % 3), "E": "2026-1%d-06" % (u % 3)}}
        for u in (1, 2, 3, 4, 5)
    },
}


def _pc_poster_keys(items):
    return {i["key"] for i in items if i["kind"] in ("topic_assessment", "flashcard")}




if __name__ == "__main__":
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromModule(sys.modules[__name__])
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    passed = result.testsRun - len(result.failures) - len(result.errors)
    print(f"\n{'='*60}")
    print(f"RESULT: {passed}/{result.testsRun} passed", end="")
    if result.failures or result.errors:
        print(f"  ({len(result.failures)} failures, {len(result.errors)} errors)")
        sys.exit(1)
    else:
        print("  -- ALL PASS")
        sys.exit(0)


import schoology_sync_section as sync  # noqa: E402  (tolerant category resolver)


class TestCategoryNameTolerance(unittest.TestCase):
    """SY26-27 Period E was created with 'Quiz'; the sync's kind table says 'Quizzes'."""

    def test_exact_name_wins(self):
        cats = {"Assessments": "1", "Quiz": "2"}
        self.assertEqual(sync._resolve_category_id(cats, "lesson_check"), "1")

    def test_singular_and_case_tolerant(self):
        cats = {"Engagement": "97110661", "Assignments": "97110595", "Posters": "97110658",
                "Assessments": "97110670", "Quiz": "97110656"}
        self.assertEqual(sync._resolve_category_id(cats, "lesson_check"), "97110670")
        self.assertEqual(sync._resolve_category_id(cats, "flashcard"), "97110661")
        self.assertEqual(sync._resolve_category_id({"assessments": "9"}, "topic_assessment"), "9")
        self.assertEqual(sync._resolve_category_id({"ASSIGNMENTS": "7"}, "try_it"), "7")

    def test_unknown_stays_none(self):
        self.assertIsNone(sync._resolve_category_id({"Homework": "3"}, "quiz"))
        self.assertIsNone(sync._resolve_category_id({}, "nope"))


def test_work_days_never_create_schoology_columns():
    schedule = {
        "lessons": {
            "1.1": {"unit": 1, "periods": {"B": "2026-09-08"}},
            "B-Work": {"kind": "work", "unit": 0, "periods": {"B": "2026-10-13"}},
        },
        "calendar": {"workDays": {"B": ["2026-10-13"], "E": []},
                     "events": {"B": [{"id": "B-Work", "kind": "work", "date": "2026-10-13"}]}},
    }
    assert len(build_scope(schedule, "PeriodB")) == 7
    assert all("Work" not in item["key"] for item in build_scope(schedule, "PeriodB"))
