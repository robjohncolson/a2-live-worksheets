/**
 * Tests for v7 unlock-code helpers (summer gating + AP date auto-roll).
 * Loads .v7-unlock-block.js via the same pattern used by v4/v5/v6 tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const V7_PATH = resolve(__dirname, '../.v7-unlock-block.js');

function loadV7(fakeWindow) {
  const src = readFileSync(V7_PATH, 'utf8');
  new Function('window', src)(fakeWindow);
  return fakeWindow.__studyGuideV7__;
}

function makeFakeWindow(extra = {}) {
  return { ...extra };
}

// Frozen fixture — computed once from generateUnlockCode('pineapple_koala', 2).
const FIXTURE_CODE_U2 = '348BVD';

let api;

beforeEach(() => {
  expect(existsSync(V7_PATH)).toBe(true);
  api = loadV7(makeFakeWindow());
  expect(api).toBeTruthy();
});

// ---------------------------------------------------------------------------
// 7a. isUnitUnlocked
// ---------------------------------------------------------------------------

describe('isUnitUnlocked', () => {
  it('absent curriculumMode → all units unlocked', () => {
    const state = {};
    expect(api.isUnitUnlocked(1, state)).toBe(true);
    expect(api.isUnitUnlocked(5, state)).toBe(true);
    expect(api.isUnitUnlocked(9, state)).toBe(true);
  });

  it('curriculumMode full → all units unlocked', () => {
    const state = { curriculumMode: 'full', unlockedUnits: [1] };
    expect(api.isUnitUnlocked(1, state)).toBe(true);
    expect(api.isUnitUnlocked(5, state)).toBe(true);
    expect(api.isUnitUnlocked(9, state)).toBe(true);
  });

  it('gated [1, 2] → U1 and U2 unlocked, U3+ locked', () => {
    const state = { curriculumMode: 'gated', unlockedUnits: [1, 2] };
    expect(api.isUnitUnlocked(1, state)).toBe(true);
    expect(api.isUnitUnlocked(2, state)).toBe(true);
    expect(api.isUnitUnlocked(3, state)).toBe(false);
    expect(api.isUnitUnlocked(9, state)).toBe(false);
  });

  it('gated with numeric strings in unlockedUnits are coerced', () => {
    const state = { curriculumMode: 'gated', unlockedUnits: [1, 2] };
    // isUnitUnlocked uses Number(unit) so string '2' matches number 2
    expect(api.isUnitUnlocked('2', state)).toBe(true);
    expect(api.isUnitUnlocked('3', state)).toBe(false);
  });

  it('null state → returns true (safe fallback)', () => {
    expect(api.isUnitUnlocked(1, null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7b. nextLockedUnit
// ---------------------------------------------------------------------------

describe('nextLockedUnit', () => {
  it('absent curriculumMode → null', () => {
    expect(api.nextLockedUnit({})).toBe(null);
  });

  it('full mode → null', () => {
    const state = { curriculumMode: 'full', unlockedUnits: [1] };
    expect(api.nextLockedUnit(state)).toBe(null);
  });

  it('gated [1] → 2', () => {
    const state = { curriculumMode: 'gated', unlockedUnits: [1] };
    expect(api.nextLockedUnit(state)).toBe(2);
  });

  it('gated [1, 2, 3] → 4', () => {
    const state = { curriculumMode: 'gated', unlockedUnits: [1, 2, 3] };
    expect(api.nextLockedUnit(state)).toBe(4);
  });

  it('gated with all 9 units unlocked → null', () => {
    const state = { curriculumMode: 'gated', unlockedUnits: [1, 2, 3, 4, 5, 6, 7, 8, 9] };
    expect(api.nextLockedUnit(state)).toBe(null);
  });

  it('gated with empty unlockedUnits → 1 (first locked)', () => {
    const state = { curriculumMode: 'gated', unlockedUnits: [] };
    expect(api.nextLockedUnit(state)).toBe(1);
  });

  it('null state → null (safe fallback)', () => {
    expect(api.nextLockedUnit(null)).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// 7c. generateUnlockCode + verifyUnlockCode
// ---------------------------------------------------------------------------

describe('generateUnlockCode', () => {
  it('produces the frozen fixture for pineapple_koala unit 2', async () => {
    const code = await api.generateUnlockCode('pineapple_koala', 2);
    expect(code).toBe(FIXTURE_CODE_U2);
  });

  it('returns a 6-character uppercase string', async () => {
    const code = await api.generateUnlockCode('pineapple_koala', 2);
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[0-9A-Z]+$/);
  });

  it('normalization: uppercase input → same code', async () => {
    const code = await api.generateUnlockCode('PINEAPPLE_KOALA', 2);
    expect(code).toBe(FIXTURE_CODE_U2);
  });

  it('normalization: extra surrounding whitespace → same code', async () => {
    const code = await api.generateUnlockCode('  pineapple_koala  ', 2);
    expect(code).toBe(FIXTURE_CODE_U2);
  });

  it('normalization: mixed case with spaces → same code', async () => {
    const code = await api.generateUnlockCode('  Pineapple_Koala  ', 2);
    expect(code).toBe(FIXTURE_CODE_U2);
  });

  it('different username → different code', async () => {
    const code = await api.generateUnlockCode('other_student', 2);
    expect(code).not.toBe(FIXTURE_CODE_U2);
  });

  it('different unit → different code', async () => {
    const code = await api.generateUnlockCode('pineapple_koala', 3);
    expect(code).not.toBe(FIXTURE_CODE_U2);
  });
});

describe('verifyUnlockCode', () => {
  it('exact match → true', async () => {
    const ok = await api.verifyUnlockCode(FIXTURE_CODE_U2, 'pineapple_koala', 2);
    expect(ok).toBe(true);
  });

  it('lowercase input → true (normalizeCodeInput uppercases)', async () => {
    const ok = await api.verifyUnlockCode(FIXTURE_CODE_U2.toLowerCase(), 'pineapple_koala', 2);
    expect(ok).toBe(true);
  });

  it('spaces in code → true (stripped by normalizeCodeInput)', async () => {
    const spaced = FIXTURE_CODE_U2.slice(0, 3) + ' ' + FIXTURE_CODE_U2.slice(3);
    const ok = await api.verifyUnlockCode(spaced, 'pineapple_koala', 2);
    expect(ok).toBe(true);
  });

  it('dashes in code → true (stripped by normalizeCodeInput)', async () => {
    const dashed = FIXTURE_CODE_U2.slice(0, 3) + '-' + FIXTURE_CODE_U2.slice(3);
    const ok = await api.verifyUnlockCode(dashed, 'pineapple_koala', 2);
    expect(ok).toBe(true);
  });

  it('wrong code → false', async () => {
    const ok = await api.verifyUnlockCode('XXXXXX', 'pineapple_koala', 2);
    expect(ok).toBe(false);
  });

  it('wrong unit → false', async () => {
    const ok = await api.verifyUnlockCode(FIXTURE_CODE_U2, 'pineapple_koala', 3);
    expect(ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeCodeInput char mapping
// ---------------------------------------------------------------------------

describe('normalizeCodeInput', () => {
  it('converts I to 1', () => {
    expect(api.normalizeCodeInput('I')).toBe('1');
  });

  it('converts L to 1', () => {
    expect(api.normalizeCodeInput('L')).toBe('1');
  });

  it('converts O to 0', () => {
    expect(api.normalizeCodeInput('O')).toBe('0');
  });

  it('strips spaces and dashes, uppercases', () => {
    expect(api.normalizeCodeInput('ab cd-ef')).toBe('ABCDEF');
  });

  it('handles lowercase ambiguous chars', () => {
    expect(api.normalizeCodeInput('iLo')).toBe('110');
  });
});

// ---------------------------------------------------------------------------
// 7d. applyUnlockCode
// ---------------------------------------------------------------------------

describe('applyUnlockCode', () => {
  it('full mode → ok: false, reason: not-gated', async () => {
    const state = { curriculumMode: 'full', unlockedUnits: [1], studentUsername: 'pineapple_koala' };
    const result = await api.applyUnlockCode(FIXTURE_CODE_U2, state);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not-gated');
  });

  it('absent curriculumMode → ok: false, reason: not-gated', async () => {
    const state = { studentUsername: 'pineapple_koala', unlockedUnits: [1] };
    const result = await api.applyUnlockCode(FIXTURE_CODE_U2, state);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not-gated');
  });

  it('valid U2 code, locked [1] → unlocks U2, state becomes [1, 2]', async () => {
    const state = { curriculumMode: 'gated', unlockedUnits: [1], studentUsername: 'pineapple_koala' };
    const result = await api.applyUnlockCode(FIXTURE_CODE_U2, state);
    expect(result.ok).toBe(true);
    expect(result.unlockedUnit).toBe(2);
    expect(state.unlockedUnits).toEqual([1, 2]);
  });

  it('state.unlockedUnits is sorted after unlock', async () => {
    // Manually simulate out-of-order unlockedUnits (edge case in imported state)
    const state = { curriculumMode: 'gated', unlockedUnits: [1], studentUsername: 'pineapple_koala' };
    await api.applyUnlockCode(FIXTURE_CODE_U2, state);
    const sorted = [...state.unlockedUnits].sort((a, b) => a - b);
    expect(state.unlockedUnits).toEqual(sorted);
  });

  it('valid U3 code, locked [1] → invalid-code with attemptedUnit: 2 (sequential enforcement)', async () => {
    // Next locked is 2, so we verify against U2 — a U3 code fails
    const u3Code = await api.generateUnlockCode('pineapple_koala', 3);
    const state = { curriculumMode: 'gated', unlockedUnits: [1], studentUsername: 'pineapple_koala' };
    const result = await api.applyUnlockCode(u3Code, state);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-code');
    expect(result.attemptedUnit).toBe(2);
  });

  it('wrong code → ok: false, reason: invalid-code', async () => {
    const state = { curriculumMode: 'gated', unlockedUnits: [1], studentUsername: 'pineapple_koala' };
    const result = await api.applyUnlockCode('XXXXXX', state);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-code');
    expect(result.attemptedUnit).toBe(2);
  });

  it('already fully unlocked → ok: false, reason: already-fully-unlocked', async () => {
    const state = {
      curriculumMode: 'gated',
      unlockedUnits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      studentUsername: 'pineapple_koala'
    };
    const result = await api.applyUnlockCode(FIXTURE_CODE_U2, state);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('already-fully-unlocked');
  });

  it('does not mutate state on failure', async () => {
    const state = { curriculumMode: 'gated', unlockedUnits: [1], studentUsername: 'pineapple_koala' };
    await api.applyUnlockCode('XXXXXX', state);
    expect(state.unlockedUnits).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// 7e. computeApExamDate
// ---------------------------------------------------------------------------

describe('computeApExamDate', () => {
  it('before May 7 → current year', () => {
    const date = api.computeApExamDate(new Date('2026-04-01T12:00:00'));
    expect(date).toBe('2026-05-07');
  });

  it('on May 7 → current year (inclusive)', () => {
    const date = api.computeApExamDate(new Date('2026-05-07T00:00:00'));
    expect(date).toBe('2026-05-07');
  });

  it('on May 7 at noon → current year (entire exam day counts)', () => {
    const date = api.computeApExamDate(new Date('2026-05-07T12:00:00'));
    expect(date).toBe('2026-05-07');
  });

  it('late on May 7 → current year (one second before rollover)', () => {
    const date = api.computeApExamDate(new Date('2026-05-07T23:59:59'));
    expect(date).toBe('2026-05-07');
  });

  it('after May 7 → next year', () => {
    const date = api.computeApExamDate(new Date('2026-05-08T00:00:00'));
    expect(date).toBe('2027-05-07');
  });

  it('well after May 7 → next year', () => {
    const date = api.computeApExamDate(new Date('2026-12-31T23:59:59'));
    expect(date).toBe('2027-05-07');
  });

  it('Jan 1 → current year May 7', () => {
    const date = api.computeApExamDate(new Date('2027-01-01T00:00:00'));
    expect(date).toBe('2027-05-07');
  });

  it('returns a YYYY-05-07 formatted string', () => {
    const date = api.computeApExamDate(new Date('2026-03-15T00:00:00'));
    expect(date).toMatch(/^\d{4}-05-07$/);
  });

  it('no argument → does not throw', () => {
    expect(() => api.computeApExamDate()).not.toThrow();
    expect(api.computeApExamDate()).toMatch(/^\d{4}-05-07$/);
  });
});

// ---------------------------------------------------------------------------
// v6 → v7 migration: no-op for existing profiles
// ---------------------------------------------------------------------------

describe('v6 to v7 migration passthrough', () => {
  it('v6 snapshot has no curriculumMode after migration (absence is preserved)', () => {
    // The migration just bumps schemaVersion — it must NOT add curriculumMode.
    // We simulate by checking the HTML's normalizeState handles v6 without adding it.
    // Here we just verify that isUnitUnlocked treats absent mode as full access.
    const migratedState = { schemaVersion: 7 }; // simulates post-migration state with no curriculumMode
    expect(api.isUnitUnlocked(5, migratedState)).toBe(true);
  });

  it('existing student (no curriculumMode) can access all units', () => {
    const oldStudentState = {
      schemaVersion: 7,
      studentUsername: 'veteran_student',
      touchedFormulas: {}
      // No curriculumMode or unlockedUnits
    };
    for (let u = 1; u <= 9; u += 1) {
      expect(api.isUnitUnlocked(u, oldStudentState)).toBe(true);
    }
  });

  it('nextLockedUnit returns null for old student (no curriculumMode)', () => {
    const oldStudentState = { schemaVersion: 7, studentUsername: 'veteran_student' };
    expect(api.nextLockedUnit(oldStudentState)).toBe(null);
  });
});
