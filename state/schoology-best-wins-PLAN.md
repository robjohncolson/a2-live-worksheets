# Part B plan

Specification re-read in full on 2026-09-11. Keep sync_section signature and scheduled CLI intact; add the required explanatory --help text only. _parse_args is called by main and CLI tests. Keep lib.compute_sync_actions unchanged; orchestration will skip targets already covered by the recorded higher grade. New reader has only _push_grades and test callers. Detailed git-grep evidence: test-results/b-work-best-wins-callers.txt.

1. After Part A, inspect ops DOM fixtures, sync action/state logic and existing tests. Use GitNexus upstream impact plus git grep caller inventory before existing symbol edits.
2. Add pure DOM grade reader and best-wins comparison, kept count and informative dry-run output, preserving sync_section signature and scheduled task CLI. Add fake-ops matrix, DOM parsing, tolerance and second-run idempotence tests. Commit ops + sync + tests + this plan.
3. Add README paragraph explaining one-way max(app, hand-entered) and the existing teacher lesson-unlock override. Run all required verification suites including full pytest. Commit README + final summary. Four commits total; never push.

Caller inventory (git grep, full evidence: test-results/b-work-callers.txt): new read_grade_from_cell: _push_grades and tests; _push_grades: sync_section; sync_section: main and integration tests. find_cell_selector is reused unchanged by writer, CLI and verification readback. compute_sync_actions is consumed by _push_grades; inspect its monotone skip behavior before deciding whether any change is necessary. No grade engine edits.

Risk: sync orchestration controls every component grade write (HIGH manual estimate); fake ops only, no live Schoology. Detect changes before each commit, report existing root failures by name, stop on unmet acceptance constraints without special-casing.

GitNexus refresh attempted once: failed EPERM writing the user registry; CLI impact attempts recorded missing Desk symbols/database locks and low-risk sync callers. Authorized git-grep fallback used; pre-commit detect_changes still attempted.

Final touched-symbol inventory: _push_grades -> sync_section -> main; _parse_args -> main; new _grade_at_least -> _push_grades; new ops.read_grade_from_cell -> _push_grades. FakeOps gains a blank-cell reader used only by existing offline tests; new CellOps and ReadCDP/DomCDP are test-only. No sync library, writer, state-store, grade-engine, signature, or scheduled task changes. Graph candidates report one direct caller each, 3-4 affected symbols, LOW risk; conservative manual risk remains HIGH for grade writes.
