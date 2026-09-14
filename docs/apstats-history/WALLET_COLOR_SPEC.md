# Wallet Readiness Color — Spec

The wallet shows a continuous **red → yellow → green** signal of "am I caught up by
the current deadline?" — calendar-aware, from the live `/grade` payload.

Decisions (set by the teacher 2026-06-14):
- **Model:** completion gradient with **yellow pinned at best-of eligibility**.
- **Eligibility (the yellow waypoint):** **both PC and Work tracks ≥ 40%** (the v3
  engine gate where best-of = `max(pcAvg, workAvg)` turns on).
- **Surfaces:** whole wallet window tint, the balance card, the grade number, AND the
  desktop 👛 icon (so status shows before the wallet is even opened).
- **Scope:** the **current quarter**, due **by today** (the same quarter the wallet
  already displays).

## The metric — `WalletLogic.walletReadiness(quarter)`

`quarter` is the cached current-quarter object from `/grade` (`_gradeQuartersCache[gq]`),
which carries: `pcAvg`, `workAvg` (each `null` when that track has no due/graded data
yet), `lessonsDue`, `lessonsGraded`. Pure function; add to `js/wallet_logic.js` and test.

```
FLOOR = 0.40

walletReadiness(q):
  if !q or q.lessonsDue == null or q.lessonsDue <= 0:
      return { state:'nodue', r:null, hue:null }        // nothing due yet → NEUTRAL (no color signal)

  // Tracks with data gate eligibility; a null track is "not due yet", so it does
  // NOT drag the color (e.g. early in a unit before any Progress Check is due).
  tracks = [q.pcAvg, q.workAvg].filter(v => typeof v === 'number')
  e = tracks.length === 0 ? 0 : clamp(Math.min(...tracks) / FLOOR, 0, 1)   // progress to the floor
  eligible = e >= 1                                                         // both present tracks ≥ 40%

  completion = clamp(q.lessonsGraded / q.lessonsDue, 0, 1)                  // of due-by-today work

  // Two-segment readiness: red→yellow approaching the floor, yellow→green from
  // eligibility up to all-due-complete. Yellow (0.5) sits exactly at eligibility.
  r = eligible ? (0.5 + 0.5 * completion) : (0.5 * e)

  hue = 120 * r            // 0=red, 60=yellow, 120=green  (continuous)
  return { state: eligible ? (completion>=1 ? 'caughtup' : 'eligible') : 'behind',
           r, hue, eligible, completion, e }
```

Notes: the small bump at the moment of crossing eligibility is intentional — becoming
best-of eligible is a real unlock, and the color then reflects existing completion.

## Color application (in `ap_stats_roadmap_square_mode.html`)

Compute `walletReadiness(currentQuarterObj)` (reuse the wallet's existing current-quarter
pick — `quarterOfDate(new Date())` → `Q#`, fallback to first quarter with a numeric grade).
Map `hue` to each surface; when `state==='nodue'` (or no grade data), use a neutral grey
and no tint. All best-effort, never throw, degrade silently if the grade cache is absent.

- **Window tint:** the wallet window background → a soft `hsl(hue, 55%, 92%)` wash
  (light, non-distracting). Reset to default when neutral.
- **Balance card:** border + a faint background → `hsl(hue, 60%, 88%)` bg,
  `hsl(hue, 65%, 45%)` border.
- **Grade number:** the headline grade % text color → `hsl(hue, 70%, 35%)` (readable).
- **Desktop 👛 icon:** a status dot / tint on the `.app-icon[data-app="wallet"]` (e.g. a
  small colored ring or a corner dot `hsl(hue, 70%, 45%)`), updated whenever `/grade`
  loads (in `renderDoNowGrades`), not only when the wallet opens — so it reflects status
  on the desktop. Neutral state → no dot / grey.

Add a one-line legend in the wallet (e.g. a tiny "red → behind · yellow → eligible for
best-of · green → all caught up" caption under the balance card).

## Summer mode (overlay) — `WalletLogic.summerReadiness(...)`

During the summer (today **before** `firstDayOfSchool`), the fall schedule has nothing
due, so the fall color is meaningless. A **summer-goal overlay** (`data/summer-schedule.json`)
drives the color instead — green = on pace for the summer goal (Unit 1 by the first day),
not "did one lesson." It does NOT touch grades or the fall schedule.

`data/summer-schedule.json`: `{ goal, unit, startDate, targetDate, firstDayOfSchool,
lessons:[{topic, due}] }` — Unit 1 paced one lesson/week, 1.1 due 2026-06-23 … 1.10 due
2026-08-25, first day 2026-09-01. Loaded once on Desk init into a global.

**Dynamic rest-rhythm model (decided 2026-06-14): a personal cadence with the deadline
as a hard safety net.** Finishing a lesson buys a 2-day green "breather"; idling past it
eases toward a soft yellow "ready for the next?"; but falling **behind the fixed Aug 25
schedule** is always red (resting can never make you miss the goal).

```
summerReadiness(schedule, todayISO, doneCount, lastCompletionISO, restDays=schedule.restDays||2):
  // doneCount         = # of schedule.lessons complete (Desk: _isLessonComplete(topic)).
  // lastCompletionISO = YYYY-MM-DD of the student's most recent Unit-1 lesson activity, OR
  //                     null/'' if none (Desk: max .ts among getStudentMarks() keys
  //                     '<topic>|worksheet' / '<topic>|blooket' for schedule.lessons).
  total            = schedule.lessons.length
  actual           = clamp(doneCount, 0, total)
  deadlineExpected = count of schedule.lessons with due <= todayISO     // the SAFETY NET line
  behind           = max(0, deadlineExpected - actual)

  if actual >= total:                                    // 1. all done
      return { state:'done', resting:false, r:1, hue:120, total, actual, deadlineExpected, behind:0 }

  if actual < deadlineExpected:                          // 2. SAFETY NET — behind the hard deadline
      behindGrace = schedule.behindGraceDays || 1
      daysSinceLast = lastCompletionISO ? daysBetween(lastCompletionISO, todayISO) : 9999
      if daysSinceLast <= behindGrace:                   // just made progress while behind → CATCHING-UP (blue, 1-day grace)
          return { state:'catchingup', resting:true, r:null, hue:210, total, actual, deadlineExpected, behind, daysSinceLast }
      r = deadlineExpected > 0 ? clamp(actual/deadlineExpected, 0, 1) : 0   // idle while behind → red zone
      return { state:'behind', resting:false, r, hue:120*r, total, actual, deadlineExpected, behind, daysSinceLast }

  if deadlineExpected == 0 and actual == 0 and !lastCompletionISO:   // 3. before any deadline, nothing done → neutral
      return { state:'notdue', resting:false, r:null, hue:null, total, actual, deadlineExpected, behind:0 }

  // 4. On/ahead of the deadline → personal rest rhythm
  daysSinceLast = lastCompletionISO ? daysBetween(lastCompletionISO, todayISO) : 9999
  if daysSinceLast <= restDays:                          // resting → green
      return { state:'resting', resting:true, r:1, hue:120, total, actual, deadlineExpected, behind:0, daysSinceLast, restDays }
  // past the rest → ease green(1) → yellow(0.5) over ~4 idle days; NEVER red here (red = deadline only)
  r = clamp(1 - 0.5 * ((daysSinceLast - restDays) / 4), 0.5, 1)
  return { state:'ready', resting:false, r, hue:120*r, total, actual, deadlineExpected, behind:0, daysSinceLast, restDays }
```
`daysBetween(aISO,bISO) = max(0, floor((Date.parse(bISO) - Date.parse(aISO)) / 86400000))`.

Banner copy by state: `done` → "Unit 1 complete! 🎉"; `behind` → "Summer goal: Unit 1 by
Sept 1 — A/total · N behind"; `catchingup` → "Catching up — nice! Still N behind; keep
going to get back on track."; `notdue` → "Summer goal: Unit 1 by Sept 1 — starts <first
due>"; `resting` → "Nice work — A/total done. Take a breather; next lesson whenever you're
ready."; `ready` → "A/total done — ready for lesson <next not-done>? (due <date>)".

State → color (the painters just use `hue`; `hue:null` → neutral grey): `notdue` grey;
`resting`/`done` green (120); `ready` green→yellow (120→60); `catchingup` **blue (210)** —
a distinct "behind but actively catching up" state; `behind` red→orange (0→48 by deficit).

Active when `today < schedule.firstDayOfSchool`. When active, the Desk uses
`summerReadiness`'s hue for ALL FOUR surfaces (window/card/grade-number/icon dot) **instead
of** the fall `walletReadiness`, and shows a summer banner on the balance card:
**"☀️ Summer goal: Unit 1 by Sept 1 — `actual`/`total` done · `[Ahead! | On pace ✓ | N behind]`"**,
plus the next not-done lesson and its due date. Once `today >= firstDayOfSchool`, summer mode
turns off and the normal fall `walletReadiness` resumes automatically. The icon dot reflects
summer readiness too (updated on `/grade` load).

## Tests (`tests/wallet-logic.test.js`, extend)

- `nodue` when `lessonsDue` is 0/null → `state:'nodue'`.
- behind: `workAvg:0.2, pcAvg:null, lessonsDue:4, lessonsGraded:2` → `eligible:false`,
  `r ≈ 0.25` (e=0.5 → r=0.25), hue in the red-orange range.
- early unit, PC not due yet: `pcAvg:null, workAvg:0.5, lessonsDue:2, lessonsGraded:2`
  → eligible (work≥40, PC null ignored), `r = 1.0`, hue green.
- eligible-but-behind: `pcAvg:0.6, workAvg:0.5, lessonsDue:10, lessonsGraded:6` →
  eligible, `completion 0.6`, `r 0.8`.
- both below floor: `pcAvg:0.3, workAvg:0.5` → e=0.75, r=0.375 (the MIN track gates).
- caught up: all due graded + both tracks ≥0.4 → `r 1.0`, green.
- monotonic-ish sanity + clamping. Execute real imported code.
