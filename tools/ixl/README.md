# IXL homework bonus (Algebra 2)

IXL completion at SmartScore 80+ = 1 bonus point in the quarter's Bonus column (capped at 10).

Two routes to the IXL analytics JSON (`/analytics/skill-score-chart/run?...&skill=<skillId>`):

1. **Chrome MCP** (teacher signed in to IXL through ClassLink in Chrome): fetch the JSON from an
   IXL tab, save the practiced rows to `roster-local/ixl-<code>-<due>.json`, then
   `python tools/ixl/ixl_award_from_file.py roster-local/ixl-<code>-<due>.json <code> <section> <due> "<label>" [--commit]`
   (dry run without `--commit`). Then `node scripts/a2-bonus-totals.mjs --commit --url <roster url>`
   and rewrite the section's Schoology Bonus column with `schoology_enter_bonus.py` (browser-harness).
2. **browser-harness end to end**: `ixl_bonus_run.sh <skillId> <code> <section> <due> "<label>"`
   (IXL_DRY=1 for a dry run). Requires the harness Chrome to be signed in to IXL.

IXL sign-in is the district SSO link on the IXL sign-in dialog, never a typed password.
Set `IXL_TEACHER_ID` (the teacher id in the IXL analytics URL) and `A2_TEACHER_SURNAME` in the environment. Skill ids resolve from `data/ixl-algebra2-skills.json`.
The award is idempotent per source label; a late finisher after the pull must be added by hand.


## Skill ids outside the Algebra 2 map
`tools/ixl/skill-ids.json` holds numeric ids found via `currSkillId` in the skill page source (W42, BNH, PHD, PS2). The 2026-09-28 rule for the 1-1 quiz: SmartScore 80+ on W42, BNH and PHD replaces the 1-1 Quiz score with 20/20 (roster-local/quiz/2026-09-28-PeriodD-1-1-quiz.json); pull all three, then overwrite the quiz column for qualifiers.
