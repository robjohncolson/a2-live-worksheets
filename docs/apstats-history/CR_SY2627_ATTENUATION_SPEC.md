# CR SY2627 Attenuation — Pass 1 Spec

**Goal:** make `curriculum_render/data/curriculum.js` (the public GH-Pages quiz bank) match the Fall-2026 5-unit CED: strip the deprecated Progress Checks and the off-exam "Beyond the Exam" lessons, and regroup the surviving core content 9→5 units — **without renumbering any item id** (grades, deep-links, and Supabase `lesson_urls` all key off the old ids: Option B).

**Status:** DRAFT for review. Nothing here is applied yet.
**Repos touched:** `curriculum_render` (the bank + the app menu) and `follow-alongs` (regen scripts, tests, Desk dead-link suppression).
**Out of scope (Pass 2):** delivering the *new* CB-secure PC26 banks as a token-gated, teacher-released backup. This spec only *removes* the old PCs; it does not add the new ones.

---

## 0. Why this is safe to do now

- **No calendar dependency.** Independent of the still-blocked SY2627 school calendar (that's M2c′).
- **Grade-safe (verified).** No code in `roster-server/*.js` (grade / ledger / donow) references any `U#-PC-` id. Removing the old PCs cannot change a computed grade. The old cr PCs were browse-only content, never wired to the grade engine.
- **Fixes a live exposure.** The 364 old PC items are verbatim College Board secure Progress Checks sitting in a public file. UI-hiding leaves them harvestable; **deletion is the only real remediation.**

---

## 1. Current architecture (what we're changing)

`curriculum_render/data/curriculum.js` = `const EMBEDDED_CURRICULUM = [ {id, type, prompt, answerKey, reasoning?, attachments}, … ]`, **817 items, loaded as a plain global** (`index.html:555`). Items carry **no unit/topic/lesson/difficulty field** — every grouping and selection is derived by **regex on the `id` string**:

| Concern | Where | Logic today |
|---|---|---|
| Unit grouping | `js/data_manager.js:268` `initializeFromEmbeddedData` | `id.match(/U(\d+)/i)` → `allCurriculumData[oldUnit]` |
| Lesson / PC split | `index.html:4503` `detectUnitAndLessons` | `-PC-` → "PC" bucket; else `/U\d+-L(\d+)-/` → lesson N |
| Menu (by unit) | `index.html:11376` `renderUnitMenu` | one card per old unit |
| Unit → lessons | `index.html:11434` `selectUnit` → `11504` `renderLessonSelectorWithResources` | lesson buttons + one "Progress Check" button |
| Item selection | `index.html:11590` `loadLessonWithResources` | PC → filter `-PC-`; lesson N → filter `/U\d+-L(\d+)-/`===N |
| Deep-links | `index.html:11031` `handleURLNavigation` | `?q=U4-L2-Q01`, `?u=4&l=2` (`l` may be `PC`), `?unit=&lesson=` |
| Unit name (header) | `index.html:4378` `unitStructure` | `unitStructure[oldUnit].name` |
| Resource panel | `allUnitsData.js` `ALL_UNITS_DATA` (a **separate** 9-unit file) | keyed `unit${N}` / topic `${u}-${l}` |

**Design constraint that shapes everything:** lesson numbers are unique within an *old* unit but **collide within a new unit** (new U2 merges old U2 + old U4 + old U5, each with an "L2"). So the menu cannot be "new unit → lesson N." It must be **new unit → new topic → items resolved by old id-prefix.**

---

## 2. Bank inventory & the three changes

817 items = **453 lesson items + 364 old-PC items**. Types: 782 MCQ / 34 FRQ / 1 resource.

| Change | What | Count |
|---|---|---|
| **A. Delete old PCs** | every id matching `/-PC-/` | 364 (347 MCQ + 17 FRQ) |
| **B. Delete bonus lessons** | every id whose old topic is `status:'bonus'` in the crosswalk | 86 items across 9 lessons |
| **C. Regroup 9→5** | display overlay; ids unchanged | 367 surviving core items |

**Bonus set (B)** — delete these 9 old lesson-prefixes (crosswalk `status:'bonus'`, = the 10-topic bonus list already pinned in `roster-server/data/blooket-lessons.json`; old 9.1 has no quiz so 10 topics → 9 lessons):

`U2-L9` (2.9) · `U4-L9` (4.9) · `U4-L12` (4.12) · `U8-L2` (8.2) · `U8-L3` (8.3) · `U9-L2` (9.2) · `U9-L3` (9.3) · `U9-L4` (9.4) · `U9-L5` (9.5)

**Result:** 817 → **367** core items (350 MCQ + 16 FRQ + 1 resource), zero PCs, zero off-exam content.

---

## 3. Deletion (step A + B)

Write a codemod `curriculum_render/scripts/attenuate-sy2627.mjs`:

1. Load `EMBEDDED_CURRICULUM` (eval/`vm` the file — it's `const … = [ … ];`, one object per item).
2. Load `follow-alongs/2026-crosswalk.json` (copy it into `curriculum_render/data/2026-crosswalk.json` — it's needed at runtime too, see §4).
3. `oldTopicOf(id)` = `id.match(/U(\d+)-L(\d+)/)` → `"${u}.${l}"`. (PC ids have no `-L`.)
4. **Keep an item iff:** `!/-PC-/.test(id)` **AND** `crosswalk.map[oldTopicOf(id)]?.status === 'core'`.
   - PC ids fail the first clause. Bonus ids fail the second. Everything core survives.
   - Assert: every surviving id resolves to a `core` crosswalk entry (no orphan → hard-fail the build).
5. Re-serialize preserving the `const EMBEDDED_CURRICULUM = [ … ];` wrapper and formatting; write back.
6. Print kept/removed counts (removed should be 450 = 364 + 86).

> **Pre-req verification (do first):** the `L{n} ≈ topic {u}.{n}` mapping is a well-supported approximation but not proven item-by-item. Before deleting, dump `oldTopicOf(id) → crosswalk` for all 817 ids and eyeball the boundary cases — especially **old U8** (core 8.1 shows no quiz while bonus 8.2/8.3 carry 26 items). Confirm no core item is being deleted as bonus and vice-versa.

---

## 4. The crosswalk render overlay (step C)

Keep item ids old; drive **display** from the crosswalk. Load `data/2026-crosswalk.json` via `<script>` (or fetch) alongside `curriculum.js`.

**New grouping (`initializeFromEmbeddedData`, `data_manager.js:268` — rewrite):**
```
byNewUnit = {}                       // { newUnit: { newTopic: [items] } }
for (item of EMBEDDED_CURRICULUM) {
  cw = crosswalk.map[oldTopicOf(item.id)]   // core-only after §3
  (byNewUnit[cw.newUnit] ??= {})[cw.newTopic] ??= []
  byNewUnit[cw.newUnit][cw.newTopic].push(item)
}
```
Menu becomes **item-driven** — buckets that have items define the menu; no assumption that a prefix exists.

**Touch-points:**

| File:sym | Change |
|---|---|
| `data_manager.js:268` `initializeFromEmbeddedData` | group by `crosswalk.newUnit` / `newTopic` as above (replaces `/U(\d+)/i`) |
| `index.html:11376` `renderUnitMenu` | render **5** cards; label from `crosswalk` new-unit labels (add a `NEW_UNIT_LABELS` const or read from crosswalk) |
| `index.html:11434` `selectUnit(newUnit)` | set `allUnitTopics = byNewUnit[newUnit]`; render its **new topics** (sorted) as buttons, each labeled `newLabel` |
| `index.html:11504` `renderLessonSelectorWithResources` | list new topics instead of `L#`; button `onclick="loadTopic('<newTopic>')"` |
| `index.html:11590` `loadLessonWithResources` → `loadTopic(newTopic)` | `currentQuestions = byNewUnit[currentNewUnit][newTopic]` (drop the `-PC-` branch — no PCs remain) |
| `index.html:4378` `unitStructure` | keep old map for internal/deep-link use; add `NEW_UNIT_LABELS` for the header |
| `index.html:4503` `detectUnitAndLessons` | superseded by topic grouping; repurpose or bypass |

**Deep-link decoupling (`handleURLNavigation`, `index.html:11031` — the one real nuance):** existing links (`roadmap-data.json`, Supabase) are **old-unit locators** (`?u=6&l=2`). Keep them working by resolving **directly by id-prefix**, independent of the menu:
```
?q=U6-L2-Q01  → items where id startsWith "U6-L2-"
?u=6&l=2      → items where id startsWith "U6-L2-"
```
Then set the header context via `crosswalk[oldTopicOf(firstItem.id)]` (so the breadcrumb reads "Unit 3 › 3.3"). Keep the `?lesson=PC` path as a **graceful no-op** (empty set) — no PCs remain. A bonus-lesson locator (`?u=9&l=2`) resolves to an empty set (its items were deleted) — see §6.

**Resource panel (scope guard):** `ALL_UNITS_DATA` (`allUnitsData.js`) stays **old-keyed and untouched** in Pass 1 (regrouping it would break `curriculum-data.test.js:52` which pins 9 units, and is out of scope). When showing a new topic, map back to its old lesson(s) via `oldTopicOf` of the topic's items and union their `${u}-${l}` resource lookups.

---

## 5. Regenerate artifacts (after §3)

`curriculum.js` is the source for two committed, dual-written caches. **Regenerate exactly these two; do NOT run the work-manifest builder.**

```
cd follow-alongs
node scripts/build-answer-key.mjs     # → data/answer-key.json + roster-server/data/answer-key.json
node scripts/build-skill-map.mjs      # → data/skill-map.json (+ frq/supplement/disambiguated variants)
```

- `build-answer-key.mjs` emits only `type:'multiple-choice'` items → count drops **782 → ~350**. Writes **both** copies (byte-identical parity is tested).
- `build-skill-map.mjs` re-ingests `curriculum.js` → PC ids gone, bonus lesson ids gone.
- **DO NOT run `build-work-manifest.mjs`.** It rewrites the *frozen* `scripts/fixtures/work-manifest-9unit-source.json` (a deliberate historical snapshot the W-reg suite pins at 3402 itemIds + PC blocks). The **live** 5-unit Do-Now (`build-work-manifest-ced.mjs`) already excludes PC + bonus, so the Do-Now grade surface needs no change. Leaving the frozen source alone keeps `work-manifest-ced-regression.test.js` green.

**Silent-drift trap:** if you edit `curriculum.js` but skip the two regens, the committed caches still describe the 817-item bank and tests pass on stale data while the app diverges. Always regen in the same commit.

---

## 6. Test updates

Only the count/PC assertions on the two regenerated caches change (ids are unchanged, so regroup/bonus break nothing else). **Set thresholds to the values the regen actually emits** — the numbers below are expected magnitudes, not gospel:

| Test | Assertion today | After Pass 1 |
|---|---|---|
| `follow-alongs/tests/answer-key.test.js:72` | entries `> 700` (782) | set to regen count (~350) |
| `follow-alongs/tests/skill-map.test.js:200` | `pcIds.length > 0` | `=== 0` (or delete) — no PC ids remain |
| `follow-alongs/tests/skill-map.test.js:194-195` | lesson-`-Q` ids `> 400` (417) | set to regen count (~341) — **also drops from bonus removal** |
| `follow-alongs/tests/skill-map.test.js:203-217` | PC-id provenance block | passes vacuously (empty PC set) — confirm |
| `follow-alongs/tests/content-validation.test.js:340` | skill-map entries `>= 3000` | **VERIFY margin** — removing ~450 curriculum ids from a worksheet-dominated map; confirm it still clears 3000, else adjust |

**Must stay byte-identical (regen both copies together):** `answer-key.test.js:63-67`, `bundle-parity.test.js:32-35`.

**Must stay GREEN untouched** (do not regenerate their inputs): `work-manifest-ced-regression.test.js:99-101` (frozen 3402 + PC blocks), `:73-89` (live 2644 / 5-unit / bonus-absent), `curriculum-data.test.js:52,67-70` (units.js still 9 — we don't touch it).

**cr repo:** no test loads/counts `curriculum.js`; every id reference is an inline mock pinning only the `U#-L#-Q` shape (unchanged). Add a smoke test for the new overlay: `initializeFromEmbeddedData` yields exactly 5 new units, every item resolves to a core topic, and a sample deep-link (`?u=6&l=2`) resolves a non-empty set under new Unit 3.

---

## 7. Desk consistency — bonus dead-links

Deleting the 9 bonus lessons orphans **9 quiz links** in `roadmap-data.json` (`?u=9&l=2..5`, `?u=8&l=2/3`, `?u=4&l=9/12`, `?u=2&l=9`). Because Supabase `lesson_urls` **overrides** the baked file at runtime, the robust fix is at render time:

- **Primary:** in the Desk's "Beyond the Exam" / bonus-tile render (`ap_stats_roadmap_square_mode.html`), **suppress the cr quiz button** for `status:'bonus'` topics. One change, immune to what's in the file or the table.
- **Tidy-up (optional):** scrub the 9 bonus `quiz` URLs from `roadmap-data.json` and the `lesson_urls` rows for those topics.

Verify: after Pass 1, no greyed bonus tile exposes a quiz link that opens an empty cr quiz.

---

## 8. Acceptance criteria

1. `curriculum.js` = 367 items; `grep -c '"id"'` confirms; **zero** `-PC-` ids; **zero** ids whose crosswalk status is `bonus`.
2. cr menu shows **5 units** with new CED labels; drilling a unit shows its **new topics**; each topic loads its items.
3. Deep-links `?u=N&l=M` and `?q=U N-L M-Q..` (old locators from `roadmap-data.json` / Supabase) still resolve the correct core items; header shows the new unit/topic.
4. `answer-key.json` (both copies, byte-identical) + `skill-map.json` regenerated; follow-alongs test suite green with the §6 threshold updates; `work-manifest` frozen + live untouched.
5. No Desk greyed-bonus tile links to an empty cr quiz.
6. Grade regression: a spot student's computed grade is unchanged before/after (expected — PCs were never graded).

---

## 9. Risks / non-goals

- **Non-goal:** adding the new PC26 banks to cr (that's Pass 2 — token-gated, teacher-released, never in the public JS).
- **Non-goal:** regrouping `allUnitsData.js` (`ALL_UNITS_DATA`) to 5 units, or touching `framework-context.js` (both are parallel 9-unit data files; leave for a later pass to keep `curriculum-data.test.js` green).
- **Risk:** the `L{n}→topic` approximation — mitigated by the §3 pre-req dump + orphan assertion.
- **Risk:** `content-validation.test.js:340` 3000-entry margin — mitigated by measuring post-regen before committing.
- **Reversibility:** ids are unchanged and the deleted content is recoverable from git history + the crosswalk; the overlay is additive.

---

## 10. Sequenced task list

1. Copy `2026-crosswalk.json` → `curriculum_render/data/`.
2. **Pre-req:** dump `id → oldTopic → crosswalk` for all 817; eyeball boundary cases (esp. old U8); confirm the delete predicate.
3. Write + run `scripts/attenuate-sy2627.mjs` → 817→367; commit the deletion (curriculum.js only).
4. Regen `answer-key.json` + `skill-map.json` (both copies); **do not** run the work-manifest builder.
5. Update the §6 test thresholds to the emitted values; verify the 3000 margin; run the full follow-alongs suite.
6. Implement the §4 overlay in cr (grouping + menu + `loadTopic` + deep-link decoupling + header labels); add the cr smoke test.
7. Desk: suppress quiz buttons on bonus tiles (§7); optional roadmap-data / `lesson_urls` scrub.
8. Verify §8 on the public URL (commit + push — `file://` isn't a valid surface); spot-check a grade.
