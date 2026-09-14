# Codex Task: Verify TI-84 Plus CE Procedure Data in CEmu

## Objective

Use CEmu with the local TI-84 Plus CE ROM to verify the AP Statistics procedure data in `ti84-procedures-data.json`.

Your job is to establish **ground truth from the actual CE UI** for:

1. `STAT > TESTS` menu positions
2. `2ND > DISTR` menu positions
3. Wizard field labels
4. Wizard field order
5. Wizard default values
6. Result screen labels and order
7. CE-specific UI behavior such as `Data` vs `Stats`, `Calculate` vs `Draw`, and the `invNorm` tail selector

This is a **verification task**, not an implementation task. Do not rewrite the trainer UI. Do not invent labels from memory. Trust the live ROM over prior assumptions.

## Ground Truth Target

Use the local ROM bundle in this repo:

- ROM: `TI-84_Plus_CE/ROM.rom`
- Metadata: `TI-84_Plus_CE/TI-84_Plus_CE_meta.xml`
- Dumper artifacts: `TI-84_Plus_CE/dump.8xp`, `TI-84_Plus_CE/ROMData*.8xv`

Important:

- This is a **TI-84 Plus CE** ROM, not a TI-84 Plus Silver Edition / SE ROM.
- ROM strings in local analysis suggest a CE base code around `5.8.2.0029`.
- Use the live emulator UI as the final authority if it disagrees with `ti84-procedures-data.json`.

## Repo Context

Read these files first:

- `CONTINUATION_PROMPT.md`
- `ti84-procedures-data.json`
- `ti84-trainer-spec.md`

Use `ti84-procedures-data.json` as the baseline you are checking, not as unquestioned truth.

## Deliverables

Create:

1. `ti84-cemu-verification.md`

Optional, if convenient:

2. `ti84-cemu-screenshots/` with clearly named screenshots such as `1-propztest-wizard.png`, `tinterval-result.png`, etc.

Do **not** edit `ti84-procedures-data.json` yet unless explicitly asked in a follow-up. First produce the verification report.

## Setup

### 1. Check whether CEmu is already available

Try common Windows locations first.

```bash
where cemu 2>nul
dir /s /b C:\Users\rober\*cemu*.exe 2>nul
```

### 2. Install CEmu if needed

If not present, try one of these:

```bash
winget install CEmu
```

or

```bash
scoop install cemu-ti
```

If package-manager install fails, download the latest Windows build from:

- `https://github.com/CE-Programming/CEmu/releases`

### 3. Load the ROM

Open:

- `C:\Users\rober\Downloads\Projects\school\follow-alongs\TI-84_Plus_CE\ROM.rom`

Confirm the emulator boots successfully to a TI-84 Plus CE home screen.

## Verification Workflow

### Phase 1: Record the environment

At the top of `ti84-cemu-verification.md`, record:

- Whether CEmu was already installed or had to be installed
- Which binary/version you used
- Whether the ROM booted successfully
- What OS / base code / identifying version strings were visible

### Phase 2: Spot-check menu numbering visually

Before deep wizard verification, visually inspect these menus in the running emulator:

- `STAT > TESTS`
- `2ND > DISTR`

Compare what you see against the current JSON.

Current JSON claims this `STAT > TESTS` ordering:

1. `Z-Test...`
2. `T-Test...`
3. `2-SampZTest...`
4. `2-SampTTest...`
5. `1-PropZTest...`
6. `2-PropZTest...`
7. `χ²-Test...`
8. `2-SampFTest...`
9. `ZInterval...`
0. `TInterval...`
A. `2-SampZInt...`
B. `2-SampTInt...`
C. `1-PropZInt...`
D. `2-PropZInt...`
E. `LinRegTTest...`
F. `χ²GOF-Test...`
G. `LinRegTInt...`

Current JSON claims this relevant `DISTR` ordering:

2. `normalcdf(`
3. `invNorm(`
A. `binompdf(`
B. `binomcdf(`
E. `geometpdf(`
F. `geometcdf(`

If the live ROM disagrees, record the exact live ordering. Do not hand-wave it.

### Phase 3: Verify procedure screens

For each procedure below, verify:

1. Exact path from home screen
2. Exact wizard field labels, top to bottom
3. Exact default values shown in the wizard
4. Exact toggle options or action buttons
5. Exact result labels, top to bottom
6. Any discrepancy from `ti84-procedures-data.json`

If a procedure requires sample data or matrix setup, enter minimal valid values so the result screen can be observed.

## Procedures To Verify

### Highest Priority: `STAT > TESTS`

1. `1-PropZTest`
Path baseline: `STAT > TESTS > 5`
Verify: `p0` label formatting, `x`, `n`, alternative-direction selector, `Calculate` / `Draw`, result labels

2. `1-PropZInt`
Path baseline: `STAT > TESTS > C`
Verify: `x`, `n`, `C-Level`, result labels and order

3. `T-Test (Stats input)`
Path baseline: `STAT > TESTS > 2 > Stats`
Verify: `μ0`, `x̄`, `Sx`, `n`, alternative-direction selector, result labels and order

4. `T-Test (Data input)`
Path baseline: `STAT > TESTS > 2 > Data`
Verify: `μ0`, `List`, `Freq`, alternative-direction selector, result labels and order

5. `TInterval (Stats input)`
Path baseline: `STAT > TESTS > 0 > Stats`
Verify: `x̄`, `Sx`, `n`, `C-Level`, result labels and order

6. `TInterval (Data input)`
Path baseline: `STAT > TESTS > 0 > Data`
Verify: `List`, `Freq`, `C-Level`, result labels and order

7. `2-SampTTest`
Path baseline: `STAT > TESTS > 4 > Stats`
Verify: `x̄1`, `Sx1`, `n1`, `x̄2`, `Sx2`, `n2`, alternative-direction selector, `Pooled`, result labels and order

8. `2-SampTInt`
Path baseline: `STAT > TESTS > B > Stats`
Verify: `x̄1`, `Sx1`, `n1`, `x̄2`, `Sx2`, `n2`, `C-Level`, `Pooled`, result labels and order

9. `χ²-Test`
Path baseline: `STAT > TESTS > 7`
Verify: observed/expected matrix labels, result labels and order

10. `χ²GOF-Test`
Path baseline: `STAT > TESTS > F`
Verify: observed list, expected list, `df`, result labels and order

11. `LinRegTTest`
Path baseline: `STAT > TESTS > E`
Verify: `Xlist`, `Ylist`, `Freq`, alternative-direction selector for slope/correlation, regression-equation field, result labels and order

12. `LinRegTInt`
Path baseline: `STAT > TESTS > G`
Verify: `Xlist`, `Ylist`, `Freq`, `C-Level`, regression-equation field, result labels and order

### Medium Priority: `2ND > DISTR`

13. `normalcdf`
Path baseline: `2ND > DISTR > 2`
Verify: field labels, field order, defaults, what happens after `Paste` / `Enter`, and result display

14. `invNorm`
Path baseline: `2ND > DISTR > 3`
Verify: `area`, `μ`, `σ`, tail selector, default tail, and result display

15. `binompdf`
Path baseline: `2ND > DISTR > A`
Verify: field labels, order, defaults, and result display

16. `binomcdf`
Path baseline: `2ND > DISTR > B`
Verify: field labels, order, defaults, and result display

17. `geometpdf`
Path baseline: `2ND > DISTR > E`
Verify: field labels, order, defaults, and result display

18. `geometcdf`
Path baseline: `2ND > DISTR > F`
Verify: field labels, order, defaults, and result display

### Lower Priority: `STAT > CALC`

19. `1-Var Stats`
Path baseline: `STAT > CALC > 1`
Verify: wizard labels, defaults, and both pages of result labels

20. `LinReg(a+bx)`
Path baseline: `STAT > CALC > 8`
Verify: wizard labels, defaults, and result labels including `a`, `b`, `r²`, and `r`

## Suggested Sample Inputs

Use simple valid values so you can reach the result screens consistently.

### Proportion procedures

- `p0 = 0.5`
- `x = 60`
- `n = 100`
- `C-Level = 0.95`

### One-sample t procedures

- `μ0 = 50`
- `x̄ = 52`
- `Sx = 8`
- `n = 30`
- For Data mode, enter a short list in `L1`

### Two-sample t procedures

- `x̄1 = 12`
- `Sx1 = 2.5`
- `n1 = 20`
- `x̄2 = 10`
- `Sx2 = 2.2`
- `n2 = 22`
- `C-Level = 0.95`

### Distribution procedures

- `normalcdf`: lower `0`, upper `1`, `μ = 0`, `σ = 1`
- `invNorm`: area `0.95`, `μ = 0`, `σ = 1`, note the tail default
- `binompdf/binomcdf`: `n = 10`, `p = 0.3`, `x = 4`
- `geometpdf/geometcdf`: `p = 0.2`, `x = 4`

### Chi-square procedures

Use a small valid observed matrix / list and expected matrix / list, just enough to reach a result screen.

### Regression procedures

Enter a short paired dataset in `L1` / `L2`.
If `r` and `r²` are not shown, turn diagnostics on first and record that requirement.

## Report Format

Write `ti84-cemu-verification.md` in this format:

```md
# TI-84 Plus CE CEmu Verification

## Environment

- CEmu status:
- CEmu version:
- ROM booted:
- Visible OS/base code:
- Notes:

## Menu Verification

### STAT > TESTS
- JSON says:
- Emulator shows:
- Discrepancies:

### 2ND > DISTR
- JSON says:
- Emulator shows:
- Discrepancies:

## Procedure Verification

### procedure-id

**Path used**
- `STAT > TESTS > ...`

**Wizard fields**
1. `label` — default: `value`
2. ...

**Buttons / toggles**
- ...

**Result screen**
1. `label`
2. ...

**Discrepancies vs JSON**
- None
```

Be literal. Exact capitalization, punctuation, symbols, and ordering matter.

## Failure Handling

If CEmu installation or ROM boot fails:

1. Record exactly what you tried
2. Record the exact error
3. If possible, fall back to the online CE emulator at `https://ti84calc.com/ti84calc`
4. Clearly label the fallback as a fallback in the report

## Important Constraints

- Do not confuse TI-84 Plus CE with older monochrome TI-84 / TI-83 variants.
- Do not assume classic paste-to-homescreen behavior if the CE shows a wizard.
- Do not normalize labels. If the screen says `p0`, do not write `p_0`. If it says `x̄`, do not write `x-bar`.
- If the emulator UI contradicts the current JSON, record the emulator truth.
- The final output should be the verification report, not a rewritten JSON file.
