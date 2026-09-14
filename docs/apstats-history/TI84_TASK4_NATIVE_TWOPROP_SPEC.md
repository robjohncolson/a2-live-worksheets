# Task 4: native two-proportion support + suite un-redding (Codex implement spec)

Repo: C:/Users/rober/Downloads/Projects/school/follow-alongs
Owned paths: ti84-trainer-v2/native/ ONLY (modules + its tests).
Do NOT touch: ti84-trainer-v2/app.js, bridge.js, build.mjs, index.html, generated/, standalone.html, any data JSON at repo root, roster-server/, tests/ at repo root. Another agent owns those. Do not run build.mjs.
Do NOT commit. Leave changes in the working tree; never revert or stage pre-existing dirty files.

Background: two-propztest and two-propzint shipped in ti84-procedures-data.json (29 procedures) but the native calculator simulation was never extended, and the native suite has been permanently red since because of a stale count pin. The pattern-recognition data for both procedures was just authored (ti84-pattern-recognition-data.json now has 29 signatures), so the trainer app now exposes them - the native module is the remaining gap.

## Work

1. stat-math.js: add twoPropZTest(x1, n1, x2, n2, alternative) and twoPropZInt(x1, n1, x2, n2, cLevel).
   - twoPropZTest: pooled phat = (x1+x2)/(n1+n2); z = (p1hat - p2hat) / sqrt(pooledP * (1-pooledP) * (1/n1 + 1/n2)); p-value via the existing normal CDF helpers honoring alternative '<', '>', two-sided default (mirror how tPValue treats alternatives, including the '!=' fallthrough to two-tailed).
   - Return keys MUST be: { z, p, pHat1, pHat2, pHatPooled, n1, n2 } for the test and { lower, upper, pHat1, pHat2, n1, n2, ME } for the interval (unpooled SE for the interval, per TI-84 behavior: SE = sqrt(p1hat*(1-p1hat)/n1 + p2hat*(1-p2hat)/n2), critical z from the existing invNorm helper).
   - pHat1/pHat2 naming matters: the app's mock result screens map line labels to these exact keys.
   - Follow the file's existing style (window global + module.exports dual export already exists - just extend the exported object).
2. menu-tables.js: stat-tests-menu action table - add index 5 (2-PropZTest, the '6' shortcut) and index 11 (2-PropZInt, the 'B' letter item), routing to the new wizard flows, mirroring how 1-PropZTest (index 4) and 1-PropZInt (index 10) are wired.
3. field-tables.js + form-engine.js: wizard field definitions for both two-prop wizards (x1, n1, x2, n2, then alternative row for the test / C-Level for the interval, then Calculate), mirroring the one-prop entries. The result screen should expose the computed values through the same getComputedValues path the one-prop flows use (verify by reading ti84-native.js resultComputedValues wiring).
4. native/tests/verify-all-procedures.test.js:
   - Replace the hardcoded `expect(proceduresData.procedures.length).toBe(27)` (line ~241) with TWO invariants: (a) procedures.length === Object.keys(patternsData.patternSignatures).length where patternsData loads ../../ti84-pattern-recognition-data.json the same way proceduresData is loaded; (b) every procedure id has a patternSignatures entry AND a canonicalProblems entry AND a distractorSets entry. This keeps the original tripwire (procedures added without pattern backfill fail loudly) without pinning a count.
   - Update the stale file-header comment ('all 27 TI-84 procedures').
   - Add 'x1' and 'x2' to SAMPLE_VALUES (lines ~48-60) so the two-prop walkthroughs type realistic values instead of the '1' fallback.
   - The suite's diagnostic [DISCREPANCY] warnings for two-propztest/two-propzint (walkthroughs ending on the wrong screen) should disappear once the menu/wizard support lands - confirm and report. If a discrepancy remains, report exactly which step diverges; do NOT weaken any assertion to hide it.
5. Add focused native tests for the new math: a worked two-prop z-test example (e.g. x1=30,n1=250,x2=45,n2=240, alt '<': z is approximately -2.07) and a two-prop interval example, using the suite's existing numeric tolerance style.

## Verify + report

1. cd ti84-trainer-v2/native && npx vitest run - must be FULLY GREEN (this suite has been red for two months; the point of this task is that red means something again).
2. Report: files touched, the exact new return-key shapes, whether the DISCREPANCY warnings cleared, and test counts.
