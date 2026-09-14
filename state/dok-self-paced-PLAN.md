# DOK self-paced plan - 2026-09-12

Status: Complete. Four local commits implement, migrate, audit, and rebuild/verify the sheets.
Starting HEAD: 221ba0f31d5d592e59f991f338ee528e3ceead82.

## Four commits
1. Generator, validator guards, EOL-preserving idempotent codemod, and tests.
2. Apply the codemod to all 69 YAMLs.
3. Hand edits and per-part on-page audit additions.
4. Rebuild all 207 PDFs with dok/compile.ps1 -All, documentation, verification report.
Never push. Preserve unrelated changes. Scratch work uses the Windows TEMP directory.

## Field deletion inventory
All 69 YAMLs: minutes, exit_reflection, teacher.phase_tag, teacher.teacher_does,
teacher.students_do, teacher.adult_role. Six fields per file, 414 total.
Keep standalone calendar metadata and worksheet/worksheets filename metadata.
Rewrite 14 stock first_take_note values to:
Ungraded commitment; accept any evidence-based first impression.

## Forbidden phrases and hand edits
Exact case-insensitive substrings (shared JSON list):
video; rules box; follow-along; scan the code; QR code; before we discuss; before the discussion; after the discussion; at minute; at the bell; turn in one sheet; Explore (; Do Now; class period; in class.
Parsed YAML/registry field-value occurrences before: 365.
Codemod preview remaining hits: 0, on 0 lines. No phrase-removal hand edits needed.
Per-part audit found six sheets requiring normal-area lookup additions:
5.2, 5.7, 5.8, 6.5, 6.6, 6.11. Keep every ask and all original content.
Also remove the standalone YAML comment's obsolete full-period finish-window copy.

## Previous blocking section resolved
Minutes: and min) are removed from the guard and section 6 check. Problem data
and unit labels remain unchanged. Any future phrase collision with protected
problem data requires dropping that phrase from the guard, never editing the problem.
No remaining preflight phrase contradiction. GitNexus index refresh and all required
existing-symbol impact checks completed. Individual symbol risk was LOW. Aggregate
first-commit impact was HIGH across the expected rendering flows, reported before
committing. YAML-only stages have no indexed symbol changes.
The unused loader _path field was removed because it injected the workspace name
into author content; the guard retains every specified phrase without exemptions.

## Verification
Run generator --validate, requested five-file Vitest suite, all dok-*.test.js,
pytest tests/test_dok_build.py -q, root npm test (compare failure names with baseline),
section 6 grep, all emitted-text guards, all student PDF page counts, protected-content
comparison, 207 PDF rebuild inventory, and verbatim 1.4+1.5 student page 2 extraction.
Run GitNexus detect_changes before each commit; never push.

## Completed implementation
- a56b9ca: generator, both guards, shared phrase list, codemod, tests, spec and plan.
- 0fb6020: 414 field deletions across 69 YAMLs, plus 14 stock-note rewrites.
- 06b36bc: six additive normal-area lookup paragraphs, one obsolete comment edit,
  and state/dok-self-paced-audit.md covering every sheet and part.
- Validator green (73 registry rows, 69 lessons); Python suite: 605 passed.
- Codemod idempotence and parsed-content preservation verified for all 69 YAMLs.
- Initial root baseline: 25 failed, 10051 passed, 1 skipped; failures recorded by name.

## Final verification
compile.ps1 -All rebuilt all 207 PDFs successfully. All 69 student PDFs are two pages.
Protected-content comparison passed: 208 focus parts and four optional items; only
six additive lookup sentences changed protected fields. YAML/registry phrase hits
365 -> 0; emitted TeX hits 714 -> 0. Exact section 6 grep: no matches after archiving
three ignored logs from retired sheet combinations in the Windows TEMP directory.
Focused Vitest: 362 passed. Migration Vitest: seven passed. Pytest: 605 passed.
Root npm test: 10053 passed, 26 failed, one skipped. Twenty-five failures match the
pre-edit baseline; one extra wallet-test timeout passed on isolated file rerun.
Full names, page counts, PDF hashes, and the visually checked page-2 transcription
are in state/dok-self-paced-verification.json. No push; no scratch directories under state/.

Final GitNexus staged review: 419 files, LOW risk, zero affected execution flows.
Compare against master: LOW risk; unrelated working-tree files were excluded from staging.
