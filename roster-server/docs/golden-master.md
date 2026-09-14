# Grade golden master

The golden master protects the roster server's HTTP grade contract. Both
oracles boot the real `createApp(...)` with in-memory roster and ledger
databases, frozen inputs, and a clock fixed to the fixture's `asOf` date. They
compare every `GET /grade` response and the teacher's `GET /class/grades`
response after applying the one versioned `stripVolatile` contract.

The committed oracle is synthetic. The real-data oracle is an optional,
local-only teacher-machine check. The test never reads production data, contacts
the network, or writes fixtures.

Answer-key freeze status: **implemented in commit `<pending>`; deployed when the
overseer pushes.** Once deployed, production grading uses a per-school-year
frozen answer key. Client answer-key endpoints continue to serve the live
document.

## Committed synthetic oracle

Regenerate the deterministic, commit-safe fixture from `roster-server/`:

```sh
node scripts/build-golden-synthetic.mjs
```

This writes plain JSON to `tests/fixtures/golden-synthetic/`. Its 16 fictional
students deliberately include unequal Work sub-tracks, the V3 floor value
`0.40`, a track at the V3 single-track ceiling value `0.70`, two periods with
different due states, and both ahead-of-schedule and behind-schedule students.
`inputs.json` records the exact configuration used. V3 remains enabled; the removed mastery source no longer participates.

The teeth tests perturb exactly one input at a time: Work weights,  the Blooket make-up score, and one answer-key entry. Every
perturbation must change at least one fictional student's HTTP response and
report a readable first-difference path.

## Optional local real-data oracle

The repository is public. Data derived from real students must never be
committed, even after pseudonymization. The default output directory is
`tests/fixtures/golden-local/`, which is gitignored.

Keep the raw `apstats-ledger-snapshot/v1` backup outside the repository. From
`roster-server/`, build and explicitly accept the local oracle with:

```sh
node scripts/build-golden-fixture.mjs --accept
```

Use `--snapshot PATH`, `--asOf YYYY-MM-DD`, `--out PATH`, or `--salt VALUE` when
needed. The builder writes plain `students.json`, `inputs.json`, and—only with
`--accept`—`expected.json`. If any file is absent, the real-data `describe`
block skips and prints the local build command. There is no gzip path.

Accept a difference only after identifying its first differing JSON path and
confirming an intentional, reviewed contract change or correction to frozen
inputs. Never accept merely to make a failing check green. Grade-neutral
refactors should leave the oracle byte-identical.

## Privacy rules

- Never commit a raw snapshot, locally generated oracle, real student ID,
  username, name, email, free-text response, review comment, receipt, or
  signature.
- The local builder hashes IDs to `gm-` plus 12 lowercase hexadecimal
  characters. Section is retained only because it selects the period dates.
- A normalized `response` may remain only on `curriculum_quiz` rows or
  retained quiz rows.
- Every retained non-null response must match
  `^[a-z0-9][a-z0-9 .,/\\-]{0,7}$`: at most eight lowercase, deliberately
  restricted characters. The builder stops and names the item ID on failure;
  it never echoes the unsafe value or silently alters it.
- Every other ledger response is `null`; review comments and identity fields
  are dropped. The output scan also rejects `@` and any source username, real
  name, or student ID.

## Coverage matrix

| Surface | Synthetic oracle | Optional local oracle |
| --- | --- | --- |
| HTTP routes | Per-student `/grade`; teacher `/class/grades` | Same |
| Sources | `worksheet` blanks, `WS-…-DESK_DONE`, `curriculum_quiz` right/wrong, `frq`, finite-score `pc`, `BL-…-DESK_DONE`, real `blooket` game rows, `trainer` | Whatever the selected snapshot actually contains |
| Units | U1, U2, U3 | Snapshot-dependent |
| Sections / periods | Period B and Period E, including a date that is due for B but future for E | Snapshot-dependent |
| Schedule state | Dates before and after `asOf`; ahead-of-schedule work; missing due work | Snapshot-dependent |
| V3 / PC | `useV3: true`; `pcTrack.enabled: true`; floor/ceiling boundaries; unequal Work tracks | Frozen production settings, which may leave V3/PC disabled |
| Work tracks | Lessons, quizzes, Blooket, and trainer (trainer enabled synthetically) | Snapshot-dependent |
| Quarters | Q1 calculation and Q2–Q4 empty-quarter surfaces | Snapshot-dependent |
| Reviews | Quiz answer-key credit only; no teacher-review ledger path | Snapshot-dependent; snapshot `reviews[]` are sanitized but the current fake ledger does not feed them into grading |

Known gaps are explicit. Posters have a V3 placeholder but no ledger-to-
`workTracks.posters` source in the HTTP engine, so neither oracle can exercise
poster credit. The synthetic fixture does not cover U4–U9, active Q2–Q4 math,
bonus Blooket topics, combined worksheets, quiz-review/exception rows, receipt
signing, database behavior, or client rendering.

The reviewed summer real snapshot is especially narrow: 20 of 37 students have
no records, its records are U1-only, it has one section, no reviews, and its V3
and PC result fields are null/inert. It remains useful as a local historical
regression sample, but it is not the committed coverage oracle and must not be
described as broad grade-path coverage.

## Production flags (important)

Railway runs roster-server with `USE_V3_GRADING=true` (and `PC_TRACK_ENABLED` unset until the
first Progress Check is scored). The builder captures the config *of the shell it runs in*, so
build the local oracle with the same flags or its grades are not production-shaped:

```
cd roster-server && USE_V3_GRADING=true node scripts/build-golden-fixture.mjs --accept
```

The builder prints `Captured config flags: useV3=… pcTrack.enabled=…` and warns when useV3 is
off. When `PC_TRACK_ENABLED` is flipped on in production, rebuild with it set too.

