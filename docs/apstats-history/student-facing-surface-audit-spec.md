# AP Stats Student-Facing Surface Audit Spec

**Status:** draft audit spec (Codex + independent Grok review merge)  
**Date:** 2026-07-08  
**Scope:** AP Statistics student-facing materials across the Desk, follow-alongs, quizzes, calculator practice, formula practice, flashcards/Blookets, tutor prompts, offline/Android pack, and supporting generation pipelines.  
**Primary constraint:** keep legacy old ids as stable internal keys; use the Fall 2026 `ced2026` overlay for display, ordering, and course alignment.  
**Doc lineage:** Codex authored the first full draft; Grok independently audited live trees/manifests/registries and merged additional holes, surface inventory, and risk notes. Fable then added a hands-on-migration pass (having shipped the calendar/manifest/summer reframes): the stale-label data-integrity landmine (§3.2), the eliminated-Big-Ideas / skill-framework hole (H13), the provisional-SY2627-calendar caveat, and the stale progress-check config. Neither pass edited app code for this document alone.

## 1. Goal

Identify every AP Stats surface a student can reasonably encounter, find curriculum or product holes created by the Fall 2026 CED migration, and define the order of fixes needed before SY26-27 starts.

The practical target is a coherent student contract:

- Materials are idempotent.
- Graded work maps to the roster/gradebook without corrupting historical ids.
- Assignable or visible work follows the Fall 2026 5-unit CED.
- Removed exam topics are either hidden from required paths or marked "Beyond the Exam."
- Formula, calculator, quiz, worksheet, and flashcard surfaces do not contradict each other.
- Student-facing copy (Start Here, tile buttons, unit labels) matches what the tile actually offers.

## 2. Non-goals

- No in-place renumbering of old `U.T` ids such as `6.4`.
- No rewrite of historical grade rows, receipts, or item ids.
- No deletion of reusable content; removed exam topics should stay available as bonus/enrichment when appropriate.
- No attempt to finish every new-CED material cluster in one change.
- No production sync without browser smoke tests on the live student path.
- No forced expansion of summer work to full new Unit 1 (pedagogy decision already settled: Summer Foundations = old 1.x).

## 3. Operating Model

Use the already-adopted Option B architecture:

- Old ids remain internal keys for worksheets, videos, grade rows, Do-Now item ids, and links.
- `ced2026` carries new unit, topic, label, status, and bonus placement.
- Required student sequences use the 67 core topics.
- The 10 removed topics are bonus (see `2026-crosswalk.json` `status:"bonus"`):
  - `2.9`, `4.9`, `4.12`, `8.2`, `8.3`, `9.1`–`9.5`
  - Content themes: geometric distribution, combining RVs, chi-square GOF, slope inference, leverage/influence material that is no longer tested

Current migration state (as of `b447b84` / post-P2):

| Piece | State |
|---|---|
| `mobile-home.html` | 5-unit CED + greyed bonus piles |
| Desk calendar (Period X) | 5-unit CED reframe live (`39dd6de`); **dates provisional** — placeholder meeting days + unconfirmed `2027-05-14` exam |
| Desk resource-panel relabel + `_mergeRegistryData` `ced2026` fix | Live (`3215a0e`): old-nomenclature-primary panel; overlay survives roadmap refresh |
| Do-Now manifest (both copies) | 5-unit order; bonus + PCs omitted by policy (`669f088`) |
| `roadmap-data.json` / `lessons-index.json` | Additive `ced2026` |
| Manifest pipeline footgun | Hardened (`3d35034`: freeze 9-unit source, CED builder `--deploy`) |
| Summer | "Summer Foundations" labels; content still old `1.1`–`1.10` (`b447b84`) |
| Grade schedule / quarters / Blooket denominator | Still lag (9-unit / 77-topic world) |
| Formula primary launcher | Still points at old Formula Defense deck URL |

### 3.1 Multi-map cognitive load (cross-cutting)

Students currently bounce between **four unit languages** at once:

| Lens | Units / labeling |
|---|---|
| Summer Foundations | Old `1.x` only (includes old `1.10` Normal → CED new Unit 2) |
| Desk calendar / Do-Now | CED 5 units |
| Worksheet filenames, itemIds, quizzes, most tutor files | Old 1–9 |
| Grade quarters / study guide / PC tutor files | Old 1–9 |

Option B makes this *function* (ids stable). It does **not** make it *obvious*. Any fix order should reduce contradictory student copy before full content rewrites.

### 3.2 Data-integrity landmine: hand-authored labels drift from the verified crosswalk (Fable pass)

Option B protects the *id*. It does **not** protect the *human-readable label* attached to that id — and during the Desk calendar reframe those labels were found to be **semantically wrong, not merely old-styled.** Confirmed against actual worksheet content:

| Old id | Worksheet actually covers | Stale hand-authored label (WRONG) | Verified crosswalk |
|---|---|---|---|
| `2.2` | two-way tables / categorical (`u2_lesson2`: 16× "categorical") | "Two Quantitative Variables" | new 2.1 categorical |
| `2.4` | scatterplots (`u2_lesson4`: 17× "scatterplot") | "Linear Regression Models" | new 5.1 graphs of two quant |
| `2.6` | regression | "Least Squares Regression" | new 5.3 Linear Regression Models |

The hand-authored `SY2627_PACING` labels were offset ~2 topics through old Unit 2. The Desk calendar now sources labels from `2026-crosswalk.json` (EK-verified) with old ids kept as the display prefix (`2.4 → 5.1 · Graphical Representations…`). **Principle for the whole audit: any surface that shows a topic *name* from a hand-authored list is suspect and must be reconciled against the crosswalk — the id is trustworthy, the label riding on it may not be.** This directly implicates `curriculum_render/data/units.js` descriptions, `frameworks.js` lesson titles, the study-guide DAG node names, tutor filenames, and poster labels. Treat "relabel a surface" as "re-derive labels from the crosswalk," never "copy the existing labels forward."

## 4. Student-Facing Surface Inventory

| Surface | Main files / repos | Student exposure | Current alignment | Independent notes |
|---|---|---|---|---|
| Square-mode Desk | `ap_stats_roadmap_square_mode.html`, roster server | Daily hub, resource panel, calendar, Do-Now, apps | Calendar + Do-Now 5-unit; grade substrate lags | Bakes `roadmap-data` registry; Apps menu: TI-84, Equation Trainer, Study Break |
| Mobile launcher / APK | `mobile-home.html`, `lessons-index.json`, `roadmap-data.json` | QR/mobile launch path | 5-unit display + bonus piles | Primary fetch = `lessons-index` (has local videos); fallback = `roadmap-data` (videos emptied for Pages) |
| Start Here | `start-here.html` | Onboarding + grade philosophy | Mostly pre-CED copy | Claims every lesson has quiz + tutor; openers often have neither |
| Portal / index | `index.html` | Link hub | Mixed | Still markets "Units 1–9"; formula card → Defense deck |
| TOC | `TOC.html` | Flat worksheet list | Old-id list | Escape hatch, not paced path |
| Follow-along worksheets/videos | `*_live.html` (69), `media/`, AI grading prompts | Core class materials | 67 keep / 10 bonus; no full rerecords required | All 69 live sheets reference AI grade paths; video files on disk: 140 present / 0 missing vs `lessons-index` |
| Do-Now manifest | `data/work-manifest.json`, `roster-server/data/work-manifest.json` | Next-task sequencing | 5-unit; bonus/PCs omitted | 72 lesson rows, 120 activities, 2644 itemIds; empty-ledger first task = U1 / old `1.1` worksheet |
| Gradebook / roster substrate | `roster-server/grade-config.js`, `grade.js`, `lesson-grade.js`, `lesson-schedule.json` | Grades, quarters, teacher dashboards | Still partly old 9-unit | Quarters Q1=`[1,2,3]`…Q4=`[8,9]`; schedule still 77 lessons + old PCs/posters |
| Quizzes (Curriculum Render) | `../curriculum_render/`, packaged as `quiz/` in offline/Android | Lesson MCQ (graded) | Old 9-unit ids (`U{n}-L{k}-Q…`) | **Root `quiz/` absent from main tree**; live only under `android-app/www/quiz` (~107MB pack). Web `quiz/index.html?…` is a deploy hole if Pages/host does not ship cr |
| TI-84 trainer | `ti84-trainer-v2/`, `ti84_trainer.html`, `ti84-procedures-data.json` | Calculator practice | Old unit taxonomy; removed procs still present | 31 procedures across U1–U9; **not deep-linked per lesson tile** (Apps menu only) |
| Formula Lab | `tmux-trainer` Formula Lab surfaces | Formula production practice | Right architecture; partial coverage | Not yet primary launcher |
| Formula Defense / AP SRS deck | `tmux-trainer` `#deck=ap-stats-formulas` | Legacy formula game | Still default from Desk + index | External-only → offline/Android hole even after Lab is complete |
| Flashcards / Blookets | `flashcards.js`, `*_blooket.csv` (~77), `blooket-lessons.json` | Practice + Blooket grade track | Includes bonus in denominator | Native engine maps worksheet URL → CSV; **combined-topic ids** (`3.6`, `4.1`, …) can miss combined CSVs if opened by bare topic |
| AI tutor prompts | `ai-tutor/*.md`, Desk copy buttons | Resource-panel help | Old unit framing; bonus still present | ~75 files; missing simple prompts for several openers (`2.1`, `3.1`, `5.1`, `7.1`, `8.1`, …) + a few others |
| Study guide diagnostic | `study_guide_diagnostic.html` | Diagnostic/review | Old exam topology / removed nodes | Linked from index; not wired as Do-Now remediation |
| LRSL drills | `school/lrsl-driller` cartridges + roadmap `urls.drills` | Optional skill drills | Sparse | ~10 AP Stats cartridges, mostly U8/U9 (+ one U1); not a U1–U7 spine |
| Posters | calendar blocks + sparse HTML (e.g. U4 poster examples) | In-class product | Old unit poster schedule | Thin digital scaffold; not a full product suite |
| Progress Checks | AP Classroom + calendar PC blocks | Unit assessments | Off Do-Now by policy | Students must understand "PC ≠ Desk task" or Desk looks incomplete |
| Summer Foundations | `data/summer-schedule.json` + Desk summer mode | Pre–Sept 1 path | Honest labels shipped | Content = old `1.1`–`1.10`; Do-Now handoff to old `3.1` works under Option B |
| Study Break / wallet / presence | Desk overlays | Engagement / candy challenges | N/A curriculum | Not a content hole; ignore for CED completeness |
| Offline / Android pack | `offline.html`, `android-app/`, `scripts/build-offline-pack.mjs` | Packaged student shell | Snapshot risk | Pack bundles quiz + optional media; can lag live Desk/manifest after CED deploys |
| Agent generation pipeline | `Agent/scripts/*`, `Agent/config/topic-schedule.json` | Generates roadmap/schedule data | Rebake regression risk | `ced2026` must live in generator path, not only checked-in output |
| Future Desk specs | `the-desk/specs/*` | Planning only | Stale vs live | Planning debt only |

## 5. Highest-Risk Holes

Risk order below merges Codex ranking with independent verification. **H0** is new (deploy/dead-end); **H1–H2** remain the grade truth holes.

### H0. Quiz packaging / web deploy dead-end (NEW — high)

**Risk:** high for day-one student path on web/GH Pages.

Observed holes:

- Registry / `lessons-index` quiz URLs are relative: `quiz/index.html?u=&l=…`.
- Offline pack build copies `../curriculum_render` → `quiz/`; Android `www/quiz` exists (~107MB).
- **Main follow-alongs root has no `quiz/` directory** in the working tree used for Desk development.
- If production static host does not separately publish cr as `/quiz`, **Quiz buttons 404** while worksheets/Blooket links still work.
- Systematic **no-quiz openers** in data (not just deploy): answer-key has **0** items for `1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1` (and bonus `9.1`). Do-Now likewise has worksheet-only activities for those openers and several combined lessons (`3.6-7`, `4.1-2`, `5.1-2`, …).

Required fix:

- Confirm production host actually serves `/quiz` (or point registry at an absolute cr origin).
- Document quiz = curriculum_render packaging contract in the offline-pack + GH Pages/deploy docs.
- Tile honesty: hide or label "No quiz — worksheet only" when `quiz` is null.
- Align Start Here copy ("every lesson has a quiz") with reality.

Acceptance criteria:

- From Desk and mobile launcher on **production**, a known quiz lesson (`1.2`) opens without 404.
- Opener lessons do not show a dead Quiz button.
- Offline pack and web host either both ship quiz or both document the intentional difference.

### H1. Grade substrate still encodes the old 9-unit year

**Risk:** high. Affects teacher dashboards, quarter summaries, grade schedule joins, and "what counts?"

Observed holes:

- `roster-server/grade-config.js` still groups quarters by old units 1–9 (`Q1=[1,2,3]` … `Q4=[8,9]`).
- `data/lesson-schedule.json` / server copy still model 77 lessons + old-unit PCs/posters (Period dates may differ by copy — verify identity).
- Work manifest is 5-unit (72 Do-Now lesson rows after combined keys), but schedule/quarter/PC grade logic has not fully followed.
- Core worksheet blank counts are invariant under P2 for retained keys (verified); bonus keys drop from blank-count map by design.

Required fix:

- Produce `grade-substrate-ced2026-fix-spec.md`.
- Decide whether `lesson-schedule.json` remains a legacy archive or gets a new SY26-27 generated copy.
- Align quarter/unit grouping to new units 1–5 **or** keep old-id quarter bands explicitly documented as transitional (if grades key only off old topic ids, document that students still see "Unit 6" in grade UI).
- Keep old ids as keys.
- Keep bonus off required grade paths.
- Add tests proving core worksheet blank counts and grade rows are unchanged for all 67 core topics.

Acceptance criteria:

- Grade schedule uses only 67 core lessons for required AP Stats progress.
- Bonus lessons are excluded from required percentages.
- Both schedule copies are either intentionally identical or one is explicitly retired.
- No historical item ids or grade row ids change.
- Teacher grade views do not show old Unit 9 as a required unit.

### H2. Flashcard/Blooket denominator still includes bonus topics

**Risk:** high. Students can be held responsible for removed topics; completion distorts.

Observed holes:

- `roster-server/data/blooket-lessons.json` still has 77 topics including bonus (`4.9`, `4.12`, `8.2`, `8.3`, `9.1`–`9.5`, etc.).
- `grade.js` uses the Blooket lesson list as a completion/grade denominator.
- ~77 `*_blooket.csv` files exist; native flashcards are a real grade path (`BL-U{u}-L{key}-DESK_DONE`).
- **Combined-lesson resolution gap:** bare topic ids like `3.6`, `4.1`, `6.2` do not map to a simple `u{n}_l{k}_blooket.csv`; content lives on combined CSVs (`u3_l6_l7`, `u4_l1_l2`, …). Desk path via worksheet URL is usually OK; topic-only open can miss the deck.

Required fix:

- Split Blooket/flashcard lists into `core` and `bonus`.
- Default grade denominator to core only.
- Render bonus Blookets as enrichment, not required progress.
- Resolve combined-lesson CSVs from topic id (not only from worksheet URL).

Acceptance criteria:

- Required Blooket denominator has 67 core topics.
- Bonus topics remain reachable but never required.
- Teacher views label bonus explicitly.
- Opening flashcards for every Do-Now lesson id (including combined keys) loads a deck or shows an explicit "no deck" state — never a silent empty fail.
- No removed topic appears as a normal required flashcard/Blooket assignment.

### H3. Dual registry video / status drift (NEW — high for Desk media)

**Risk:** high for "open the lesson video" on Desk/web; medium for readiness UI noise.

Observed holes:

- `lessons-index.json`: local `media/…` paths present; files exist on disk.
- `roadmap-data.json`: **`urls.videos: []` for essentially all 77 lessons** (index vs roadmap video-count mismatch = 77/77).
- Desk loads/bakes `roadmap-data`; mobile prefers `lessons-index` then falls back to roadmap (explicitly documents videos as APK-only on Pages).
- Registry `status` is almost all `"partial"` (68) with only 9 `"ready"` — readiness dots are not a trustworthy completeness signal.

Required fix:

- Either rehydrate `roadmap-data` videos from the same source as `lessons-index`, or teach Desk to merge media from lessons-index when present.
- Redefine `status` or stop showing partial/ready as student-facing readiness until it is accurate.
- Document GH Pages media policy (bundle / external host / APK-only) in one place.

Acceptance criteria:

- On the primary student Desk host, a U1 lesson video control either plays or explains why media is unavailable (no silent empty list).
- Mobile and Desk do not contradict each other on whether a lesson has a video.
- `status` is either accurate or not shown as a traffic light to students.

### H4. TI-84 trainer still teaches removed procedures

**Risk:** high for student practice accuracy; medium for discoverability (not lesson-wired).

Observed holes:

- `ti84-procedures-data.json` still contains geometric distribution commands, chi-square goodness-of-fit, and slope inference calculator procedures (31 procs across old units 1–9).
- `data/ti84-lesson-map.json` maps removed old topics to trainer procedures.
- `ti84-pattern-recognition-data.json` still uses old unit fields and old framework skill labels.
- Trainer is Apps-menu global, not "open calc skill for this tile."

Required fix:

- Prune or mark removed TI-84 procedures as bonus.
- Re-home surviving procedures under new CED topics using `ced2026`.
- Preserve calculator practice for core inference, descriptive stats, probability, and regression description.
- Keep pattern-recognition taxonomy canonical with Formula Lab classification axes.
- Optional later: per-tile deep link for the relevant procedure(s).

Acceptance criteria:

- Required calculator trainer contains no GOF, geometric, or slope-inference tasks.
- Removed procedures are bonus-only if retained.
- Pattern recognition families match Formula Lab's family map.
- Lesson map references new unit/topic display via `ced2026`.

### H5. Formula entry points still launch old Formula Defense

**Risk:** medium-high. Conflicts with moving to Formula Lab as the primary surface.

Observed holes:

- Follow-alongs launchers / index still link to `https://tmux-trainer.vercel.app/#deck=ap-stats-formulas`.
- Desk app registry still points the formula app at that deck.
- Formula Defense is pruned, but not deprecated in student navigation.
- Formula surface is **external-only** → school network / offline / Android pack do not get a local fallback.

Required fix:

- Change formula app entry points to Formula Lab.
- If Formula Defense remains visible, label it "legacy review" and do not make it the default.
- Confirm service worker precache and Vercel path behavior.
- Decide offline story (bundle Lab later vs accept online-only).

Acceptance criteria:

- The primary formula button opens Formula Lab.
- Formula Defense is not presented as the main AP Stats formula surface.
- Roster allowlist includes `formula-lab` in deployed server env/code.
- Student path works from a direct QR/mobile launch.

### H6. Formula Lab is not yet a complete replacement

**Risk:** medium-high. Architecture is right; coverage is partial.

Current coverage (Codex):

- One- / two-proportion z tests and intervals
- Retention layer and roster integration scaffolding

Missing production workflows:

- One-mean / paired / two-mean t workflows
- Chi-square homogeneity/independence
- Earlier-unit formula fluency where production matters

Also from formula probe map in follow-alongs:

- `data/formula-probe-map.json` reports 81 formulas; supplement claims 81/81 tagged when combined with `formula-probe-supplement.js` (probe tagging ≠ full Lab workflow coverage).

Required fix:

- Continue cluster builds in curriculum order: means → chi-square H/I → earlier-unit fluency.
- Keep classify/setup gauntlet broad; production workflows CED-aligned.

Acceptance criteria:

- Every tested inference workflow has classify, setup, compute, conditions, and interpretation practice.
- Removed workflows are not production targets.
- Formula Lab can stand as the default formula practice surface before Formula Defense is hidden.

### H7. Curriculum Render is legacy 9-unit content

**Risk:** medium-high if used as current-year assessment; compounded by **H0** packaging.

Observed holes:

- Question ids are old `U{unit}-L{lesson}-Q{number}` (782 MCQ keys in `data/answer-key.json`).
- Data files still include old units 1–9; removed topics appear in quiz banks.
- Historical answer ids and receipts make in-place renumbering unsafe.
- Opener lessons intentionally have no quiz items (see H0).

Required policy:

- Freeze current `curriculum_render` as SY25-26 / transitional legacy bank **with explicit version labeling**.
- Build a forward `ced2026` quiz bank with versioned ids instead of mutating old ids.
- Hide or label legacy quizzes in current student navigation until a new bank exists.
- Do not renumber; Option B applies to quizzes too.

Acceptance criteria:

- Students cannot accidentally take removed-topic legacy quizzes as current required work.
- Any current quiz surface identifies whether it is legacy or Fall-2026 aligned.
- New quiz ids do not collide with old grade/receipt keys.

### H8. AI tutor prompts are old-unit, incomplete, and removed-topic aware

**Risk:** medium. Contradictory guidance when launched from Desk; Start Here overclaims coverage.

Observed holes:

- `ai-tutor/` includes old Unit 9 prompts and geometric / removed-topic material.
- PC tutors exist for old `u1`–`u9` only.
- Coverage gaps on simple paths (independent check): openers and others missing, including `2.1`, `3.1`, `5.1`, `5.6`, `7.1`, `8.1`, `9.1`, `9.3` (plus pattern: many `*.1` intros never got a prompt).
- Start Here says every lesson tile has a tutor copy button — not accurate.

Required fix:

- Generate prompt metadata from the `ced2026` crosswalk.
- For bonus topics, prepend a "Beyond the Exam" policy note.
- For core topics, show new CED labels while preserving old resource ids.
- Hide tutor button when artifact missing; fix Start Here copy.

Acceptance criteria:

- Core tutor prompts use new CED framing.
- Bonus prompts are clearly marked enrichment.
- No required core prompt tells students slope inference, GOF, or geometric distributions are tested.
- Missing prompt ≠ broken button.

### H9. Study guide diagnostic is stale

**Risk:** medium. Another student-facing review path; still reflects the old exam.

Observed holes:

- Linked from the launcher/index.
- DAG data includes geometric, GOF, and slope-test nodes.
- Old exam dates and Unit 9 references remain.
- Not connected as the automatic remediation for Do-Now gaps.

Required fix:

- Decide migrate vs freeze as legacy review.
- If migrated, rebuild DAG from 67 core topics + current formula/calculator taxonomy.
- Hide removed nodes or place them in bonus.

Acceptance criteria:

- Diagnostic does not recommend removed topics for current AP exam prep.
- Exam-date text is not stale.
- Any retained bonus paths are visibly optional.

### H10. Agent rebake pipeline can regress the live overlay

**Risk:** medium. Generated data can overwrite manual fixes.

Observed holes:

- `Agent/config/topic-schedule.json` still carries old schedule assumptions.
- Roadmap generator owns `roadmap-data.json`; hand-edits are not durable.
- Generator drift possible (review lesson mismatch reported).
- `roadmap-data.json` still carries a **9-unit `progressChecks` + `posters` config with fixed 2026-27 dates** (U1 PC 2026-09-24 … U9 PC 2027-02-04). The live Desk calendar no longer uses these — it derives **5** PC/poster blocks from `.u` transitions in the pacing via `injectPcPosterEvents`. So the checked-in config is now stale/inconsistent; audit whether any view (`rProg`, teacher dashboards, exports) still reads the 9-unit `progressChecks`, and either regenerate it to 5 units or retire it.
- Manifest dual-write footgun was partially closed by `3d35034` (freeze 9-unit source + CED `--deploy`); keep that contract tested.

Required fix:

- Keep all `ced2026` enrichment in the generator path, not just checked-in output.
- Prevent old 9-unit topic schedules from rebaking over live 5-unit surfaces.
- Add tests that rebuilt roadmap data preserves `ced2026`.
- Keep CED work-manifest deploy path from re-deriving off an already-CED live file without a frozen source snapshot.

Acceptance criteria:

- A fresh Agent rebake preserves all 77 `ced2026` records.
- Bonus/core counts remain 10/67 after rebake.
- Review marker handling for `1.review`–`5.review` is explicit.
- `build-work-manifest.mjs` cannot silently restore 9-unit + PC Do-Now without an explicit flag.

### H11. Worksheet/video content is safe, but supplements remain

**Risk:** low-medium. Main library survives; a few content edits still needed.

Known punch-list:

- Matched-pairs supplement for Unit 4 means workflows (`mu_d` / `xbar_d`, `H0: mu_d = 0`, differences condition).
- Small details: unstructured data examples, `Var(X)` notation, interpolation, randomization distribution as reallocating responses to treatment groups.
- Keep old `1.10` Normal as summer foundation / new Unit 2 content, not "exactly new Unit 1."

Acceptance criteria:

- Supplement list is tracked as concrete videos/worksheet edits.
- Student-facing labels distinguish teaching mode from CED placement where needed.
- No core video needs a full rerecord.

### H12. Thin / secondary surfaces (lower, track explicitly)

| Item | Risk | Note |
|---|---|---|
| LRSL drills | low | U8/U9-heavy; optional enrichment only |
| Posters | low–medium | Calendar shows blocks; digital kits incomplete |
| PC calendar vs Do-Now | low (policy) | Accepted omission; needs student copy so it does not look broken |
| Summer catch-up nudge | low now | Hold until September; Do-Now already points summer-skippers at `1.1` |
| Study Break / wallet | low | Engagement only |
| Android pack staleness | medium process | Rebuild after major Desk/manifest deploys |
| Desk console error | low | Pre-existing `"process is not defined"` pageerror on load (a bundled script; verified NOT from CED work). Student-facing surface logs one uncaught error; harmless but worth a cleanup ticket. |

### H13. Eliminated Big Ideas (VAR/UNC/DAT) still drive AI grading + skill-tagged surfaces (Fable pass)

**Risk:** medium-high for grading/coaching accuracy. This is a genuine content-correctness bug, not cosmetics.

The Fall 2026 CED **eliminated the Big Ideas axis** (VAR- / UNC- / DAT-) entirely and replaced the skill system with **18 codes (`1.A`–`4.G`) across 4 practices**. Several surfaces still teach the dead framework:

- `curriculum_render/data/frameworks.js` — `UNIT_FRAMEWORKS` still lists `bigIdeas: [{id:"VAR"…},{id:"UNC"…},{id:"DAT"…}]` per unit, and its own header says it "provides context-aware AI grading feedback." So the **AI grader coaches students on Big Ideas College Board removed.**
- `ti84-pattern-recognition-data.json` still uses old-framework skill labels (also flagged in H4).
- Formula Lab classification axes and several tutor prompts reference the old skills.

There is no official College Board old→new skill crosswalk, so any mapping is inference — but *removing* the eliminated Big Ideas and *stopping* the AI grader from citing them is unambiguous and should happen regardless.

Required fix:

- Rewrite `frameworks.js`: drop `bigIdeas`, map to the new 18-code taxonomy (or at minimum stop emitting Big Ideas into the AI-grading context).
- Establish ONE canonical new-CED skill map and have Formula Lab, TI-84 pattern-recognition, and tutor prompts share it (no per-surface skill vocabularies).
- Keep old topic/question ids; this is a framework/label change, not an id change (Option B).

Acceptance criteria:

- No student-facing AI feedback references "VAR/UNC/DAT" or "Big Idea."
- Skill labels across Formula Lab / TI-84 / tutor trace to one canonical Fall-2026 taxonomy.
- Grading still keys off old ids; no question/receipt id changes.

## 6. Recommended Fix Order

### Phase 0. Lock the audit document

Deliverable:

- This spec committed as the cross-surface source of truth.

Verification:

- Codex/Claude/Grok review focuses on missing surfaces and incorrect risk ranking.

### Phase 0.5. Dead-end smoke (NEW — before feature work)

Deliverables:

- Production check: worksheet, quiz, video, flashcards, formula, TI-84 from Desk + mobile.
- File a one-page "host matrix" (GH Pages / Railway / Vercel / APK) stating what each host actually serves.

Why first-among-first:

- No point aligning CED labels if Quiz 404s or Desk has no videos on the host students use.

### Phase 1. Fast navigation + copy cleanup

Deliverables:

- Change formula app launchers to Formula Lab or a two-option screen with Formula Lab primary.
- Mark Formula Defense as legacy if retained.
- Confirm roster allowlist/env includes `formula-lab`.
- Tile honesty for null quiz / missing tutor.
- Start Here + index copy: Summer Foundations, 5-unit year language, no "every lesson has a quiz."

Why first product change:

- Visible, low blast radius, reduces trust damage.

### Phase 2. Grade substrate and required-denominator cleanup

Deliverables:

- `grade-substrate-ced2026-fix-spec.md`.
- Align `lesson-schedule.json`, grade quarter config, progress-check assumptions, and Blooket denominator.
- Decide legacy archive vs active schedule copies.
- Combined-lesson flashcard CSV resolution.

Why second:

- Highest-risk mismatch: migrated course map vs grades/required practice.

### Phase 3. Registry media + status truth

Deliverables:

- Videos present where the host can serve them, or explicit unavailable state.
- `status` field either fixed or demoted from student traffic-light.

Why third:

- Daily lesson open path; independent of full grade rewrite.

### Phase 4. TI-84 trainer reframe

Deliverables:

- Prune or bonus removed procedures.
- Re-home procedure map by `ced2026`.
- Align pattern recognition taxonomy with Formula Lab.

Why fourth:

- High-use practice can train removed exam tasks if left alone.

### Phase 5. Curriculum Render policy gate

Deliverables:

- UI/route labeling that freezes legacy quizzes.
- Plan for new versioned Fall-2026 quiz ids.
- H0 packaging contract documented and enforced in deploy.

Why fifth:

- Full quiz migration is large; immediate risk is accidental use + dead links.

### Phase 6. Tutor / study-guide regeneration + skill-framework fix (H13)

Deliverables:

- `ced2026`-aware tutor prompt generation + coverage for openers.
- Study guide diagnostic hide/legacy/migrate decision.
- **Rewrite `curriculum_render/frameworks.js` to drop Big Ideas (VAR/UNC/DAT) so the AI grader stops citing a dead framework; establish the one canonical 18-code skill map (H13) that tutor / TI-84 / Formula Lab consume.** The frameworks.js AI-grading fix is the highest-value slice — it's *wrong now*, independent of the full quiz-bank migration in Phase 5.

### Phase 7. Formula Lab completion clusters

Deliverables:

- Means cluster → chi-square H/I → earlier-unit fluency.
- Only then fully hide Formula Defense.

## 7. Cross-Surface Acceptance Matrix

| Contract | Desk | Mobile | Worksheets | Grades | Quizzes | TI-84 | Formula Lab | Flashcards | Tutor | Study Guide | Offline/APK |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Uses 5-unit display | partial | yes | wrapper yes | no | no | no | yes | no | no | no | depends on pack age |
| Keeps old ids stable | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| Bonus excluded from required path | calendar yes, grades TBD | yes | yes | no | no | no | yes | no | no | no | no |
| Graded/roster-tied | yes | via Desk | yes | yes | yes | yes | partial | yes | mixed | mixed | yes when online |
| Removed topics hidden or greyed | partial | yes | yes | no | no | no | mostly | no | no | no | pack-dependent |
| Primary media works on host | **risk** | APK yes / Pages maybe | yes if media present | n/a | **deploy risk** | yes | external | CSV local | file local | local | best-effort |
| Needs immediate action | medium–high | low–medium | low | **high** | **high** | high | medium | high | medium | medium | process |

## 8. Verification Plan

Every implementation spec should include a static and browser/behavioral gate.

Static checks:

- Count core vs bonus topics: 67 core, 10 bonus.
- Search required-path references to: `geometric`, `goodness-of-fit`, slope inference, old Unit 9 as required.
- Verify old ids and item ids are unchanged.
- Verify generated output is reproducible from its source.
- Assert both work-manifest copies byte-identical after any Do-Now deploy.
- Assert `buildWorksheetBlankCounts` core keys unchanged across reframe deploys.
- Assert quiz URL resolution: either `quiz/index.html` exists on host tree or registry uses absolute origin.
- Assert every student-facing topic *label* traces to `2026-crosswalk.json` (or the registry topic name), NOT a hand-authored surface list — the old pacing labels were provably wrong (§3.2), so "copy existing labels forward" is a forbidden shortcut.
- Assert no shipped student-facing surface emits "VAR/UNC/DAT" or "Big Idea" (H13).

Behavior checks:

- Student launcher opens current primary apps without 404.
- Desk Do-Now and calendar agree on first unfinished topic (empty ledger → old `1.1` worksheet / new U1).
- Teacher grade views exclude bonus from required completion.
- TI-84 trainer cannot assign removed procedures as required.
- Formula Lab opens directly and records under real roster identity when available.
- Flashcards open for combined Do-Now lessons (`4.1-2`, `3.6-7`, …).
- Summer completer of `1.1`–`1.10` lands Do-Now on old `3.1` (first incomplete new-U1 collecting-data row).

Browser smoke:

- Desktop and phone viewports.
- Fresh profile and stale localStorage profile.
- Direct QR/mobile path.
- Offline/service worker path where applicable.
- Production host matrix (Pages vs Railway vs APK), not only `file://` or local checkout.
- Zero new uncaught page errors.

## 9. Open Decisions

1. Should Formula Defense be hidden entirely, or remain as a clearly marked legacy review game until Formula Lab covers means and chi-square?
2. Should bonus Blookets remain visible to students, or only to teachers?
3. Should Curriculum Render legacy quizzes be hidden from student navigation, or shown with an explicit SY25-26 / transitional label?
4. Should old AP Classroom Progress Check placeholders stay off the Desk entirely until new-CED PCs exist? *(current policy: off Do-Now; calendar may still show PC blocks)*
5. Should the study guide diagnostic be migrated, or frozen as a legacy review tool?
6. Should summer remain "Summer Foundations" with old Unit 1 scope, or should the label explicitly warn that old `1.10` is now new Unit 2 content? *(labels already softened in summer view; school-year CED tags retained)*
7. **NEW:** What is the production source of truth for the quiz app — GH Pages `/quiz`, separate cr origin, or APK-only?
8. **NEW:** Should grade quarters physically renumber to CED 1–5 this summer, or keep old-id bands with clearer UI labels until a dedicated grade migration window?
9. **NEW:** Are unit-opener lessons permanently quiz-less by design, or a content debt to fill?
10. **NEW (Fable):** The live SY2627 Desk calendar is **provisional** — Period X uses placeholder meeting days (old E's Mon/Wed/Fri) and the exam date `2027-05-14` is unconfirmed (College Board still publishes only 2026 dates). The real school calendar is pending via `sy2627-calendar-intake.md`. Ship the provisional calendar as-is now, or hold the Desk's *dates* (not the unit structure) until the coordinator confirms? Whatever ships must stay labeled provisional.
11. **NEW (Fable):** Where does the canonical Fall-2026 **skill taxonomy** (18 codes `1.A`–`4.G`) live once authored, so Formula Lab / TI-84 / tutor / AI-grading all consume one map instead of re-inventing it (H13)?

## 10. Independent verification snapshots (2026-07-08)

Useful numbers from the Grok pass (re-run if sources move):

| Check | Result |
|---|---|
| Crosswalk bonus ids | 10: `2.9, 4.9, 4.12, 8.2, 8.3, 9.1–9.5` |
| Do-Now units | U1(17), U2(21), U3(18), U4(11), U5(5); no `pc` |
| Do-Now itemIds / index | 2644 unique, tree ↔ index match |
| Empty-ledger first task | `U1` / `1.1` / worksheet |
| Core blank-count deltas vs pre-P2 | 0 mismatches; only 10 bonus keys dropped |
| Live worksheets with AI grade refs | 69/69 |
| Lessons-index quizzes null | 9 openers (`*.1` pattern + `9.1`) |
| Answer-key MCQ | 782; 0 keys for `U*-L1` openers |
| Roadmap vs index video mismatch | 77/77 (roadmap empty) |
| Media files missing vs index paths | 0 |
| TI-84 procedures | 31 |
| Blooket CSVs | 77 |
| AI tutor files | ~75 including 9 PC tutors |
| LRSL AP Stats cartridges | ~10, mostly U8/U9 |
| Summer lessons | `1.1`–`1.10`, target Sept 1 |

## 11. Next Spec To Write

Recommended next artifact:

`grade-substrate-ced2026-fix-spec.md`

It should cover:

- `lesson-schedule.json` source of truth (and dual-copy policy).
- Quarter/unit grade config (CED 1–5 vs transitional old-id bands).
- Progress-check policy (AP Classroom vs Desk vs grade %).
- Blooket/flashcard denominator (67 core).
- Teacher dashboard display of bonus/core.
- Tests for grade invariance and required-path correctness.
- Explicit non-goals: no itemId renames; no receipt rewrites.

**Parallel micro-spec (can be a short appendix or one-pager, not blocking grade substrate):**

`student-host-matrix-and-quiz-packaging.md` — what each deploy target serves for `quiz/`, `media/`, formula origin, and offline pack rebuild triggers. Closes H0/H3 without waiting for full grade rewrite.

This remains the highest leverage sequence: **dead-end smoke → grade/required-path truth → practice surfaces (TI-84 / formula / quizzes) → satellite regen (tutor / study guide).**
