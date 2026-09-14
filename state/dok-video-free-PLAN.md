# DOK sheets: implementation plan (2026-09-12)

Starting commit: 2aac485. Preserve existing unrelated changes. Never push. Temporary files go in the system temporary directory, never under state/.

## Exact mechanical mapping table

| ID | Match (regular expression) | Replacement | Count |
|---|---|---|---|
| minutes | `\bvideo_worksheet(?=:)` | `explore` | 69 |
| phase | `^  phase_tag:[^\r\n]*(?:\r?\n {4}\S[^\r\n]*)*` | `  phase_tag: First take $\rightarrow$ rules + (a)--(c) $\rightarrow$ turn in (use (d) for the four-part standalone sheet)` | 69 |
| exit | `One thing the video changed about my first take` | `One thing the rules box changed about my first take` | 66 |
| group_exit | `One claim I would revise after both videos` | `One claim I would revise after reading the rules box` | 2 |
| first_note | `(first_take_note:[^\r\n]*)before the video` | `Preserve first_take_note prefix; replace before the video with before the discussion` | 14 |
| start | `Start the video follow-along at minute 5\.` | `At minute 5, read the rules box aloud once; students start (a).` | 2 |
| begin | `Begin the (?:(?:combined |lesson )?(?:\d+\.\d+(?:--\d+\.\d+)? )?)?video follow-along at minute 5` | `At minute 5, read the rules box aloud once; students start (a)` | 35 |
| run_named | `Run the named video follow-along, then allow about 10 minutes for parts \(a\)--\(c\)\.` | `Read the rules box; work (a) and (b). Allow about 10 minutes to finish (a)--(c).` | 17 |
| do | `Do the video follow-along \(the DOK-1/2 work of the day\)\.` | `Work (a) and (b) from the rules box and the stem.` | 1 |
| complete_stock | `Complete the video follow-along worksheet\.` | `Work (a) and (b) from the rules box and the stem.` | 13 |
| first_sentence | `Write a one-sentence first take before the video\.` | `Write a one-sentence first take before any discussion.` | 13 |
| play_topic | `Play the topic video; pause for the follow-along\.` | `Read the rules box; take one question on each rule.` | 0 |
| play_group | `Play both topic videos in teaching order; pause for each follow-along\.` | `Read the rules box; work (a) then (b) in teaching order.` | 2 |
| group_commit | `Commit one sentence before watching\.` | `Commit one sentence before any discussion.` | 2 |
| group_work | `Complete both follow-alongs, then finish this single problem and turn it in\.` | `Work (a)--(c) in order from the rules box, then turn in one sheet.` | 2 |
| stem | `Suppose a video platform has 5,000 active accounts` | `Suppose a streaming platform has 5,000 active accounts` | 1 |

Hand edits remaining after these mappings: 65 physical lines containing video, follow-along / follow along, or watching (including prerequisite wording without video). Read each whole YAML field and its printed problem before rewriting; count changed physical lines separately in the final record. No part prompts reference video. The sole registry exception is aps-5.5-d3-1.stem: a video platform -> a streaming platform; preserve all numbers and claims.

## Four commits

1. Generator: normalize legacy minutes to explore; recursively validate field values with a filename-only exception; unify student, board, and teacher copy and derive part ranges. Add the idempotent EOL-preserving codemod and regression tests, including the missing dok-index.test.js. Include this plan. Run upstream GitNexus impact before editing existing functions.
2. Apply the exact mechanical mappings to all 69 YAML files and the one registry stem. Record counts and remainder.
3. Hand-rewrite the remaining instructions in short teacher language. Preserve protected fields, time budgets, standalone calendar/finish rules, and human grading. Check parsed data against the starting commit.
4. Run compile.ps1 -All once after source edits; rebuild all 207 edition PDFs and TeX files. Add dated doctrine notes to the three requested docs and the task specification. Record all verification in state/dok-video-free-verification.json. Run detect_changes before each commit.

## Verification

- Capture root npm test baseline before changes, then compare final failure names.
- python dok/build_ladder.py --validate
- npx vitest run tests/dok-coverage.test.js tests/dok-registry.test.js tests/dok-index.test.js tests/desk-dok-ladder-row.test.js tests/desk-teacher-dok-app.test.js
- pytest tests/test_dok_build.py -q
- npm test
- powershell -NoProfile -File dok/compile.ps1 -All
- Case-insensitive recursive scan of dok/lessons, dok/registry, and emitted TeX: only *_live.html filename hits permitted; scan for residual viewing prerequisites too.
- Verify codemod idempotence and line endings, protected field equality, preserved budgets and standalone semantics, complete rebuilt PDF inventory, and GitNexus affected scope.
- Plain-text report: four hashes, mapping counts, hand-line count and three examples, PDF counts, suites and unchanged baseline failure names, registry/part exceptions, and anything unmet.
