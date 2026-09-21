# Algebra 2 student launch — spec (2026-09-20)

Goal: all three sections (C, D, G) can sign in to the Desk this week, change a shared starting
password, and run a 10-card flashcard check that mirrors the daily Blooket opener. The Schoology
link is posted only after every work item below is merged, reviewed, deployed and smoke-tested.

Context the implementer needs:

- 38 of 39 students already have roster accounts (bulk-enrolled; real names; `fruit_animal`
  usernames). Self-signup (`POST /roster/claim`) is open for PeriodC, PeriodD, PeriodG, so a student
  who does not know a password will create a duplicate account. That must stop.
- Students do **not** use the Desk for grades yet. The teacher's grading model now lives in the
  syllabus (`scripts/build-a2-syllabus.mjs`): daily Blooket = Engagement with a flashcard
  redemption; Try-Its = Assignments and quizzes = Assessments, both with an 80% work rule; IXL Web
  Jam accuracy feeds a single Schoology Bonus column. The Desk's grade engine still implements the
  older model (lesson checks, zero for unattempted due work). Re-modelling the engine is **out of
  scope**; hiding its student-facing grade is in scope (WI-B3).
- Source for the new deck: `data/sources/blooket/a2-number-line-interval/set.json` (76 questions,
  one correct answer each, 23 with an `image` file beside it).

Rules for every work item:

- Match the surrounding code's style and comment density. No new dependencies.
- Do **not** run `scripts/bump-build.mjs`, do not commit, do not push; the coordinator does that.
- Do not touch files outside your owned paths. If you must, stop and report why instead.
- Add or update tests for everything you change. `A2_FORK_BASELINE.md` names the inherited failures;
  add none. Root: `npx vitest run`. Server: `npm test` in `roster-server/`.
- Never print, log or commit secrets or student names.

## WI-A — roster-server: shared starting password, duplicate-proof signup, forced change

Owned paths: `roster-server/**`, `scripts/teacher-reset-passwords.mjs`, `deploy/RUNBOOK.md`.

A1. **Starting password.** New constant from env `ROSTER_STARTING_PASSWORD`, default `password`.

A2. **Teacher bulk reset.** `POST /roster/reset-passwords`, gated by `requireTeacher` exactly like
`/roster/enroll`. Body `{ section?: string, studentIds?: string[], password?: string }`; at least
one of `section`/`studentIds`; `password` defaults to the starting password. For each matching
**active student** (never a teacher role): bcrypt-hash, store the reversible cipher the same way
enroll does, set `must_change_password = true`. Response `{ ok, updated: n }`. 400 on an empty
selector, 401 without teacher auth. Add `scripts/teacher-reset-passwords.mjs` (zero deps, same
secret lookup and `--url` handling as `scripts/teacher-roster.mjs`; flags `--section`, `--all`
(the three open sections), `--dry-run`); it prints counts only, never names or passwords.

A3. **Duplicate-proof claim.** In `POST /roster/claim`, before inserting, compare the submitted
`realName` with every active roster row in **all** open sections using a pure, exported
`namesMatch(a, b)`:
  - normalise: NFD + strip diacritics, lowercase, drop punctuation, split on whitespace/commas/
    hyphens, drop tokens of length 1 and the placeholder `nln`;
  - match when the token sets are equal, or one is a subset of the other with at least 2 shared
    tokens, or they share at least 2 tokens and one of them is the last token of either name;
  - tolerate one edit (Levenshtein 1) per token for tokens of length ≥ 5.
  Table-test it with fictional names only (never real students): `"De'Andre Marsh"` =
  `"Marsh, De'Andre"`; `"Lucia Fernandez"` = `"Fernandez Ortega, Lucia"`; `"José Núñez"` =
  `"Nunez, Jose"`; `"Maria Torres"` must match `"Torres Medina, Maria"` and must **not** match
  `"Tavares, Maria"`; `"Carlos Ramos"` must not match `"Ramos Ramos, Hector"`; a one-letter typo
  (`"Fernandes"`) still matches.
  On a match respond `409 { ok:false, error:'account-exists', username, section,
  mustChangePassword, startingPassword? }` and insert nothing. Include `startingPassword` **only
  when that account's `must_change_password` is true**; otherwise the client tells the student to
  ask the teacher for a reset. If several rows match, return the single best (most shared tokens);
  on a tie return `error:'account-exists'` with no username and `ambiguous:true`.
  Keep the existing rate limiter in front of this path and remove the `[GOLIVE]` diagnostic log.

A4. **Forced change, server-side.** While `must_change_password` is true, token-authenticated
grade- or feature-bearing writes (`/ledger/record`, commits, reroll, anything that records work)
return `403 { ok:false, error:'password change required' }`. `/roster/verify`,
`/roster/change-password` and read-only endpoints stay open. `/roster/change-password` additionally
rejects (400) a new password equal to the starting password, case-insensitively.

A5. **Security note for the runbook.** Anyone who types a classmate's name during signup learns
that classmate's username and, until the classmate first signs in, the shared password. A4 limits
the damage (nothing counts until the real owner changes it) and the teacher can re-run A2 for one
student. Record this trade-off in `deploy/RUNBOOK.md` with the reset command.

## WI-B — Desk client: signup hand-off, forced change, no AP leftovers, no student grade

Owned paths: `desk.html`, `roster-client.js`, `mobile-home.html`, tests under `tests/desk-*`,
`tests/mobile-home-*`, `gitnexus-shadow/**` if a tracked shadow must be refreshed.

B1. **Signup hand-off.** `rosterClient.claim` surfaces `account-exists`. The self-signup modal then
shows: "You already have an account. Your username is `<username>`." plus, when
`startingPassword` is present, "Your starting password is `<startingPassword>`. You will choose a
new one right after you sign in." and one button that closes signup and opens Sign In with the
username prefilled. Without `startingPassword`: "Ask your teacher to reset your password." With
`ambiguous`: "Use 'Find my name on the class list' to sign in."

B2. **Forced change.** After `/roster/verify` returns `mustChangePassword:true`, show a blocking
change-password dialog (reuse the existing change-password UI if there is one): cannot be
dismissed, min 6 characters, rejects the starting password, confirms twice, calls
`/roster/change-password`, then proceeds. A `403 password change required` from any later call
re-opens it.

B3. **No student-facing Desk grade, for now.** One flag near the other A2 config,
`A2_STUDENT_GRADES_VISIBLE = false`. When false, for role `student`: My Progress, the grade
check-in banner/menu, grade help, the ceiling/outlook and any live-grade number are replaced by one
line: "Your grade is in Schoology for now." Teacher role is unaffected. Flipping the flag restores
today's behaviour exactly.

B4. **Remove AP exam leftovers.** Delete the "Days to Exam" and "Exam Day" countdown boxes (keep
"Today" and "School Days"), the `examDate` plumbing that only fed them, and the "AP" desktop icon
art. Nothing on the Desk may say AP, exam day, or days to exam.

## WI-C — flashcards: a deck that is the Blooket

Owned paths: `content/a2/1-1/**`, `flashcards.js`, the flashcard renderers in `desk.html` and
`mobile-home.html` (run after WI-B lands; rebase onto it), `scripts/build-a2-blooket-deck.mjs`,
deck-related tests. Runs **after WI-B** because both edit `desk.html`.

C1. `scripts/build-a2-blooket-deck.mjs` (`--check` supported) generates
`content/a2/1-1/deck.csv` and `deck.sources.json` from the Blooket source, replacing every current
card. Keep the Blooket CSV column order used today; shuffle nothing in the file (answer order is
shuffled at run time if it already is today). Proper CSV quoting (answers contain commas,
brackets, `∞`, `≤`, `∪`); write UTF-8 without a BOM. Add one new trailing column `image`
(file name or empty). Copy the 23 images to `content/a2/1-1/images/blooket/`.
C2. `flashcards.js` parses the optional `image` column; the Desk and mobile renderers show the
image above the question (max-width 100%, alt text "number line"). A card whose image fails to
load is skipped for that run, never shown blind.
C3. **About 10 a day.** The quick check still serves `QUICK_TARGET = 10`, but the 10 are a
deterministic daily draw: seed = local date (YYYY-MM-DD) + lesson key, so every student gets the
same 10 on a given day and a different 10 the next day, cycling through the deck before repeating.
Keep a pure, exported, tested `dailyDraw(cards, dateKey, n)`.
C4. Update the lineage/validation tests that pin the old 14 cards; do not weaken what they check.

## WI-D — Start Here says what the syllabus says

Owned paths: `start-here.html`, `open-house.html`, `scripts/build-open-house.mjs`,
`scripts/build-a2-syllabus.mjs`, `syllabus-*.html`, and the tests that pin them
(`tests/a2-surfaces.test.js`, `tests/open-house.test.js`, `tests/phase4-structure.test.js`,
`tests/grade-clarity.test.js`, `tests/a2-syllabus-bonus.test.js`, `tests/grade-playground.test.js`).

D1. Rewrite Start Here's "An average day", "What gets graded" and the first-two-weeks section so
they carry the syllabus copy (the wording currently hard-coded in `build-a2-syllabus.mjs`), then
make the syllabus builder lift that copy from Start Here again so there is one source. The
Open House handout follows. Keep the district formula sentence, the minimums, the topic-assessment
rule, the Bonus section, the quarter dates and the grade playground unchanged.
D2. Update the pinned tests to the new copy; keep every structural guarantee they make (section
count/order, word-count band adjusted only as needed, no teacher name or contacts on public pages,
reproducible generation).

## Review (separate agent, read-only)

Review the combined diff against this spec. Look hardest at: A3 false positives/negatives and the
information it discloses; A4 routes that were missed; any path that stores or logs the plaintext
password beyond the existing cipher; B3 leaks (a grade number still reachable by a student); CSV
quoting and encoding in C1; tests that were loosened rather than updated. Report findings as
file:line with a concrete failure scenario; do not edit.

## Coordinator checklist (after review)

1. Full test suites; failure set must equal the inherited one.
2. `node scripts/bump-build.mjs`, commit, push; confirm Railway `/health` reports the new commit.
3. Teacher runs `node scripts/teacher-reset-passwords.mjs --all` (needs the teacher secret).
4. Smoke on the live site: signup with an existing name is refused and hands off; sign-in with the
   starting password forces a change; quick check shows 10 cards including number-line images.
5. Only then post the Desk link in the three Schoology courses.
