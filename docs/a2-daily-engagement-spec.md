# Daily Engagement score — spec (2026-09-21)

The teacher's rule (it is in the syllabus): every class opens with a Blooket, scored on **accuracy
and number of questions answered**. A student can redeem a bad Blooket with that day's flashcard
quick check. When both exist, the day's score is **the higher score plus half of the lower score,
capped at full credit**. One Engagement score per student per class day goes into Schoology.

Nothing here changes the Desk's grade engine or what students see. It produces numbers for the
teacher to enter in Schoology.

Rules for every work item (same as `docs/a2-student-launch-spec.md`): match surrounding style; no
new dependencies; do not run `scripts/bump-build.mjs`, commit or push; stay inside owned paths;
add tests; add no new failing test files (root: only the six inherited files named in fix round 1
F9 may fail; `roster-server` `npm test` fully green); never print, log or commit student names or
secrets — real names live only under the gitignored `roster-local/`. GitNexus does not index this
checkout: do not refresh or write any index; grep for callers before editing a function and list
the blast radius in your report.

## WI-E — record and serve the raw daily flashcard result

Owned paths: `roster-server/**`, `flashcards.js`, the flashcard completion code in `desk.html` and
`mobile-home.html`, `gradebook-client.js` only if the payload must pass through it, related tests.

E1. Today a finished quick check records one ledger item per lesson whose score is capped at 80.
Keep that exactly as it is (the Desk's completion gate depends on it). **Additionally** record the
raw run: lesson key, local date key (`YYYY-MM-DD`, America/New_York), mode (`quick` | `full`),
`correct`, `total`. No schema migration: use an existing JSON/text payload column on the ledger row
or an existing key-value store already used for per-student state; say which in the report. A
student may run it many times a day; keep every run or at least the best run per date and mode.
The write goes through the existing authenticated path (so the password gate covers it).

E2. `GET /teacher/flashcards/daily?section=PeriodC&date=2026-09-21`, gated by `requireTeacher`.
Response `{ ok, section, date, students: [{ studentId, realName, username, runs, best: { correct,
total, mode } | null }] }` — one entry for **every active student** in the section, `best: null`
when they did not run it that day. `best` is the run with the highest `correct/total`. 400 on a
missing/invalid section or date, 401 without teacher auth.

E3. Tests: capped ledger item unchanged; raw run stored and returned; two runs the same day return
the better one; a run on another date is not returned; a student with must-change still true
cannot record; non-teacher gets 401.

## WI-F — the daily Engagement calculator

Owned paths: `lib/a2-engagement.js`, `scripts/a2-daily-engagement.mjs`,
`data/a2-engagement-config.json`, `tests/a2-engagement.test.js`.

F1. `data/a2-engagement-config.json` (the teacher can edit these; these are defaults, not policy):
`{ "pointsPerDay": 10, "accuracyWeight": 0.7, "participationWeight": 0.3,
"questionsForFullParticipation": 20, "cap": 1 }`.

F2. `lib/a2-engagement.js`, pure and exported:
  - `blooketScore({ correct, answered }, config)` → 0..1: `accuracyWeight * (correct/answered) +
    participationWeight * min(1, answered/questionsForFullParticipation)`; 0 when `answered` is 0.
  - `flashcardScore({ correct, total })` → 0..1 (raw, **not** capped at 0.8).
  - `combine(a, b, cap)`: both present → `min(cap, max(a,b) + 0.5 * min(a,b))`; one present → that
    one; neither → `null` (absent, which is **not** zero: the teacher decides what an absence is).
  - `dayPoints(score, config)` → points rounded to the nearest 0.5, or `null`.
  Table-test: 0.9 & 0.6 → 1.0 (capped); 0.5 & 0.4 → 0.7; 0.3 only → 0.3; none → null.

F3. `scripts/a2-daily-engagement.mjs --section PeriodC --date 2026-09-21 [--url U] [--offline
<flashcards.json>]`:
  - reads `roster-local/blooket/<date>-<section>.json`: `{ "players": [{ "name": "<as typed in
    Blooket>", "correct": n, "answered": n }] }` (the coordinator transcribes the teacher's
    screenshot into this file);
  - fetches WI-E2 with the teacher key (same secret lookup as `scripts/teacher-roster.mjs`, but
    the `roster-server/.env` file must win over an ambient `ROSTER_TEACHER_SECRET` env var, which
    is stale on the teacher's PC); `--offline` reads the same response shape from a file instead;
  - matches each Blooket player name to a roster student with `namesMatch`/`nameMatchScore` from
    `roster-server/names-match.js`, after applying `roster-local/blooket-aliases.json`
    (`{ "<blooket name>": "<studentId or username>" }`) — Blooket names are nicknames, so also
    accept a single-token name that equals exactly one student's first name in that section.
    Unmatched or ambiguous players are **never guessed**: they are listed in the output file for
    the teacher to alias;
  - writes `roster-local/engagement/<date>-<section>.csv` (proper CSV quoting): `realName,
    username, blooketPct, flashcardPct, combinedPct, points, note`, one row per active student,
    blank points for absent; and prints **counts only** to the console (scored, absent,
    unmatched), never names.
F4. Tests for the pure library and for the script end to end in `--offline` mode with fictional
names and a temp directory (no network, nothing written under the real `roster-local/`).

## Review (separate agent, read-only)

Look hardest at: E1 changing or double-counting the existing capped ledger item; the raw write
bypassing auth or the password gate; date-key handling around midnight and DST (America/New_York,
not UTC); E2 leaking students from another section; F2 arithmetic and rounding at the boundaries;
F3 guessing a match, printing names, or writing outside `roster-local/`; secrets in logs.

## Not in this round (needs the teacher's decisions first)

Re-modelling the Desk's grade engine to the syllabus (daily Engagement items, Try-Its and quizzes
with the 80% work rule, Bonus). Open decisions: point value of a Try-It set and of a quiz; whether
an absent day is excused or zero; whether the Desk or Schoology is the book of record once both
can compute the grade. Until then `A2_STUDENT_GRADES_VISIBLE` stays false.

## Fix round 1 (after review)

One agent; owned paths: WI-E's, plus `lib/flashcard-sync.js` only if G2 cannot be solved on the
server side.

G1 (major). A raw run finished offline, or whose POST fails, is lost: `recordFlashcardRun` fires
one fetch and forgets it, and a later retry would stamp the replay date. Persist pending raw runs
locally **with the date key and timestamp of the run itself**, and replay them through the same
retry/reconnect machinery the capped ledger record already uses (including after a fresh token is
stored). The server accepts a client-supplied run date only if it is not in the future and not
more than 7 days old (America/New_York); otherwise 400. Test: finish offline on day N, reconnect
on day N+1, the teacher endpoint shows the run under day N.

G2 (major). For a student with no `flashcard_state` row, the daily POST inserts a state that holds
only `dailyRuns`; `lib/flashcard-sync.js` `fromWire` then treats the row as unreadable and
cross-device practice sync never initialises. Whenever the daily route creates or rewrites the
row, the practice envelope must stay valid (`v: 1`, `e: []` when empty) and untouched when it
already exists. Test with the real `fromWire`.

G3 (minor). Bound the store: keep at most the 60 most recent run dates per student, accept only
lesson keys that exist in the lesson model, and keep the practice-state size check meaningful
(the daily data must not be able to push the row past the existing limit).

G4. `tests/desk-flashcards-recap.test.js` and `tests/desk-quick-retry-redraw.test.js` now fail
with `window is not defined` — new Desk code runs where those tests evaluate extracted functions
without a window. Fix the code (guard or restructure) rather than the tests unless a test pins
behaviour this spec changed. After this round the root suite's failing files must again be exactly
the six inherited ones; `roster-server` `npm test` fully green.
