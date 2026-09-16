"""schoology_sync_section.py -- P2 orchestration CLI for the Schoology grade-sync tool.

CLI:
    python tools/schoology_sync_section.py --sync-section PeriodB
    python tools/schoology_sync_section.py --sync-section PeriodE --course-id 7945275798
    python tools/schoology_sync_section.py --sync-section PeriodB --dry-run
    python tools/schoology_sync_section.py --sync-section PeriodB --grades-fixture path.json
    python tools/schoology_sync_section.py --sync-section PeriodB --limit 5

StateStore contract:
    get_assignment(section, lesson_key) -> dict|None
    upsert_assignment(section, lesson_key, fields)
    get_last_synced(student_id, assignment_key) -> value|None
    set_last_synced(student_id, assignment_key, value)
    log_run(summary_dict)

Idempotency guarantee:
    LocalJsonStateStore records every assignment_id after creation and every
    grade value after a successful push.  plan_assignment_work checks the store
    before creating; compute_sync_actions checks the store before pushing.
    A second identical run therefore sees all assignments already recorded
    (reuse bucket) and all grades already synced (skip bucket), producing
    assignments_created=0 and grades_pushed=0.

ASCII only. LF line endings.
"""
from __future__ import annotations

import abc
import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from typing import Any

SCHOOL_TZ = "America/New_York"


def _eastern_offset_hours(utc_dt: datetime) -> int:
    """US Eastern UTC offset without tzdata: -4 during DST (2nd Sun Mar 2am ->
    1st Sun Nov 2am local), else -5. Windows CPython has no tz database unless the
    `tzdata` pip package is installed, so zoneinfo is only a first attempt."""
    def nth_sunday(month: int, n: int) -> datetime:
        first = datetime(utc_dt.year, month, 1)
        first_sun = first + timedelta(days=(6 - first.weekday()) % 7)
        return first_sun + timedelta(days=7 * (n - 1))
    start = nth_sunday(3, 2).replace(hour=7)   # 2am EST == 07:00 UTC
    end = nth_sunday(11, 1).replace(hour=6)    # 2am EDT == 06:00 UTC
    return -4 if start <= utc_dt < end else -5


def today_school_date() -> str:
    """Today's date (YYYY-MM-DD) in school time -- the default --through date."""
    try:
        from zoneinfo import ZoneInfo  # optional on Windows (needs the tzdata package)
        return datetime.now(ZoneInfo(SCHOOL_TZ)).strftime("%Y-%m-%d")
    except Exception:  # ZoneInfoNotFoundError on a box without tzdata
        now = datetime.utcnow()
        return (now + timedelta(hours=_eastern_offset_hours(now))).strftime("%Y-%m-%d")


def filter_scope_through(items: list, through_date: str | None) -> list:
    """Keep only scope items whose due_date has arrived (due_date <= through_date).

    SY2627 (teacher 2026-09-03): Schoology must show ONLY work that is due, so
    columns for future lessons are neither created nor graded until their day.
    A None through_date disables the gate (summer mock / explicit override).
    Undated items are dropped when a gate is active.
    """
    if through_date is None:
        return list(items)
    return [i for i in items if i.get("due_date") and i["due_date"] <= through_date]

# ---------------------------------------------------------------------------
# Path bootstrap -- allow running from any cwd
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(REPO_ROOT, "data")
# Prefer the roster-server bundled schedule -- it carries the canonical SY26-27
# pack-left dates + progressChecks + posters (the same file the grade engine
# loads). The root data/lesson-schedule.json can lag (null/stale dates), so fall
# back to it only when the roster-server copy is missing.
_ROSTER_SCHEDULE = os.path.join(REPO_ROOT, "roster-server", "data", "lesson-schedule.json")
_ROOT_SCHEDULE = os.path.join(DATA_DIR, "lesson-schedule.json")
SCHEDULE_PATH = _ROSTER_SCHEDULE if os.path.exists(_ROSTER_SCHEDULE) else _ROOT_SCHEDULE
STATE_PATH = os.path.join(SCRIPT_DIR, ".schoology-sync-state.json")

# Fine-grained (component) granularity presence sources. roadmap-data.json gives
# the authoritative "has a quiz" signal (urls.quiz null for X.1 openers);
# blooket-lessons.json is the engine's hasBlooket denominator.
ROADMAP_PATH = os.path.join(REPO_ROOT, "roadmap-data.json")
BLOOKET_LESSONS_PATH = os.path.join(REPO_ROOT, "roster-server", "data", "blooket-lessons.json")
# Quiz presence now comes from the ANSWER KEY (engine quizTotal parity), not roadmap
# urls.quiz -- prefer the roster-server copy the engine reads, fall back to the root.
_ROSTER_ANSWER_KEY = os.path.join(REPO_ROOT, "roster-server", "data", "answer-key.json")
_ROOT_ANSWER_KEY = os.path.join(REPO_ROOT, "data", "answer-key.json")
ANSWER_KEY_PATH = _ROSTER_ANSWER_KEY if os.path.exists(_ROSTER_ANSWER_KEY) else _ROOT_ANSWER_KEY

sys.path.insert(0, SCRIPT_DIR)
import schoology_sync_lib as lib
import schoology_components as components

SECTION_TO_COURSE_ID = {
    # SY26-27 Algebra 2 Desk sections, course ids from the teacher 2026-09-15
    # (https://lynnschools.schoology.com/course/<id>/materials). Env vars
    # A2_SCHOOLOGY_COURSE_ID_<Section> / --course-id still override these.
    "PeriodC": "8537065947",
    "PeriodD": "8537065922",
    "PeriodG": "8537065934",
    "PeriodB": "8537033028",   # SY26-27 "Algebra 2 · Section 1" (13 students; discovered via the rig 2026-09-04)
    "PeriodE": "8537033042",   # SY26-27 "Algebra 2 · Section 2" (15 students). SY25-26 mock courses were 7945275782 / 7945275798.
    # Summer mock-grading (2026-06). PeriodY is a roster TEST section whose 3
    # fruit_animal students map (via roster.schoology_uid) to real Period B
    # students, so a mock push lands in Period B's REAL gradebook. Same course as
    # Period B. Fall cutover = repoint this entry + the per-student schoology_uid
    # map (and clear SECTION_FORCE_MP_DATE below); the sync code stays unchanged.
    "PeriodY": "8537033028",  # fall cutover 2026-09-04: follows PeriodB (its 3 mock uids are stale — mock pushes find no rows)
}

PERIOD_LETTER = {
    "PeriodC": "C", "PeriodD": "D", "PeriodG": "G",
    "PeriodB": "B",
    "PeriodE": "E",
    "PeriodY": "B",  # summer mock builds its scope from Period B's lesson dates
}

# Force EVERY assignment for a section into the marking period that COVERS this
# date, instead of resolving the MP per-lesson from its own due-date. Needed for
# the summer mock: the lessons carry SY26-27 dates (Sept 2026+) that would
# resolve to MP1, but the mock must land in MP4 (4/11/26-6/30/26). 2026-05-15 is
# safely inside MP4. Resolved against the LIVE marking periods at sync time, so
# no Schoology-internal grading_period_id is hard-coded here (and it survives an
# id change). None / absent = resolve per due-date as usual -> PeriodB & PeriodE
# behavior is unchanged.
SECTION_FORCE_MP_DATE = {
    "PeriodY": "2026-05-15",
}


# ---------------------------------------------------------------------------
# StateStore interface + implementations
# ---------------------------------------------------------------------------

class StateStore(abc.ABC):
    """Abstract persistence layer.  All methods are synchronous (no network)."""

    @abc.abstractmethod
    def get_assignment(self, section: str, lesson_key: str) -> dict | None:
        """Return stored assignment row or None if not yet created."""

    @abc.abstractmethod
    def upsert_assignment(self, section: str, lesson_key: str, fields: dict) -> None:
        """Create or overwrite the stored row for this (section, lesson_key)."""

    @abc.abstractmethod
    def get_last_synced(self, student_id: str, assignment_key: str) -> Any | None:
        """Return the last grade value successfully pushed, or None."""

    @abc.abstractmethod
    def set_last_synced(self, student_id: str, assignment_key: str, value: Any) -> None:
        """Record a successfully pushed grade value."""

    @abc.abstractmethod
    def log_run(self, summary: dict) -> None:
        """Append a run summary record (for audit / debugging)."""


class LocalJsonStateStore(StateStore):
    """File-backed state store.  Persists to tools/.schoology-sync-state.json.

    Internal structure::

        {
          "assignments": {
            "<section>/<lesson_key>": { "schoology_assignment_id": "...", ... }
          },
          "last_synced": {
            "<student_id>/<assignment_key>": <value>
          },
          "runs": [ {...}, ... ]
        }
    """

    def __init__(self, path: str = STATE_PATH):
        self._path = path
        self._data = self._load()

    # -- persistence helpers ------------------------------------------------

    def _load(self) -> dict:
        if os.path.exists(self._path):
            with open(self._path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"assignments": {}, "last_synced": {}, "runs": []}

    def _save(self) -> None:
        with open(self._path, "w", encoding="utf-8") as f:
            json.dump(self._data, f, indent=2)

    # -- assignment registry ------------------------------------------------

    def _asgn_key(self, section: str, lesson_key: str) -> str:
        return f"{section}/{lesson_key}"

    def get_assignment(self, section: str, lesson_key: str) -> dict | None:
        return self._data["assignments"].get(self._asgn_key(section, lesson_key))

    def upsert_assignment(self, section: str, lesson_key: str, fields: dict) -> None:
        key = self._asgn_key(section, lesson_key)
        existing = self._data["assignments"].get(key, {})
        existing.update(fields)
        self._data["assignments"][key] = existing
        self._save()

    # -- last-synced registry -----------------------------------------------

    def _ls_key(self, student_id: str, assignment_key: str) -> str:
        return f"{student_id}/{assignment_key}"

    def get_last_synced(self, student_id: str, assignment_key: str) -> Any | None:
        return self._data["last_synced"].get(self._ls_key(student_id, assignment_key))

    def set_last_synced(self, student_id: str, assignment_key: str, value: Any) -> None:
        self._data["last_synced"][self._ls_key(student_id, assignment_key)] = value
        self._save()

    # -- run log ------------------------------------------------------------

    def log_run(self, summary: dict) -> None:
        summary.setdefault("timestamp", datetime.utcnow().isoformat() + "Z")
        self._data.setdefault("runs", []).append(summary)
        self._save()


class SupabaseStateStore(StateStore):
    """Production stub -- raises NotImplementedError. DEFERRED: LocalJsonStateStore
    covers every current dry-run/smoke need; this is only required for a real
    --sync-section run (~Sept-2026), which is itself gated on the migration being
    applied to the live DB. Do NOT build it blind -- there is a design decision.

    To implement (it is NOT just "fill in the method bodies"):
    1. Run roster-server/migrations/0010_schoology_sync.sql against Supabase
       (user-owned) and set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
    2. supabase-py is NOT a current dependency -- lazy-import it inside __init__
       and accept an injected client so unit tests can pass a mock.
    3. IMPEDANCE MISMATCH (the real work): get_last_synced / set_last_synced take
       (student_id, lesson_key:str) with NO section, but schoology_grade_sync keys
       on (student_id, assignment_id:uuid -> schoology_assignment.id), and
       schoology_assignment is unique on (section, lesson_key). So the store must
       CARRY section -- construct SupabaseStateStore(section=...) -- and resolve
       (section, lesson_key) -> assignment uuid before touching grade-sync.
       Alternative: a migration 0011 re-keying schoology_grade_sync on text
       (section, lesson_key), which simplifies the store but changes the schema.
    4. Map: upsert_assignment -> schoology_assignment (on-conflict section,lesson_key);
       get/set_last_synced -> schoology_grade_sync; log_run -> schoology_sync_log.
    """

    def get_assignment(self, section: str, lesson_key: str) -> dict | None:
        raise NotImplementedError(
            "SupabaseStateStore is a stub.  "
            "Apply migration roster-server/migrations/0010_schoology_sync.sql first, "
            "then implement get_assignment with supabase-py."
        )

    def upsert_assignment(self, section: str, lesson_key: str, fields: dict) -> None:
        raise NotImplementedError(
            "SupabaseStateStore is a stub.  "
            "Apply migration roster-server/migrations/0010_schoology_sync.sql first."
        )

    def get_last_synced(self, student_id: str, assignment_key: str) -> Any | None:
        raise NotImplementedError(
            "SupabaseStateStore is a stub.  "
            "Apply migration roster-server/migrations/0010_schoology_sync.sql first."
        )

    def set_last_synced(self, student_id: str, assignment_key: str, value: Any) -> None:
        raise NotImplementedError(
            "SupabaseStateStore is a stub.  "
            "Apply migration roster-server/migrations/0010_schoology_sync.sql first."
        )

    def log_run(self, summary: dict) -> None:
        raise NotImplementedError(
            "SupabaseStateStore is a stub.  "
            "Apply migration roster-server/migrations/0010_schoology_sync.sql first."
        )


# ---------------------------------------------------------------------------
# Schedule loading
# ---------------------------------------------------------------------------

def load_schedule(path: str = SCHEDULE_PATH) -> dict:
    """Read lesson-schedule.json and return the raw parsed dict."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_gradebook_page(ops, cdp, course_id: str) -> None:
    """Return CDP to the gradebook after setup/create pages have navigated away."""
    ops.navigate(cdp, ops.gradebook_url(course_id))
    ops.inject_helpers(cdp)


def _event_unit(unit_str, entry: dict | None):
    """The NEW CED unit an event row (progress check / poster) belongs to.

    The row's explicit `unit` wins; older rows without it use the map key
    ("3" or "U3").
    """
    unit = (entry or {}).get("unit")
    if unit is not None:
        return unit
    return str(unit_str).lstrip("Uu")


def build_scope(schedule: dict, section: str) -> list[dict]:
    return build_component_scope(schedule, section, quiz_topics=set(), blooket_topics=set())



def build_component_scope(
    schedule: dict,
    section: str,
    *,
    quiz_topics=None,
    blooket_topics=None,
    include_undated: bool = False,
    roadmap_path: str = ROADMAP_PATH,
    blooket_lessons_path: str = BLOOKET_LESSONS_PATH,
    answer_key_path: str = ANSWER_KEY_PATH,
) -> list[dict]:
    """Return FINE-GRAINED (per-component) scope items for the given section.

    Each lesson yields up to three columns -- Follow-Along (worksheet),
    Quiz (if the topic has a quiz), Blooket (if the topic has a Blooket) --
    instead of one coarse blended column. Combined worksheets share ONE
    Follow-Along / Blooket column; quizzes stay per-topic. See
    schoology_components.component_columns for the rules.

    quiz_topics / blooket_topics override the on-disk presence sources (for
    tests); when None they are loaded from roadmap-data.json + blooket-lessons.json.

    include_undated: include lessons with no date for this section's period
    (the summer mock forces every column into MP4 regardless of the calendar).

    Items share the SAME shape as build_scope ({key, kind, title, due_date,
    unit}) plus group_label/topic_keys, so the rest of the pipeline is unchanged.
    """
    period_letter = PERIOD_LETTER.get(section, "B")
    if quiz_topics is None:
        quiz_topics = components.load_quiz_topics(answer_key_path)
    if blooket_topics is None:
        blooket_topics = components.load_blooket_topics(blooket_lessons_path)

    columns = components.component_columns(
        schedule.get("lessons", {}),
        period_letter,
        quiz_topics=quiz_topics,
        blooket_topics=blooket_topics,
        include_undated=include_undated,
        progress_checks=schedule.get("progressChecks"),
        posters=schedule.get("posters"),
        topic_assessments=schedule.get("topicAssessments"),
    )
    return columns


# ---------------------------------------------------------------------------
# Assignment-creation helpers
# ---------------------------------------------------------------------------

def _normalize_category_name(name: str) -> str:
    """Case/plural/space-insensitive key: 'Quizzes', 'quiz', 'Quiz ' -> 'quiz'."""
    key = " ".join(str(name or "").lower().split())
    if len(key) <= 3:
        return key
    if key.endswith("zzes"):            # quizzes -> quiz
        return key[:-3]
    if key.endswith(("ches", "shes", "xes", "sses")):   # matches, boxes, classes
        return key[:-2]
    if key.endswith("s"):               # posters -> poster, lessons -> lesson
        return key[:-1]
    return key


def _resolve_category_id(cats: dict, kind: str) -> str | None:
    """Map kind -> category_name -> category_id from live Schoology categories.

    Exact name first; then a tolerant match so a teacher-typed "Quiz" still
    resolves the sync's "Quizzes" (SY26-27 Period E was created that way).
    """
    category_name = lib.KIND_TO_CATEGORY.get(kind)
    if category_name is None:
        return None
    if category_name in cats:
        return cats[category_name]
    wanted = _normalize_category_name(category_name)
    for live_name, cat_id in cats.items():
        if _normalize_category_name(live_name) == wanted:
            return cat_id
    return None


def _ensure_assignment(
    item: dict,
    section: str,
    course_id: str,
    cats: dict,
    mps: dict,
    state: StateStore,
    ops,
    cdp,
    dry_run: bool,
    errors: list,
    force_mp_date: str | None = None,
) -> str | None:
    """Return the Schoology assignment id for this scope item (creating if needed).

    force_mp_date: when set (summer mock -> MP4), EVERY assignment is filed into
    the marking period covering this date and dated there too, instead of
    resolving the MP from the lesson's own due-date. None -> resolve per due-date.

    Returns None on failure (error appended to errors list).
    """
    key = item["key"]
    kind = item["kind"]
    title = item["title"]
    # A forced MP date overrides the lesson's own due-date both for marking-period
    # resolution AND as the assignment's due-date, so the assignment sits cleanly
    # inside the forced MP (no Sept-due-date-in-an-MP4-that-ends-in-June mismatch).
    due_date = force_mp_date or item["due_date"]

    # Check state store first (idempotency: already created in a prior run)
    stored = state.get_assignment(section, key)
    if stored and stored.get("schoology_assignment_id"):
        return stored["schoology_assignment_id"]

    # Resolve the marking period up front (also shown in the dry-run line, so a
    # dry-run proves WHICH MP each assignment would land in -- e.g. MP4 -- before
    # any live write).
    grading_period_id = lib.marking_period_for_date(due_date, mps)
    if due_date and grading_period_id is None:
        msg = f"No grading_period_id covering due_date={due_date!r} (key={key})"
        print(f"  [ERROR] {msg}")
        errors.append(msg)
        return None

    if dry_run:
        print(f"  [DRY-RUN] WOULD CREATE: {title!r} (kind={kind}, due={due_date}, mp={grading_period_id})")
        return None

    # Pre-flight: does the assignment already exist in Schoology?
    existing_id = ops.find_assignment_id_by_title(cdp, title)
    if existing_id:
        print(f"  [REUSE]  Found existing assignment {existing_id!r} for {title!r}")
        state.upsert_assignment(section, key, {"schoology_assignment_id": existing_id, "title": title})
        return existing_id

    # Resolve category
    category_id = _resolve_category_id(cats, kind)
    if category_id is None:
        msg = f"No category_id for kind={kind!r} (key={key})"
        print(f"  [ERROR] {msg}")
        errors.append(msg)
        return None

    result = ops.add_assignment(
        cdp,
        course_id,
        title=title,
        points=lib.assignment_points(kind),
        category_id=category_id,
        grading_period_id=grading_period_id,
        due_date=due_date,
        publish_scores=True,
        sync_to_sis=True,
    )

    _load_gradebook_page(ops, cdp, course_id)

    result_ok = bool(result and result.get("ok"))
    assignment_id = (result or {}).get("assignment_id")

    # Fallback: look it up by title if id not returned. This is also the
    # best-effort false-negative recovery path: the submit click may have landed
    # even when add_assignment missed the transient confirmation JSON.
    if not assignment_id:
        assignment_id = ops.find_assignment_id_by_title(cdp, title)

    if assignment_id:
        state.upsert_assignment(section, key, {"schoology_assignment_id": assignment_id, "title": title})
        label = "CREATED" if result_ok else "RECONCILED"
        print(f"  [{label}] {title!r} -> id={assignment_id}")
        return assignment_id

    if not result_ok:
        err_msg = (result or {}).get("error") or "add_assignment returned not-ok"
        msg = f"Failed to create {title!r}: {err_msg}"
        print(f"  [ERROR] {msg}")
        errors.append(msg)
        return None

    msg = f"Created {title!r} but could not resolve assignment_id"
    print(f"  [WARN] {msg}")
    errors.append(msg)

    return assignment_id


# ---------------------------------------------------------------------------
# Grade-push helpers
# ---------------------------------------------------------------------------

def _build_last_synced_map(student_ids: list, scope_keys: list, state: StateStore) -> dict:
    """Read last-synced values from the store for all (student, key) pairs."""
    last_synced = {}
    for sid in student_ids:
        for key in scope_keys:
            composite = (sid, key)
            last_synced[composite] = state.get_last_synced(sid, key)
    return last_synced


def _grade_at_least(existing, target) -> bool:
    """Compare persisted or live numeric grades with the sync tolerance."""
    try:
        return float(existing) >= float(target) - 1e-9
    except (TypeError, ValueError):
        return False


def _push_grades(
    targets: dict,
    scope_items_by_key: dict,
    students_by_id: dict,
    section: str,
    state: StateStore,
    ops,
    cdp,
    dry_run: bool,
    errors: list,
) -> tuple[int, int, int]:
    """Apply best-wins grades. Returns (pushed_count, skipped_count, kept_count)."""

    # Build last-synced map for the students + keys that appear in targets
    student_ids = {sid for sid, _ in targets}
    scope_keys = {key for _, key in targets}
    last_synced_map = _build_last_synced_map(list(student_ids), list(scope_keys), state)

    # A higher hand entry recorded on KEEP already covers a lower app target.
    replace_keys = {key for key in targets if scope_items_by_key.get(key[1], {}).get('kind') == 'try_it'}
    covered = {key for key, target in targets.items() if key not in replace_keys
               if target is not None and _grade_at_least(last_synced_map.get(key), target)}
    pending = {key: target for key, target in targets.items() if key not in covered}
    actions = lib.compute_sync_actions(pending, last_synced_map)
    pushed = 0
    kept = 0
    skipped = len(covered) + len(actions["skip"])

    for composite_key in actions["push"]:
        student_id, lesson_key = composite_key
        target_value = targets[composite_key]

        scope_item = scope_items_by_key.get(lesson_key)
        if scope_item is None:
            errors.append(f"No scope item for lesson_key={lesson_key!r}")
            continue

        # Grade-push targets the COLUMN data-x (what write_grade_to_cell keys
        # on), NOT the stored assignment node id. data-x is positional and can
        # shift between runs, so resolve it live by title each run.
        column_key = ops.find_assignment_id_by_title(cdp, scope_item.get("title"))
        if column_key is None:
            errors.append(
                f"No gradebook column for lesson_key={lesson_key!r} "
                f"(title={scope_item.get('title')!r}); skipping grade push"
            )
            continue

        student_row = students_by_id.get(str(student_id))
        if student_row is None:
            errors.append(f"Student {student_id!r} not found in gradebook roster")
            continue

        row_index = student_row.get("rowIndex")

        existing = ops.read_grade_from_cell(cdp, column_key, row_index)
        keep = composite_key not in replace_keys and _grade_at_least(existing, target_value)
        if dry_run:
            decision = "KEEP" if keep else "PUSH"
            print(
                f"  [DRY-RUN] WOULD {decision} student={student_id} key={lesson_key} "
                f"existing={existing} target={target_value} col={column_key}"
            )
            continue

        if keep:
            state.set_last_synced(str(student_id), lesson_key, existing)
            kept += 1
            print(f"  [KEEP] student={student_id} key={lesson_key} "
                  f"existing={existing} >= target={target_value}")
            continue

        result = ops.write_grade_to_cell(cdp, column_key, row_index, target_value)
        if result and result.get("ok"):
            state.set_last_synced(str(student_id), lesson_key, target_value)
            pushed += 1
        else:
            err_msg = (result or {}).get("error") or "write_grade_to_cell returned not-ok"
            msg = (
                f"Failed to push grade for student={student_id} "
                f"key={lesson_key}: {err_msg}"
            )
            print(f"  [ERROR] {msg}")
            errors.append(msg)

    return pushed, skipped, kept


def _lookup_assignment_id(section: str, lesson_key: str, state: StateStore) -> str | None:
    stored = state.get_assignment(section, lesson_key)
    return (stored or {}).get("schoology_assignment_id")


# ---------------------------------------------------------------------------
# Core orchestration
# ---------------------------------------------------------------------------

def sync_section(
    section: str,
    course_id: str,
    *,
    dry_run: bool = True,
    state: StateStore,
    grades: dict,
    ops=None,
    schedule_path: str = SCHEDULE_PATH,
    limit: int | None = None,
    force_mp_date: str | None = None,
    granularity: str = "lesson",
    quiz_topics=None,
    blooket_topics=None,
    through_date: str | None = None,
) -> dict:
    """Orchestrate one full sync for a single section.

    through_date: only scope items due on/before this YYYY-MM-DD are created and
    graded (None = no gate; the summer mock passes None via force_mp_date).

    Parameters
    ----------
    section:       'PeriodB' or 'PeriodE'
    course_id:     Schoology course id string
    dry_run:       if True, no writes are performed and state is not mutated
    state:         StateStore implementation to use
    grades:        {(student_id, lesson_key): value} -- grade targets
    ops:           schoology_ops module (or fake); if None, imported lazily
    schedule_path: override for testing
    limit:         cap scope to first N items (for smoke-testing)

    Returns summary dict.
    """
    errors = []

    # -- load schedule + build scope ----------------------------------------
    schedule = load_schedule(schedule_path)
    if granularity == "component":
        # Fine-grained per-component columns. include_undated when a force MP is
        # in play (summer mock): units 1-5 have null SY26-27 dates but must still
        # land in MP4, so they can't be date-filtered out.
        scope_items = build_component_scope(
            schedule, section,
            quiz_topics=quiz_topics,
            blooket_topics=blooket_topics,
            include_undated=bool(force_mp_date),
        )
    else:
        scope_items = build_scope(schedule, section)
    if through_date is not None and not force_mp_date:
        before = len(scope_items)
        scope_items = filter_scope_through(scope_items, through_date)
        print(f"[sync_section] --through {through_date}: {len(scope_items)} of {before} scope items are due")
    if limit is not None:
        scope_items = scope_items[:limit]

    scope_keys = [item["key"] for item in scope_items]
    print(f"\n[sync_section] section={section} course={course_id} "
          f"scope_items={len(scope_items)} dry_run={dry_run}")

    # -- lazy-import live ops (allows test injection) -----------------------
    if ops is None:
        sys.path.insert(0, SCRIPT_DIR)
        import schoology_ops as ops_module  # type: ignore
        ops = ops_module

    # -- connect + verify login --------------------------------------------
    print("[1/5] Connecting to Edge CDP ...")
    cdp = ops.connect(reuse=True)
    _load_gradebook_page(ops, cdp, course_id)
    login_state = ops.detect_login_state(cdp)
    if login_state != "authenticated":
        print(
            f"[AUTH] Not authenticated (state={login_state!r}).  "
            "Please sign into Schoology in the Edge window, then re-run."
        )
        sys.exit(1)

    # -- read live data ----------------------------------------------------
    print("[2/5] Reading live Schoology data ...")
    cats = ops.list_categories(cdp, course_id)
    mps = ops.list_marking_periods(cdp, course_id)
    _load_gradebook_page(ops, cdp, course_id)
    students = ops.list_students(cdp)
    students_by_id = {str(s["studentId"]): s for s in students}

    # -- build existing-assignments map from state -------------------------
    existing = {}
    for key in scope_keys:
        stored = state.get_assignment(section, key)
        existing[key] = stored or {"schoology_assignment_id": None}

    # -- plan assignment work ----------------------------------------------
    plan = lib.plan_assignment_work(scope_keys, existing)
    print(
        f"[3/5] Assignment plan: {len(plan['create'])} to create, "
        f"{len(plan['reuse'])} to reuse"
    )

    # -- create missing assignments ----------------------------------------
    assignments_created = 0
    scope_items_by_key = {item["key"]: item for item in scope_items}

    for key in plan["create"]:
        item = scope_items_by_key[key]
        assignment_id = _ensure_assignment(
            item, section, course_id, cats, mps, state, ops, cdp, dry_run, errors,
            force_mp_date=force_mp_date,
        )
        if assignment_id and not dry_run:
            assignments_created += 1
            # Attach id to the in-memory item for grade-push lookup
            item["schoology_assignment_id"] = assignment_id

    # Re-attach ids for reuse items (already in state)
    for key in plan["reuse"]:
        stored = state.get_assignment(section, key)
        if stored:
            scope_items_by_key[key]["schoology_assignment_id"] = stored.get(
                "schoology_assignment_id"
            )

    # -- push grades -------------------------------------------------------
    # SY2627 --through gate, grade side: targets for columns that are not yet
    # due are DEFERRED (not errors) -- they get pushed on their day.
    grades_deferred = 0
    if grades and through_date is not None and not force_mp_date:
        in_scope = {k: v for k, v in grades.items() if k[1] in scope_items_by_key}
        grades_deferred = len(grades) - len(in_scope)
        if grades_deferred:
            print(f"[sync_section] --through {through_date}: {grades_deferred} grade targets deferred (not yet due)")
        grades = in_scope
    if not grades:
        print("[4/5] No grade targets supplied -- skipping grade push.")
        grades_pushed = 0
        grades_skipped = 0
        grades_kept = 0
    else:
        print(f"[4/5] Pushing grades ({len(grades)} targets) ...")
        _load_gradebook_page(ops, cdp, course_id)
        grades_pushed, grades_skipped, grades_kept = _push_grades(
            grades,
            scope_items_by_key,
            students_by_id,
            section,
            state,
            ops,
            cdp,
            dry_run,
            errors,
        )

    # -- summarise ---------------------------------------------------------
    summary = {
        "section": section,
        "course_id": course_id,
        "dry_run": dry_run,
        "scope_items": len(scope_items),
        "assignments_created": assignments_created,
        "grades_pushed": grades_pushed,
        "grades_skipped": grades_skipped,
        "grades_kept": grades_kept,
        "grades_deferred": grades_deferred,
        "errors": errors,
    }

    print("\n[5/5] Run summary:")
    print(json.dumps(summary, indent=2))

    if not dry_run:
        state.log_run(summary)

    return summary


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="Sync Algebra 2 grades into Schoology for one section. "
                    "Schoology = max(app, hand-entered); the app never learns about hand entries."
    )
    p.add_argument(
        "--sync-section",
        required=True,
        choices=list(SECTION_TO_COURSE_ID.keys()),
        help="Which section to sync (PeriodB or PeriodE).",
    )
    p.add_argument(
        "--course-id",
        default=None,
        help=(
            "Schoology course id.  Defaults to the hard-coded id for the section "
            "(PeriodB=7945275782, PeriodE=7945275798)."
        ),
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what WOULD happen; perform no writes and no state mutations.",
    )
    p.add_argument(
        "--grades-fixture",
        default=None,
        metavar="PATH",
        help=(
            "Path to a JSON file whose top-level keys are 'student_id/lesson_key' "
            "strings and whose values are numeric grades.  "
            "Used as the grade targets for this run."
        ),
    )
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Cap scope to first N items.  Useful for smoke-testing.",
    )
    p.add_argument(
        "--through",
        default=None,
        help=(
            "Only create/grade columns due on or before this YYYY-MM-DD "
            "(default: today in America/New_York). Schoology shows ONLY due work."
        ),
    )
    p.add_argument(
        "--no-through",
        action="store_true",
        help="Disable the due-date gate (push every dated column).",
    )
    p.add_argument(
        "--granularity",
        choices=["lesson", "component"],
        default="lesson",
        help=(
            "lesson (default): one coarse blended column per lesson. "
            "component: fine-grained Follow-Along / Quiz / Blooket columns "
            "(data-driven from roadmap-data + blooket-lessons; the full rollout). "
            "Use the matching --grades-fixture granularity."
        ),
    )
    p.add_argument("--apply", action="store_true", help="Apply the reviewed sync plan.")
    args = p.parse_args(argv)
    args.dry_run = args.dry_run or not args.apply
    return args


def _load_grades_fixture(path: str) -> dict:
    """Load grades fixture JSON.

    File format::

        {
          "<student_id>/<lesson_key>": <numeric_value>,
          ...
        }

    Returns a {(student_id, lesson_key): value} dict.
    """
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    grades = {}
    for composite_key, value in raw.items():
        if "/" not in composite_key:
            print(f"[WARN] Skipping malformed grades fixture key: {composite_key!r}")
            continue
        student_id, lesson_key = composite_key.split("/", 1)
        grades[(student_id, lesson_key)] = value
    return grades


def main(argv=None):
    args = _parse_args(argv)

    section = args.sync_section
    course_id = args.course_id or SECTION_TO_COURSE_ID[section]
    dry_run = args.dry_run

    grades: dict = {}
    if args.grades_fixture:
        grades = _load_grades_fixture(args.grades_fixture)
        print(f"[grades-fixture] Loaded {len(grades)} grade targets from {args.grades_fixture}")
    else:
        print("[grades] No --grades-fixture supplied; running with empty grade targets.")

    state = LocalJsonStateStore()

    force_mp_date = SECTION_FORCE_MP_DATE.get(section)
    if force_mp_date:
        print(f"[force-mp] section={section}: filing every assignment into the "
              f"marking period covering {force_mp_date} (summer mock -> MP4).")

    sync_section(
        section,
        course_id,
        dry_run=dry_run,
        state=state,
        grades=grades,
        ops=None,  # imported lazily inside sync_section
        limit=args.limit,
        force_mp_date=force_mp_date,
        granularity=args.granularity,
        through_date=None if args.no_through else (args.through or today_school_date()),
    )


if __name__ == "__main__":
    main()
