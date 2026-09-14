# Exit-ticket bonus: section 3 audit

| Surface | Location | Outcome |
| --- | --- | --- |
| Lesson formula | roster-server/lesson-grade.js:482 | Only a post-B block added inside computeLessonGrades: max(with, without) + 5/3/1, capped at 105. Cws/W/Q and completion gate unchanged. Internal exitBonus=0 and exitCounted=false for absent/ungraded tickets. |
| No-quiz track | roster-server/lesson-grade.js:1029 | Same max-baseline bonus; preserves existing rounding and optional Cws-reveal floor. Private helpers only; no new exports. |
| Public metadata | roster-server/lesson-grade.js:1603 | Surfaces exitBonus/exitCounted on graded-ticket lessons. Omits new public fields otherwise, preserving byte-identical stripped-ticket responses. |
| Quarter / Work | roster-server/lesson-grade.js:978,988,1426 | Work mean can exceed 100. Existing final quarter Math.min(100, base + earlyBonus) retained; real-engine test proves Work=105, quarter=100. Legacy quarter path still banks at C=85 and is unchanged. |
| Desk remediation | ap_stats_roadmap_square_mode.html:9036 | Existing <75 filter accepts higher grades; unchanged. |
| Desk day-grade number | ap_stats_roadmap_square_mode.html:18435 | Existing number formatting displays 105.0 without clipping. Added earned +N exit ticket label at 18446. DOM regression passes. |
| Desk gradebook bar | ap_stats_roadmap_square_mode.html:18348 | Existing width clamp at 100% retained; number stays 105. DOM regression passes. |
| Teacher dashboard grid | teacher-dashboard.html:1112,2424 | fmt1 and grid emit the full number without a score clamp or percentage bar. No production edit needed; 105 DOM regression passes. |
| In-app grid engine | roster-server/gradebook-grid.js:214 | cellValue forwards lessonGradeNoQuiz unchanged. New bundle/server grid parity cases prove 101/103/105 survive. |
| Grade Playground | start-here.html:604,622,673,776,826,831,904 | One-line bonus explanation; lesson and Work inputs permit 105; reader honors each input max; quarter remains 100; Work bar visually capped at 100. Other feeder limits remain 100. |
| Bundle / mesh / Android | scripts/build-grade-engine.mjs:32; grade-engine.bundle.js | Regenerated the actual canonical ROOT bundle. The spec's roster-server/grade-engine.bundle.js path does not exist. Fresh-generation and online/offline bonus parity pass. No separate offline change needed. |
| m2b invariance | roster-server/tests/m2b-grade-invariance.test.js:49; roster-server/tests/fixtures/m2b-invariance/art-hashes.json | Existing scenarios have no graded exit-ticket rows. No Part B expectation changes needed. Part A changed only the SY2627 schedule artifact hashes; frozen SY2526 values unchanged. |
| Schoology fixture | tools/build_schoology_fixture.py:73; tools/schoology_components.py:388 | Full lesson and no-quiz component grades both preserve 105. Offline regression passes. |
| Schoology sync/write | tools/schoology-sync.py:202; tools/schoology_ops.py:245; tools/schoology_sync_lib.py:137 | Write delegates to write_grade_to_cell, formats the supplied value and types it without a >100 rejection/clamp. Assignment maximum remains 100 (extra credit). No write-time clamp needed; no live writes performed. |
| Nightly Review / coach | roster-server/nudge*.js; roster-server/coach*.js | No 100% grade ceiling text found. nudge.js:85 says max 100 about the result-count limit, not grades; unchanged. cr prompt rules excluded as specified. |

## Impact and scope

The refresh failed with EPERM at C:/Users/rober/.gitnexus/registry.json.tmp. Used the authorized git caller inventories alongside CLI impact attempts and the partial graph. computeLessonGrades remains CRITICAL despite the partial graph's false zero-caller result; computeGrade calls it. lessonGradeNoQuiz has one direct caller, lessonTrackValue, then computeQuarterV3 and computeGrade (three upstream symbols; graph LOW, treated HIGH for grades). buildLessonsArray is also called by computeGrade; only additive ticket metadata changed.

B2: readPct -> renderReal -> module initializer (LOW, 2 upstream); renderToy and renderReal -> local initializer/listeners (LOW, 1 indexed upstream each, no cross-module processes). openDayGrade was absent from the size-limited graph; git caller inventory shows rCal's double-click/context-menu handlers only (local display change). No other existing production functions edited. Existing test helpers remain unchanged; new regression callbacks only. Derived shadows regenerated. Before every commit detect_changes was run and the staged diff manually reviewed; the partial index cannot authoritatively map shifted lines/large Desk source.
