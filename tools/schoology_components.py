"""schoology_components.py -- data-driven FINE-GRAINED column generator for the
Schoology grade sync (the full-rollout replacement for the hard-coded 3-grid
throwaway _periody_finegrained.py).

A "component" is one gradebook column for one lesson:
  - Follow-Along  (worksheet blanks -> category 'Lesson')   key  FA:<group>
  - Quiz          (curriculum quiz  -> category 'Quizzes')   key  QUIZ:<topic>
  - Blooket       (Blooket game     -> category 'Blooket')   key  BL:<group>

Presence is DATA-DRIVEN, never a fixed grid:
  - Follow-Along exists for every lesson (one column per worksheet GROUP, so a
    combined worksheet like 6.1-2 yields ONE column, not two).
  - Quiz exists only where the topic has a quiz. roadmap-data.json urls.quiz is
    null for every X.1 opener (and combined opener-halves), so 1.1 never gets a
    Quiz column.
    KNOWN FOLLOW-UP (adversarial review 2026-06-03): this COLUMN gate reads
    roadmap urls.quiz, while the live PRODUCER fills grades from the engine's
    lesson.quizTotal (answer-key derived). The two disagree on exactly {5.6, 9.3}
    (roadmap has a quiz URL but the answer key has no gradable U#-L#-Q items),
    so those two Quiz columns would be created but never filled. The fix is to
    source quiz presence from the same quizTotal signal the producer fills (the
    in-app gradebook deriver, roster-server/gradebook-grid.js, already does this).
    Bundled with the PC+Poster column pass.
  - Blooket exists only for topics in blooket-lessons.json (the engine's
    hasBlooket denominator). Units 4-7 are absent there today (roadmap-data has
    no Blooket URLs for them) -> no Blooket columns for those units.

The SAME key scheme is shared by:
  - the column generator (component_columns)  -> what the orchestrator creates
  - the live producer (component_grades_from_class_doc) -> grades from /class/grades
  - the mock fixture builder (build_periody_mock_fixture)
so a fixture key always resolves to exactly one generated column.

Pure logic. stdlib only. No I/O except the small JSON loaders. ASCII only. LF.
"""
from __future__ import annotations

import json
import re

# ---------------------------------------------------------------------------
# Component kinds -> the SAME kinds schoology_sync_lib.KIND_TO_CATEGORY maps:
#   'lesson' -> 'Lesson', 'quiz' -> 'Quizzes', 'blooket' -> 'Blooket'.
# Reusing them means _resolve_category_id needs no change.
# ---------------------------------------------------------------------------

KIND_FOLLOWALONG = "lesson"
KIND_QUIZ = "quiz"
KIND_BLOOKET = "blooket"
# Unit-level components. The kind strings match schoology_sync_lib.KIND_TO_CATEGORY
# ('progress_check' -> 'Progress Check', 'poster' -> 'Posters'), NOT node's internal
# 'pc'/'poster' -- only the COLUMN KEYS (PC:U#, POSTER:U#) must match node.
KIND_PROGRESS_CHECK = "progress_check"
KIND_POSTER = "poster"

# Stable order within a unit so the plan reads FA, Quiz, Blooket, then the
# unit-level Progress Check + Poster (mirrors gradebook-grid.js KIND_RANK).
_COMP_RANK = {KIND_FOLLOWALONG: 0, KIND_QUIZ: 1, KIND_BLOOKET: 2, KIND_PROGRESS_CHECK: 3, KIND_POSTER: 4}


# ---------------------------------------------------------------------------
# Key + title scheme (the single source of truth shared by all three callers)
# ---------------------------------------------------------------------------

def group_label(unit, worksheet_key) -> str:
    """The human label for a worksheet GROUP: '1.1' (solo) or '6.1-2' (combined).

    A solo lesson 1.1 has worksheetKey '1' -> '1.1'. A combined 6.1/6.2 share
    worksheetKey '1-2' -> '6.1-2'.
    """
    return f"{unit}.{worksheet_key}"


def fa_key(label: str) -> str:
    return f"FA:{label}"


def quiz_key(topic_key: str) -> str:
    return f"QUIZ:{topic_key}"


def bl_key(label: str) -> str:
    return f"BL:{label}"


def fa_title(label: str) -> str:
    return f"{label} Follow-Along"


def quiz_title(topic_key: str) -> str:
    return f"{topic_key} Quiz"


def bl_title(label: str) -> str:
    return f"{label} Blooket"


# Unit-level component keys/titles. Keys match gradebook-grid.js EXACTLY
# (PC:U<n> / POSTER:U<n>) so the in-app grid and the Schoology push agree.
def pc_key(unit) -> str:
    return f"PC:U{unit}"


def pc_title(unit) -> str:
    return f"Unit {unit} Progress Check"


def poster_key(unit) -> str:
    return f"POSTER:U{unit}"


def poster_title(unit) -> str:
    return f"Unit {unit} Poster"


# ---------------------------------------------------------------------------
# Presence loaders (authoritative data sources)
# ---------------------------------------------------------------------------

def load_quiz_topics(answer_key_path: str) -> set:
    """Return the set of topicKeys that HAVE a gradable curriculum quiz.

    Sourced from the ANSWER KEY, mirroring the engine's computeQuizTotals
    (roster-server/lesson-grade.js): a topic "has a quiz" iff the answer key has a
    gradable item matching ^U#-L#-Q (case-insensitive). That shape excludes PC items
    (U#-PC-Q) and worksheet blanks (WS-U#L#-Q), and `answerKey == null` items are
    skipped as non-gradable. This is the SAME signal the live producer fills grades
    from (lesson.quizTotal > 0), so a generated Quiz column always gets a grade --
    unlike roadmap-data urls.quiz, which lists {5.6, 9.3} that have NO gradable quiz
    items, producing empty columns (the bug this fixes).
    """
    with open(answer_key_path, "r", encoding="utf-8") as f:
        doc = json.load(f)
    # The bundled answer key nests the item map under a top-level "answerKey" key --
    # the SAME map the engine feeds computeQuizTotals (via answerKeyMapOrNull). Fall
    # back to treating doc itself as the map if that key is absent.
    key_map = doc.get("answerKey")
    if not isinstance(key_map, dict):
        key_map = doc
    out = set()
    for item_id, entry in key_map.items():
        if not isinstance(entry, dict) or entry.get("answerKey") is None:
            continue  # gradable items only (answerKey null = an unscorable FRQ entry)
        m = re.match(r"^U(\d+)-L(\d+)-Q", str(item_id), re.IGNORECASE)
        if m:
            out.add(f"{m.group(1)}.{m.group(2)}")  # quizzes are per single-lesson topic
    return out


def load_blooket_topics(blooket_lessons_path: str) -> set:
    """Return the set of topicKeys that HAVE a Blooket (presence / hasBlooket UI).

    M2a presence/required split (G4):
      topics / allTopics = PRESENCE (all Blooket-bearing lessons, incl. bonus)
      requiredTopics     = grade Due denominator (core only) — NOT used here

    Schoology component columns need the presence set so bonus lessons still
    get a visible Blooket column (enrichment, never required).
    Prefer allTopics when present; fall back to topics.
    """
    with open(blooket_lessons_path, "r", encoding="utf-8") as f:
        doc = json.load(f)
    if isinstance(doc.get("allTopics"), list) and doc["allTopics"]:
        return set(doc["allTopics"])
    return set(doc.get("topics") or [])


# ---------------------------------------------------------------------------
# The generator
# ---------------------------------------------------------------------------

def _topic_sort_key(topic_key: str):
    """Sort '1.10' AFTER '1.9' (numeric, not lexical)."""
    m = re.match(r"^(\d+)\.(\d+)", str(topic_key))
    if not m:
        return (9999, 9999)
    return (int(m.group(1)), int(m.group(2)))


def component_columns(lessons: dict, period_letter: str, *, quiz_topics: set,
                      blooket_topics: set, include_undated: bool = False,
                      progress_checks: dict | None = None, posters: dict | None = None,
                      topic_assessments: list | None = None) -> list:
    """A column per A2 item; explicit lesson items match the server registry."""
    from schoology_sync_lib import KIND_TO_CATEGORY, assignment_points
    columns = {}
    definitions = []
    for lesson_key, lesson in lessons.items():
        if lesson.get('kind') == 'work' or '.' not in lesson_key:
            continue
        due = (lesson.get('periods') or {}).get(period_letter)
        if not due and not include_undated:
            continue
        unit, number = lesson_key.split('.', 1)
        items = lesson.get('items')
        if items is None:
            items = [{'itemId': f'LC-U{unit}-L{number}', 'source': 'lesson-check'}]
            items += [{'itemId': f'TI-U{unit}-L{number}-{i+1}', 'source': 'try-it'}
                      for i in range(lesson.get('tryItCount', 5))]
            deck = lesson.get('worksheetKey') or number
            items += [{'itemId': f'BL-U{unit}-L{deck}-DESK_DONE', 'source': 'flashcard'}]
        for item in items:
            definitions.append({**item, 'lessonKey': lesson_key, 'dueDate': item.get('dueDate', due), 'unit': int(unit)})
    definitions += topic_assessments or []
    for item in definitions:
        kind = item.get('source', '').replace('-', '_')
        if kind not in KIND_TO_CATEGORY:
            continue
        key = item['itemId']
        due = (item.get('periods') or {}).get(period_letter) or item.get('dueDate')
        if not due and not include_undated:
            continue
        columns[key] = {'key': key, 'kind': kind, 'category': KIND_TO_CATEGORY[kind],
                        'title': key, 'group_label': item.get('lessonKey', ''),
                        'topic_keys': [item['lessonKey']] if item.get('lessonKey') else [],
                        'due_date': due, 'unit': item.get('unit', 0),
                        'points': assignment_points(kind)}
    return sorted(columns.values(), key=lambda c: (c['due_date'] or '', c['key']))



# ---------------------------------------------------------------------------
# Live producer: /class/grades -> component fixture
# ---------------------------------------------------------------------------

def component_grades_from_class_doc(doc: dict, uid_map: dict | None = None) -> dict:
    """Emit earned POINTS, using the same item IDs as the district gradebook."""
    out = {}
    for student in doc.get('students', []) or []:
        sid = str(student.get('studentId'))
        uid = str(student.get('schoologyUid') or (uid_map or {}).get(sid, sid))
        for item in student.get('items', []):
            if item.get('attempted') and item.get('due'):
                out[f"{uid}/{item['itemId']}"] = item['points']
    return out

