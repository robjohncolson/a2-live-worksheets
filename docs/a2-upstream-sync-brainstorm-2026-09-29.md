# Upstream (AP Stats follow-alongs) since the fork, and the eventual one-Desk merge

Brainstorm written 2026-09-29 at the teacher's request. Read-only survey; nothing was ported. The teacher's stated end state: one Desk that manages both the Algebra 2 and AP Statistics courses ("they're all schoolwork").

## Numbers
- Fork point: A2 initial import 804cac2, 2026-09-14. Since then: A2 126 commits, upstream 105 commits (~63k insertions).
- Files changed in BOTH repos since the fork, excluding tests: 22. The real divergence is `roster-server/lesson-grade.js` (~570 diff lines: district 50/40/10 formula vs the two-track v3 engine) and `server.js` (~200).
- Desk: A2 `desk.html` 15.6k lines; upstream `ap_stats_roadmap_square_mode.html` 27.6k lines, changed 60 times in two weeks.
- Runtime: nothing shared (separate Supabase projects, Railway services, secrets). Upstream keeps `A2_SYNC_NOTES.md` as an append-only log of A2 changes worth porting back.

## Upstream features worth taking into A2 (priority order)
1. **Zero date = class day + 13** (commit 34cef5aa): `grade-config.js dueLagDays`, `lesson-grade.js lessonZeroDate/isLessonDue`, `/grade` lessons carry `zeroDate` per section, Schoology sync writes the 0 only after the zero date. Grade-affecting; golden outputs regenerated; hard-codes Period B/E keys. Foundational for everything below. Port section-generic.
2. **Schoology grade-cell comments on lagged zeros** (5c283fc5, 7223264f): `tools/schoology_ops.py write_cell_comment/clear_cell_comment` (prefix guard, only clears its own), `schoology_components.py component_comments_from_class_doc`, `schoology_sync_section.py --comments`. CDP fixes: inner `#closebutton`, scroll cell into view, cp1252-safe output. Very high value here: Schoology is A2's book of record and students are not on the Desk.
3. **Sliding session refresh** (8a86fdef): `token.js tokenExpiry`, server re-issues under 10 days left, `roster-client.js refreshIfNeeded()`, Desk calls it at boot. Generic, small.
4. **Claude GitHub workflows** (8d2d29b5, aed4b052): `claude.yml` (@claude mentions), `claude-code-review.yml`. Needs `CLAUDE_CODE_OAUTH_TOKEN` secret.
5. **School bulletin desktop app** (9a475e1c, fef62f33, f2756b07): icon + window over public `data/bulletin.json`, audience filter, 3-day count. Same school: one file could serve both courses.
6. **teacher-week.html** (e9ac8229, c88e4b43, 140e52f8): static Mon-Fri objectives per period from `data/lesson-schedule.json` + `data/learning-objectives.json`. A2 already has `build-a2-week-objectives.mjs` and `lesson-objectives.json`; this is another surface for the same data.
7. **Missing-work visibility + calm ledger** (MISSING_WORK_VISIBILITY_SPEC, LEDGER_CALM_SPEC): red badge, "N missing" pill, "2 become a 0 by Sun" wording, verb buttons straight to the work, graphs behind a button. Display-only over cached `/grade` + zeroDate. High once students are on the Desk.
8. Grade-coach deltas (0f96273e..eb6badbe): facts follow zero-date rule, plain text, "First: <missing work>". A2 already has the base coach (`renderWhySoLow`); port selectively after zero dates.
9. Effort visibility v2: take only the My Gradebook colour key (blue-grey "in Schoology now" / green "recorded ahead").

Skip (welded to v3 tracks, Progress Checks, AP vocabulary or the DOK pipeline): Class Snapshot + tentative zeros, slips v2, Bonus Bank, higher-track bonus, ahead-work projection, weekly DOK, Study Break challenge alert, APStat Park.

## A2 features worth sending upstream (append to their A2_SYNC_NOTES.md)
- `roster-server/district-grade.js` behind `useDistrictFormula` (upstream's notes already call it portable).
- Per-example IXL skills (`data/a2-lesson-skills.json` `example` field; Desk lists core skills by example) and the Web Jam / SmartScore tooling in `tools/ixl/`.
- The day log (`content/a2/day-log.json`): what landed per section per day, decorating the calendar without moving due dates; per-day `student` line for the focused view.
- Year plan generator with closures and per-section reflow (`build-a2-year-plan.mjs`, `PUT /teacher/pacing/reflow`), objectives strip for observers.
- Question-bank pipeline: TE LaTeX transcription -> ingest -> registry, plus the answer-leak guard test (upstream's notes already flagged it as cheap to add for `ai-grading-prompts*`).

## Merge shape (converge first, merge later)
Do not merge histories now. Converge on three things that turn course-specific code into data:
1. **A course record**: sections, meeting days, gradebook formula, content root, Schoology course ids. Every "B/E" or "C/D/G" literal reads from it.
2. **Grade engine as a plugin**: v3 two-track and district 50/40/10 both stay, selected per course. Ledger, receipts, offline queue, roster server are already shared and stable since the fork.
3. **Content under namespaces**: AP worksheets/DOK/rubrics under one root, A2 lessons/packets/question bank under another; the Desk renders tiles from each course's lesson JSON.

Suggested order: port items 1-6 above into A2 now (help this quarter). Then introduce the course record upstream and make B/E read from it (invisible to AP students). Merge in late fall after progress reports, once A2 students are on the Desk and upstream's s42 user-action items are closed. The merge is also an infrastructure decision (two Supabase projects, two Railway services).
