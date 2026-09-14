# Part A plan

Corrected specification re-read in full on 2026-09-11. Acceptance is the 11 Work Days, corrected five unit ends, March 22/24 review ends and 12 E pairs; the older E table is superseded.

1. Read both calendar specs and c581816; attempt the GitNexus refresh once, with git grep caller inventories as the authorized fallback. Check the literal rule against the acceptance fixture before implementation; stop and report any conflict without special-casing.
2. Add B configuration and generated Work Days; minimally update Desk tiles, legend, Do Now, resources and progress where needed. Add extracted-function regressions and Schoology scope regression. Commit generator + Desk + tests + this plan.
3. Regenerate both schedule JSON copies and update date expectations only. Run focused Vitest, schedule --check, root npm test, roster-server npm test and pytest tests/. Commit JSON + expected dates + verification results.
4. Never push; leave unrelated working-tree changes alone. Use test-results/ or TEMP for scratch, never a scratch directory under state/.

Caller inventory (git grep, full evidence: test-results/b-work-callers.txt): generateSchedule: activateYear and schedule builder; cls/htm/cellAria: rCal; _computePace: rProg; rProg: year/period switching, grade hydration, refresh and minute timer; _isLessonComplete: localLessonState, recursive group checks, resource/progress and advancement consumers; showResourcePanel: tile/Do Now opening, resource refresh and grade hydration; renderDoNow: sign-in/session refresh, visibility change, year switching and resource updates. build_scope: sync_section. Builder calendar assembly is top-level code. New tests have no production callers. Final inventory must include any additional symbol actually edited.

Current caller evidence: test-results/b-work-best-wins-callers.txt. generateSchedule is called by loadYear and the builder; updateLegend by loadYear; sTip by rCal; localLessonState by calendar, pace, gate and Do Now consumers; donowCellState by paintDonowCells. New catch-up helpers will be called by renderDoNow and showResourcePanel. Existing pace/progress filters already exclude B-Work and need tests, not changes. Tests have no production callers.

Risk: generator changes affect all live calendar consumers and generated server due dates; completion/Do Now are broadly shared paths (HIGH manual estimate). Keep edits specific to kind=work and preserve legacy definitions and E parameters. GitNexus impact must be attempted before each existing symbol edit; detect_changes before each commit.

GitNexus refresh attempted once: failed EPERM writing the user registry; CLI impact attempts recorded missing Desk symbols/database locks and low-risk sync callers. Authorized git-grep fallback used; pre-commit detect_changes still attempted.
