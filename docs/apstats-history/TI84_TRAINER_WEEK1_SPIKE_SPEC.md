# TI-84 Trainer — Week One Spec: Reliability Spike + Operational Fixes

Status: DRAFT for review (2026-07-02). Agreed brainstorm: CC + Codex, this session.
Owner split suggestion: Track A = CC in-session (investigation-heavy), Track B = CC (small,
touches the Desk — user edits that file in parallel, stage own hunks only), Track C = design doc only.

## 0. Context — the constraint just changed

Since June, all data-entry reliability work assumed: *the WASM bridge can only send keystrokes
and read LCD pixels*. That led to the open-loop keystroke-timing fix and `emulatorDataLeniency()`
(`ti84-trainer-v2/app.js:789`), which **waives the numeric check** for data procedures on the
emulator because autofill could still silently drop a keystroke.

This session verified the constraint is wrong — or rather, mis-scoped:

- `ti84-trainer-v2/wasm/WebCEmu.js` exports `_emu_send_variable(a0,a1)` and
  `_emu_send_variables(a0..a4)` (plus `_set_file_to_send`, `_emu_save`). In desktop CEmu these
  are the TI-Connect-style **variable transfer** path: hand it a `.8xl`/`.8xv` variable file
  and it lands in **calculator RAM** directly — no keystrokes, no timing race.
- The glue also exports `Module["FS"]`, `FS_createDataFile`, `ccall`, `cwrap`, `HEAPU8`,
  `_malloc` — everything needed to call it from `bridge.js`.
- The current bridge uses none of this: only `_lcd_get_frame` (`bridge.js:315`) and
  `_emu_keypad_event` (`bridge.js:716`).

Wording note (Codex): the ROM stays immutable. What we are injecting is **list/matrix
variables into calculator RAM** — say "variable transfer", never "writing ROM".

**The spike's outcome is a fork in the road:** if variable transfer works, autofill stops
pretending to press keys and the whole race disappears; if it dead-ends, we invest in
LCD-guided closed-loop retry instead. Everything downstream (retiring the leniency, trusting
emulator results) waits on this answer.

Scope guard: the **student keystroke path is untouched** either way. Students practicing
`enter-data-l1` type at human speed, which never raced. Autofill is the only fast typer.

---

## Track A — Reliability spike (the decision-maker)

### A1. Frame access API on the bridge

Expose what `_lcd_get_frame` already provides internally:

- `bridge.getFrame()` → `{ width, height, pixels }` (one snapshot, RGBA or the raw LCD format —
  whatever `_lcd_get_frame` yields, documented).
- `bridge.sampleRegion(x, y, w, h)` → cropped pixel block.
- `bridge.frameHash(x, y, w, h)` → cheap stable hash of a region (the oracle primitive below).

No OCR. No interpretation. Pixels and hashes only.

### A2. Autofill stress harness

A repeatable measurement rig, so "is autofill reliable?" is a number, not an anecdote.
Home: **`ti84-trainer-v2/spike-harness.html`** (dev-only, never linked from student pages) —
not a vitest suite, because the harness needs the real WASM + ROM, which CI/jsdom cannot have.
(Original draft said extend `ti84-verify.html`; that page turned out to be a manual
physical-calculator checklist with no emulator in it, so the harness got its own page that
script-src's `rom-config.js` + `bridge.js` directly.)

- Loop: reset → `autoFillList('L1', values)` (`app.js:1837`) → navigate to a deterministic
  display state → `frameHash` the data region → compare against a **golden hash**.
- Golden hash source: one slow, human-verified entry of the same dataset (or keystroke entry
  at generous 200ms holds), captured once per dataset.
- Deterministic display state for the oracle: `2nd QUIT` then `L1 ENTER` on the home screen —
  the OS prints the full list `{28 32 …}`; same data ⇒ same pixels. (STAT→EDIT works too but
  scroll position adds state; home-screen echo is flatter.)
- Matrix: ≥3 datasets (integers / decimals / negatives+decimals) × ≥20 runs each, at current
  timing constants (`DEFAULT_HOLD_MS = 90`, `bridge.js:19`). Output: failure rate per dataset.

Deliverable A2 stands on its own: it is the regression detector for ANY future timing or
transfer change, and it is how we later prove the leniency can be retired.

### A3. `_emu_send_variable` feasibility test

Steps, in order — stop at the first wall and record it:

1. **Build a minimal `.8xl` in JS**: TI83F container (`**TI83F*` signature + comment + data
   section) wrapping one real-list variable named L₁ (type ID `0x01`, name bytes `5D 00`),
   entries as TI 9-byte BCD floats, trailing checksum. Start with `{1,2,3}` (trivial BCD)
   before decimals/negatives. Validate the bytes offline first: desktop CEmu or an `.8xl`
   from TI Connect as a golden reference — do not debug the file format inside the browser.
2. **Place it in the Emscripten FS** — probe the write API at runtime, do not hard-code one.
   Guaranteed exports in this glue: `Module["FS"]`, `ccall`, `cwrap`, `_emu_send_variable`.
   The write path itself varies by Emscripten build config, so try in order and use the
   first that exists: `Module.FS.writeFile('/l1.8xl', bytes)` →
   `Module.FS.createDataFile('/', 'l1.8xl', bytes, true, true)` →
   top-level `FS_createDataFile(...)`. Record which one worked in the spike result doc.
3. **Call it**: `Module.ccall('emu_send_variable', 'number', ['string','number'],
   ['/l1.8xl', loc])` — `ccall` marshals the path string for us. Probe `loc` semantics
   (CEmu core enum; try 0 = RAM first). Log the return value.
4. **Verify with the A2 oracle**: home-screen `L1 ENTER` → frameHash vs the golden hash from
   keystroke entry of the same values.
5. **Probe the operational envelope** (this is where PARTIAL verdicts come from):
   - Does it require the OS idle at the home screen, or does it work mid-editor /
     mid-wizard? (Autofill currently fires while the list editor is open — if transfer needs
     home screen, `confirmDataSetup` (`app.js:1945`) must QUIT→transfer→re-enter STAT EDIT.)
   - Does an already-open list editor show the new data, or stale values until re-entered?
   - Decimals, negatives, 20+ element lists, overwriting an existing L1.
   - L2 (name bytes `5D 01`) and, if cheap, a matrix `[A]` (type `0x02`) — matrices matter
     for χ²-Test.
   - `_emu_send_variables` (batch, 5 args) and `_set_file_to_send` as alternates if the
     direct call misbehaves.

### A4. Exit criteria — REQUIRED, one verdict, written down

| Verdict | Definition | Consequence |
|---|---|---|
| **WORKS** | Injected L1/L2 correct via frame oracle ≥20/20 per dataset incl. decimals+negatives; callable from the state autofill actually runs in (or a cheap QUIT/re-enter wrapper); matrix path at least plausible | Next spec: rewire `autoFillData`/`autoFillList` to variable transfer, keystroke autofill kept only as fallback flag; then retire `emulatorDataLeniency` and restore the hard check |
| **PARTIAL** | Transfers land but with caveats (e.g. home-screen-only + re-enter cost, integer-only BCD bug we can fix later, no matrix support, intermittent <100%) | Enumerate caveats + cost; decide transfer-with-wrapper vs A5 fallback in review. A2 harness data decides — do not decide on vibes |
| **DEAD-END** | No way to reach FS/call path in this glue build, calls crash the core, or data never becomes visible to the OS | Build A5: closed-loop keystroke entry — after each ENTER read the list-editor status line region (`L1(k)=`) via `sampleRegion`, detect non-advance, retype. Leniency retires only after that ships |

The verdict + evidence (hashes, run counts, failure modes) goes in a short
`TI84_TRAINER_SPIKE_RESULT.md` so the decision is auditable later.

### Not in Track A

- No production rewiring of autofill (that is the *next* spec, after the verdict).
- No OCR/glyph matching — frame hashing only.
- No leniency removal this week.

---

## Track B — Operational fixes (cheap, do first)

### B1. Desk `#unit=N` deep-link (FIX_PLAN D5, Desk side)

- Trainer side already ships: `app.js:4288` parses `[#&]unit=(\d+)`, session-only.
- Desk side: `APP_REGISTRY.ti84.url` (`ap_stats_roadmap_square_mode.html:17937`) is a bare
  URL; `openApp` is at `:17951`; menu call site at `:1907`.
- Change: when opening `ti84`, append `#unit=N` where N = the current unit derived from the
  **same source the Do Now card uses** (`data/lesson-schedule.json`, loaded near `:9289`).
  If no current unit is derivable (summer, schedule gap), append nothing — trainer defaults
  to all units, and the student can still change the in-app unit filter either way.
- Verify: iframe's own `window.location.hash` carries the fragment (it is part of the iframe
  `src`), on the **public URL** after push.
- ⚠ The user edits the Desk file in parallel — stage only these hunks, never `git add` the file.

### B2. Migration live probes — 0016 and 0017

Both are USER-RUN migrations (policy: never auto-run). The repo cannot tell whether they ran;
only a live probe can. Codex's correction stands: failure is **not silent in the UI** (the
gradebook client ships explicit auth/server/network reasons), but rows do not persist, so
operationally recording is dead until the migration runs.

- **0016** (`item_ledger` accepts `source='trainer'` — TI-84 trainer gradebook rows).
  Probe = the FIX_PLAN A10 smoke: signed-in trainer completion → server either records
  (row visible via `GET /teacher/student/:sid/recent` with source `trainer`) or answers
  503 `"source 'trainer' not provisioned"`.
- **0017** (`trainer_state` table — **Equation Trainer / tmux-trainer cloud save +
  leaderboard, NOT the TI-84 trainer**). Probe = any `/trainer/*` route; unrun ⇒ 503
  `"trainer_state not provisioned (run migration 0017)"`. Scope note so nobody panics: its
  blast radius is the formulas app's cloud sync, which currently degrades to local-only.
  **Non-blocking**: probe it while we're here, but an unrun 0017 does NOT gate any TI-84
  week-one work — only 0016 does. Defer running 0017 unless the Equation Trainer's cloud
  save matters right now.
- If either is unrun: hand the user the SQL file(s) to run on the roster Supabase
  (`<AP_SUPABASE_PROJECT_REF>`), re-probe, then do the one-time live smoke and mark A10 done in
  `TI84_TRAINER_FIX_PLAN.md`.

---

## Track C — Design-only: seeded parameterized problem templates

Deliverable: a schema + validation plan document (`TI84_TRAINER_TEMPLATES_SPEC.md`), **zero
content authored, zero runtime code**. Purpose: agree on the shape before anyone hand-authors
200 brittle fixed problems.

Design constraints to satisfy (settled in brainstorm):

- **Why**: 29 procedures × 1–3 fixed problems (68 total, `pickRandom` at `app.js:1424`)
  cannot sustain an SRS — students memorize answers by rep 3, which also defeats the
  handheld mastery check.
- **Seeded, never random at serve time**: seed = hash(studentId, procedureId, dateISO,
  attempt#) through a small PRNG (e.g. mulberry32). Properties this buys: no reroll-fishing,
  reproducible bug reports, teacher can regenerate exactly what a student saw.
- **Template shape (starting point)**: `{ procedureId, stemTemplate (slot text),
  params: {name → {range, step, round}}, constraints (np≥10, n(1−p)≥10, df≥1, realistic
  magnitudes, "clean" displayed values), answerVia: 'recompute' }` — `stat-math.js` stays the
  single authority; templates never carry precomputed answers.
- **Validation plan**: fast-check property suite — every generated problem satisfies its
  constraints; recompute outputs finite and in-range; the tolerance checker (`valuesMatch`
  rounding rules) accepts every realistic rendering of every generated answer. Plus an
  offline scipy cross-check over a generated sample, extending the existing
  `tests/ti84-reference-values.json` pin (which only covers the 59 fixed canonicals).
- **Compatibility**: `canonicalProblems` stay as curated exemplars — the pattern-recognition
  stems keep their hand-written distractor sets. Templates feed track1/track2 reps and the
  handheld mastery check first.
- **Wave 1 scope proposal** for the review: stats-input inference wizards (1/2-PropZTest+Int,
  T-Test/TInterval stats, 2-SampT stats) — pure wizard-field procedures, no data-entry
  coupling, so Track A's outcome does not block them.

Open questions to resolve at review: how much stem *text* variation (fixed text with number
slots vs a couple of scenario skins per procedure); whether pattern-recognition stems get
parameterized in a later wave; per-day stability (same problem all day vs per-attempt).

---

## Non-goals this week

- Content wave (U3 randInt/randIntNoRep, paired-t via `L3=L1−L2`, χ² expected-counts `[B]`
  inspection, frequency/probability-weighted 1-Var Stats, invT) — next spec, after Track C review.
- "Which procedure?" standalone drill mode + confusion analytics.
- SRS calendar/unit-aware scheduling.
- OCR, `emulatorDataLeniency` removal, autofill rewiring — all gated on the A4 verdict.

## Deliverables checklist

| # | Deliverable | Proof |
|---|---|---|
| A1 | `getFrame`/`sampleRegion`/`frameHash` on bridge | callable from spike-harness.html |
| A2 | Autofill stress harness + baseline numbers | failure-rate table in spike result doc |
| A3/A4 | `_emu_send_variable` verdict: WORKS / PARTIAL / DEAD-END | `TI84_TRAINER_SPIKE_RESULT.md` with evidence |
| B1 | Desk `#unit=N` deep-link | open trainer from Desk on public URL → unit pre-filtered |
| B2 | 0016 + 0017 live probe results (+ user runs 0016 SQL if needed) | trainer row visible in teacher recent-activity; 0017 status merely REPORTED (non-blocking) |
| C | `TI84_TRAINER_TEMPLATES_SPEC.md` draft | reviewed by user |

## Risk register

- `.8xl` byte-format bugs masquerading as transfer failure → validate file bytes against a
  TI-Connect/CEmu-produced golden file BEFORE blaming `_emu_send_variable`.
- Transfer may require OS-idle state → that is a PARTIAL verdict with a QUIT/re-enter
  wrapper cost, not a dead end.
- Stress harness flakiness from emulator boot variance → reset to a known state (fresh
  `emu_load`) between runs; never reuse a wedged session.
- Desk file is concurrently edited by the user → surgical staging (B1 note).
- ROM is not in the repo (licensing) → all Track A work is manual-run on the dev machine via
  ti84-trainer-v2/spike-harness.html; nothing lands in CI.
