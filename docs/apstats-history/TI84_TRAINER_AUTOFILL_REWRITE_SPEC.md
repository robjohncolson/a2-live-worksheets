# TI-84 Trainer — List Autofill Rewrite (variable transfer)

Follow-up to the week-one spike. Evidence and verdict: `TI84_TRAINER_SPIKE_RESULT.md`
(PARTIAL leaning WORKS — keystroke autofill 18/20 on realistic-20; `_emu_send_variable`
6/6 vs frame oracle across L1/L2 × 3 datasets). Codex signed off on proceeding.

## 0. Binding requirements (Codex sign-off, 2026-07-05)

1. Transfer-backed autofill for **L1/L2 list data only**.
2. **Student keystroke practice unchanged** — guided key walkthroughs, the clutch,
   and manual entry are the product; only the app-driven autofill changes.
3. **Matrix `[A]` procedures unchanged** until a separate `.8xm` spike.
4. **QUIT/home-screen wrapper before transfer**, then proceed to the procedure phase.
5. **Keystroke fallback** behind a flag + automatic runtime fallback.
6. Acceptance includes a **repeated send+verify soak**.
7. **`emulatorDataLeniency` retires only after** transfer-backed entry passes.

## 1. Current architecture (what changes, what doesn't)

Call graph today (`ti84-trainer-v2/app.js`):

- `confirmDataSetup()` (:1945) and the `auto-fill-data` action (:4071) both funnel into
  `autoFillData(dataTarget)` (:1905), which loops lists → `autoFillList` (:1837,
  keystrokes via `goToListHeader` + `typeValue`), then matrices → `autoFillMatrix`
  (:1864), then `quitToHome()` → `startProcedurePhase()`.
- **Autofill runs in the data-setup phase, BEFORE the wizard opens**, and
  `goToListHeader` already begins with `quitToHome()`. So transfer will fire from
  exactly the home-screen-idle state the spike proved — verdict caveat 3 is resolved
  by the existing call structure, not by new engineering. Requirement 4 is satisfied
  by keeping the `quitToHome()` prelude.
- `emulatorDataLeniency()` (:789) blanket-softens the numeric check for ALL data
  procedures on the real emulator. Call sites: banner text (:2821), finish-review
  button enable (:3233), finish-review gate (:4084).

Unchanged: `autoFillMatrix`, `goToListHeader`, `typeValue`, the clutch/guided key UX,
`syncDataTargetToNative`, `rememberDataTarget`, `startProcedurePhase`, mock mode,
physical mode.

**Coverage** (from `generated/data-procedures.js` `dataRequirements`): 13 procedures
declare data targets. 12 are L1/L2-only — one-var-stats, histogram,
modified-boxplot, linreg-a-plus-bx, scatterplot, residual-plot, t-test-data,
t-interval-data, linreg-ttest, linreg-tint, chi-square-gof-test, and
**matrix-entry** (despite the name). `chi-square-test` is the sole `[A]` target.
So this rewrite moves 12 of 13 data procedures to transfer-backed autofill;
only chi-square-test stays fully keystroke until the `.8xm` spike.

## 2. New bridge API — `sendList(listName, values)`

Lives in `ti84-trainer-v2/bridge.js` (the emulator interface), exported on the bridge
instance next to `getModule()`. **Port the four proven harness functions verbatim**
from `spike-harness.html` — they are the exact code path the 6/6 evidence validates:

- `encodeTiReal(value)` — 9-byte TI real (sign byte, biased exponent, 14 BCD digits).
- `buildRealList8xl(listName, values)` — TI83F container, 0x0D entry header,
  RAM flag 0x00, little-endian checksum over the entry.
- `writeToEmscriptenFs(module, path, bytes)` — probe chain
  `FS.writeFile → FS.createDataFile → FS_createDataFile`.
- `callSendVariable(module, path, loc)` — `ccall('emu_send_variable', …)` with the
  `_malloc`+direct fallback.

`sendList` contract:

```js
// returns { ok: true, via, fsApi } on result === 0;
// returns { ok: false, reason } on missing module/unsupported list/nonzero result;
// never throws to the caller — autofill decides the fallback.
sendList(listName, values)
```

- Path `/autofill.8xl`, `loc = 0` (RAM), matching the spike exactly.
- List tokens: extend `LIST_NAME_TOKENS` to L1–L6 (`[0x5d, index]`) since the token
  is index-derived, but **only L1/L2 are proven** — see the gate in §3.
- The harness keeps working as the standalone rig; it may later import from
  bridge.js, but that cleanup is not part of this spec.

## 3. `autoFillList` rewrite

```js
async function autoFillList(listName, values) {
  if (transferAutofillEnabled() && listName in PROVEN_TRANSFER_LISTS) {
    const sent = await app.bridge?.sendList?.(listName, values);
    if (sent?.ok) {
      app.clutch.dataProgress[listName] = { ...app.clutch.dataProgress[listName], entered: values.length };
      app.clutch.dataFillMethods[listName] = 'transfer';
      render();
      return;
    }
    console.warn(`[autofill] transfer failed (${sent?.reason ?? 'unavailable'}) — falling back to keystrokes`);
  }
  app.clutch.dataFillMethods[listName] = 'keys';
  await keystrokeFillList(listName, values);   // the current :1837 body, renamed
}
```

Fill tracking is **per data-target name** (`dataFillMethods[name]`), not a scalar —
Codex amendment: a scalar "last fill wins" would false-hard-check a future procedure
that mixes transfer-filled lists with keystroke-filled matrix data. `autoFillMatrix`
records `dataFillMethods[matrixName] = 'keys'`; `resetClutchState` (:1002) resets the
map to `{}`.

- `PROVEN_TRANSFER_LISTS = { L1: true, L2: true }` — requirement 1. A dataTarget
  containing any other list name uses keystrokes for that list (per-list decision,
  not per-problem, since transfer and keystrokes both end at a known state).
- **Flag** (requirement 5): `transferAutofillEnabled()` =
  `app.persisted.transferAutofill !== false` (default ON) with a
  `?autofill=keys` URL override for a misbehaving device. No settings UI —
  it's an operator escape hatch, not a student choice.
- **Automatic runtime fallback**: any `ok: false` (missing exports in a future
  emulator build, nonzero return) falls through to keystrokes in the same run.
  Students never see a hard failure from the transfer path.
- Progress UI: transfer is effectively instant, so the per-value progress ticker
  collapses to one jump-to-complete per list. The `Auto-filling data...` banner and
  the completion flow are unchanged.
- Update the now-stale comment in `confirmDataSetup` (:1951) — "The ROM can only be
  loaded via keystrokes" is no longer true.
- `autoFillData` is untouched except that its list loop now goes through the new
  `autoFillList` head; matrices keep the keystroke path (requirement 3).

## 4. Leniency retirement (requirement 7 — the point of the exercise)

`emulatorDataLeniency()` currently blanket-trusts nothing on data procedures. After
the rewrite it becomes **method-aware** instead of deleted:

```js
function emulatorDataLeniency() {
  return !app.persisted.physicalMode
    && Boolean(app.bridge?.isRealEmulator?.())
    && problemUsesData(app.walkthrough?.problem)
    && !allDataTransferFilled();
}

// Hard check only when EVERY filled data target went in via transfer.
function allDataTransferFilled() {
  const methods = app.clutch.dataFillMethods ?? {};
  const names = Object.keys(methods);
  return names.length > 0 && names.every((name) => methods[name] === 'transfer');
}
```

- Transfer-filled problems get the **hard numeric check back** — a wrong result now
  blocks finish-review and shows the existing "reload the list and re-run" banner
  (:2823 path), which is the correct remedy and doubles as the runtime integrity
  check for a corrupted transfer (no golden exists at runtime; the wizard result IS
  the verification).
- The aggregate is deliberately conservative (Codex amendment): a problem with ANY
  keystroke-filled target — fallback flag, unproven list, transfer failure, a mixed
  lists+matrix procedure — keeps today's leniency, since retiring it there would
  re-introduce the exact false-blocking the leniency was built to prevent.
- Manual data entry never touches `dataFillMethods`, so the empty map stays lenient.
- All three call sites (:2821, :3233, :4084) work unchanged with the new predicate.

**Gate:** this lands as a separate commit, only after the §5 soak passes 20/20.

## 5. Testing

### CI (vitest, no ROM — ROM never enters the repo or CI)

New `tests/ti84-list-transfer.test.js` alongside the existing ti84 suites:

1. **BCD byte vectors** — `encodeTiReal` against hand-derived encodings from the
   TI-8x format definition (not round-tripped through the implementation):
   `0` → `00 80 00…`, `1` → `00 80 10 00…`, `-3.1` → `80 80 31 00…`,
   `12.25` → `00 81 12 25 00…`, `0.5` → `00 7F 50 00…`, `30.5` → `00 81 30 50…`.
2. **Container fields** — signature `**TI83F*`, entry length field, L1/L2 token
   bytes (`5D 00` / `5D 01`), RAM flag 0x00, total length `55 + 17 + (2 + 9n) + 2`,
   checksum = sum of entry bytes mod 0x10000. Pin the full 121-byte small-int file
   head against the spike's logged `2a 2a 54 49 38 33 46 2a 1a 0a 00 …`.
3. **Probe chain + call fallback** — mock modules: FS.writeFile present → used;
   only createDataFile → used; ccall absent but `_emu_send_variable`+`_malloc`
   present → direct path with `_free` called; nothing present → `ok: false`.
4. **Fallback behavior** — mock bridge: `sendList` returns `ok: false` →
   `keystrokeFillList` invoked; `ok: true` → no keystrokes, progress = total,
   `dataFillMethods[name] === 'transfer'`; L3 in dataTarget → keystrokes for L3
   only, and the map records both methods.
5. **Leniency predicate** — truth table over `allDataTransferFilled()`: physical
   mode, mock mode, non-data problem, all-transfer (strict), any-keys (lenient),
   mixed transfer+keys (lenient — the Codex-amendment case), empty map / manual
   entry (lenient).

### Manual, ROM-gated (operator-run, closes verdict caveat 1)

6. **Soak button in `spike-harness.html`**: "A3 soak ×20" — loops build → send →
   echo-verify against the existing per-list golden, 20× per (dataset, list),
   reporting `N/20`. Required: **20/20 on all 3 datasets × L1 and L2** (120 total).
7. **In-app smoke on the public URL**: one 1-Var-Stats-style data problem
   (transfer path: banner → instant fill → wizard → hard check passes), one
   **chi-square-test** problem for the unchanged `[A]` keystroke path — it is the
   ONLY procedure whose `dataRequirements` declare `[A]` (Codex correction:
   `matrix-entry`, despite the name, declares L1/L2 and is therefore a transfer
   target, not the matrix smoke) — and one run with `?autofill=keys` (keystroke
   path + leniency intact).

## 6. Rollout order

| Commit | Content | Gate |
|---|---|---|
| 1 | bridge `sendList` + builder port + CI tests 1–3 | tests green |
| 2 | `autoFillList` rewire + flag + tests 4 | tests green; harness soak button added |
| 3 | method-aware leniency + test 5 | **operator soak 120/120** + in-app smoke |

`node ti84-trainer-v2/build.mjs` after bridge/app changes and commit the regenerated
`standalone.html` (the Desk embeds it). Existing suites (`ti84-*` 27/27, desk 817)
must stay green at every commit.

## 7. Out of scope

- Matrix `.8xm` transfer — separate mini-spike (same harness pattern: builder +
  offline-validation download + echo oracle) before `autoFillMatrix` may switch.
- Track C generated templates (design review pending; explicitly second priority
  per Codex).
- L3–L6 transfer enablement — tokens exist, flip `PROVEN_TRANSFER_LISTS` only after
  a harness pass on those names.
- Archive (`loc ≠ 0`) variants, `_emu_send_variables` (plural), `set_file_to_send`.
- Retiring `typeValue`/keystroke code — it is the permanent fallback and the
  student-practice path.
