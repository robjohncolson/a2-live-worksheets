# Gradebook Phase 5 — §6.4 adoption + AI-tutor delivery (FROZEN CONTRACT)

**Status:** Planner-frozen 2026-05-19 (session 100, autonomous loop, after
Phase 4a `13cb326` DONE+PROD-VERIFIED). This doc is the authoritative Phase-5
build contract; implement it loop-style (freeze → build → Codex review →
planner verify on disk → commit/push, no roster-server redeploy unless §6.4
touches it). Reads: `GRADEBOOK_SPEC.md` §6.4 + §2 identity audit,
`AI_TUTOR_SPEC.md` §31 + §156, `AI_TUTOR_FANOUT_BUILD.md` (delivery wiring
was explicitly deferred until "the teacher approves delivery" — Phase 5 is
the approval), `GRADEBOOK_PHASE4_BUILD.md` (Phase-4a interaction with
start-here.html is the precedent — only ADD a section, do not touch the
existing "Where you stand" block).

Depends on (DONE & prod-verified): Phase 0 roster auth (`a7d7bbd`), Phase 1
`item_ledger` + `gradebook-client.js` (`d461ebc`), DN2a/b feeder rollout
across 69 worksheets (`5fa2c79`), DN2c rosterClient single sign-in into the
Desk, Phase 4a `start-here.html` "Where you stand" (`d68e98b`/`13cb326`), 75
ai-tutor artifacts in `ai-tutor/u{u}_{l{L},pc}.md` (`9207d24`).

## 1. Scope — Phase 5 (this) vs Phase 4b (separate, deferred contract)

CONTINUATION_PROMPT.md names Phase 5 as the "next loop task = §6.4 adoption
+ AI-tutor Desk-tile delivery." Two coherent shippable increments:

- **Phase 5 — THIS increment (delivery + adoption gap closure):** wire the
  AI-tutor artifacts onto the Desk and student-facing welcome page; close
  the one remaining §6.4 identity gap (`study_guide_diagnostic.html`). No
  new DB table, no new server endpoints, no roster-server redeploy.
- **Phase 4b — DEFERRED (separate frozen contract):** the §6 `remediation
  _assignment` write loop. Needs a new curriculum_render Supabase table =
  user-gated migration. Out of Phase 5 by design.

### What §6.4 means after the audit (2026-05-19)

Per the cold-reload audit:
- ✅ Desk (`ap_stats_roadmap_square_mode.html`): rosterClient wired
  (sign-in form + `current()/signIn()/changePassword()/signOut()` paths;
  ~15 call sites including 3414/3430/3452/3473/3537/3553/3577/3710/3722).
- ✅ All 69 worksheets: `gradebookClient.record` wired (DN2b form-agnostic;
  `audit-feeder-ids` CLEAN 69; `gradebook-feeder-wiring` 92/92).
- ✅ `start-here.html`: loads `roster_config.js` + `roster-client.js` for
  Phase 4a "Where you stand" live grade render.
- ❌ `study_guide_diagnostic.html`: posts FRQs to `/api/ai/grade` at
  lines 5494 and 5532 with **no `student_id`** and no rosterClient load.
  These FRQ scores are orphan in `item_ledger`. This is the **last
  remaining §6.4 gap** and is in Phase 5 scope.
- ➖ TI-84 trainer: out of scope (spec §3 — not a feeder).

## 2. The three deliverables (Phase 5)

### 2.1 Desk-tile AI-tutor copy action (planner implements directly)

The Desk-file ownership protocol (CONTINUATION + memory) says **the
gradebook session owns `ap_stats_roadmap_square_mode.html`** and cohesive
changes to ONE contended file are planner-direct (NEVER parallel-Sonnet —
that's the s100 clobber rule). Implementation:

- Where: inside `showResourcePanel(inf, dateStr)` at line 5217+, in the
  "Today's Lesson" branch right after the Worksheet / Quiz / Blooket links
  block (around line 5277 — after the `if (u.blooket) { ... }`), or after
  the Schoology block — the exact insertion order is "after the existing
  link list, before the Resource Panel's other sections". Single block.
- What: a "🤖 Tutor prompt — copy to clipboard" button + a tiny status
  line (`"Copied — paste into ChatGPT, Claude, or Gemini"` on success,
  `"Tutor prompt not available for this lesson yet"` if the artifact 404s).
- Mapping rule (lessons only in v1): `inf.t` is a topic id in dot form
  (e.g. `"1.2"`, `"4.10"`); regex `/^(\d+)\.(\d+)$/` extracts `(unit,
  lesson)` → path `ai-tutor/u{unit}_l{lesson}.md`. If `inf.t` does not
  match (e.g. Review `R` cells, Progress Check tiles), **render NO button
  — silently** (no 404, no console noise). PC tile lookup is deferred to
  Phase 5.1 (the topic-id surface for PC tiles is not regular; we ship
  lessons now and add PCs only if the schedule's PC-tile shape is easy to
  detect). The 60 lesson artifacts ship; the 9 unit-PC artifacts remain in
  the repo, just not wired in v1.
- Fetch + clipboard: `fetch('ai-tutor/u{N}_l{L}.md').then(r => r.ok ?
  r.text() : Promise.reject()).then(text => navigator.clipboard.writeText
  (text))`. On any error (404 or clipboard permission denied), show the
  "not available" status line — never a broken page or a thrown promise.
- Visual: re-use existing `s7btn chicago` button style — matches the
  `_doneBtn` styling on the worksheet/quiz/blooket lines. No new CSS.
- HTML-escape `inf.t` before embedding in any onclick attribute (per
  CLAUDE.md security guidance); use a delegated listener or
  `data-topic` attribute + `addEventListener` is preferred to avoid
  inline-handler XSS risk if a topic id ever contains an apostrophe.

### 2.2 `start-here.html` AI-tutor section (parallel-safe — Sonnet)

`start-here.html` is independent of the Desk file (different file, no
overlap). Add ONE new `<section>` between "Your toolkit" (line 350) and
the existing toolkit cards, OR as a new toolkit `<div class="tool">` card
inside the existing `.tools` grid — whichever reads better. Content per
`AI_TUTOR_SPEC.md` §1 + §6:

- Title: "🤖 Your AI tutor (per lesson)"
- Body: "Every lesson tile in the Desk has a **copy-to-clipboard button**
  for an AP-framework-tethered tutor prompt. Paste it into whatever AI
  you use — ChatGPT, Claude, Gemini — and it becomes a Socratic tutor
  for **that exact lesson**, with the AP CED concepts named as the
  tether. It has the answer key, but won't hand you an answer; it makes
  you reason there and defend it. For FRQs it grades like an AP reader
  and iterates with you until you'd earn full credit."
- A `note` line: "Designed to help you *earn* a 5, not to do the work for
  you. Open the Desk → click a lesson tile → copy the prompt."
- **No grade-render JS code.** This section is pure HTML; the existing
  Phase-4a "Where you stand" script is untouched.

### 2.3 `study_guide_diagnostic.html` — §6.4 adoption (planner direct)

The minimum-viable, zero-functional-risk close of the §6.4 FRQ-orphan
gap (`GRADEBOOK_SPEC.md` §2 row "FRQ attribution"):

- Add three `<script src="..."></script>` tags before the existing inline
  script, loading the repo-root siblings (same `../` pattern as worksheets
  — but study_guide_diagnostic.html is at repo root, so plain `roster
  _config.js` / `roster-client.js` / `gradebook-client.js`).
- At the **two existing `/api/ai/grade` call sites** (lines 5494 + 5532):
  - **A. body field (BOTH sites):** include `student_id` only if available
    — `body: JSON.stringify({ ..., student_id: (window.rosterClient &&
    window.rosterClient.studentId && window.rosterClient.studentId()) ||
    null })`. Backend can ignore null (mirror of the existing field-fixed
    contract from `GRADEBOOK_SPEC.md` §7).
  - **B. on graded-FRQ success (line 5494 only):** fire-and-forget call to
    `window.gradebookClient.record({ source: 'frq_studyguide', itemId:
    gateId(unit), unit, response: answer, score: result.score, attempt: 1
    })`. `gradebookClient.record` is contractually no-op when there's no
    identity (returns `{ok:false, reason:'no-identity'}`) — zero risk if
    the student isn't signed into the Desk's roster.
  - **NOT for line 5532:** `runFocus(unit)` uses `/api/ai/grade` as a
    generic LLM endpoint to return a "focus synthesis" recommendation,
    NOT a graded event. It gets the body `student_id` only — no
    `gradebookClient.record` (it would pollute `item_ledger` with
    non-gradeable rows).
- This is **best-effort identity attachment** — the study guide's own
  username/password auth is untouched; this is purely additive. A student
  signed into the Desk gets their FRQ grades into `item_ledger`; one who
  never signs in keeps the current behavior verbatim.

### 2.4 Phase 5 structure guard test (planner direct)

A new `tests/phase5-structure.test.js` (mirrors `tests/phase4-structure.
test.js` shape) that asserts:

1. `ap_stats_roadmap_square_mode.html` contains the AI-tutor button code
   path — search for a stable marker like `'ai-tutor/u'` + `clipboard
   .writeText` near `showResourcePanel`.
2. `start-here.html` contains the new "AI tutor" section — search for a
   stable visible string like `"Your AI tutor"` and a `"copy-to-clipboard
   "` reference; assert the existing Phase-4a "Where you stand" `id=
   "where-you-stand"` survives unchanged (no clobber).
3. `study_guide_diagnostic.html` contains:
   - Three new script srcs (`roster_config.js` + `roster-client.js` +
     `gradebook-client.js`).
   - Both `/api/ai/grade` call sites include `student_id`.
   - `window.gradebookClient.record(` appears at least twice (one per
     FRQ grade success path) with `source: 'frq_studyguide'`.
4. All 75 ai-tutor artifacts exist on disk (`ai-tutor/u{1..9}_{l{N},pc}
   .md`) — count matches the inventory + sanity-check that each starts
   with the `<!-- AI Tutor · AP Stats` header marker.
5. Jargon-ban for the new start-here section: no `BKT`/`θ`/`pKnow`/
   `posterior`/`Bayesian` tokens (mirrors the Phase-4a guard).

## 3. Method (loop algorithm)

Contract frozen (this doc) → **planner implements 2.1 + 2.3 + 2.4
directly** (cohesive single-file changes to the contended Desk and to
`study_guide_diagnostic.html`; structure test alongside; **no
parallel-Sonnet on either contended file — s100 clobber rule**) → **one
parallel Sonnet for 2.2** (`start-here.html` is genuinely independent and
non-contended — safe to delegate the HTML section) → Codex cross-agent
**read-only review** (ASCII-only prompt; detached via PowerShell
`Start-Process -WindowStyle Hidden`; parse `state/cross-agent/<id>.result
.json` / transcript tail, NEVER the wrapper `summary`/`files_changed`) →
planner re-verify on disk (vitest root + phase5-structure + audit-feeder-
ids + jargon guard) → tight commit (stage own paths only — repo has
unrelated dirty scratch) → push → update memory/CONTINUATION → task #7.

**No roster-server change.** Phase 5 is client-side only. No redeploy.
**No `curriculum.js` touch.** Sacred.

## 4. GREEN gate (the loop gate)

- follow-alongs root suite: only the 1 known `tests/study-guide.test.js`
  fail (study_guide_diagnostic.html structural snapshot, untouched in any
  way that would break v3-structure) **PLUS** the new
  `phase5-structure.test.js` passing. **Verify the study-guide test still
  fails identically** — if 2.3 breaks it (extra script tags shifting line
  counts, etc.), update the snapshot tolerantly or restructure the
  insertion. Targeted check: the test asserts certain markers; the
  3-script-tag insertion shouldn't change them, but verify.
- `gradebook-feeder-wiring` 92/92 unchanged (DN2b worksheets untouched).
- `desk-roster-signin` + `desk-donow-card` tests pass (Desk integration).
- `roster-client` 27/27 + `gradebook-client` tests pass (no change to
  either client, but they're the contract).
- `node scripts/audit-feeder-ids.mjs` → CLEAN 69 / MISMATCH 0 (Phase 5
  adds no skill-map keys — the study guide's `frq_studyguide` source is a
  NEW source name, not in the per-worksheet audit set; audit-feeder-ids
  only checks worksheet ids and is unaffected).
- No roster-server regression (we don't touch it; just sanity that 169/169
  still holds after any tangential lib-share touches — confirm with one
  test run).
- Desk + start-here + study_guide_diagnostic.html all keep their EOL
  conventions exactly as-is (EOL-preserving edits). The Desk is LF; older
  worksheets are CRLF but we're not touching them; study_guide is LF.

## 5. Guardrails (hard-won)

- **Sacred:** never write `curriculum_render/data/curriculum.js`. The AI-
  tutor artifacts ALREADY exist (read-only consumption); we do not
  regenerate them in Phase 5.
- **One-file = planner-direct:** the Desk and study_guide_diagnostic.html
  are SINGLE contended files; ONLY planner edits them (CLAUDE.md DN3-era
  rule; s100 clobber proof). Sonnet ONLY for `start-here.html`.
- **EOL preservation:** Desk, start-here, study_guide_diagnostic.html are
  all LF — verify with `git diff` line counts. Do not let any editor (or
  Sonnet's autosave) flip them to CRLF.
- **Stage own paths only:** repo has unrelated `.ai-tutor-u*.result.md`
  scratch + `state/cross-agent-log.json` modifications + `GRADEBOOK
  _TAGGING_AUDIT.md`. NEVER `git add -A`; explicit `git add <path>` for
  each Phase 5 file.
- **ASCII-only Codex prompts:** the runner has the cp1252 0x97/0xa7
  encoding bug recorded in CONTINUATION — strip `§`, em-dash, `→`,
  curly quotes. Add an explicit "reply in ASCII only" instruction.
- **Detached Codex run:** `powershell.exe Start-Process -WindowStyle
  Hidden -RedirectStandardOutput …` — harness-tracked Bash dies on
  session suspend (lost 2 T2 runs that way). One bg watcher exits on
  terminal state.
- **Clipboard API gotcha:** `navigator.clipboard.writeText` requires a
  user gesture + secure context. The Desk runs on GitHub Pages (HTTPS) ✓
  and the button click is a user gesture ✓. Fallback to a textarea
  `select()/execCommand('copy')` IF `navigator.clipboard` is undefined
  (older browsers); else just show the "could not copy" message.
- **Best-effort, never-throw:** every new code path in 2.1 / 2.3 must
  fail soft (per `gradebook-client.js` decision L-D ethos). No new
  console.error stacks, no thrown promises, no broken pages.
- **No `student_id` PII leak to console:** existing fetch bodies don't
  log; preserve that.
- **No new `<script>` order risk:** load the 3 study-guide siblings
  **before** the inline script that uses them, but **after** any
  `<head>`/CSP meta. Mirror the worksheet pattern.

## 6. Out of Phase 5 (explicit non-goals)

- Phase 4b — `remediation_assignment` write loop + Supabase migration.
- PC-tile AI-tutor wiring (`ai-tutor/u{N}_pc.md`) — deferred to Phase 5.1
  if the PC tile shape is easily detectable; the artifacts are already in
  the repo.
- Migrating study_guide_diagnostic.html's primary auth to rosterClient —
  only the FRQ feeder is touched.
- Any new server endpoint, any roster-server redeploy, any DB migration.
- Touching the worksheets or the schedule HTML.
- Touching `curriculum.js` for any reason.

## 7. Acceptance / Definition of Done

- `git diff --stat` shows exactly 4 modified files (Desk +
  start-here.html + study_guide_diagnostic.html + new
  `tests/phase5-structure.test.js`), no scratch/state/unrelated files.
- `phase5-structure.test.js` passes (5 assertions per §2.4).
- Manual smoke (planner browser-test if possible): open
  `ap_stats_roadmap_square_mode.html` locally → click any 1.x / 2.x
  lesson tile → "🤖 Tutor prompt" button visible → click → status flips
  to "Copied" → paste verifies the ai-tutor file content. Open
  `start-here.html` → new AI-tutor section visible. Open
  `study_guide_diagnostic.html` → DevTools shows the 3 new scripts
  loaded; FRQ grade success calls gradebookClient.record (network tab
  shows POST to `/ledger/record` if signed in, OR ok:no-identity if not).
- Commit message: `Phase 5: AI-tutor Desk-tile delivery + §6.4 close
  (study_guide → roster/gradebook clients)`.
- Memory updated, CONTINUATION_PROMPT.md refreshed, push to `master`.

---

**Planner-frozen 2026-05-19, session 100. Loop step 2 = build (parallel
where independent, planner-direct where contended).**
