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
        "1.1": {"unit": 1, "worksheetKey": "1",
                "periods": {"C": "2026-09-15", "D": "2026-09-16", "G": "2026-09-16"},
                "items": [{"itemId": "LC-U1-L1", "source": "lesson-check"}]},
        "1.2": {"unit": 1, "worksheetKey": "2",
                "periods": {"C": "2026-09-15", "D": "2026-09-16", "G": "2026-09-16"},
                "items": [{"itemId": "LC-U1-L2", "source": "lesson-check"}]},
        "2.1": {"unit": 2, "worksheetKey": "1", "periods": {"C": None, "D": None, "G": None}},
    },
    "topicAssessments": [
        {"itemId": "TA-U1", "source": "topic-assessment", "unit": 1,
         "periods": {"C": "2026-10-15", "D": "2026-10-16", "G": "2026-10-16"}},
        {"itemId": "BL-U1-L1-DESK_DONE", "source": "flashcard", "unit": 1,
         "periods": {"C": "2026-10-19", "D": "2026-10-19", "G": "2026-10-20"}},
    ],
}

# Historical constant names are retained for test-helper compatibility.
# Four independent A2 item columns, with section-specific dates.
EXPECTED_B_KEYS = {"LC-U1-L1", "LC-U1-L2", "TA-U1", "BL-U1-L1-DESK_DONE"}
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
        folder_ok=True,
    ):
        self._folder_ok = folder_ok
        self.filed = []                  # nids handed to move_assignments_into_folder
        # students: list of {studentId, rowIndex, name}
        self._students = students or [
            {"studentId": "S1", "rowIndex": 0, "name": "Alice"},
            {"studentId": "S2", "rowIndex": 1, "name": "Bob"},
        ]
        # existing_titles: set of titles already in Schoology (pre-existing)
        self._existing_titles = existing_titles or set()
        self._marking_periods = (
            {"MP1": {"start": "2026-01-01", "end": "2027-06-30"}}
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

    # -- materials folder (2026-09-16) ---------------------------------------
    def move_assignments_into_folder(self, cdp, course_id, title="Assignments", only_nids=None):
        self.current_page = "materials"
        self.page_history.append(self.current_page)
        nids = sorted(only_nids or [])
        self.filed.extend(nids)
        if not self._folder_ok:
            return {"ok": False, "folder_id": None, "moved": [], "errors": ["move form missing"]}
        return {"ok": True, "folder_id": "F1", "moved": [{"nid": n} for n in nids], "errors": []}

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
            "Assignments": "CAT_ASSIGNMENTS",
            "Assessments": "CAT_ASSESSMENTS",
            "Engagement": "CAT_ENGAGEMENT",
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
            "points": points,
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
        items = build_scope(MINI_SCHEDULE, "PeriodC")
        keys = {item["key"] for item in items}
        self.assertEqual(keys, EXPECTED_B_KEYS)
        self.assertEqual(len(items), EXPECTED_B_COUNT)

    def test_periodE_includes_same_items_different_dates(self):
        items_b = build_scope(MINI_SCHEDULE, "PeriodC")
        items_e = build_scope(MINI_SCHEDULE, "PeriodD")
        keys_b = {item["key"] for item in items_b}
        keys_e = {item["key"] for item in items_e}
        # Same item identities across the C and D schedules
        self.assertEqual(keys_b, keys_e)
        # Dates differ
        dates_b = {item["key"]: item["due_date"] for item in items_b}
        dates_e = {item["key"]: item["due_date"] for item in items_e}
        self.assertNotEqual(dates_b["LC-U1-L1"], dates_e["LC-U1-L1"])

    def test_no_date_items_excluded(self):
        # Undated A2 lessons produce no item columns
        items = build_scope(MINI_SCHEDULE, "PeriodC")
        keys = {item["key"] for item in items}
        self.assertFalse(any("U2-" in key for key in keys))

    def test_item_kinds_correct(self):
        items = build_scope(MINI_SCHEDULE, "PeriodC")
        by_key = {item["key"]: item for item in items}
        self.assertEqual(by_key["LC-U1-L1"]["kind"], "lesson_check")
        self.assertEqual(by_key["TA-U1"]["kind"], "topic_assessment")
        self.assertEqual(by_key["BL-U1-L1-DESK_DONE"]["kind"], "flashcard")

    def test_items_sorted_by_date_then_key(self):
        items = build_scope(MINI_SCHEDULE, "PeriodC")
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
            "PeriodC", "fixture-course",
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
            "PeriodC", "fixture-course",
            dry_run=False,
            state=self.state,
            grades={},
            ops=self.ops,
            schedule_path=self.schedule_path,
        )
        for key in EXPECTED_B_KEYS:
            row = self.state.get_assignment("PeriodC", key)
            self.assertIsNotNone(row, f"state missing entry for key={key}")
            self.assertIsNotNone(row.get("schoology_assignment_id"))

    def test_run_summary_logged(self):
        sync_section(
            "PeriodC", "fixture-course",
            dry_run=False,
            state=self.state,
            grades={},
            ops=self.ops,
            schedule_path=self.schedule_path,
        )
        self.assertEqual(len(self.state.runs), 1)
        self.assertEqual(self.state.runs[0]["section"], "PeriodC")


class TestAssignmentsFolder(unittest.TestCase):
    """Every created assignment is filed into the Assignments folder; a failed move is
    reported but never blocks the create or the grade push (2026-09-16)."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.schedule_path = _write_schedule(self.tmpdir)
        self.state = FakeStateStore()

    def test_every_created_assignment_is_filed(self):
        ops = FakeOps()
        summary = sync_section("PeriodC", "fixture-course", dry_run=False, state=self.state,
                               grades={}, ops=ops, schedule_path=self.schedule_path)
        created_ids = sorted(str(self.state.get_assignment("PeriodC", k)["schoology_assignment_id"])
                             for k in EXPECTED_B_KEYS)
        self.assertEqual(sorted(ops.filed), created_ids)
        self.assertEqual(summary["assignments_created"], EXPECTED_B_COUNT)
        self.assertEqual(summary["errors"], [])

    def test_failed_move_is_reported_not_fatal(self):
        ops = FakeOps(folder_ok=False)
        summary = sync_section("PeriodC", "fixture-course", dry_run=False, state=self.state,
                               grades={}, ops=ops, schedule_path=self.schedule_path)
        self.assertEqual(summary["assignments_created"], EXPECTED_B_COUNT)
        self.assertEqual(len(ops.filed), EXPECTED_B_COUNT)
        self.assertTrue(all("Assignments folder" in e for e in summary["errors"]))
        self.assertEqual(len(summary["errors"]), EXPECTED_B_COUNT)

    def test_dry_run_files_nothing(self):
        ops = FakeOps()
        sync_section("PeriodC", "fixture-course", dry_run=True, state=self.state,
                     grades={}, ops=ops, schedule_path=self.schedule_path)
        self.assertEqual(ops.filed, [])


class TestIdempotencySecondRun(unittest.TestCase):
    """Second run with the same inputs: 0 creates + 0 grade pushes."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.schedule_path = _write_schedule(self.tmpdir)
        self.state = FakeStateStore()
        self.ops = FakeOps()

        # Grades fixture: two students, one lesson each
        self.grades = {
            ("S1", "LC-U1-L1"): 8.8,
            ("S2", "LC-U1-L2"): 7.5,
        }

    def _run(self):
        return sync_section(
            "PeriodC", "fixture-course",
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
        self.grades = {("S1", "LC-U1-L1"): 9.0}

    def test_dry_run_no_assignments_created(self):
        summary = sync_section(
            "PeriodC", "fixture-course",
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
            "PeriodC", "fixture-course",
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
            "PeriodC", "fixture-course",
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
            "PeriodC", "fixture-course",
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
            "PeriodC", "fixture-course",
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
            "PeriodC", "fixture-course",
            dry_run=False,
            state=state,
            grades={},
            ops=ops,
            schedule_path=self.schedule_path,
            limit=1,
        )
        row = state.get_assignment("PeriodC", "LC-U1-L1")
        self.assertEqual(summary["assignments_created"], 1)
        self.assertEqual(summary["errors"], [])
        self.assertIsNotNone(row)
        self.assertEqual(row["schoology_assignment_id"], "EXISTING_LC-U1-L1")


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
            ("S1", "LC-U1-L1"): 9.5,
            ("S2", "LC-U1-L1"): 8.2,
            ("S1", "LC-U1-L2"): 7.8,
        }

    def test_correct_cells_written(self):
        sync_section(
            "PeriodC", "fixture-course",
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
            "PeriodC", "fixture-course",
            dry_run=False,
            state=self.state,
            grades=self.grades,
            ops=self.ops,
            schedule_path=self.schedule_path,
        )
        written_values = [v for _, _, v in self.ops.written_grades]
        self.assertIn(9.5, written_values)
        self.assertIn(8.2, written_values)
        self.assertIn(7.8, written_values)

    def test_last_synced_recorded_after_push(self):
        sync_section(
            "PeriodC", "fixture-course",
            dry_run=False,
            state=self.state,
            grades=self.grades,
            ops=self.ops,
            schedule_path=self.schedule_path,
        )
        self.assertEqual(self.state.get_last_synced("S1", "LC-U1-L1"), 9.5)
        self.assertEqual(self.state.get_last_synced("S2", "LC-U1-L1"), 8.2)
        self.assertEqual(self.state.get_last_synced("S1", "LC-U1-L2"), 7.8)


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
        s.upsert_assignment("PeriodC", "LC-U1-L1", {"schoology_assignment_id": "X42"})

        # Reload from disk
        s2 = self._fresh_store()
        row = s2.get_assignment("PeriodC", "LC-U1-L1")
        self.assertIsNotNone(row)
        self.assertEqual(row["schoology_assignment_id"], "X42")

    def test_last_synced_roundtrip(self):
        s = self._fresh_store()
        s.set_last_synced("S1", "LC-U1-L1", 8.8)

        s2 = self._fresh_store()
        self.assertEqual(s2.get_last_synced("S1", "LC-U1-L1"), 8.8)

    def test_log_run_appends(self):
        s = self._fresh_store()
        s.log_run({"assignments_created": 2})
        s.log_run({"assignments_created": 0})

        s2 = self._fresh_store()
        self.assertEqual(len(s2._data["runs"]), 2)

    def test_upsert_merges_fields(self):
        s = self._fresh_store()
        s.upsert_assignment("PeriodC", "LC-U1-L1", {"schoology_assignment_id": "X1"})
        s.upsert_assignment("PeriodC", "LC-U1-L1", {"title": "Topic 6.1"})

        row = s.get_assignment("PeriodC", "LC-U1-L1")
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
        self._check_raises(self.store.get_assignment, "PeriodC", "LC-U1-L1")

    def test_upsert_assignment_raises(self):
        self._check_raises(self.store.upsert_assignment, "PeriodC", "LC-U1-L1", {})

    def test_get_last_synced_raises(self):
        self._check_raises(self.store.get_last_synced, "S1", "LC-U1-L1")

    def test_set_last_synced_raises(self):
        self._check_raises(self.store.set_last_synced, "S1", "LC-U1-L1", 9.0)

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
            "PeriodC", "fixture-course",
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
# Explicit marking-period overrides use a synthetic A2 section schedule.
# ---------------------------------------------------------------------------

SUMMER_SCHEDULE = {
    "lessons": {
        "1.2": {"unit": 1, "worksheetKey": "2",
                "periods": {"C": "2026-09-15", "D": "2026-09-16", "G": "2026-09-16"}},
    },
}
MP_RANGES_FALL_AND_MP4 = {
    "GP_FALL": {"start": "2026-09-01", "end": "2026-11-13"},
    "GP_MP4": {"start": "2027-04-11", "end": "2027-06-30"},
}


class TestForceMarkingPeriod(unittest.TestCase):
    """Explicit overrides preserve assignment dates and marking-period filing."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.schedule_path = _write_schedule(self.tmpdir, SUMMER_SCHEDULE)
        self.state = FakeStateStore()

    def test_without_force_uses_the_due_date_marking_period(self):
        ops = FakeOps(marking_periods=MP_RANGES_FALL_AND_MP4)
        sync_section(
            "PeriodC", "fixture-course", dry_run=False, state=self.state,
            grades={}, ops=ops, schedule_path=self.schedule_path,
        )
        self.assertEqual(len(ops.created_assignments), 7)
        self.assertTrue(all(a["grading_period_id"] == "GP_FALL" for a in ops.created_assignments))
        self.assertTrue(all(a["due_date"] == "2026-09-15" for a in ops.created_assignments))

    def test_force_routes_assignment_into_mp4(self):
        ops = FakeOps(marking_periods=MP_RANGES_FALL_AND_MP4)
        sync_section(
            "PeriodC", "fixture-course", dry_run=False, state=self.state,
            grades={}, ops=ops, schedule_path=self.schedule_path,
            force_mp_date="2027-05-18",
        )
        self.assertEqual(len(ops.created_assignments), 7)
        self.assertTrue(all(a["grading_period_id"] == "GP_MP4" for a in ops.created_assignments))
        self.assertTrue(all(a["due_date"] == "2027-05-18" for a in ops.created_assignments))

    def test_force_dry_run_creates_nothing(self):
        ops = FakeOps(marking_periods=MP_RANGES_FALL_AND_MP4)
        summary = sync_section(
            "PeriodC", "fixture-course", dry_run=True, state=self.state,
            grades={}, ops=ops, schedule_path=self.schedule_path,
            force_mp_date="2027-05-18",
        )
        self.assertEqual(summary["assignments_created"], 0)
        self.assertEqual(ops.created_assignments, [])
        self.assertEqual(self.state._assignments, {})
        self.assertEqual(self.state.runs, [])


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
            {"key": "LC-U1-L1", "due_date": "2026-09-15"},
            {"key": "LC-U1-L2", "due_date": "2026-09-16"},
            {"key": "LC-U1-L3", "due_date": "2026-09-17"},
            {"key": "LC-U1-L4", "due_date": None},
        ]
        kept = filter_scope_through(items, "2026-09-16")
        self.assertEqual([i["key"] for i in kept], ["LC-U1-L1", "LC-U1-L2"])

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
        all_items = build_scope(MINI_SCHEDULE, "PeriodC")
        first_date = min(i["due_date"] for i in all_items if i["due_date"])
        expected = len([i for i in all_items if i["due_date"] and i["due_date"] <= first_date])
        self.assertLess(expected, len(all_items))
        summary = sync_section(
            "PeriodC", "fixture-course",
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
        all_items = build_scope(MINI_SCHEDULE, "PeriodC")
        dated = sorted(i["due_date"] for i in all_items if i["due_date"])
        first_date = dated[0]
        last_key = next(i["key"] for i in all_items if i["due_date"] == dated[-1])
        summary = sync_section(
            "PeriodC", "fixture-course",
            dry_run=True,
            state=state,
            grades={("stu-1", last_key): 1},   # a future column -- must be deferred
            ops=ops,
            schedule_path=schedule_path,
            through_date=first_date,
        )
        self.assertEqual(summary["grades_deferred"], 1)
        self.assertEqual(summary["grades_pushed"], 0)
        self.assertFalse(any("No scope item" in e for e in summary["errors"]))


# ---------------------------------------------------------------------------
# District categories
# ---------------------------------------------------------------------------

import schoology_sync_section as sync  # noqa: E402  (tolerant category resolver)


class TestCategoryNameTolerance(unittest.TestCase):
    """District category matching tolerates case, whitespace and singular names."""

    def test_exact_name_wins(self):
        cats = {"Assessments": "1", "Assessment": "2"}
        self.assertEqual(sync._resolve_category_id(cats, "lesson_check"), "1")

    def test_singular_and_case_tolerant(self):
        cats = {"Engagement": "97110661", "Assignment": "97110595",
                " Assessment ": "97110670"}
        self.assertEqual(sync._resolve_category_id(cats, "lesson_check"), "97110670")
        self.assertEqual(sync._resolve_category_id(cats, "flashcard"), "97110661")
        self.assertEqual(sync._resolve_category_id({"assessments": "9"}, "topic_assessment"), "9")
        self.assertEqual(sync._resolve_category_id({"ASSIGNMENTS": "7"}, "try_it"), "7")

    def test_unknown_stays_none(self):
        self.assertIsNone(sync._resolve_category_id({"Homework": "3"}, "lesson_check"))
        self.assertIsNone(sync._resolve_category_id({}, "nope"))


def test_work_days_never_create_schoology_columns():
    schedule = {
        "lessons": {
            "1.1": {"unit": 1, "periods": {"C": "2026-09-08"}},
            "C-Work": {"kind": "work", "unit": 0, "periods": {"C": "2026-10-13"}},
        },
        "calendar": {"workDays": {"C": ["2026-10-13"], "D": []},
                     "events": {"C": [{"id": "C-Work", "kind": "work", "date": "2026-10-13"}]}},
    }
    assert len(build_scope(schedule, "PeriodC")) == 7
    assert all("Work" not in item["key"] for item in build_scope(schedule, "PeriodC"))


class TestA2AssignmentsFolder(unittest.TestCase):
    """Folder filing preserves A2 sections, point scales, and gradebook navigation."""

    def _ensure(self, ops, section="PeriodC", kind="try_it", state=None, dry_run=False):
        from schoology_sync_section import _ensure_assignment

        state = state if state is not None else FakeStateStore()
        item = {"key": "A2-item", "kind": kind, "title": "A2 item", "due_date": "2026-09-16"}
        errors = []
        ops.current_page = "gradebook"
        assignment_id = _ensure_assignment(
            item, section, SECTION_TO_COURSE_ID[section],
            {"Assessments": "ASSESS", "Assignments": "ASSIGN", "Engagement": "ENGAGE"},
            {"MP1": {"start": "2026-09-01", "end": "2026-11-30"}},
            state, ops, None, dry_run, errors,
        )
        return assignment_id, errors

    def test_a2_sections_and_scoring_are_preserved(self):
        course_ids = {"PeriodC": "8537065947", "PeriodD": "8537065922", "PeriodG": "8537065934"}
        policies = {"lesson_check": (10, "ASSESS"), "topic_assessment": (100, "ASSESS"),
                    "try_it": (2, "ASSIGN"), "flashcard": (1, "ENGAGE")}
        for section, course_id in course_ids.items():
            for kind, (points, category) in policies.items():
                with self.subTest(section=section, kind=kind):
                    ops = FakeOps()
                    assignment_id, errors = self._ensure(ops, section, kind)
                    self.assertEqual(errors, [])
                    self.assertEqual(ops.filed, [assignment_id])
                    created = ops.created_assignments[0]
                    self.assertEqual(created["course_id"], course_id)
                    self.assertEqual(created["points"], points)
                    self.assertEqual(created["category_id"], category)
                    self.assertEqual(ops.page_history[-2:], ["materials", "gradebook"])

    def test_reconciled_create_is_filed_and_gradebook_restored(self):
        ops = FakeOps(add_ok=False, add_returns_id=False)
        assignment_id, errors = self._ensure(ops)
        self.assertIsNotNone(assignment_id)
        self.assertEqual(ops.filed, [assignment_id])
        self.assertEqual(errors, [])
        self.assertEqual(ops.current_page, "gradebook")

    def test_folder_failure_does_not_block_grade_writes(self):
        ops = FakeOps(folder_ok=False)
        assignment_id, errors = self._ensure(ops)
        self.assertIsNotNone(assignment_id)
        self.assertEqual(len(errors), 1)
        self.assertIn("Assignments folder", errors[0])
        self.assertEqual(ops.current_page, "gradebook")
        column = ops.find_assignment_id_by_title(None, "A2 item")
        self.assertTrue(ops.write_grade_to_cell(None, column, 0, 2)["ok"])

    def test_folder_exception_restores_gradebook(self):
        from unittest import mock

        ops = FakeOps()

        def fail_move(*args, **kwargs):
            ops.current_page = "materials"
            raise RuntimeError("move unavailable")

        with mock.patch.object(ops, "move_assignments_into_folder", side_effect=fail_move):
            assignment_id, errors = self._ensure(ops)
        self.assertIsNotNone(assignment_id)
        self.assertIn("move unavailable", errors[0])
        self.assertEqual(ops.current_page, "gradebook")

    def test_existing_assignments_are_not_backfilled(self):
        state = FakeStateStore()
        state.upsert_assignment("PeriodC", "A2-item", {"schoology_assignment_id": "OLD"})
        ops = FakeOps()
        assignment_id, errors = self._ensure(ops, state=state)
        self.assertEqual(assignment_id, "OLD")
        self.assertEqual(errors, [])
        self.assertEqual(ops.filed, [])
        self.assertEqual(ops.created_assignments, [])

        ops = FakeOps(existing_titles={"A2 item"})
        assignment_id, errors = self._ensure(ops)
        self.assertIsNotNone(assignment_id)
        self.assertEqual(errors, [])
        self.assertEqual(ops.filed, [])
        self.assertEqual(ops.created_assignments, [])

    def test_a2_dry_run_does_not_file_or_create(self):
        ops = FakeOps()
        assignment_id, errors = self._ensure(ops, dry_run=True)
        self.assertIsNone(assignment_id)
        self.assertEqual(errors, [])
        self.assertEqual(ops.filed, [])
        self.assertEqual(ops.created_assignments, [])


def test_a2_scope_matches_component_mode_and_grade_fixture():
    from schoology_components import component_grades_from_class_doc
    from schoology_sync_section import build_component_scope

    for section in ("PeriodC", "PeriodD", "PeriodG"):
        scope = build_scope(MINI_SCHEDULE, section)
        component_scope = build_component_scope(
            MINI_SCHEDULE, section, quiz_topics=set(), blooket_topics=set(),
        )
        assert scope == component_scope
        points = {"LC-U1-L1": 8, "LC-U1-L2": 9, "TA-U1": 73, "BL-U1-L1-DESK_DONE": 1}
        doc = {"students": [{"studentId": "fixture", "items": [
            {"itemId": key, "points": value, "attempted": True, "due": True}
            for key, value in points.items()
        ]}]}
        grades = component_grades_from_class_doc(doc)
        assert grades == {"fixture/" + key: value for key, value in points.items()}
        assert {item["key"] for item in scope} == set(points)
        assert PERIOD_LETTER[section] == section[-1]


if __name__ == "__main__":
    unittest.main()
