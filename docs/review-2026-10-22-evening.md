# Review 2026-10-22 (evening) — algebra2-live-worksheet `b8c16df..HEAD`

Independent review (FABLE_SPRINT_2026_10_22D_SPEC D1), formed from the diffs, not the
sprint reports. Scope: `roster-server/card-decks.js` (deck-result section rule,
`deckFromRow` drop rule), `roster-server/class-summaries.js` (`course=`),
`roster-server/device-health.js` (`recordingWarnings24h`), `lib/class-log-health.js`
(amber/red), `.github/workflows/ci.yml`, `scripts/build-grade-engine.mjs` (LF).

## Confirmed findings

None that needed a code change.

## Confirmed working (read end to end)

- **Deck-result section rule.** `validateResults` requires `section` as a short string, so
  the comparison is always string vs string. A section card whose section differs from
  the body answers `409 {error: 'section_mismatch', cardSection, section}` before any row
  is built; a course-wide card (`section` null from `getCard`, column nullable in 0046)
  keeps the body's section, and `deck_results.section` is `not null`, which the body's
  required string guarantees. Tests cover the 409 with nothing written, the matching
  write, and the course-wide path.
- **`course=` filter.** Absent → every course and no `course` key in the response; a
  value outside `CARD_COURSES` (including `''` and a repeated `course=` that Express
  parses as an array) → 400 before the range checks; a valid value is pushed into the
  PostgREST query (`.eq('course', …)`) inside `listRange`'s paging loop, so a filtered
  range still pages by `PAGE` rows and cannot be truncated. Tests pin both.
- **`recordingWarnings24h` derivation.** The phone's own non-negative integer wins;
  otherwise the server counts `events24h` lines matching `transcript poor` or
  `\bMic:` followed by anything but `ok` (case-insensitive); otherwise 0. The value is
  stamped into the stored payload on every ping, so an old row without it reads as 0 on
  the Desk. Matches the phone's writers (`<section>: transcript poor (…)`,
  `Mic: possibly covered (…)`, `Mic: silent for 2 min`, `Mic: ok`).
- **Amber/red precedence.** `verdict` collects reasons (red) and warnings (amber)
  separately; `amber` is `!red && warnings.length > 0`, so red always wins; both lists go
  into the hover title; `mount` toggles `is-red` and `is-amber` independently and the
  CSS defines both. Tests cover amber alone, red+amber, and the no-field legacy ping.
- **CI workflow.** Triggers on `main` (this fork's branch) plus `workflow_dispatch`; the
  roster step runs `npm test`, which is `scripts/test-modes.js` and runs the legacy
  (v3-forced) and district-formula vitest suites, passing `--retry=2` through to both;
  typecheck is `continue-on-error: true` (advisory) with the reason recorded inline.
- **Bundle LF normalization.** `readSource` strips `\r` before the transforms and before
  the version hash. Verified both ways: regenerating in place reproduces the committed
  `grade-engine.bundle.js` byte for byte, and regenerating from a scratch copy whose
  eight server sources were rewritten with CRLF line endings also produces an identical
  bundle (`_engineVersion` aa5b06e481b7). The committed bundle contains no `\r`.
- **`deckFromRow` drop rule.** Non-object entries (null, strings, nested arrays) are
  filtered before `deckStats` and before the phone sees the deck; the ETag is computed
  from the row columns, so the filter does not change caching. Test pins both routes.

## Plausible (not fixed)

- **A 409 is terminal on the phone.** class-log's `DeckResultQueue` drops any 4xx other
  than 401/403, so grades for a deck rehearsed after its card was re-sectioned are lost
  silently. Rare; the server could log the mismatch (card id, both sections) so the
  teacher can see it on the Desk's Class Log strip.
- **`course=` with an empty value is a 400.** A URL builder that appends `&course=` with
  nothing after it will fail rather than fall back to "all courses". No caller does this
  today (the AP Stats Desk sends `course=apstats`).
- **Server-side warning count differs from the phone's in edge cases** (case-insensitive,
  counts undated lines). Only reachable from an APK that sends `events24h` without
  `recordingWarnings24h`; none does.
- **The advisory typecheck hides regressions.** With `continue-on-error: true` a new type
  error in the allowlisted files shows as a yellow check only. D3 is meant to flip it
  back once the 46 inherited errors are cleared; until then nothing enforces the
  allowlist.
- **`#class-log-health.is-amber` uses a fixed yellow** (`#f9a825` on black). Readable, but
  not a `--platinum`-family token like the rest of the strip; purely cosmetic.

## Suites

- Root: `npx vitest run` — 229 files (226 passed, 2 skipped), 3355 tests (3338 passed, 16 skipped), one
  timing miss: `tests/journeys/harness.smoke.test.js` boot 3279 ms against its 3000 ms budget while three
  other suites and a Gradle build ran on the same box; 1125–1801 ms and green in isolation. Same class
  of parallel-load flake as the two budgets widened in 823b820 (D4 scales these by platform).
- roster-server: `npm test` (legacy + district) — 97 files / 1776 tests, then 2 files /
  16 tests, all green.
