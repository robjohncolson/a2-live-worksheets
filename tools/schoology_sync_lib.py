"""schoology_sync_lib.py -- pure-logic helpers for the Schoology grade-sync tool.

No I/O, no CDP, stdlib only.
"""

import re
from datetime import date

KIND_TO_CATEGORY = {
    'lesson_check': 'Assessments',
    'topic_assessment': 'Assessments',
    'try_it': 'Assignments',
    'flashcard': 'Engagement',
}


def classify_lesson_key(lesson_key: str) -> str:
    key = str(lesson_key or '').upper().replace('_', '-')
    if key.startswith(('TA-', 'TA:')) or 'TOPIC-ASSESSMENT' in key:
        return 'topic_assessment'
    if key.startswith(('LC-', 'LC:')) or 'LESSON-CHECK' in key:
        return 'lesson_check'
    if key.startswith(('BL-', 'BL:', 'FC-', 'FC:')) or 'FLASHCARD' in key:
        return 'flashcard'
    return 'try_it'



# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_unit_from_key(lesson_key: str) -> str:
    """Extract the unit number from a progress-check or poster key.

    Handles: "PC3", "PC_U3", "U3-PC", "U3PC", "POSTER_U4", "U4-POSTER".
    Returns the unit digit string, or '?' if not found.
    """
    # Look for a digit sequence that follows 'U', or a standalone digit sequence
    # adjacent to 'PC' or 'POSTER'.
    upper = lesson_key.upper()

    # Explicit "U<n>" pattern
    m = re.search(r'U(\d+)', upper)
    if m:
        return m.group(1)

    # Trailing digits on keys like "PC3", "POSTER4"
    m = re.search(r'(\d+)', upper)
    if m:
        return m.group(1)

    return '?'


def _parse_topic_numbers(lesson_key: str):
    """Return (unit, topic_range) strings from a lesson key like "4.1-2" or "U4.1".

    Returns (unit_str, topic_str) where topic_str may include a dash range.
    Returns (lesson_key, '') on parse failure.
    """
    # Strip leading 'U' or 'u'
    stripped = re.sub(r'^[Uu]', '', lesson_key)

    # Match  <unit>.<topic>  or  <unit>.<topic_start>-<topic_end>
    m = re.match(r'^(\d+)\.(\d+(?:-\d+)?)$', stripped)
    if m:
        return m.group(1), m.group(2)

    return lesson_key, ''


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def assignment_title(kind: str, lesson_key: str, topic_name: str | None = None) -> str:
    label = {'lesson_check': 'Lesson check', 'topic_assessment': 'Topic assessment',
             'try_it': 'Try-It', 'flashcard': 'Flashcards'}.get(kind, kind)
    return f'{label} {topic_name or lesson_key}'



def assignment_points(kind: str | None = None) -> int:
    return {'lesson_check': 10, 'topic_assessment': 100, 'try_it': 2, 'flashcard': 1}.get(kind, 2)



def marking_period_for_date(date_iso: str, mp_ranges: dict) -> str | None:
    """Return the grading_period_id that contains date_iso (inclusive), or None.

    mp_ranges format::
        { grading_period_id: {'start': 'YYYY-MM-DD', 'end': 'YYYY-MM-DD'} }

    ISO date strings compare correctly as plain strings (lexicographic == chronological).
    A None or empty date_iso returns None.
    """
    if not date_iso:
        return None

    for period_id, bounds in mp_ranges.items():
        start = bounds.get('start', '')
        end = bounds.get('end', '')
        if start and end and start <= date_iso <= end:
            return period_id

    return None


def should_push(target_value, last_synced_value, tol: float = 1e-9) -> bool:
    """Decide whether a grade needs to be pushed to Schoology.

    Rules:
      - target_value is None  -> False  (nothing to push)
      - last_synced_value is None and target is not None -> True (first push)
      - Both numeric: True iff abs difference > tol
      - Non-numeric fallback: compare as strings
    """
    if target_value is None:
        return False

    if last_synced_value is None:
        return True

    try:
        return abs(float(target_value) - float(last_synced_value)) > tol
    except (TypeError, ValueError):
        return str(target_value) != str(last_synced_value)


def plan_assignment_work(scope_keys: list, existing: dict) -> dict:
    """Split scope_keys into assignments that need creating vs. those that can be reused.

    existing format::
        { lesson_key: {'schoology_assignment_id': id_or_None} }

    Returns::
        {'create': [...], 'reuse': [...]}

    Order follows scope_keys; duplicates are removed (first occurrence wins).
    """
    seen = set()
    create = []
    reuse = []

    for key in scope_keys:
        if key in seen:
            continue
        seen.add(key)

        row = existing.get(key)
        if row is None:
            create.append(key)
        else:
            sid = row.get('schoology_assignment_id')
            if sid is None:
                create.append(key)
            else:
                reuse.append(key)

    return {'create': create, 'reuse': reuse}


def compute_sync_actions(targets: dict, last_synced: dict) -> dict:
    """Determine which grade entries need pushing vs. skipping.

    targets / last_synced are keyed by any hashable id
    (e.g. a (student_id, lesson_key) tuple or a plain string).

    Returns::
        {
          'push': [keys where should_push is True],
          'skip': [keys where target is not None but should_push is False],
        }

    Keys whose target is None are omitted entirely.
    Iteration order follows targets.
    """
    push = []
    skip = []

    for key, target_value in targets.items():
        if target_value is None:
            continue

        last_value = last_synced.get(key)
        if should_push(target_value, last_value):
            push.append(key)
        else:
            skip.append(key)

    return {'push': push, 'skip': skip}
