# TI-84 Trainer Week-One Spike — Result (A4 verdict)

- **Date run:** 2026-07-04 → 2026-07-05 (UTC timestamps below)
- **Operator:** teacher (manual runs with the real ROM; ROM never committed)
- **Harness:** `ti84-trainer-v2/spike-harness.html` at `051b6f7`, plus the
  per-list golden fix `21031e8` (required for any L2 verify — see Harness notes)
- **Spec:** `TI84_TRAINER_WEEK1_SPIKE_SPEC.md` §A4

## Verdict: PARTIAL — leaning WORKS

List variable transfer (`_emu_send_variable`) is a clean WORKS on everything it
was tested on, including the exact dataset where keystroke autofill fails. The
verdict is PARTIAL rather than WORKS only because three spec-level bars were
not exercised (enumerated under Caveats): no ≥20-rep injected soak, no matrix
`[A]` path, and sends were only proven from home-screen idle state.

## Evidence

### A2 — keystroke autofill stress at production timing (the baseline problem)

Golden = slow ~2.5× keystroke entry, echo-hash frame oracle, region y=30 h=44.

| Dataset | Runs | Passes | Golden (L1) |
|---|---|---|---|
| small-int (5 ints) | 20 | **20/20** | `3c028d63` |
| dec-neg (5 values, decimals+negatives) | 20 | **20/20** | `1b2a6281` |
| realistic-20 (20 values w/ halves) | 20 | **18/20** | `36043877` |

The current production autofill path demonstrably corrupts longer data
(2/20 failures on realistic-20). Raw A2 run JSON is retained in the
operator/Codex session log.

### A3 — `_emu_send_variable` feasibility (the proposed fix)

Export probes (all runs identical): `_emu_send_variable` ✓, `_emu_send_variables` ✓,
`_set_file_to_send` ✓, `ccall` ✓, `cwrap` ✓, `Module.FS.writeFile` ✓,
`Module.FS.createDataFile` ✓, `_malloc`/`_free` ✓. (`Module.FS_createDataFile` ✗ —
irrelevant, first probe in the chain succeeds.)

Transfer path used by every run: build `.8xl` in JS (TI83F container, 9-byte
BCD reals) → `Module.FS.writeFile('/spike.8xl')` → `ccall('emu_send_variable',
'/spike.8xl', loc=0)` → return `0` → echo `Lx ENTER` on home screen → stable
hash vs the keystroke-entered golden.

| Dataset | Target | Send result | Golden | Echo hash | Match | At (UTC) |
|---|---|---|---|---|---|---|
| small-int | L1 | 0 | `3c028d63` | `3c028d63` | ✅ | 2026-07-05T00:03:59Z |
| dec-neg | L1 | 0 | `1b2a6281` | `1b2a6281` | ✅ | 2026-07-05T00:05:17Z |
| realistic-20 | L1 | 0 | `36043877` | `36043877` | ✅ | 2026-07-05T00:06:20Z |
| small-int | L2 | 0 | `32f6d53d` | `32f6d53d` | ✅ | 2026-07-05T00:36:23Z |
| dec-neg | L2 | 0 | `7399145b` | `7399145b` | ✅ | 2026-07-05T00:43:42Z |
| realistic-20 | L2 | 0 | `78fe2a51` | `78fe2a51` | ✅ | 2026-07-05T01:15:09Z |

**6/6 match, all `stable: true`.** The decisive cell is realistic-20: keystroke
autofill 18/20, variable transfer match — transfer solves the exact reliability
failure it was proposed for.

The `.8xl` byte-level offline validation (desktop CEmu / TI Connect CE) was not
needed: it was the first-suspect step *if A3 failed*. The echo-vs-golden match
is direct evidence the BCD encoding is correct — the OS rendered exactly the
expected values from the transferred file, decimals and negatives included.

### Harness notes

- L2 verification initially false-failed: goldens were dataset-keyed and
  captured L1-only, and the echo hash region includes the typed `L1`/`L2`
  glyphs, so an L2 echo can never match an L1 golden. Fixed in `21031e8`
  (per-list goldens; slow fill mirrors `goToListHeader` RIGHT navigation).
  Early L2 mismatches predating that fix are artifacts, not evidence.
- Capturing L2 goldens also exercised slow keystroke entry into the L2 column
  (previously untested) — it worked on all three datasets.

## Caveats (why not WORKS)

1. **No injected soak.** Spec WORKS bar is ≥20/20 frame-oracle verifies per
   dataset. We have 1 verified send per (dataset, list). Mitigating: the
   transfer path is deterministic (fixed bytes → FS write → C call), unlike the
   keystroke timing races the 20/20 bar was designed to catch. Cheap to close:
   a loop button that repeats send+verify 20×.
2. **Matrix `[A]` unproven.** The harness only builds real-list `.8xl` files.
   Matrix `.8xm` (type 0x02, dimension header) was never built or sent, so
   matrix-entry procedures (χ² etc.) cannot switch to transfer yet.
3. **Send-state envelope untested.** All sends ran from home-screen idle.
   Production autofill fires while inside a STAT TESTS wizard; transfer from
   that state is unproven. Expected mitigation is the cheap QUIT/re-enter
   wrapper the spec anticipated (transfer first, then navigate into the
   wizard), which sidesteps the question entirely.
4. **loc=0 (RAM) only.** Archive variants untested — irrelevant for production
   use.

## Consequence (per spec §A4 PARTIAL row)

Recommendation for the next spec, to be confirmed in review:

- **Rewire list autofill** (`autoFillList`, and `autoFillData`'s list legs) to
  variable transfer with the QUIT/re-enter wrapper; keep keystroke autofill
  behind a fallback flag.
- **Matrix procedures keep keystroke entry** until a `.8xm` builder passes the
  same echo-oracle test (small follow-up spike, same harness pattern).
- **`emulatorDataLeniency` retires only after** the rewire ships and the
  trainer suites pass against transfer-backed entry — restoring the hard
  data-integrity check is the point of the whole exercise.
- Fold caveat 1's soak loop into the rewire's acceptance test rather than
  re-running the manual harness.

---

## Addendum (2026-07-05): acceptance soak — caveat 1 CLOSED

Run by the operator on the public harness (`21031e8` per-list goldens +
`5f037f3` soak button + `c0900f5` accumulation), after the rewrite's commits
1–2 shipped (`eb0a576`, `5f037f3`). 20× build → send → echo-verify per
(dataset, list) via the frame oracle:

| Dataset | Target | Runs | Passes | Golden | At (UTC) |
|---|---|---|---|---|---|
| small-int | L1 | 20 | **20/20** | `3c028d63` | 2026-07-05T03:42:05Z |
| small-int | L2 | 20 | **20/20** | `32f6d53d` | 2026-07-05T04:00:46Z |
| dec-neg | L1 | 20 | **20/20** | `1b2a6281` | 2026-07-05T04:20:01Z |
| dec-neg | L2 | 20 | **20/20** | `7399145b` | 2026-07-05T04:24:08Z |
| realistic-20 | L1 | 20 | **20/20** | `36043877` | 2026-07-05T04:44:19Z |
| realistic-20 | L2 | 20 | **20/20** | `78fe2a51` | 2026-07-05T04:52:39Z |

**120/120, zero failures** (six separate harness exports, merged here; the
page was refreshed between runs so each export carries one soak). Confirmed
by Codex review. The decisive rows are realistic-20: flaky at 18/20 under
keystroke autofill, perfect over 40 transfer reps across both lists.

Cross-check: the goldens were **recaptured from scratch** in this session
(post-refresh) and hashed identically to the original A3 verify goldens from
2026-07-04/05 for all six pairs — the echo rendering, and therefore the frame
oracle, is deterministic across sessions.

Caveat status after this addendum: caveat 1 (no injected soak) **closed**;
caveat 3 (send-state envelope) resolved by call structure — production
autofill fires in the data-setup phase from a `quitToHome()` prelude (see
`TI84_TRAINER_AUTOFILL_REWRITE_SPEC.md` §1); caveat 2 (matrix `.8xm`) and
caveat 4 (archive loc) remain open and out of scope. Remaining gate for the
leniency commit: the three in-app smokes (transfer-filled data problem,
chi-square-test matrix path, `?autofill=keys` fallback).
