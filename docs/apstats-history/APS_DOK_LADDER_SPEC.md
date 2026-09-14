2026-09-12: the daily/pairing program is deprecated; only misconception-generated sheets are active ? see DOK_DEPRECATE_DAILY_SPEC.md.

# APS_DOK_LADDER_SPEC.md — One DOK-3 problem per AP Stats lesson day, laddered 1→2→3 inside

> **2026-09-12: Self-paced bonus sheets.** The flow is superseded by [DOK_SELF_PACED_SPEC.md](DOK_SELF_PACED_SPEC.md): work from the printed sheet, turn it in whenever finished, and score the final part E / P / I by hand.

> **2026-09-12 ? video-free doctrine:** Every sheet stands alone: first take before discussion ? printed rules box ? (a)?(c) (or the sheet's part range) ? turn in. Board follow-along links are optional review. This supersedes the viewing prerequisites below; see [DOK_VIDEO_FREE_SPEC.md](DOK_VIDEO_FREE_SPEC.md). Human E/P/I grading stays.

**Purpose:** give every dated lesson day of SY26-27 ONE DOK-3 problem that bookends the
period: it goes up on the board as the warm-up (students commit a *first take* before the
video), the video follow-along carries the DOK-1/2 work, and students finish the problem
and turn it in as the exit ticket. The problem's parts (a)(b)(c) ladder DOK 1 → 2 → 3 so
every student gets a foothold. Three editions — student sheet, board slide, teacher key
(answers, questions to ask, E/P/I scoring guide) — generated from a YAML per lesson and an
item registry, typeset in LaTeX, published as PDFs the Desk can link.

> **Status:** proposed (2026-09-03, revised the same day to the teacher's class flow — §6).
> **Owner:** teacher. **Workflow:** brainstorm (2026-09-03) → this spec → stress-test 3
> problems → fan-out. Grade-INERT in v1. Nothing in the app changes until Phase 5, which is
> optional.

---

## 0. What already exists (reused, not rebuilt)

| Piece | Where | Reuse for |
|---|---|---|
| Single-DOK3 lesson spine + Do Now A-B-C doctrine (one DOK-3 per day, rules printed on the page, summary exit not CER, don't crowd the page) | wiki `concepts/Single-DOK3 Lesson Spine.md`, `concepts/Do Now A-B-C Framework.md` | the ladder's shape and the page budget |
| LaTeX packet pipeline: `tex/preamble.sty` (tcolorbox callouts, `\bankitem`, `\sectionbanner`, `\packetheading`, sentence-frame + summary-exit boxes, ASCII icon macros, named colors) | `Lesson_planning/tex/preamble.sty` | COPIED into this repo (§3) — proven on 36 A2 PDFs + the AP Stats 6.4 vitality check (`31dd97f`) |
| YAML → student/teacher `.tex` generator (`emit_student`, `emit_teacher`, `bank_item_block`, registry loader) | `Lesson_planning/build_lesson_from_yaml.py` (469 lines) | PORTED and trimmed (§4) — one problem, three editions, not a 6-page packet |
| Item registry discipline: `id`, `dok` enum, mandatory one-sentence `dok_rationale`, `role`, `tags`; the five-rule DOK authority hierarchy (esp. rule 3 "adapted items are re-rated by actual demand" and rule 4 "DOK ≠ difficulty") | `Lesson_planning/questionbank/schemas/question.json`, `inventory/decision-console/DOK_RUBRIC_v0.2.md` | the registry schema (§2) and the AP Stats rubric (§1.2) |
| Per-topic CED learning objectives, essential knowledge, skill codes, already parsed | `apstat_{1..9}_framework.md` via `scripts/lib/framework-parse.mjs` (`parseFrameworks`) | the generator prints the LO/EK block on the teacher edition and validates skill codes |
| Per-topic lesson content already written (Socratic tutor prompts with answer keys + scoring notes) | `ai-tutor/u{u}_l{n}.md` (75 files) | authoring anchor: the ladder's DOK-2 items rehearse the same EKs; never copy the tutor's answer key onto the student sheet |
| The real calendar: 66 dated lesson days per period (B: 10/8/6/10/8/11/9/4 by OLD unit 1–8), `topicKey` + `periods.B/E` dates | `data/lesson-schedule.json` | coverage test (§7) + fan-out order (§8) |
| OLD-topic → NEW-CED-unit mapping (`ced2026.newUnit`, `newTopic`, `newLabel`, `status: core|bonus`) | `roadmap-data.json` | the sheet header prints the NEW label; files stay keyed by the OLD `topicKey` like everything else in this repo |
| E/P/I scoring-guide shape (`expectedElements`, `scoringGuide.{E,P,I}`, `commonMistakes`) | `ai-grading-prompts*.js` (see CLAUDE.md "AI Grading Rubric Structure") | the DOK-3 scoring guide on the teacher edition uses the SAME shape (a good rubric shape for hand-scoring — the DOK-3 is never AI-graded, §1) |
| Runtime resource overlay: Supabase `lesson_urls` (`topic, worksheet_url, drills_url, quiz_url, blooket_url`) read by the Desk at `ap_stats_roadmap_square_mode.html:4987` | Desk + Supabase `<AP_SUPABASE_PROJECT_REF>` | NOT needed — Phase 5a derives the PDF URL from the topic key instead |
| MiKTeX on the teacher laptop (`pdflatex`, `latexmk`) | Athena, via scoop | local compile; CI does NOT compile (§7) |

**Why this lives in `follow-alongs`, not `Lesson_planning`.** Lesson_planning's hard rules are
Algebra-2-specific and would be violated on every AP Stats sheet: *Savvas-only provenance*
(AP Stats has no publisher DOK table), the *Klimsara 3-period cadence* (AP Stats runs one
topic per day), and the *OWNED_PATHS* policy (a second subject there needs its own namespace
and manager anyway). Everything the ladder consumes — schedule, frameworks, tutor artifacts,
rubric shape, GH Pages publishing, the Desk — is here. We copy the two proven files
(`preamble.sty`, the generator) rather than share them across repos. The A2 repo stays
untouched.

## 1. Goals / Non-goals

Goals:
1. **One problem per dated lesson day**, 66 per period-year; student sheet + board slide +
   teacher key, PDF.
2. **Exactly one DOK-3 per day, every day** (Topic 1.1 included — §1.3). It is the
   warm-up AND the exit ticket: seen first, finished last, turned in. Its parts ladder
   (a) DOK-1 identify → (b) DOK-2 describe/compute → (c) DOK-3 adjudicate/justify, so the
   *first take* at the start of class has a foothold and the video work feeds (b) and (c).
3. **AP-authentic DOK-3.** Every DOK-3 names the CED skill code it exercises and the released-FRQ
   pattern it rehearses (pattern DESCRIBED in the registry, never the copyrighted item).
4. **Evaluator-legible teacher edition**: phase tag, DOK, minutes, `Questions to ask`, `Adult
   role` — the columns of the Lynn framework (`Lesson_planning/DOKframework.txt`).
5. **Printable, breathable**: student edition fits ONE sheet (two sides max), no ruled lines,
   whitespace for work.

Non-goals (v1):
- No grade wiring. The ladder is paper; nothing lands in the ledger. (Phase 5(a) is optional.)
- **No AI grading of the DOK-3, ever — the human channel (teacher decision, 2026-09-04).** The rest of the course
  is largely AI-graded; this sheet is the one guaranteed teacher-read, teacher-scored piece of work every lesson day.
  Part (c) is scored by the teacher with the E/P/I guide on the key, by hand, and handed back. The E/P/I shape is
  kept only because it is a good rubric shape, not as a hook for the grader. Do not propose an AI-graded textarea.
- No slides, no pacer, no six-page packet. The follow-along worksheet already owns Launch.
- No MCQs. (`curriculum.js` is sacred; this is a separate, paper artifact — no quiz-bank edits.)
- No copying of AP Classroom / released-exam item text. Contexts and numbers are original.
- No retroactive conversion of anything in Lesson_planning.

### 1.1 DOK for AP Statistics — the substitute authority

There is no textbook DOK table. Level is assigned by **cognitive demand relative to the CED
skill categories**, with released-FRQ scoring patterns as the tie-breaker:

| DOK | What the student does | CED skill anchors | Typical verbs |
|---|---|---|---|
| **1** | Recall or recognize one EK; one-step read of a display or formula | 1.A identify/select (when the answer is a lookup), 2.A/2.B when it is a single feature | name, identify, state, which, read off |
| **2** | Apply a known procedure or describe using multiple features; one decision path, context required | 2.B/2.C/2.D describe & compare, 3.A–3.E compute/construct, 1.B–1.E select a method for a stated goal | describe in context (SOCS), compute and show, construct, select and state |
| **3** | Coordinate several ideas to **justify, critique, compare methods, or bound a conclusion**; more than one defensible path; reasoning must be explained | **4.A–4.E Statistical Argumentation**, 1.A/1.B when the selection must be *defended*, scope-of-inference, "which of two analyses is right and why" | justify, critique, decide and defend, explain why NOT, what could go wrong, design and defend |
| 4 | Multi-day investigation | — | not used in the ladder (posters / projects live elsewhere) |

The AP Stats DOK-3 has a stable shape: **identify → describe → adjudicate.** "Here are two
answers / two methods / a claim and its data — decide which is warranted, cite the specific
features that settle it, and say what you would report." That shape recurs in every unit
(which display, which summary, which test, which conclusion, which scope), which is what makes
a 66-day fan-out tractable.

### 1.2 Rules (ported from `DOK_RUBRIC_v0.2.md`, adapted)

- R1 **Authority = CED skill + FRQ pattern.** Each item cites one primary skill code; each
  DOK-3 also cites an `frq_pattern` string (e.g. `compare-two-distributions-justify-center`).
- R2 **DOK ≠ difficulty.** Hard arithmetic is still DOK-1/2. A one-line "explain why the
  median" answer can be DOK-3. The `dok_rationale` sentence must say what *kind* of thinking,
  not how hard.
- R3 **Adapted items are re-rated.** A DOK-3 with the decision pre-made in the stem drops to
  DOK-2. Splitting a DOK-3 into lettered parts that each have one path drops it to DOK-2.
- R4 **All info on the page.** Every rule/formula the DOK-3 needs is in the rules callout on
  the student sheet. Teacher role during the task = circulate with the printed prompts.
- R5 **No answer leak.** Student edition never renders `\answer{}` bodies, teacher notes, or
  a figure cropped from a key. Figures are TikZ/PGFPlots drawn from the YAML data.
- R6 **Original contexts, honest numbers.** Data are invented and plausible; never present an
  invented dataset as a real study ("a survey found…" → "suppose a survey found…").
- R7 **One DOK-3 per day.** A second DOK-3 candidate goes to `reinforcement` (not collected).

### 1.3 Every lesson carries a DOK-3, no exceptions (teacher rule, 2026-09-03)

Every dated lesson day gets a real DOK-3, Topic 1.1 included. The Algebra 2 repo allows
"DOK 1–2 days"; this course does not. On a mechanics-only topic the DOK-3 is never "do the
mechanic harder" (R2) — it is the *judgment around* the mechanic, which always exists:

| Mechanics-only topic | The DOK-3 that is honestly there |
|---|---|
| 1.1 What can we learn from data? (intro) | Two claims drawn from the same small dataset; decide which the data can actually support and which needs data we don't have. Skill 1.A / 4.A. |
| 1.3 Tables for a categorical variable | A frequency table and a relative-frequency table of the same survey, one presented by a club to argue for funding; decide which table the argument needs and what the chosen table hides. Skill 2.B / 4.B. |
| a "compute the statistic" day | Two students got different values from the same data; find whose procedure is right AND explain what the wrong one would lead a reader to conclude. Skill 3.x + 4.B. |
| a "check the conditions" day | A study where one condition is borderline; decide whether to proceed, and what you would say to a reader who disagrees. Skill 4.C. |

Pattern: **choose / critique / bound** — which display, which summary, which procedure,
which conclusion is warranted, and what the alternative would mislead a reader into. If an
author cannot find one, that is an authoring failure to escalate, not a `focus: none`.

## 2. Data model

### 2.1 Registry — `dok/registry/{topic}.jsonl` (one file per lesson day; one JSON object per line; id-unique; the row's `topic` must equal the file name — Phase-2 change so parallel authors never touch one shared file)

```jsonc
{
  "id": "aps-1.6-d3-1",              // aps-{topicKey}-d{dok}-{k}; topicKey = OLD key from lesson-schedule.json
  "topic": "1.6",
  "dok": 3,                           // the problem's TOP rung: 1 | 2 | 3
  "role": "focus",                    // focus | reinforcement (reinforcement = optional back-of-sheet items)
  "skill": "4.B",                     // primary CED skill code of the top rung (validated against framework-parse output)
  "lo": ["UNC-1.H", "UNC-1.I"],       // learning objectives touched
  "frq_pattern": "two-descriptions-adjudicate-then-choose-center",   // DOK-3 only
  "dok_rationale": "Part (c) requires weighing two competing descriptions against graph features and defending a summary choice; no single procedure yields the answer.",
  "stem": "Two students described the commute-time histogram …",     // LaTeX-safe; shared by all parts and the board slide
  "first_take": "Before the video: whose description do you trust more, Ana's or Ben's? One sentence, no wrong answers yet.",
  "parts": [                          // the ladder — REQUIRED for role: focus, dok strictly non-decreasing, last part == top rung
    {"label": "a", "dok": 1, "skill": "2.A", "prompt": "…"},
    {"label": "b", "dok": 2, "skill": "2.B", "prompt": "…"},
    {"label": "c", "dok": 3, "skill": "4.B", "prompt": "…"}
  ],
  "visual": "commute_hist",           // key into the lesson YAML's visuals block, or null
  "answers": {"a": "…", "b": "…", "c": "…"},   // teacher edition only
  "scoring": {                        // top rung only; SAME shape as ai-grading-prompts
    "expectedElements": [{"id": "cites-skew", "description": "names the right skew / tail", "required": true}],
    "scoringGuide": {"E": "…", "P": "…", "I": "…"},
    "commonMistakes": ["treats the 70-min value as typical"]
  },
  "sentence_frames": ["I would report the ___ because the distribution is ___, so the ___ is pulled toward ___."],
  "source": "original",               // original | adapted:<id>
  "hypothetical": true                // R6: data are invented
}
```

Validation (test-enforced, §7): id pattern; `dok ∈ {1,2,3}`; `dok_rationale` ≥ 40 chars and
contains none of the words *hard, easy, difficult*; every `skill` matches `^[1-4]\.[A-F]$` and
exists in the parsed frameworks; `role: focus` ⇒ `first_take` + `parts` (2–4, `dok`
non-decreasing, last == top `dok`) present, top `dok` MUST be 3, and `frq_pattern` +
`scoring` present; `hypothetical: true` whenever `stem` contains a number.

### 2.2 Lesson YAML — `dok/lessons/{topicKey}.yaml`

```yaml
topic: "1.6"                       # OLD topicKey (file/registry key)
ced2026: { unit: 1, topic: "1.6", label: "Describing the Distribution of a Quantitative Variable" }  # printed
title: "Describing a Distribution"
minutes: { first_take: 5, video_worksheet: 28, finish: 10, turn_in: 2 }   # the §6 flow; video block is the follow-along's own timing
essential_question: "What does a reader need from a description of a distribution to trust a summary statistic?"
rules_callout:                     # R4 — printed on the STUDENT sheet between the first-take box and the parts
  title: "DESCRIBING A DISTRIBUTION (keep on the page)"
  body: |
    Shape (symmetric / skewed left / skewed right; peaks) · Center (median or mean) ·
    Variability (range, IQR) · Unusual features (gaps, outliers) · always in CONTEXT with units.
    A long tail pulls the MEAN toward it; the MEDIAN resists.
focus: aps-1.6-d3-1                # the day's problem — REQUIRED, top rung must be DOK 3 (§1.3)
reinforcement: [aps-1.6-d2-3]      # optional, back of sheet, not collected
worksheet: "u1_lesson6_live.html"  # the follow-along that fills the middle of the period (link printed on the board slide)
exit_reflection: "One thing the video changed about my first take: ___"   # the summary line under part (c)
teacher:                           # teacher edition only
  phase_tag: "Do Now (first take) → Explore (video + follow-along) → Exit (finish + turn in)"
  questions_to_ask:
    - "Which feature of the graph did you look at first? Why that one?"
    - "If you deleted the 70-minute student, which description changes?"
  adult_role: "Circulate. Answer questions with questions. Do not confirm a choice until the student has cited two features."
  watch_for: ["reads 'skewed right' off the acronym without pointing at the tail"]
visuals:
  commute_hist:
    kind: pgfplot_hist
    bins: [0,10,20,30,40,50,60,70,80]
    counts: [3,11,12,7,4,2,0,1]
    xlabel: "Commute time (minutes)"
    ylabel: "Number of students"
```

## 3. Files

**New (all under `dok/`, this repo's new namespace):**

| Path | What |
|---|---|
| `dok/README.md` | how to author one ladder, compile, and publish |
| `dok/registry.jsonl` | the item bank (§2.1) |
| `dok/lessons/{topicKey}.yaml` | one per dated lesson day (§2.2) |
| `dok/calibration/unit{1..5}.json` | 2 DOK-2 + 2 DOK-3 *anchor descriptions* per NEW unit (what a DOK-3 in this unit looks like, which FRQ patterns) — the authoring reference, in the A2 `calibration/` spirit |
| `dok/tex/preamble.sty` | copied from `Lesson_planning/tex/preamble.sty`; one-line header noting origin + copy date. Add `\ladderheading`, `\dokbadge{n}`, `\focusbanner`, and a `pgfplot_hist` helper |
| `dok/build_ladder.py` | YAML + registry → `dok/tex/aps_{topicKey}_{student,board,teacher}.tex` (§4) |
| `dok/compile.ps1` / `dok/compile.sh` | `pdflatex --miktex-enable-installer` all three editions → `dok/pdf/aps_{topicKey}_{student,board,teacher}.pdf`; `-All` loops every YAML |
| `dok/pdf/` | committed PDFs. GH Pages serves them, so the board slide opens in a browser tab on the classroom projector with no file copying. Teacher PDFs are public like every other teacher-facing spec in this repo — they contain answers to *our* items, not exam items |
| `dok/index.html` | static TOC: one row per lesson day, dates for B and E, student / board / teacher PDF links, DOK-3 skill + pattern badge. The teacher's morning tab: click today's row, project the board slide |
| `tests/dok-registry.test.js`, `tests/dok-coverage.test.js` | §7 |
| `tests/test_dok_build.py` | §7 (generator emission, no-leak) |

**Edited:** `TOC.html` / `index.html` (one link to `dok/index.html`), `package.json` (nothing new —
vitest picks the tests up), `CLAUDE.md` (a "DOK ladders" row in the content table).
**Unchanged:** every worksheet, the Desk (until Phase 5), `curriculum.js`, roster-server.

## 4. The generator — `dok/build_ladder.py`

Port of `build_lesson_from_yaml.py`, cut to the ladder:

1. `load_registry()` — same line-numbered error on bad JSON (the 6.4 run's fix, keep it).
2. `load_frameworks()` — shells out to `node scripts/lib/framework-parse.mjs --json` (or reads a
   cached `data/frameworks.json` that a tiny `scripts/build-frameworks-json.mjs` emits) to
   validate `skill`/`lo` and print the LO/EK block on the teacher edition.
3. `emit_student(lesson, registry)` → ONE side: heading (NEW CED label, Name/Date line) ·
   the stem + visual · **FIRST TAKE** box (`calloutyellow`, the `first_take` prompt, ~1.2in of
   space) · rules callout (`calloutgreen`) · parts (a)(b)(c) each with a `\dokbadge{n}` and
   graduated space (0.9in / 1.4in / 2.4in, tunable per YAML `space:`) · the `exit_reflection`
   line · "Turn this in." Back side: `OPTIONAL REINFORCEMENT` only if declared, else blank
   for work. `\answer{}` renders to nothing.
4. `emit_board(lesson, registry)` → one landscape page, 28pt+: stem + visual + the
   `first_take` prompt, the three part prompts in a column with their DOK badges, the
   follow-along link/QR from `worksheet:`, and a footer "Finish (a)–(c) after the video —
   turn in." No rules callout (that stays on paper), no answers. Same TikZ source as the
   sheet so the board and the paper show the identical figure.
5. `emit_teacher(lesson, registry)` → the student body with answers rendered inline in
   `warmred`, plus a front page: objectives/LO/EK table,
   `\frameworkphaseheader{Do Now → Explore → Exit}{1→3}{45}` with `questions_to_ask` /
   `adult_role` / `watch_for`, the top-rung `scoring` block as an E/P/I table, and
   `dok_rationale` printed under the problem (evaluators read these).
6. `render_visual()` — reuse `render_pgfplot` / `render_tikz_boxes`; add `pgfplot_hist`,
   `boxplot` (five-number list), `dotplot`, `two_way_table`, `scatter` — the five displays
   the course needs. No raster images in v1. A `scale:` argument so the board edition
   renders the same spec at 2×.
7. Deterministic output; running twice yields byte-identical `.tex` (test).

## 5. Page anatomy

Student sheet (one side; the back is blank for work unless reinforcement is declared):

```
┌ AP Statistics · Topic 1.6 (CED 1.6) · Describing a Distribution      Name ____ Date ____ ┐
│ ★ TODAY'S PROBLEM   [stem + histogram]                                                   │
│ ┌ FIRST TAKE (before the video, 5 min) ─────────────────────────────────────────────┐   │
│ │ Whose description do you trust more, Ana's or Ben's? One sentence.   ⟨1.2in⟩      │   │
│ └───────────────────────────────────────────────────────────────────────────────────┘   │
│ ┌ RULES: DESCRIBING A DISTRIBUTION (keep on the page) ──────────────────────────────┐   │
│ └───────────────────────────────────────────────────────────────────────────────────┘   │
│ (a) [DOK 1] …                                                     ⟨0.9in⟩               │
│ (b) [DOK 2] …                                                     ⟨1.4in⟩               │
│ (c) [DOK 3 · Skill 4.B] …   frame: "I would report the ___ because …"   ⟨2.4in⟩         │
│ One thing the video changed about my first take: ______________________  → TURN IN     │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Board slide (landscape, projected at the bell and again after the video):

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  TOPIC 1.6 · TODAY'S PROBLEM                                    [histogram, 2× scale]    │
│  Two students described the commute data …  Ana: "…"   Ben: "…"                          │
│  FIRST TAKE (5 min, on your sheet): whose description do you trust more? One sentence.   │
│  (a) [1] …   (b) [2] …   (c) [3] …                                                       │
│  ▶ Video + follow-along: u1_lesson6_live.html   [QR]       Finish (a)–(c) after. Turn in. │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Teacher key = 1 front page (framework block + E/P/I scoring) + the annotated sheet. ≤ 3 pages.

## 6. The class flow (teacher decision, 2026-09-03 — this is the design)

The DOK-3 problem bookends the period. It never competes with the video for time because
the first take is short and the finish reuses what the video just taught.

| Min | Phase (framework) | What happens | DOK |
|---|---|---|---|
| 0–5 | Do Now | Board slide up at the bell. Students read the problem and write a **first take** on their sheet: a one-sentence commitment, "no wrong answers yet." | 2 (predict) |
| 5–33 | Launch + Explore | Video follow-along on devices — the existing worksheet, unchanged. This IS the DOK-1/2 work of the day. | 1–2 |
| 33–43 | Explore (finish) | Board slide back up. Students finish parts (a)(b)(c) with the rules callout in front of them; teacher circulates with the printed prompts. | 1→2→3 |
| 43–45 | Exit | One-line reflection ("what the video changed about my first take"), name on it, **turn in**. | recap |
| later / optional | — | Quiz questions and Blooket are homework or a short after-video fun round. Neither is required for the sheet. | 1 |

Rules: the first take is never graded for correctness (it is the hook); part (c) is the only
thing the E/P/I guide scores; a Wednesday-short period cuts the reinforcement and part (b)'s
space, never part (c). If a video runs long, the finish window shrinks to 6 min — parts are
ordered so (a) and (b) are already answerable from the first ten minutes of the video.

## 7. Tests / invariants

- **T1 registry schema** (`tests/dok-registry.test.js`): every line parses; id pattern; dok
  enum; rationale rule (R2 words banned); `focus ⇒ dok 3 + frq_pattern + scoring`; skill codes
  exist in the parsed frameworks; ids unique; `hypothetical` rule.
- **T2 coverage** (`tests/dok-coverage.test.js`): every `topicKey` with a `periods.B` date in
  `data/lesson-schedule.json` has `dok/lessons/{topicKey}.yaml` OR is listed in
  `dok/PENDING.md` (the fan-out backlog, which the test prints as a countdown). Every YAML's
  `focus` / `reinforcement` ids exist in the registry with the right `role`; exactly one
  `focus`, and its registry row's top `dok` is 3 — every lesson, no exceptions (§1.3).
- **T3 emission** (`tests/test_dok_build.py`): generator runs on every YAML; student and
  board `.tex` contain no `\answer{` body text, no `scoring`, no `dok_rationale`; teacher
  `.tex` contains all three; the board `.tex` contains the `first_take` prompt, every part
  prompt, and the `worksheet:` link, and NOT the rules callout; output deterministic; a
  fixture YAML whose focus row tops out at DOK 2 is REJECTED with a message naming §1.3.
- **T4 no-leak visuals**: `visuals` blocks contain only data + labels (no `answer`-bearing
  annotations such as "outlier" arrows) — a key allow-list per `kind`.
- **T5 compile smoke (local, not CI)**: `dok/compile.ps1 -All` exits 0 and every PDF page
  count is exactly 1 (board), ≤ 2 (student) and ≤ 3 (teacher); logged in
  `dok/COMPILE_LOG.md` by the author.

CI runs T1–T4 (pure Node/Python). Compilation is teacher-laptop only (MiKTeX), like the A2 repo.

## 8. Phases

| Phase | Work | Gate |
|---|---|---|
| 0 | Teacher signs off on this spec, picks §6 placement and §9 defaults | — |
| 1 — skeleton | copy `preamble.sty`; port generator; `pgfplot_hist`; `dok/calibration/unit1.json`; ladder **1.6** authored, compiled, printed once | PDF looks right on paper |
| 2 — stress test | ladders **1.2** (variable types) and **1.9** (comparing distributions) by the same path; `dok/README.md` written FROM the friction log; T1–T3 green | ≤ 30 min per ladder by hand, else fix the tooling before fan-out (per `feedback_authoring_tool_stress_test`) |
| 3 — Unit 1 fan-out | remaining 7 dated Unit-1 days (B: 09-08 → 09-24), dispatched as ONE dependency-free batch (each agent owns exactly `dok/lessons/{topic}.yaml` + its registry lines + its calibration unit), adversarial review on the 10 DOK-3s only | all 10 compile; DOK-3 review: 0 must-fix |
| 4 — rolling fan-out | Units 2–5 + bonus days, one NEW-unit per batch, each batch landed ≥ 2 weeks before its first lesson date; `dok/PENDING.md` counts down | T2 coverage reaches 66/66, every one with a DOK-3 |
| 5 — app hook (BUILT 2026-09-04) | (a) **teacher-only** "DOK-3 · Board · Sheet · Key" row in the Desk resource panel (`_dokLadderRowHtml`, gated on `_deskIsTeacher()` — false for students AND in view-as; teacher decision: students must not be pulled toward the paper sheet and away from the AI-graded work). URLs are derived from the OLD topic key (`dok/pdf/aps_{topic}_{edition}.pdf`, relative to the Desk's origin), so **no Supabase `lesson_urls` column** was needed. Test: `tests/desk-dok-ladder-row.test.js`. **(b) is withdrawn — see §1 "the human channel".** | shipped |

## 9. Open decisions (defaults chosen; change if you want)

- Board slide as a PDF page vs. a projectable HTML page **[default: PDF — same TikZ source as
  the sheet, opens from `dok/index.html` on GH Pages; HTML only if the projector browser
  fights PDF zoom]**.
- Turned-in sheets: paper only in v1 **[default: yes; Phase 5(b) adds the typed part-(c)
  textarea for AI grading, never replacing the paper]**.
- Student PDFs committed to the repo (public) **[default: yes; teacher PDFs too — items are ours]**.
- File key **[default: OLD `topicKey` like the rest of the repo; NEW CED label printed]**.
- Bonus ("Beyond the Exam") days get ladders **[default: yes, but last, and DOK-3 optional]**.
- Registry language **[default: JSONL + Python generator, mirroring the proven A2 chain; the
  tests are Vitest so the repo's `npm test` stays the single gate]**.
- Sentence frames on every DOK-3 **[default: yes — the ELL non-negotiable from the A2 spine]**.
- Fan-out executor **[default: Codex/agents in batches per §8; the teacher authors nothing by hand after Phase 2]**.

## 10. Worked sample — Topic 1.6 (the Phase-1 problem)

**★ TODAY'S PROBLEM** *(stem + histogram of 40 students' commute times, bins of 10 min,
one value near 70)*
Two students described the commute data.
*Ana:* "Roughly symmetric, centered near 20 minutes, spread from 5 to 45."
*Ben:* "Skewed right with a peak in the 10–20 interval; most students are under 30
minutes; one student at about 70 minutes is an outlier."

**FIRST TAKE (before the video, 5 min)** — Whose description do you trust more, Ana's or
Ben's? One sentence. No wrong answers yet.

*(video + follow-along `u1_lesson6_live.html`)*

**Finish after the video:**
(a) **[DOK 1 · 2.A]** Name the shape of the histogram and state which interval contains the
median.
(b) **[DOK 2 · 2.B]** Describe the distribution in context: shape, center, variability, and
unusual features, with units.
(c) **[DOK 3 · 4.B · pattern `two-descriptions-adjudicate-then-choose-center`]** Whose
description could a reader trust when choosing a summary statistic? Cite two specific
features of the graph that settle it, then state which measure of center you would report
and why. *Frame:* "I would report the ___ because the distribution is ___, so the ___ is
pulled toward ___."

**Exit line:** One thing the video changed about my first take: ___. → Turn in.

**Teacher key (E/P/I on part (c), abbreviated).** E: picks Ben, cites the tail AND the
70-min value, chooses the median with a pull-toward-tail justification. P: picks Ben with
one feature, or chooses the median without the mechanism. I: picks Ana, or chooses a center
without reference to shape. Watch for: treating the 70-minute value as typical; reading
"skewed right" off the acronym without pointing at the tail. Questions to ask while
circulating: "Which feature did you look at first — why that one?" / "If you deleted the
70-minute student, whose description changes?"

Why this shape ladders: (a) is a one-feature read, (b) is the SOCS procedure the video just
taught, (c) forces a judgment between two plausible descriptions and a defended choice —
the identify → describe → adjudicate spine that recurs in every unit.

### TL;DR
One YAML per lesson day + one JSONL item bank → a Python generator (ported from the proven
Algebra 2 chain) emits ONE DOK-3 problem whose parts ladder 1→2→3, in three editions:
student sheet (first-take box at the top, finish at the bottom, turn in), board slide
(projected at the bell and after the video), teacher key (E/P/I on the top rung). Anchored
to a CED skill code and a described FRQ pattern, compiled with MiKTeX, published under
`dok/`. Stress-test three problems, then fan out the 66 dated days a unit at a time, two
weeks ahead of the calendar. Grade-inert; the Desk chip is an optional Phase 5(a); the DOK-3 is
never AI-graded — it is the teacher's human channel.
