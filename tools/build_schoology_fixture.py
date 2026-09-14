"""build_schoology_fixture.py -- produce the Schoology grades-fixture from the
roster-server grade engine (GRADE_PIPELINE_E2E_SPEC.md P4).

GETs /class/grades and emits the {"<student>/<lessonKey>": value} fixture that
`schoology_sync_section.py --grades-fixture` consumes. The teacher secret is read
from the ENVIRONMENT (ROSTER_TEACHER_SECRET) -- never passed on the CLI -- so this
can run headless in the daily scheduled batch (see the spec's delivery model).

  ROSTER_TEACHER_SECRET=... python tools/build_schoology_fixture.py \
      --section PeriodB --out fixture.json [--uid-map uidmap.json]
  ROSTER_TEACHER_SECRET=... python tools/build_schoology_fixture.py \
      --section PeriodB --inspect          # print pipeline state, write nothing

--inspect doubles as the P3 sanity check: it reports whether v3 is actually live
(pcAvg/workAvg present) and how much real grade data exists, before any push.

The Schoology push keys on the SCHOOLOGY uid. Once the durable roster.schoology_uid
bridge (P4b) is populated, /class/grades surfaces each student's schoologyUid and the
fixture is keyed by it automatically -- so --uid-map is now OPTIONAL. Pass --uid-map
(a JSON {rosterId: schoologyUid}) only to override the surfaced uid or to translate
before the bridge is backfilled; an explicit map still takes precedence over the
roster id, but the server-surfaced schoologyUid wins over both.

ASCII only. LF line endings.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import schoology_components as components  # noqa: E402

DEFAULT_BASE = "https://a2-live-worksheets-production.up.railway.app"


# --------------------------------------------------------------------------- #
# Pure mapping (unit-tested; no network)                                       #
# --------------------------------------------------------------------------- #

def _lesson_key(lesson: dict):
    """The lesson's Schoology column key -- tolerant of field-name drift."""
    for k in ("topicKey", "lessonKey", "key", "topic"):
        v = lesson.get(k)
        if v is not None:
            return str(v)
    return None


def build_fixture(doc: dict, uid_map: dict | None = None,
                  granularity: str = "lesson") -> dict:
    """Map a /class/grades response to {"<student>/<key>": value}.

    granularity 'lesson' (default) -> per-lesson lessonGrade keyed by topic;
    'quarter' -> per-quarter quarterGrade keyed by Q1..Q4; 'both' -> union.

    Key resolution per student (highest priority first): the server-surfaced
    schoologyUid (P4b bridge), then the explicit uid_map, then the roster id.
    """
    if any('items' in s for s in doc.get('students', [])):
        return components.component_grades_from_class_doc(doc, uid_map)
    uid_map = uid_map or {}
    out = {}
    for s in doc.get("students", []) or []:
        rid = str(s.get("studentId"))
        surfaced = s.get("schoologyUid")
        uid = str(surfaced) if surfaced not in (None, "") else uid_map.get(rid, rid)
        if granularity in ("lesson", "both"):
            for lesson in (s.get("lessons") or []):
                key = _lesson_key(lesson)
                val = lesson.get("lessonGrade")
                if key is not None and val is not None:
                    out[f"{uid}/{key}"] = val
        if granularity in ("quarter", "both"):
            for qk, q in (s.get("quarters") or {}).items():
                val = (q or {}).get("quarterGrade")
                if val is not None:
                    out[f"{uid}/{qk}"] = val
    return out


def inspect_summary(doc: dict) -> dict:
    """Pipeline-state summary -- the P3 sanity check, no network needed."""
    students = doc.get("students", []) or []
    quarters = [q for s in students for q in (s.get("quarters") or {}).values()]
    # pcAvg/workAvg are non-null ONLY on the v3 path (grade.js:311-312), so their
    # presence proves USE_V3_GRADING took effect on the live server.
    v3_active = any(
        (q or {}).get("pcAvg") is not None or (q or {}).get("workAvg") is not None
        for q in quarters
    )
    lessons = [lesson for s in students for lesson in (s.get("lessons") or [])]
    graded = [lesson for lesson in lessons if lesson.get("lessonGrade") is not None]
    quiz_signal = sum(
        1 for s in students for u in (s.get("units") or {}).values()
        if isinstance(u, dict) and u.get("Q") is not None
    )
    pc_signal = sum(
        1 for s in students for u in (s.get("units") or {}).values()
        if isinstance(u, dict) and u.get("pcRawPct") is not None
    )
    # P4b: how many students carry a server-surfaced schoologyUid. Zero means the
    # roster.schoology_uid bridge is empty (migration 0012 not run, or not backfilled).
    uid_bridge_covered = sum(
        1 for s in students if s.get("schoologyUid") not in (None, "")
    )
    return {
        "students": len(students),
        "v3_active": v3_active,
        "lesson_entries": len(lessons),
        "graded_lessons": len(graded),
        "units_with_quiz_data": quiz_signal,
        "units_with_pc_data": pc_signal,
        "uid_bridge_covered": uid_bridge_covered,
    }


# --------------------------------------------------------------------------- #
# Network                                                                      #
# --------------------------------------------------------------------------- #

def fetch_class_grades(base: str, section: str | None, secret: str,
                       timeout: float = 30.0) -> dict:
    url = base.rstrip("/") + "/class/grades"
    if section:
        url += "?section=" + section
    req = Request(url, headers={"x-teacher-secret": secret})
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


# --------------------------------------------------------------------------- #
# CLI                                                                          #
# --------------------------------------------------------------------------- #

def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Build the Schoology grades-fixture from /class/grades.")
    p.add_argument("--base", default=os.environ.get("ROSTER_BASE", DEFAULT_BASE))
    p.add_argument("--section", default=None, help="Roster section (omit for all).")
    p.add_argument("--out", default=None, help="Fixture output path (JSON).")
    p.add_argument("--uid-map", default=None, help="JSON {rosterId: schoologyUid} to translate keys.")
    p.add_argument("--granularity", choices=["lesson", "quarter", "both", "component"], default="lesson",
                   help="component: fine-grained Follow-Along / Quiz / Blooket per lesson "
                        "(the full rollout; pair with --granularity component on the sync side).")
    p.add_argument("--inspect", action="store_true", help="Print pipeline state, write nothing.")
    args = p.parse_args(argv)

    secret = os.environ.get("ROSTER_TEACHER_SECRET")
    if not secret:
        print("ERROR: set ROSTER_TEACHER_SECRET in the environment (not on the CLI).", file=sys.stderr)
        return 2

    try:
        doc = fetch_class_grades(args.base, args.section, secret)
    except HTTPError as e:
        print(f"ERROR: /class/grades HTTP {e.code} ({e.reason})", file=sys.stderr)
        return 1
    except URLError as e:
        print(f"ERROR: could not reach {args.base}: {e.reason}", file=sys.stderr)
        return 1

    if not doc.get("ok"):
        print(f"ERROR: /class/grades returned not-ok: {doc.get('error')}", file=sys.stderr)
        return 1

    if args.inspect:
        summary = inspect_summary(doc)
        print(json.dumps(summary, indent=2))
        if not summary["v3_active"]:
            print("\nNOTE: v3 NOT active (no pcAvg/workAvg) -- USE_V3_GRADING is not in "
                  "effect on this server, or it has not redeployed.", file=sys.stderr)
        if summary["graded_lessons"] == 0:
            print("NOTE: zero graded lessons -- no work has reached the ledger yet "
                  "(P1 feeder live? students submitted since the cr redeploy?).", file=sys.stderr)
        if summary["students"] > 0 and summary["uid_bridge_covered"] == 0:
            print("NOTE: uid bridge is empty (no student carries a schoologyUid) -- run "
                  "migration 0012 + backfill via "
                  "`node scripts/teacher-roster.mjs --set-schoology-uids`, "
                  "else pass --uid-map to key the fixture by Schoology uid.", file=sys.stderr)
        return 0

    uid_map = None
    if args.uid_map:
        with open(args.uid_map, "r", encoding="utf-8") as f:
            uid_map = json.load(f)

    if args.granularity == "component":
        fixture = components.component_grades_from_class_doc(doc, uid_map=uid_map)
    else:
        fixture = build_fixture(doc, uid_map=uid_map, granularity=args.granularity)
    payload = json.dumps(fixture, indent=2)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(payload + "\n")
        print(f"wrote {len(fixture)} targets -> {args.out}"
              + ("" if uid_map else "  (keyed by ROSTER id -- pass --uid-map for Schoology uids)"))
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
