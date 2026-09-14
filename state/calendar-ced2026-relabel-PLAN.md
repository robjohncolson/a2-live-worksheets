# Calendar CED 2026 relabel plan — 2026-09-05

Baseline: `93dc38f` (wallet print and `9101181` spec pushed successfully before
this task). Implement the rev 2 prompt as a display-only change; do not push the
calendar commits. Do not consult the paused packing branch.

## Audit before implementation (§2.5)

The exact sweep and additional dynamic-label audit below were completed before
production edits. Line numbers refer to the baseline Desk unless another file
is named. One shared helper module will supply all CED labels/classes; callers
retain original keys, grading buckets, dates, URLs, and routing arguments.

| File / baseline lines or symbol | Finding | Disposition |
|---|---|---|
| Desk 4633, 4647, 4661, 4675 | Baked Unit 6–9 PC titles | Delete dead `BAKED_REGISTRY.progressChecks`; no readers; prove with rendered-calendar poison getters. |
| Desk 4756, 4769, 4782, 4795 | Baked Unit 6–9 poster titles | Delete dead `BAKED_REGISTRY.posters`; same proof. |
| Desk 9907–9909, 9921 / `injectPcPosterEvents` | `'U'+u` event IDs and Unit labels | Already NEW CED units; preserve identities, scheduling, and event text. |
| Desk 10105 | Unit 6–9 in SY25-26 definition | Frozen prior-year definition; preserve. |
| Desk 10989, 11059, 11124, 11168, 11389, 18623, 18626 | OLD unit references in source comments | Not rendered; resource/file organization remains unchanged. |
| Desk 11821 | `'U'+um[1]` in completion identity | Keep OLD persistent `DESK_DONE` key; no display output. |
| Mobile 183–185 / `UNIT_NAMES` | OLD unit name constant | Dead constant, no consumers; delete. |
| Start Here / Index exact regex sweep | No matches | Dynamic and manual matches below still require changes. |
| Desk 9889 / `d` | Calendar cell construction | Attach `ced` presentation data; keep all original fields. Guard helper availability for isolated generator harness. |
| Desk 9929–10078 / B/E pacing | Names contain OLD → NEW arrows | Leave arrays byte-for-byte unchanged; render helper labels instead. |
| Desk 10179–10229 / generation and year loading | Dates, meeting counts, edits, and key propagation | Preserve behavior; helper fields are excluded from schedule artifact output. |
| Desk 10333 / `updateLegend` | Five NEW unit names already correct | Retain labels; add Beyond the Exam tone. Frozen legends retain old colors. |
| Desk 22828 / `cls` | Cell unit colors | Use shared CED class for current lessons; retain special and frozen tiles. |
| Desk 22840 / `htm` | OLD topic/name in cell | NEW topic/label and folded Day n suffix from helper. |
| Desk 22858 / `cellAria` | OLD topic/name in accessible text | Same display label; preserve dates/status. |
| Desk 22921 / `_summerWeeks` | Live prep names derived from OLD pacing names | Keep construction and keys; render attached CED label. |
| Desk 22976 / `rCal` | Calls display helpers and sets dataset identities | Keep routing, completion, dates and OLD dataset.topic. |
| Desk 23304 / `rProg` | Unit segment grouping | Use CED unit/bonus presentation groups; preserve meeting counts and pace math. |
| Desk 23365 / `sTip` | OLD IDs and names in tooltip | NEW text; OLD bridge only through existing `_deskIsTeacher` gate. |
| Desk 11296 / `showResourcePanel` header | OLD-leading title and date prefix | NEW label first; OLD video/file bridge teacher-only; preserve bonus quiz suppression. |
| Resource due/as title display | Legacy resource titles can contain OLD IDs | Translate display only; keep parsers, lookups, and URLs unchanged. |
| Desk 6533 / `_showLessonLockedDialog` | OLD current/predecessor lesson in message | Translate final text; preserve gate keys. |
| Desk 9307–9368 / `_renderCoachPanel` | OLD IDs in coach recommendations | Translate final text; preserve oracle/context inputs. |
| Desk 9593, 9624, 9643 / `renderDoNow` | OLD topic and unit-only task text | Lesson labels through helper. Follow-up source verification showed the live manifest already supplies NEW unit values; preserve unit-only text and task selection. |
| Desk 13122, 13266, 13818, 14428 / flashcard headers | OLD topic in mode/review/quick/timed headings | Shared helper label; preserve decks, CSVs and scoring. |
| Desk 14942, 16882 / receipts | Raw OLD item IDs | Display resolver through helper; preserve signed receipt bytes and links. |
| Desk 18455 / `renderMyGradebook` | OLD lesson column titles | Helper labels from topicKeys; preserve columns, ordering, keys and scores. NEW PC/poster labels stay NEW. |
| Desk 18530 / `openDayGrade` | OLD lesson key plus name | Shared helper display label. |
| Desk 12346 / `_srsRenderDueChip` | Count-only chip | Already safe; no identity shown. |
| Desk 17680, 17976 / teacher review | OLD item IDs | Teacher-only; preserve. |
| Mobile 196, 774, 813 / sort, grouping and cards | Ad hoc CED mapping with OLD fallback | Share helper; preserve current ordering/grouping intent and links; add folded day labels. |
| Mobile 1225, 1283 / flashcard headings | OLD lesson.label | Shared helper label. |
| Start Here 1032 / `renderQuarters` | Date bands already correct; counts say units | Keep counts/grades; describe existing counted groups without implying five new unit grades. |
| Start Here 1071 / `renderUnitCard` | OLD unit score buckets | Preserve each score and bucket; label helper-derived CED topic coverage, never relabel as a different unit grade. |
| Index 298 | Static “69 video follow-alongs, Units 1–9” | Five CED units plus Beyond the Exam copy. |
| Completion/unlock, `_lessonDateMap`, `_computePace`, `appLaunchUrl`, `_ti84TodayTopic`, mobile scoring/receipt/CSV keys | OLD identifiers select real work | Identity consumers, not presentation: leave unchanged. Routing them through NEW identifiers would change behavior and is outside this plan. |

## Findings and implementation boundaries

- The schedule guard was added before relabel implementation. Both baseline
  hashes passed; native Windows execution exposed an existing generator import
  bug (`ERR_UNSUPPORTED_ESM_URL_SCHEME` for a `C:` path). The authorized repair
  changes only the top-level `grade-config.js` import to `new URL(...,
  import.meta.url)`, preserving the same module and all schedule calculations.
  GitNexus file impact returned UNKNOWN/not found; manual inspection confirms
  no function, grade configuration, or output schema changed.

- Contrary to the spec's historical description, current pacing `u` values are
  already NEW CED units. Do not rewrite `t`, `u`, `n`, or events.
- `9.6` is absent from the authoritative crosswalk and schedule. Report it as
  absent; test real bonus `9.5` instead. Do not invent a mapping or add a date.
- Ten folded core groups exist, including three days for `8.1/8.4/8.5 → 3.14`.
  Determine Day n centrally in existing pacing/crosswalk order, not at call sites.
- Built-in lessons currently lack CED metadata until registry hydration. A
  generated fallback in the shared helper must exactly match `2026-crosswalk.json`
  so offline/first paint also has safe NEW labels. Live registry metadata takes
  precedence; memoization must not preserve stale labels after hydration.
- OLD grade buckets do not map one-to-one to CED units: U1→1/2; U2→2/5/★;
  U3→1/★; U4→2/★; U5→2/3/4; U6→3; U7→4; U8→3/★; U9→★.
  Use topic-coverage labels for these existing Start Here scores. The live Do Now
  manifest already has five NEW units and OLD lesson keys, so its unit values
  remain unchanged. Do not combine
  grades, rename a bucket as a single CED unit, or select an arbitrary topic.
  This is presentation only; if implementation requires behavioral changes,
  obey prompt step 5 and stop/report rather than changing the oracle.

## Implementation and gates

1. FIRST add and run `tests/desk-calendar-ced2026.test.js` baseline protection:
   fixed SHA256 for both schedule files and generator `--check` before/after.
   Both current files hash to
   `15393ad27a085340248de945239a8a7b7f5a0cfa740593855ba33cc92df6b90c`.
2. Shared memoized `cedLabel` / `cedUnitClass`, fallback data generated from the
   authoritative map; coverage formatting also calls these helpers.
3. Minimal cell attachment, bonus CSS, dead baked-data removal, and caller changes
   from the table. Preserve teacher/view-as distinction using the exact DOK gate.
4. Behavioral jsdom tests for both periods, folds, bonus fixtures, progress IDs,
   student/teacher/view-as headers and tooltips, offline fallback, mobile and
   auxiliary labels; verify identifiers and score/task values stay unchanged.
5. Run `tests/desk-*.test.js`, `tests/calendar-*.test.js`,
   `tests/classroom-structure.test.js`, and unchanged
   `tests/grade-engine-bundle-parity.test.js`, plus affected mobile/Start Here tests.
6. GitNexus impact BEFORE every existing symbol edit; CRITICAL renderer impacts
   (navigation, sign-in, completion/resource repaint) were reported before edits.
   Run staged and compare-master change detection before one or two local commits.
7. Report per-surface before/after for 1.1, 3.1, 4.10, absent 9.6 (plus real 9.5),
   final audit disposition, byte preservation, test counts, commit hashes.

No calendar push, grading/server edits, schedule packing, Schoology changes, DOK
renames, node actions, or unrelated workspace changes are authorized by this plan.
