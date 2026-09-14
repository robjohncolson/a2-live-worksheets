"""build_periody_mock_fixture.py -- data-driven summer-mock fixture + plan preview.

Replaces the hard-coded throwaways (_periody_finegrained.py / _periody_full_fixture.py)
with the SAME generator the live sync uses (schoology_components via
schoology_sync_section.build_component_scope), so the mock can never disagree
with what a real push would create.

Two jobs:
  1. PLAN PREVIEW (no rig needed): prints the exact fine-grained column plan
     (Follow-Along / Quiz / Blooket per lesson, combined deduped, openers
     quiz-less) with per-unit + per-category counts. This is the review artifact
     -- the live CDP rig can't run on this host, so the plan is generated purely
     from data.
  2. FIXTURE: writes {uid}/{component_key} -> deterministic mock grade for the 3
     mapped Period B uids, consumed by:
         schoology_sync_section.py --sync-section PeriodY --granularity component
             --grades-fixture tools/_periody_component_fixture.json

Usage:
    python tools/build_periody_mock_fixture.py            # plan + write fixture
    python tools/build_periody_mock_fixture.py --plan-only
    python tools/build_periody_mock_fixture.py --unit 1   # limit plan/fixture to unit N

ASCII only. LF line endings.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

import schoology_sync_lib as lib
from schoology_sync_section import (
    PERIOD_LETTER,
    SECTION_FORCE_MP_DATE,
    SCHEDULE_PATH,
    build_component_scope,
    load_schedule,
)

SECTION = "PeriodY"
OUT = os.path.join(SCRIPT_DIR, "_periody_component_fixture.json")

# The 3 mapped real Period B uids + a base grade each (the random students the
# summer mock writes to; see project_schoology_sync memory).
BASES = {"96403370": 88, "96400318": 92, "96400271": 75}


def _grade(base: int, key: str) -> int:
    """Deterministic, realistic per-(uid,column) grade -- stable across re-runs
    so the idempotent sync doesn't re-push (last_synced compares values)."""
    jitter = sum(ord(c) for c in key) % 16
    return max(60, min(100, base - jitter))


def _category_for(kind: str) -> str:
    return lib.KIND_TO_CATEGORY.get(kind, "?")


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--plan-only", action="store_true", help="Print the plan; write no fixture.")
    p.add_argument("--unit", type=int, default=None, help="Limit to a single unit (preview/fixture).")
    p.add_argument("--show", type=int, default=0, metavar="N",
                   help="Print the first N column titles in full (0 = per-unit summary only).")
    args = p.parse_args(argv)

    schedule = load_schedule(SCHEDULE_PATH)
    # include_undated is implied: PeriodY forces every column into MP4, so units
    # 1-5 (null SY26-27 dates) must be included.
    columns = build_component_scope(schedule, SECTION, include_undated=True)
    if args.unit is not None:
        columns = [c for c in columns if c["unit"] == args.unit]

    # ---- Plan preview ----
    from collections import defaultdict
    per_unit = defaultdict(lambda: {"lesson": 0, "quiz": 0, "blooket": 0})
    per_cat = defaultdict(int)
    for c in columns:
        per_unit[c["unit"]][c["kind"]] += 1
        per_cat[_category_for(c["kind"])] += 1

    print("=" * 70)
    print("FINE-GRAINED COLUMN PLAN  (section=%s, force-MP=%s)"
          % (SECTION, SECTION_FORCE_MP_DATE.get(SECTION)))
    print("=" * 70)
    print("%-6s %12s %8s %9s %8s" % ("Unit", "Follow-Along", "Quiz", "Blooket", "Total"))
    for u in sorted(per_unit):
        r = per_unit[u]
        tot = r["lesson"] + r["quiz"] + r["blooket"]
        print("%-6s %12d %8d %9d %8d" % (u, r["lesson"], r["quiz"], r["blooket"], tot))
    print("-" * 70)
    print("Categories: " + ", ".join("%s=%d" % (k, per_cat[k]) for k in sorted(per_cat)))
    print("TOTAL COLUMNS: %d  (x %d students = %d grade cells)"
          % (len(columns), len(BASES), len(columns) * len(BASES)))

    if args.show:
        print("\nFirst %d columns:" % args.show)
        for c in columns[:args.show]:
            print("  %-22s [%-8s] key=%s" % (c["title"], _category_for(c["kind"]), c["key"]))

    # ---- Fixture ----
    if not args.plan_only:
        fixture = {}
        for c in columns:
            for uid, base in BASES.items():
                fixture["%s/%s" % (uid, c["key"])] = _grade(base, c["key"])
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(fixture, f, indent=2)
        print("\nwrote %d fixture entries -> %s" % (len(fixture), OUT))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
