# AI Tutor — Unit 1 Pilot: Build Plan & Frozen Contracts

**Status:** Build in progress (2026-05-17). Pilot for `AI_TUTOR_SPEC.md`.
**Authority (law):** `AI_TUTOR_SPEC.md` — decisions A–D and the §4 prompt template are FROZEN. This doc freezes the **U1-specific** mechanics so parallel Sonnet agents produce identical-shaped artifacts.

> Rule: contracts are law. No renamed file/path, no template drift, no schema invention. If a source looks wrong, FLAG in your result file — do not silently "fix". A result file is **not** evidence; the planner (CC) re-reads every artifact against real `curriculum.js` (memory s88b: a prior agent faked a pass report).

---

## 0. Analysis findings (grounding — verified read-only 2026-05-17)

- **Grouping is deterministic by ID.** `curriculum_render/data/curriculum.js` (sibling repo, **SACRED — READ ONLY**) is `const EMBEDDED_CURRICULUM = [ {...}, ... ]`. Every item id = `U{u}-L{l}-Q##` or `U{u}-PC-...`. A lesson quiz = **all items whose id matches `^U1-L{L}-`**. No parsing/skill-map needed.
- **U1 inventory (item counts):** L2=3, L3=3, L4=6, L5=3, L6=3, L7=6, L8=3, L9=3, L10=8. **No L1 items** (Topic 1.1 is intro-only → no tutor prompt). FRQs are at the **PC** level: ids `^U1-PC-` (incl. `U1-PC-FRQ-Q01`, `U1-PC-FRQ-Q02`).
- **Item schema:** `{ id, type, prompt, answerKey, attachments?:{ choices:[{key,value}], table?, chart? }, reasoning?, solution?:{ scoring?, scoringNotes? } }`. MCQ options live in `attachments.choices`. **MIXED schema (corrected 2026-05-18, U1-pilot finding):** *some* items carry an authoritative `reasoning` (MCQ) and/or `solution`/`scoring`/`scoringNotes` (FRQ); *many do not* (e.g. `U1-L2-Q01` has none). **Rule: when the field exists, the tutor's hidden WHY/SCORING MUST be faithful to it — clarify/condense, NEVER contradict it (contradicting the bank teaches the student wrong). When absent, author from the framework EK.** Never quote it into the student-visible flow; it grounds the tutor's hidden rationale only.
- **Framework:** `apstat_1_framework.md` (this repo, root) is well-formed: `## TOPIC 1.{L}: <title>` blocks each with `### Required Course Content` (Skill / LO / EK), plus a `## UNIT AT A GLANCE` topic→skill table (compact tether).
- **Worksheets:** `u1_lesson{L}_live.html` exist for L1–L10 (context/voice reference only).

## 1. FROZEN CONTRACT — per-artifact inputs

For artifact **L** (one of: 2,3,4,5,6,7,8,9,10, and `PC`):

| Input | Source | Extraction rule |
|---|---|---|
| Framework block | `apstat_1_framework.md` | The `## TOPIC 1.{L}:` block's `### Required Course Content` (Skill X.Y + LO + EK lines), verbatim. For `PC`: the Skill/LO/EK across **all** U1 topics, condensed (it's a unit check) — use the `## UNIT AT A GLANCE` table. |
| Items | `../curriculum_render/data/curriculum.js` (relative to repo root: `C:/Users/rober/Downloads/Projects/school/curriculum_render/data/curriculum.js`) | **READ ONLY.** All objects whose `id` matches `^U1-L{L}-` (for `PC`: `^U1-PC-`). Use `prompt`, `answerKey`, `attachments.choices`, `attachments.table`. |
| Worksheet | `u1_lesson{L}_live.html` | Voice/scope reference only — to keep tutor terminology consistent with what the student saw. `PC`: skip. |

## 2. FROZEN CONTRACT — output artifact

- **Path:** `ai-tutor/u1_l{L}.md` (e.g. `ai-tutor/u1_l2.md`); the PC artifact = `ai-tutor/u1_pc.md`. **This is the ONLY file your agent writes.** Never touch `curriculum.js`, `apstat_*`, worksheets, or another agent's file.
- **Content:** the **fully rendered** `AI_TUTOR_SPEC.md §4` template — no `{{placeholders}}` left; a student copy-pastes the whole file as-is. Markdown, plain text, no HTML.
- **Header (exact, top of file):**
  ```
  <!-- AI Tutor · AP Stats Topic 1.{L} · generated from apstat_1_framework.md + curriculum.js U1-L{L} · DO NOT hand-edit; regenerate -->
  ```
- The rest = the template, with the three blocks filled per §3.

## 3. FROZEN CONTRACT — block rendering rules

- **`{{FRAMEWORK_BLOCK}}`** — the topic's Skill / EU / LO / EK from the framework, lightly trimmed to the essentials, verbatim wording (it's the CED — do not paraphrase the skill statements).
- **`{{ITEMS_BLOCK}}`** — for each item, in id order:
  - MCQ: the `prompt`; then each `attachments.choices` entry as `(KEY) value`; then `KEY: <answerKey>`; then `WHY (for the tutor's eyes; never reveal verbatim): 2–4 sentences naming the specific LO/EK the item tests and why the key is correct and the top distractor is wrong`. **If the item has a `reasoning` field, the WHY MUST be faithful to it (clarify/condense, never contradict); if absent, author it from the framework.**
  - **Tables:** render `attachments.table` as a clean markdown table inside the item (it's text data — include it).
  - **Charts/figures:** if an item has a `chart`/image-type attachment (not textual), DO NOT invent the visual. Add: `[This item shows a chart in the quiz.]` and instruct (in the WHY) the tutor to have the student describe what they see and reason from it.
  - **FRQ items (PC artifact):** render `prompt`; then a `SCORING:` block. **If the item has `solution`/`scoring`/`scoringNotes`, that is the authoritative rubric — build the `Essentially correct / Partially correct / Incorrect` tiers + the one-line `5-level response:` descriptor FAITHFULLY from it (both U1-PC FRQs do have it; the spec §8 "no machine rubric" worry does NOT apply here).** Only author from the framework EK where no scoring field exists. Never contradict the bank's scoring.
- **Behavioral instruction block** = the fixed §4 text verbatim (the Socratic / never-reveal / refuse-"just tell me" / MCQ-flow / FRQ-flow rules). Do not soften or rewrite it.
- **Decisions A–D (`AI_TUTOR_SPEC.md §2`) are law:** key IS included for the tutor's eyes; the instruction forbids revealing/confirming until the student commits + justifies; every hint tethers to a named framework concept; FRQ gets explicit credit coaching.

## 4. Owned paths (non-overlapping — safe parallel)

One agent ⇒ one artifact ⇒ one file. Validation batch: `u1_l2.md`, `u1_l7.md`, `u1_pc.md`. Fan-out batch: `u1_l3.md`, `u1_l4.md`, `u1_l5.md`, `u1_l6.md`, `u1_l8.md`, `u1_l9.md`, `u1_l10.md`. No agent reads/writes another's file. All agents only **read** `curriculum.js`/`apstat_1_framework.md`/worksheets and only **write** their one `ai-tutor/*.md`. Parallel-safe with the concurrent gradebook session (read-only ingest + isolated write namespace, per `AI_TUTOR_SPEC.md §7`).

## 5. Verification (CC re-checks every artifact — result files are not evidence)

For each `ai-tutor/u1_l{L}.md`:
1. **Item fidelity:** every `^U1-L{L}-` item from `curriculum.js` is present; prompts/choices/keys match the source exactly (CC diffs against the real file).
2. **No leak in the student-visible flow:** the behavioral block forbids revealing the key; the key appears only in the "for YOUR eyes" items block.
3. **Template intact:** §4 fixed instruction text present verbatim; no `{{...}}` left; header line present.
4. **Tether real:** the framework block is the actual Topic 1.{L} Skill/LO/EK (not generic); WHY lines name specific LO/EK.
5. **FRQ (PC):** scoring tiers + 5-level descriptor present and CED-grounded.
6. **Sacred:** `git status` shows only `ai-tutor/` added; `curriculum.js` untouched.

Codex review goal (cross-agent, `--task-type review`, read-only): score each artifact against §2/§3 + `AI_TUTOR_SPEC.md` decisions A–D; flag any reveal-the-answer leak, any fabricated rationale presented as quoted, any item mismatch, any template drift; propose fixes. CC applies/*re-verifies* fixes (does not trust the review file).

## 6. Result files

Each Sonnet agent writes `.ai-tutor-u1-{L}.result.md`: file written, item count vs the `^U1-L{L}-` count it found, the §4 sections it filled, anything flagged. Concise. No fabrication — CC re-reads the artifact and the source.
