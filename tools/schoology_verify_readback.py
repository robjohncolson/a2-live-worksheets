"""Read back the grade cells the live sync just wrote and compare to the fixture it used.

    python tools/schoology_verify_readback.py PeriodB tools/.schoology-sync-logs/fixture-PeriodB-<ts>.json

Resolves each column by TITLE (data-x), reads every student's cell input
value via the rig, and diffs against the fixture keyed '<schoology_uid>/<KIND>:<topic>'.
"""
import json
import sys

sys.path.insert(0, "tools")
import schoology_ops as ops  # noqa: E402
from schoology_sync_section import SECTION_TO_COURSE_ID  # noqa: E402

TITLES = {"FA:1.1": "1.1 Follow-Along", "BL:1.1": "1.1 Blooket"}


def main():
    section, fixture_path = sys.argv[1], sys.argv[2]
    course = SECTION_TO_COURSE_ID[section]
    fixture = json.load(open(fixture_path, encoding="utf-8"))
    cdp = ops.connect(reuse=True)
    ops.navigate(cdp, ops.gradebook_url(course))
    ops.inject_helpers(cdp)
    students = ops.list_students(cdp)
    print(f"{section} course={course} rows={len(students)}")
    total_match = total_diff = total_blank = 0
    for key, title in TITLES.items():
        col = ops.find_assignment_id_by_title(cdp, title)
        print(f"\n== {title!r} -> column data-x={col}")
        if col is None:
            print("   COLUMN NOT FOUND")
            continue
        for s in students:
            uid, row = str(s.get("studentId")), s.get("rowIndex")
            expected = fixture.get(f"{uid}/{key}")
            sel = ops.find_cell_selector(cdp, col, row)
            # The cell container carries the persisted grade in its aria-label ('<student>, <title>,
            # <grade> out of <pts>'); the inner input's .value is only populated while editing.
            info = ops.helper_call(cdp, f"(function(){{var e=document.querySelector({json.dumps(sel)});if(!e)return null;"
                                        f"var i=e.querySelector('input');return {{aria:e.getAttribute('aria-label'),text:(e.textContent||'').trim(),"
                                        f"input:i?i.value:null,html:e.outerHTML.slice(0,220)}};}})()") if sel else None
            live_s = ""
            if info:
                import re
                m = re.search(r",\s*([0-9]+(?:\.[0-9]+)?)\s+out of", info.get("aria") or "")
                live_s = m.group(1) if m else (str(info.get("input") or info.get("text") or "").strip())
                if row == 0 and key == "FA:1.1":
                    print("   [diag row0]", json.dumps(info)[:300])
            if expected is None:
                status = "blank ok" if live_s == "" else "UNEXPECTED VALUE"
                total_blank += 1
            else:
                exp_s = str(round(float(expected)))
                same = live_s != "" and abs(float(live_s) - float(expected)) < 0.5
                status = "match" if same else f"DIFF (expected {exp_s})"
                total_match += same
                total_diff += (not same)
            print(f"   row {row:>2} {s.get('name','?')[:28]:<28} uid={uid:<10} live={live_s or '·':<5} {status}")
    print(f"\nSUMMARY match={total_match} diff={total_diff} blank(no fixture value)={total_blank}")


if __name__ == "__main__":
    main()
