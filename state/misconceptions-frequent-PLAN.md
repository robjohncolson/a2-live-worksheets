# Most frequent misconceptions plan

1. Inspect aggregation, endpoint/cache, dashboard evidence actions, Nightly Review, and the existing real-row reproduction. Run GitNexus upstream impact analysis before changing existing symbols.
2. Add a top-15 frequent view ranked by distinct students, events, then key, retaining weak evidence and readable MCQ labels/question links. Preserve persistence behavior.
3. Add the dashboard block and Nightly Review fallback, with focused aggregation, endpoint, and dashboard coverage.
4. Run the server and root npm test suites; compare root failures with a pre-change baseline. Reproduce PeriodE using real rows and record the top five frequent groups.
5. Review the diff and GitNexus detect_changes results, stage only task files, and create one commit. Never push. Keep temporary artifacts outside state/ and report the commit, suites, and top five as plain text.

## Completed verification

- Added the frequent aggregation, dashboard block and quiz links, Nightly Review fallback, and regression coverage. The real-row reproduction also exposed a trailing separator in worksheet lesson IDs; corrected parsing so follow-along links work.
- Server `npm test`: 91 files passed; 1,777 tests passed, 3 skipped.
- Root `npm test`: 311 files; 9,968 tests passed, 27 failed, 1 skipped. Twenty-four failures match the pre-change baseline. Three load-sensitive failures in gradebook-feeder-wiring and journeys/harness.smoke pass on an isolated rerun (100/100 tests). Existing unrelated failures were left unchanged. Both generated shadows are refreshed and their checks pass.
- PeriodE saved real-row snapshot, captured 2026-09-12T00:41:04.607Z, whole-year window: 53 events (28 MCQ, 25 weak FRQ), no class/student persistence, 15 frequent groups. Top five: U1-L7-Q04 chose A (3 students), WS-U1L1-reflect2 (3), U1-L4-Q05 chose B (2), WS-U1L1-reflect1 (2), WS-U1L10-reflect1 (2).
- GitNexus upstream checks reported LOW risk for aggregation, dashboard, and review symbols. The index refresh failed; the oversized roadmap renderer and lesson helper were unavailable or misattributed, so direct source review supplemented the graph. Both compare-to-master and staged detect_changes ran with LOW reported risk; stale graph paths limit symbol attribution. The staged file diff was reviewed independently.
- Verification logs, the complete failure names, real-row output, and temporary files are under test-results/, not state/. Preserve unrelated workspace changes and create exactly one local commit; never push.
