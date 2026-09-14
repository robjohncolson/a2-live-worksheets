"""Schoology Grade Sync v1 -- P1 manual one-shot grade write.

Per SCHOOLOGY_SYNC_V1_BUILD.md P1 ship gate: drive a real Edge session
into the Schoology gradebook and land ONE grade in ONE cell for ONE
student in ONE existing assignment, verified visually in the browser.

The teacher signed into Schoology once during s120 P0 discovery; the
cookie persists in %TEMP%/edge-claude-cdp for ~90 days (KMSI=Yes). This
script reuses that profile via tools/cdp/edge.py -- no auth happens
inside the sync.

CLI shape (P1):
    python tools/schoology-sync.py --p1-discover \\
        --course-id 7945275782

    python tools/schoology-sync.py --p1-write \\
        --course-id 7945275782 \\
        --student-id 96400481 \\
        --column-key <data-x-from-gradebook> \\
        --value 85

--p1-discover prints the student roster + the assignment columns
present in the live gradebook so the next call can pass the right
--column-key and --student-id. It writes nothing.

--p1-write actually types the value into the cell. Always re-reads
the cell after writing to confirm the value landed.

Safety:
- This script is the FIRST write into a real Schoology gradebook
  that students/parents can see. Always run --p1-discover first,
  always use a "Sync Test 1" assignment for the first --p1-write,
  always verify visually in Edge before scripting against real
  assignments.
- The default behavior is conservative: explicit flags only, no
  Supabase reads, no batch loops.

ASCII only. LF line endings.
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import Optional

# Reuse the existing CDP rig.
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(SCRIPT_DIR, "cdp"))
from edge import EdgeCDP, DEFAULT_PORT  # type: ignore

# Live-ops layer -- inject_helpers, helper_call, detect_login_state,
# gradebook_url, and write_grade_to_cell live here so P2+ can import them.
import schoology_ops as ops


SCHOOLOGY_BASE = ops.SCHOOLOGY_BASE

# --- Algebra 2 sync targets per s120 P0 discovery + s121 user decision ---
# Sec 1 = Period B; Sec 2 = Period E.
SECTION_TO_COURSE_ID = {
    "PeriodB": "8537033028",   # SY26-27 "Algebra 2 · Section 1" (13 students; discovered via the rig 2026-09-04)
    "PeriodE": "8537033042",   # SY26-27 "Algebra 2 · Section 2" (15 students). SY25-26 mock courses were 7945275782 / 7945275798.
}
COURSE_ID_TO_SECTION = {v: k for k, v in SECTION_TO_COURSE_ID.items()}

# Re-export for any callers that imported these names from this module directly.
inject_helpers   = ops.inject_helpers
helper_call      = ops.helper_call
detect_login_state = ops.detect_login_state
gradebook_url    = ops.gradebook_url


# --------------------------------------------------------------------------- #
# Login detection                                                              #
# --------------------------------------------------------------------------- #

def assert_authenticated(cdp: EdgeCDP) -> None:
    state = detect_login_state(cdp)
    if state == "authenticated":
        return
    if state == "login_required":
        print(
            "schoology-sync: session expired -- run this to reauth:\n"
            f"  python tools/cdp/edge.py --url {SCHOOLOGY_BASE} --keep\n"
            "then sign in via MS SSO (KMSI=Yes) and re-run.",
            file=sys.stderr,
        )
    else:
        print(
            f"schoology-sync: page does not look like a gradebook (state={state}).\n"
            "Either the URL is wrong or Schoology re-rendered the page. Re-screenshot:\n"
            "  python tools/cdp/edge.py --shot tools/cdp/_shots/schoology-state.png --keep",
            file=sys.stderr,
        )
    raise SystemExit(2)


# --------------------------------------------------------------------------- #
# P1 commands                                                                  #
# --------------------------------------------------------------------------- #

def p1_discover(cdp: EdgeCDP, course_id: str) -> None:
    """Print the live gradebook's student roster + assignment columns.

    Read-only. Used to learn the right --student-id and --column-key
    before calling --p1-write.
    """
    section_name = COURSE_ID_TO_SECTION.get(course_id, "?")
    print(f"schoology-sync: discovering course {course_id} ({section_name})")
    cdp.attach_url(ops.gradebook_url(course_id), wait_ms=3500)
    ops.inject_helpers(cdp)
    assert_authenticated(cdp)

    students = ops.list_students(cdp)
    columns  = ops.list_assignments(cdp)

    print()
    print(f"Students ({len(students)}):")
    for s in students:
        print(f"  rowIndex={s['rowIndex']:>2}  uid={s['studentId']:<10}  name={s['name']}")

    print()
    print(f"Columns ({len(columns)}):")
    for c in columns:
        flag = "AGGREGATE" if c.get("isAggregate") else "ASSIGNMENT"
        print(f"  data-x={c['columnKey']:<24}  {flag}")

    # Print copy-pasteable commands for the next step.
    print()
    print("To preview a cell selector for a specific (student, column):")
    print(
        f"  python tools/schoology-sync.py --p1-write --course-id {course_id} "
        "--student-id <uid> --column-key <data-x> --value <number> --dry-run"
    )


def p1_write(
    cdp: EdgeCDP,
    course_id: str,
    student_id: str,
    column_key: str,
    value: float,
    dry_run: bool = False,
) -> None:
    """Land ONE grade in ONE cell for ONE student. P1 ship gate.

    With --dry-run, prints the resolved cell selector + the value that
    WOULD be typed, but does not click or type.

    The live write delegates to ops.write_grade_to_cell which contains
    the P1b-VERIFIED mechanism (byte-for-byte extraction from the original
    p1_write body in schoology-sync.py, s122 2026-05-29).
    """
    section_name = COURSE_ID_TO_SECTION.get(course_id, "?")
    print(f"schoology-sync: P1 write into course {course_id} ({section_name})")
    cdp.attach_url(ops.gradebook_url(course_id), wait_ms=3500)
    ops.inject_helpers(cdp)
    assert_authenticated(cdp)

    students = ops.list_students(cdp)
    student = next((s for s in students if s.get("studentId") == student_id), None)
    if student is None:
        ids = ", ".join(s.get("studentId", "") for s in students)
        print(
            f"schoology-sync: student_id {student_id} not found in course {course_id}.\n"
            f"Enrolled student_ids: {ids}",
            file=sys.stderr,
        )
        raise SystemExit(3)

    columns = ops.list_assignments(cdp)
    if not any(c.get("columnKey") == column_key for c in columns):
        keys = ", ".join(c.get("columnKey", "") for c in columns)
        print(
            f"schoology-sync: column_key '{column_key}' not in this gradebook.\n"
            f"Available columns: {keys}",
            file=sys.stderr,
        )
        raise SystemExit(4)

    selector = ops.find_cell_selector(cdp, column_key, int(student["rowIndex"]))
    if not selector:
        print("schoology-sync: findCellSelector returned null", file=sys.stderr)
        raise SystemExit(5)

    print(f"  student: {student['name']} (uid={student_id}, rowIndex={student['rowIndex']})")
    print(f"  column : {column_key}")
    print(f"  cell   : {selector}")
    print(f"  value  : {value}")

    if dry_run:
        # Confirm the selector actually resolves on the live page.
        import json as _json
        exists = cdp.eval_js(f"!!document.querySelector({_json.dumps(selector)})")
        print(f"  dry-run: cell present in DOM = {exists}")
        return

    # --- live write ------------------------------------------------------ #
    # Delegates to ops.write_grade_to_cell -- the P1b-VERIFIED mechanism.
    # See schoology_ops.py write_grade_to_cell docstring for the full recipe.
    result = ops.write_grade_to_cell(cdp, column_key, int(student["rowIndex"]), value)

    if not result.get("focused"):
        print("schoology-sync: could not focus the grade input after retries.", file=sys.stderr)
        cdp.screenshot(os.path.join(SCRIPT_DIR, "cdp", "_shots", "schoology-p1-no-input.png"))
        raise SystemExit(7)

    if not result.get("ok"):
        print("schoology-sync: write_grade_to_cell reported failure.", file=sys.stderr)
        cdp.screenshot(os.path.join(SCRIPT_DIR, "cdp", "_shots", "schoology-p1-no-input.png"))
        raise SystemExit(7)

    print(f"  input value after typing: {result.get('typed')!r}")

    shot_path = os.path.join(SCRIPT_DIR, "cdp", "_shots", "schoology-p1-after-write.png")
    cdp.screenshot(shot_path)
    print(f"  screenshot saved: {shot_path}")
    print()
    print("schoology-sync: P1 write complete. Reload the gradebook to confirm the value persisted.")


# --------------------------------------------------------------------------- #
# CLI                                                                          #
# --------------------------------------------------------------------------- #

def main() -> int:
    p = argparse.ArgumentParser(description="Schoology Grade Sync v1 -- P1 one-shot.")
    p.add_argument("--p1-discover", action="store_true",
                   help="Print roster + assignment columns from the live gradebook.")
    p.add_argument("--p1-write", action="store_true",
                   help="Write ONE grade into ONE cell for ONE student.")
    p.add_argument("--course-id", default=None,
                   help="Schoology course id (e.g. 7945275782 for Algebra 2 Sec 1 = Period B).")
    p.add_argument("--section", default=None, choices=sorted(SECTION_TO_COURSE_ID.keys()),
                   help="Period name (PeriodB or PeriodE); resolved to a course id.")
    p.add_argument("--student-id", default=None, help="Schoology user id (uid).")
    p.add_argument("--column-key", default=None,
                   help="data-x attribute value of the target assignment column.")
    p.add_argument("--value", type=float, default=None, help="Grade value to write.")
    p.add_argument("--dry-run", action="store_true",
                   help="With --p1-write: resolve the selector but do not click/type.")
    p.add_argument("--port", type=int, default=DEFAULT_PORT)
    p.add_argument("--keep", action="store_true",
                   help="Don't close Edge on exit (default: leave open for next run).")
    args = p.parse_args()

    if not (args.p1_discover or args.p1_write):
        p.print_help()
        return 1

    course_id: Optional[str] = args.course_id
    if course_id is None and args.section:
        course_id = SECTION_TO_COURSE_ID[args.section]
    if course_id is None:
        print("schoology-sync: --course-id or --section required.", file=sys.stderr)
        return 1

    cdp = EdgeCDP(port=args.port)
    # Pass keep=True semantics by default -- the user wants the browser open
    # across multiple runs so the cookie stays warm and they can verify.
    try:
        cdp.launch(SCHOOLOGY_BASE, reuse=True)
        if args.p1_discover:
            p1_discover(cdp, course_id)
        elif args.p1_write:
            for name, val in (("student-id", args.student_id), ("column-key", args.column_key), ("value", args.value)):
                if val in (None, ""):
                    print(f"schoology-sync: --{name} is required with --p1-write.", file=sys.stderr)
                    return 1
            p1_write(
                cdp,
                course_id=course_id,
                student_id=args.student_id,
                column_key=args.column_key,
                value=args.value,
                dry_run=args.dry_run,
            )
    finally:
        # Default: leave Edge running so the next run reuses the cookie and
        # the user can verify what landed visually.
        if not args.keep:
            # Even without --keep, only close the WS; don't kill Edge.
            cdp.ws.close() if cdp.ws else None

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
