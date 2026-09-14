# Per-Lesson AI Tutor — Spec & Sample

**Status:** DRAFT for sign-off (2026-05-17). Design only — **no generator built yet** (deliberate: see §7 coordination).
**Owner of this doc + the build:** the `start-here.html` / student-deliverable lane. Parallel-SAFE with the gradebook/tagging workstream (§7): LLM-authored, read-only ingest of shared sources, isolated `ai-tutor/` write namespace — not a clobber risk.

---

## 1. What it is (the centerpiece)

Every lesson gets **one complete, ready-to-paste prompt — authored ahead of time by the teacher's tooling, not assembled or written by the student.** The student copies the whole thing, pastes it into whatever AI they already use (ChatGPT, Claude, Gemini), and it becomes a **Socratic tutor for exactly that lesson's quiz**, tethered to the AP framework. Goal, stated plainly to the model: get this student to a **5 on the AP exam** — by understanding, not by being handed answers.

This is the study spine of the course. The worksheet + quiz are the graded loop (`start-here.html` "the rhythm"); the AI tutor is how a stuck student gets unstuck without the teacher in the room, 24/7, anchored to the actual taught concepts.

## 2. The decisions (teacher, 2026-05-17 — locked)

| # | Decision | Consequence |
|---|----------|-------------|
| **A** | **Answer keys ARE included** in the prompt. | The tutor can verify and diagnose precisely. |
| **B** | **The model is forbidden to reveal or confirm the answer** until the student has reasoned there and can justify it. Guidance is **Socratic**. | Anti-cheat is enforced by *instruction & behavior*, not by withholding. (A student can paste the answer into their own chat regardless — so the design choice is what *we* seed and how we instruct; we instruct it to coach, not tell.) |
| **C** | **The AP framework is the tether.** Every hint references the Skill / EU / LO / EK *taught in this lesson*. | Keeps the tutor on the CED, not off on tangents; reinforces the lesson's concepts by name. |
| **D** | **FRQ items get explicit scoring coaching.** The prompt states what earns credit; the tutor acts as an AP reader, critiques the student's draft against the rubric, and iterates until it would earn full credit. | The tutor teaches *communication for points*, where AP FRQ scores actually live — not just the math. |

## 3. Per-lesson artifact

One prompt per lesson, **generated** (not hand-written) from sources already in the repo:

- **Framework block** — the topic's Skill / EU / LO / EK, parsed from `apstat_{U}_framework.md` (reuse the tagging workstream's repaired frameworks + parser — §7).
- **Item block** — that lesson's questions from `curriculum_render/data/curriculum.js` (the lesson's `?u=U&l=L` set). **READ-ONLY. `curriculum.js` is sacred — never edited; the prompts are new sibling artifacts.** Each item carries stem, options, the correct key, and a short rationale.
- **FRQ scoring block** — for `type:'frq'` items: scoring criteria. Sourced from the framework EK + any available rubric (`data/study-guide-frq-bank.js`, `data/frq-decompositions.json` for the 9 gate FRQs) + standard AP FRQ scoring conventions. (**Open gap, §8:** not every `curriculum.js` FRQ has a machine-readable rubric; for those the tutor applies AP norms tethered to the framework EK.)

**Delivery:** one file per lesson, surfaced from that lesson's **Desk tile** as a "🤖 Tutor prompt" copy action (alongside video / worksheet / quiz). Path convention: `ai-tutor/u{U}_l{L}.md`. `start-here.html` gets an AI-tutor section + the wiring **once the files exist** (not before — no fake promises).

## 4. The prompt template (the heart)

Generator fills `{{...}}`. Everything outside `{{...}}` is fixed instruction.

```
You are an expert AP Statistics tutor. Your student is working through
**{{TOPIC_ID}} — {{TOPIC_TITLE}}**. Your single goal: get this student to a
5 on the AP Statistics exam by making them understand this lesson, not by
giving them answers.

THE CONCEPTS THIS LESSON IS BUILT ON (your tether — every hint must trace
back to one of these by name):
{{FRAMEWORK_BLOCK}}   <!-- Skill X.Y, EU, LO, EK lines, verbatim from the CED -->

HOW YOU MUST BEHAVE:
- You have the answer key and scoring notes below. You must NEVER state or
  confirm the correct choice / final answer until the student has committed
  to one AND justified it in their own words.
- Be Socratic. When the student is stuck or wrong, do not correct them
  flatly. Ask the one question that exposes the gap, and point them to the
  specific concept above (name it: "go back to LO ... / EK ...").
- Diagnose, don't lecture. One focused move at a time. Make them do the
  thinking.
- If the student asks you to "just tell me the answer," refuse warmly and
  redirect with a question. That is the whole point of this tutor.

MULTIPLE-CHOICE ITEMS:
- Make the student pick a choice and explain WHY before you react.
- If right but shaky reasoning: probe until the reasoning is sound.
- If wrong: identify the misconception, tie it to the named concept,
  let them re-decide. Confirm only after they can defend it.

FREE-RESPONSE ITEMS:
- First, teach what earns credit on this question, in AP terms (what each
  scoring component requires; that statistics must be IN CONTEXT; that
  communication and linkage are scored, not just the calculation).
- Have the student draft a full response.
- Then score it like an AP reader: name each part Essentially correct /
  Partially correct / Incorrect, say exactly why, and what's missing.
- Iterate with them until the draft would earn full marks. End by stating
  what a 5-level response on this item looks like.

THE LESSON'S QUESTIONS (with keys + notes — for YOUR eyes; reveal nothing
prematurely):
{{ITEMS_BLOCK}}   <!-- per item: stem, options, correct key, rationale;
                       FRQ: prompt + scoring criteria -->

Start by greeting the student, naming the lesson, and asking which
question they want to work — or whether they want to start from the top.
```

## 5. Sample (rendered — illustrative items; the generator injects the real `curriculum.js` set)

> Lesson 1.2 — *The Language of Variation: Variables*. Framework + items below are **representative**, to show the shape; the generator injects the parsed CED block and the real lesson items.

```
You are an expert AP Statistics tutor. Your student is working through
**Topic 1.2 — The Language of Variation: Variables**. Your single goal:
get this student to a 5 on the AP Statistics exam by making them
understand this lesson, not by giving them answers.

THE CONCEPTS THIS LESSON IS BUILT ON (your tether):
- Skill 2.A — Describe data presented numerically or graphically.
- EU VAR-1 — Given a set of data, variation may be described.
- LO VAR-1.A — Identify questions to be answered, based on variation in data.
- EK VAR-1.A.1 — A variable is a characteristic that changes from one
  individual to another. EK VAR-1.A.2 — A categorical variable takes on
  values that are category names or group labels. EK VAR-1.A.3 — A
  quantitative variable is one that takes on numerical values for a
  measured or counted quantity.

HOW YOU MUST BEHAVE: [fixed block, as in the template]

THE LESSON'S QUESTIONS (for YOUR eyes; reveal nothing prematurely):

[MCQ] A researcher records each student's ZIP code, number of siblings,
and dominant hand. Which classification is correct?
  (A) all three quantitative
  (B) ZIP code quantitative; siblings quantitative; hand categorical
  (C) ZIP code categorical; siblings quantitative; hand categorical
  (D) all three categorical
  KEY: C.  RATIONALE: ZIP code is numeric digits but labels a place — no
  meaningful arithmetic → categorical (EK VAR-1.A.2). Siblings is a counted
  quantity → quantitative (EK VAR-1.A.3). Dominant hand is a label →
  categorical.

[FRQ] A student claims "ZIP code is quantitative because it's a number."
Explain whether you agree, in context.
  SCORING:
   - Essentially correct: states ZIP is categorical AND justifies via the
     no-meaningful-arithmetic / label idea, in context of ZIP codes.
   - Partially correct: correct classification but generic justification
     (no context) OR right idea, wrong label.
   - Incorrect: agrees it's quantitative, or "it's a number" with no
     statistical reasoning.
   - 5-level response: names it categorical, explains a ZIP is a place
     label so averaging/ordering ZIPs is meaningless, ties to the
     definition of a quantitative variable — all in context.

Start by greeting the student, naming the lesson, and asking which
question they want to work — or whether they want to start from the top.
```

## 6. Why this honors the rest of the system

- **Focus** — it's *one* artifact per lesson, on the tile the student is already on. No new place to go, no new account. Fits the "deliberately short toolkit" of `start-here.html`.
- **Framework-tethered** — reinforces the exact CED concepts the lesson teaches; complements (doesn't duplicate) the tagging workstream, which maps items→skills for diagnostics.
- **Anti-cheat by design** — same spirit as the study guide's "paper mode is a cheat path" rule: the system never hands over the answer; it makes the student earn it.
- **Self-paced / all units open** — a student doing Unit 7 in July gets the same tutor quality as one doing it in March.

## 7. Build & coordination (parallel-SAFE — corrected 2026-05-17)

An earlier draft over-stated a dependency on the gradebook tagging workstream. **Corrected per teacher:** authoring a tutor prompt is an **LLM-heavy content task**, not a deterministic parser. An LLM ingests (read-only) the lesson's **worksheet + `curriculum.js` items + `apstat_{U}_framework.md`** and *writes* a finished prompt. It does **not** need that workstream's solidified parser/skill-map to proceed.

Safe to run in parallel with the gradebook/tagging workstream because:
- **Read-only ingestion** of the shared sources — no edits to framework files or `curriculum.js` (stays sacred).
- **Isolated write namespace** — output only to `ai-tutor/u{U}_l{L}.md`. Zero file overlap with that workstream (it edits framework files / writes `data/skill-map.json`).
- **Different method** — LLM authoring, not a second parser. Nothing to duplicate, nothing to block on.

Soft coordination only (not blockers):
- `data/skill-map.json`, once it exists, is an **optional later enhancement** — inject the mapped skill code so hints can name it. Author now without it; backfill later.
- `apstat_5_framework.md` is malformed **only for deterministic header parsing** (no `## TOPIC` headers). It does **NOT** block AI-tutor authoring (corrected 2026-05-18): authoring is LLM-based — a Sonnet agent reads U5's `[Skill]` tags + the `UNIT AT A GLANCE` table directly (exactly what the audit's fallback used). **U5 fans out with every other unit; no wait on the tagging workstream's T-0.**

Status (2026-05-18): U1 pilot COMPLETE (10 artifacts committed, CC-verified). Template LOCKED. **This (student-deliverable) lane runs the U2–U9 fan-out** per teacher direction — parallel Sonnet per lesson, CC independent verification as the gate (Codex broad-review times out at xhigh × 1.7MB; pre-digest items or accept CC verify). `start-here.html` AI-tutor section + Desk-tile copy action wired once the teacher approves delivery.

## 8. Open knobs (decide before the build sprint)

1. **FRQ rubrics — UPDATED 2026-05-18 (U1-pilot finding).** Earlier worry ("most `curriculum.js` FRQs lack rubrics") was too pessimistic: many items carry machine-readable `solution.scoring`/`scoringNotes` (both U1-PC FRQs do) and MCQs carry `reasoning`. **Rule: ground the tutor's hidden rationale in those fields when present (faithful, never contradicting); author from framework EK only where absent.** Authoring risk is lower than feared; the build-doc contract enforces fidelity.
2. **Delivery mechanic.** Desk-tile copy-to-clipboard button vs. a linked `.md` page the student copies from. (Recommend: copy button — least friction.)
3. **RESOLVED (2026-05-17).** The artifact is a **complete, teacher/tooling-authored, copy-paste-ready prompt per lesson**. The student assembles nothing and is not being taught prompt-writing. Not an open knob.
4. **Skill-map tether.** Also inject the item's mapped AP skill code (from `data/skill-map.json`) so hints can name the skill, once that map exists? (Recommend: yes, when available.)
