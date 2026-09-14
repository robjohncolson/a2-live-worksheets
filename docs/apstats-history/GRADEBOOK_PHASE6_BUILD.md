# GRADEBOOK_PHASE6_BUILD — lesson-weighted, date-driven quarter grade + per-day click-through

> Frozen contract. Implements the model the teacher described 2026-05-20: a
> `quarterGrade` that reflects "average of all completed work regarding the
> material that has been due" — lesson-level granularity, date-driven
> denominator, server-clock authoritative. Plus a per-day click-through on
> the Desk calendar showing that day's lesson grades.
>
> Scope: ~1.5–2 working days. NEW server-side aggregation, additive client
> wiring, bundled lesson schedule. roster-server gets a code change so
> the GitHub auto-deploy watch on `roster-server/**` WILL fire on push.

## 0. Files in scope

| File | Role |
|------|------|
| `roster-server/lesson-grade.js` | NEW — pure lesson-level aggregation + date filter |
| `roster-server/data/lesson-schedule.json` | NEW — slim bundled schedule (lessonKey → unit, lesson, per-period dates) |
| `scripts/build-lesson-schedule.mjs` | NEW — generates the JSON from `roadmap-data.json`; dual-writes to repo root + roster-server/data/ |
| `roster-server/grade.js` | MODIFIED — `computeGrade` keeps unit-level math (teacher dashboard), but `quarters[].quarterGrade` is REPLACED with the lesson-weighted date-driven calc; new `lessons` field on the response |
| `roster-server/grade-config.js` | MODIFIED — update `quarters` bands to Q1=[1,2,3], Q2=[4,5], Q3=[6,7], Q4=[8,9] per teacher's stated class plan; add `pcCap`/`schoolTz` knobs |
| `roster-server/server.js` | MODIFIED — bootstrap lesson-schedule (fault-tolerant, mirrors `createLiveRemediationDb`) |
| `ap_stats_roadmap_square_mode.html` | MODIFIED — `renderDoNowGrades` reads new shape; calendar day-click opens new "Day Grade" modal |
| `tests/desk-day-grade-modal.test.js` | NEW — structure pins for the click-through modal |
| `tests/desk-grade-outlook.test.js` | MODIFIED — extend for the new response shape |
| `roster-server/tests/lesson-grade.test.js` | NEW — pure-function unit tests for lesson-level aggregation, item-id parsing, date filter |
| `roster-server/tests/grade.test.js` | MODIFIED — pin new `lessons` field, the date-driven `quarterGrade`, and the band update |

Out of scope (kept on purpose, not built):
- BKT / mastery — separate engine, untouched.
- `/rollup`, `/remediation/*`, `/class/*` — untouched.
- Driller, Blooket — Blooket excluded from grade per §6, Driller dropped (v2 spec §2).
- Removal of unit-level grade math — kept for teacher dashboard.

## 1. Data model

### 1.1 Lesson identity

A **lesson** is uniquely identified by the topic key in `roadmap-data.json`:
strings like `"1.2"`, `"4.1"`, `"8.6"`. The same string maps to a worksheet
UNIT_ID (e.g., `"1.2"` → `U1L2`; `"4.1"` → `U4L1-2` since 4.1 and 4.2
share a combined worksheet).

Per-period due dates already live in `roadmap-data.json`:
```json
"1.2": {
  "topic": "Topic 1.2",
  "urls": { ... },
  "periods": {
    "B": { "date": "2026-09-03", ... },
    "E": { "date": "2026-09-05", ... }
  }
}
```

### 1.2 Item-ID → lesson mapping

| Pattern | Source | Notes |
|---------|--------|-------|
| `WS-U(\d+)L([\d-]+)-` | worksheet, frq | `WS-U1L2-Q5` → unit=1, lessonKey=worksheet-id "L2". For combined worksheets like `WS-U4L1-2-...`, lessonKey="1-2". |
| `WS-U(\d+)-L(\d+)-DESK_DONE` | worksheet (synthetic Desk Done) | Desk Done for non-quiz artifact. unit=N, lessonKey="L" (single-digit). |
| `CR-U(\d+)-L(\d+)-DESK_DONE` | curriculum_quiz (synthetic Desk Done) | Desk Done for quiz artifact, score recorded. unit=N, lessonKey="L". |
| `U(\d+)-L(\d+)-Q(\d+)` | curriculum_quiz | cr-quiz items. unit=N, lessonKey="L". |
| `U(\d+)-PC-Q(\d+)` | pc | PC items. unit=N, lessonKey=null (PC is unit-scoped, not lesson-scoped). |

**Combined-worksheet expansion:** A worksheet item like `WS-U4L1-2-reflect1`
contributes to BOTH topic 4.1 AND topic 4.2 in the lesson aggregation
(each calendar day stands as its own slot; the work the student did
covers both days' content). Resolution: maintain a `combinedExpansion`
map keyed by the dashed lessonKey:
```
"1-2" → ["1", "2"]   (in U4: 4.1 and 4.2)
"3-4" → ["3", "4"]   (in U4: 4.3 and 4.4)
... etc
```
The map is derived during `build-lesson-schedule.mjs` by inspecting the
worksheet URLs in `roadmap-data.json` — if two topics share a worksheet
URL, they form a combined-lesson group.

### 1.3 lesson-schedule.json shape

Output of `build-lesson-schedule.mjs`:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-20T16:00:00Z",
  "lessons": {
    "1.1": { "unit": 1, "topicKey": "1.1", "worksheetKey": "1", "periods": { "B": "2026-09-01", "E": "2026-09-03" } },
    "1.2": { "unit": 1, "topicKey": "1.2", "worksheetKey": "2", "periods": { "B": "2026-09-03", "E": "2026-09-05" } },
    ...
    "4.1": { "unit": 4, "topicKey": "4.1", "worksheetKey": "1-2", "periods": { ... }, "combinedWith": ["4.2"] },
    "4.2": { "unit": 4, "topicKey": "4.2", "worksheetKey": "1-2", "periods": { ... }, "combinedWith": ["4.1"] }
  }
}
```

Build script lives at repo root (`scripts/build-lesson-schedule.mjs`); dual-writes
to:
- `data/lesson-schedule.json` (repo root, for any client-side that needs it)
- `roster-server/data/lesson-schedule.json` (bundled with the container)

### 1.4 Quarter bands (updated)

`grade-config.js`:
```js
quarters: {
  Q1: { units: [1, 2, 3], pcAnchor: { p85: 40, p100: 60 } },
  Q2: { units: [4, 5],    pcAnchor: { p85: 45, p100: 64 } },
  Q3: { units: [6, 7],    pcAnchor: { p85: 50, p100: 67 } },
  Q4: { units: [8, 9],    pcAnchor: { p85: 55, p100: 70 } },
}
```

The pcAnchor values are unchanged from Phase 3 (those are knobs, not
band issues). U3 moved from Q2 to Q1.

### 1.5 "Today" reference

Server clock, dispatched per period's timezone:
- `schoolTz: 'America/New_York'` — new config knob in `grade-config.js`
- For each student, "today" = `new Date()` rendered to `YYYY-MM-DD` in `schoolTz`
- Per-period dates in lesson-schedule.json are already `YYYY-MM-DD` strings
  (date-only, no time), so the comparison is `dueDate <= todayDateStr`
  lexicographically.

If the student has no `section` field set (unusual), default to the
union of B and E dates — i.e., a lesson is "due" if EITHER period's
date is <= today. This makes the strip work for orphaned roster entries
without crashing.

## 2. Logic

### 2.1 Per-lesson grade

Mirror Phase 3's per-unit math but applied per-lesson:

```
W_lesson(L) = mean over frqScoreToPct(frq_items) where frq_item.lessonKey == L
            = null if no frq items present for L
Q_lesson(L) = correctness % over curriculum_quiz_items where item.lessonKey == L
            = null if no quiz items present for L
B_lesson(L) = weighted mean of present feeders, W:Q = 1:2
            = null if both W and Q are null

lessonGrade(L) = B_lesson(L)   // no per-lesson cap; cap applies at quarter level
              = null when B_lesson(L) is null
```

PC is NOT a per-lesson concept. PC items stay unit-scoped.

### 2.2 Per-quarter aggregation

```
For each quarter Q with band = [units in Q]:
  bandLessons = all lessons L where L.unit in band
  todayDate   = serverDate in schoolTz, formatted YYYY-MM-DD
  studentSec  = student.section (e.g., "PeriodB" or "PeriodE"); B or E extracted

  dueLessons  = [L in bandLessons where L.periods[studentSec] <= todayDate]
                (if studentSec unknown, dueLessons = [L where any period's date <= todayDate])

  graded   = [L in dueLessons where lessonGrade(L) != null]
  ungraded = [L in dueLessons where lessonGrade(L) == null]

  rawQuarter = sum(lessonGrade(L) for L in graded) / len(dueLessons)
             // i.e., ungraded counted as 0 in numerator, due counted in denominator
             = null when len(dueLessons) == 0 (nothing due yet)

  banked     = min(rawQuarter, C=85)   // same C cap as Phase 3
  P_quarter  = mean of P_unit over units in band that have PC data; 0 otherwise
             // P_unit = pcRawToP(unit's PC raw%, quarter's pcAnchor)
  quarterGrade = max(banked, P_quarter)
              = null when rawQuarter is null AND P_quarter == 0
              (don't show "0" when nothing is due yet AND no PC taken)
```

Ceiling (for the motivational pill) — rewritten for the new denominator:
```
remaining = len(bandLessons) - len(dueLessons)         // future lessons
unattempted = len(ungraded)                            // due but not done
maxRest = (remaining + unattempted) * 100              // best case for unfinished work
ceiling = (sum(graded) + maxRest) / len(bandLessons)
       = null if remaining == 0 AND unattempted == 0   // already maxed
       OR if len(bandLessons) == 0                     // band empty (defensive)
```

### 2.3 /grade response shape (additive + replacing quarterGrade math)

```jsonc
{
  "ok": true,
  "studentId": "...",
  "units": { "U1": { ...existing... }, ... },        // UNCHANGED — teacher dashboard reads this
  "quarters": {
    "Q1": {
      "units": [1, 2, 3],                            // updated band
      "unitGrades": { "U1": 35, "U2": null, ... },   // UNCHANGED shape
      "quarterGrade": 1.3,                           // CHANGED: lesson-weighted, date-driven, ungraded-due counted as 0
      "unitsGraded": 1,                              // UNCHANGED
      "unitsTotal": 3,                               // CHANGED: now matches updated band
      "ceiling": 97.5,                               // CHANGED: lesson-weighted ceiling
      // NEW fields:
      "lessonsDue": 2,                               // number of lessons due-by-today
      "lessonsGraded": 1,                            // number of due lessons with any scored data
      "lessonsTotal": 26                             // total lessons in the band (denominator if zero date filter)
    },
    ...
  },
  "lessons": [                                        // NEW — for per-day click-through
    {
      "lessonKey": "1.1",
      "unit": 1,
      "worksheetKey": "1",
      "due": { "B": "2026-09-01", "E": "2026-09-03" },
      "lessonGrade": 35,                              // null if no scored items
      "W": 35,
      "Q": null,
      "items": {
        "frq": [{ "itemId": "WS-U1L1-reflect1", "score": 35, "ts": "..." }, ...],
        "quiz": [],
        "worksheet": [{ "itemId": "WS-U1L1-Q5", "ts": "...", "score": null }, ...]  // completion-only
      }
    },
    ...
  ],
  "completion": { ...existing... }                    // UNCHANGED
}
```

### 2.4 Server bootstrap (fault-tolerant)

`server.js`'s app factory MUST attempt to load `lesson-schedule.json` from
the bundled path at boot. If the file is missing OR parse-fails:
- Log a warning (`[phase6] lesson schedule unavailable; date filter disabled`)
- `/grade` still works but acts as if every lesson is "due" (no date filter)
- This degrades gracefully — same pattern as `createLiveRemediationDb`.

If `lesson-schedule.json` IS present but malformed (missing required keys),
treat as missing. NEVER crash the server.

## 3. Client wiring (Desk)

### 3.1 renderDoNowGrades update

The existing function (added 2026-05-20 in `381a442`) must change in two
small ways:

1. Read the new `lessonsDue` / `lessonsGraded` / `lessonsTotal` fields if
   present and use them for the tooltip text:
   ```
   "Q1 covers U1, U2, U3 — 1 of 26 lessons graded (2 due so far)"
   ```
2. The pill grade and ceiling still use `quarterGrade` and `ceiling` — but
   now those numbers come from the lesson-weighted date-driven calc. So
   the pill display code itself doesn't change; the semantics shift on
   the server.

Pill state for "nothing due yet" (rawQuarter null + no PC): pill renders
in the `.empty` class with text `—`, same as today.

### 3.2 Per-day click-through

A new modal: `#day-grade-overlay` with `closeDayGrade()` symmetric to
`closeResourcePanel`.

Calendar cells already have click handlers (open the resource panel).
The new behavior: **double-click** or **right-click** on a calendar cell
opens the day-grade modal instead of the resource panel. (Single-click
preserves existing behavior.)

The modal renders:
- Header: "Day grade — {dateStr}"
- Body: for each lesson on that day (1+ entries when multi-lesson days exist):
  - Lesson key + topic name
  - lessonGrade (or "—" if no scored data yet)
  - Item breakdown: "FRQs graded: 2/3 (mean 35) · Quiz: not taken · Worksheet completed: 5/22"
- "OK" button → closeDayGrade
- Modal-scoped keydown listener (per Task #8 pattern): Esc closes;
  active-element + modifier guards.

Data source: the new `lessons[]` field on the /grade response. Cache
this client-side after the first fetch in renderDoNowGrades; refresh on
visibilitychange (same cadence as Do Now polling).

## 4. Test pins

### 4.1 `roster-server/tests/lesson-grade.test.js` (NEW)

Pure-function unit tests of `lesson-grade.js`. ~25 cases:

- Item-ID parsing: WS-U1L2-Q5 → {unit:1, lessonKey:"2"}; WS-U4L1-2-reflect1 → {unit:4, lessonKey:"1-2"}; U6-L3-Q1 → {unit:6, lessonKey:"3"}; CR-U2-L4-DESK_DONE → {unit:2, lessonKey:"4"}; WS-U2-L4-DESK_DONE → {unit:2, lessonKey:"4"}; U1-PC-Q3 → {unit:1, lessonKey:null}; unparseable → null.
- Combined-worksheet expansion: WS-U4L1-2-* contributes to both lesson "1" and lesson "2" in U4.
- lessonGrade math: 2 FRQ-Is → 35; 1 FRQ-E + 1 quiz at 80% → weighted mean (W=100, Q=80, weights 1:2) = 86.67; quiz-only → 80; W-only → W; both null → null.
- Quarter aggregation: 1 lesson graded at 35, 1 lesson due-not-done, 24 future → quarterGrade ≈ 17.5 (35/2); ceiling = (35 + 1·100 + 24·100)/26 ≈ 96.7.
- Date filter: dueLessons grows monotonically as today advances; future lessons excluded.
- "today" formatting: schoolTz='America/New_York' for a UTC date crossing midnight EDT.
- Edge: empty band, all lessons future, no items → quarterGrade null, ceiling null.
- Edge: PC-only data (no FRQ/quiz) → quarterGrade = max(0, P_quarter) = P_quarter.
- Edge: PC + lessons → max(banked, P_quarter) preserves the only-raises asymmetry.
- Cap at 85: a band of 26 lessons all scored 100 → rawQuarter=100, banked=85, quarterGrade=85.

### 4.2 `tests/desk-day-grade-modal.test.js` (NEW)

Structure pins (~12) on the Desk markup + behaviors:
- `#day-grade-overlay` element exists, default-hidden.
- `closeDayGrade()` function defined.
- `openDayGrade(dateStr)` function defined; takes dateStr as arg.
- Calendar cells have dblclick / contextmenu handlers attached.
- Modal-scoped keydown handler defined; Esc closes.
- Active-element guard (INPUT|TEXTAREA|SELECT|isContentEditable).
- Modifier-key guard.
- Body rendering uses createElement + textContent for response data (no innerHTML on /grade data).
- Renders "no lessons due this day" empty state.
- Per-lesson card shows lessonGrade + completion breakdown.
- Single-click on cells still opens the resource panel (existing behavior preserved).

### 4.3 `tests/desk-grade-outlook.test.js` (MODIFIED, +5 pins)

Add pins for:
- Pill tooltip text includes "X of Y lessons graded" / "Z due so far" (when new fields present in response).
- Empty-state pill (`—`) renders when quarterGrade is null AND new `lessonsDue` field is 0.

### 4.4 `roster-server/tests/grade.test.js` (MODIFIED)

Add/update:
- Q1 band now [1,2,3] not [1,2].
- /grade response includes `lessons[]` array.
- `quarters[].quarterGrade` now uses lesson-weighted math (existing per-quarter assertions update accordingly).
- New `lessonsDue` / `lessonsGraded` / `lessonsTotal` fields on each quarter.
- Backward-compat: `units` field UNCHANGED in shape and values (teacher dashboard test still passes).

### 4.5 Existing tests that must not regress

- `tests/desk-modal-polish.test.js` (22/22 — Task #8)
- `tests/desk-donow-card.test.js` (16/16 — DN3a vm test)
- `tests/desk-grade-outlook.test.js` (13/13 — yesterday's grade outlook strip)
- `tests/phase5-structure.test.js` (32/32 — AI-tutor)
- `roster-server/tests/remediation.test.js` (50/50 — Phase 4b)
- `roster-server/tests/grade.test.js` (assertions update per §4.4; ALL still green)
- `tests/audit-feeder-ids.test.js` (3/3)

The full root suite baseline post-`381a442` is 1688/1689 (1 known
unrelated study-guide.test.js fail). New pin count ≈ +37 from this build.
Target post-Phase 6: ~1725/1726.

## 5. GREEN gate (loop step 6)

- All §4 tests pass (new + modified).
- Full root vitest: only known pre-existing fail (`study-guide.test.js`
  v3 structure snapshot).
- roster-server vitest: all green (current baseline 223 + ~25 new = ~248).
- `node scripts/audit-feeder-ids.mjs`: CLEAN 69 / MISMATCH 0.
- `node scripts/build-lesson-schedule.mjs`: writes both copies, exits 0.
- EOL: Desk file + new test files stay LF, no CRLF introduced.
- `git status --porcelain`: only own-paths staged (no unrelated dirty files).

## 6. Manual smoke (loop step 3)

Against `http://localhost:8000/ap_stats_roadmap_square_mode.html` with
roster-server at `http://localhost:8091`:

1. Sign in as a test student (create via teacher console if needed).
2. Open a U1 lesson worksheet. Submit 2 FRQ reflections at I.
3. Reload Desk. Q1 pill shows `~1.3 ↑97.5` (low cumulative current, high
   ceiling) instead of the old `35 ↑67.5`.
4. Double-click a calendar day in week 1 of Sept → Day Grade modal
   opens, shows lesson 1.1 with grade 35, item breakdown.
5. Esc → modal closes.
6. Press a key on the calendar (not focused in modal) → no spurious
   action (modal-scoped listener gone).
7. Open a calendar day with no lessons → modal shows "No lessons due
   this day."
8. As a different student (no scored data), the Q1 pill shows `—` when
   no lessons are due yet OR a low cumulative number when lessons are
   due but not done.

## 7. Out of scope (explicit non-goals)

- BKT / mastery — untouched.
- Teacher dashboard changes — `units` field unchanged so dashboard
  still works; can be enhanced later to show lesson-level data.
- Removal of unit-level quarter math — kept inside `computeGrade` for
  shape compat; the OLD `quarterGrade` formula is REPLACED with the new
  one but the `unitGrades` map stays.
- New endpoints — `/grade` extended additively; no new routes.
- Reminders / nudges based on missed lessons — separate workstream.
- Per-period dispatch beyond date lookup (e.g., different cohorts having
  different feeder weights) — not built; one config for all.
- Mobile-specific calendar interactions for day-grade — dblclick is the
  desktop affordance; mobile gets long-press as a follow-up.

## 8. Execution discipline

Following the Task #8 / Phase 4b / Phase 5 method:
1. Planner freezes THIS contract (done).
2. Dispatch ONE Sonnet for the implementation (single coherent change
   to a contended file set; parallel = clobber risk).
3. Planner re-verify on disk: full test suite + audit + manual smoke
   against localhost (NOT trust the result file per s88b).
4. Cross-dispatch Codex read-only review (detached PowerShell, ASCII
   prompt, parse `state/cross-agent/<id>.result.json`).
5. Fold findings (planner-direct on contended files).
6. Final planner pass: full GREEN gate per §5.
7. Commit (will trigger Railway auto-deploy via `roster-server/**`
   watch path — expected and correct).
8. Update memory + CONTINUATION_PROMPT.md with shipped SHA + Phase 6
   status.

## 9. Lineage

Builds on `381a442` (lesson keyboard rework + grade outlook strip) ←
`3de5fd1` (Phase 4b live docs) ← `ccbf75f` (Task #8 docs) ← `63d8559`
(Task #8 code) ← `8f0ba44` (docs queue) ← `633013c` (per-quarter ceiling).

Triggers Railway redeploy on push. Phase 4b's `/remediation/*` will
remain functional (additive change). Phase 5/5.1 AI-tutor delivery
untouched.
