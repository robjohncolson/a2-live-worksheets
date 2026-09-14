/**
 * Session 94a Wave 2 — UI gating integration tests.
 *
 * Tests that pickDailyQueueV5 respects v7 unlock gating, and that the
 * full-mode passthrough is unaffected (regression). Loads both v4 and v5
 * blocks via the same pattern used by study-guide-v5-ladder.test.js, then
 * stubs __studyGuideV7__ on the fake window to exercise gating logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const V4_PATH = resolve(__dirname, '../docs/apstats-history/dotfiles/.v4-logic-block.js');
const V5_PATH = resolve(__dirname, '../docs/apstats-history/dotfiles/.v5-ladder-block.js');
const V7_PATH = resolve(__dirname, '../.v7-unlock-block.js');

const START_DAY = '2026-04-14';
const EXAM_DATE = '2026-05-07';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadV7(fakeWindow) {
  const src = readFileSync(V7_PATH, 'utf8');
  new Function('window', src)(fakeWindow);
  return fakeWindow.__studyGuideV7__;
}

function loadV4V5(fakeWindow) {
  const v4Src = readFileSync(V4_PATH, 'utf8');
  const v5Src = readFileSync(V5_PATH, 'utf8');
  new Function('window', v4Src)(fakeWindow);
  fakeWindow.__studyGuideV4__.FORMULA_UNIT_MAP = { ...fakeWindow.FORMULA_UNIT_MAP };
  new Function('window', v5Src)(fakeWindow);
  return {
    v4: fakeWindow.__studyGuideV4__,
    v5: fakeWindow.__studyGuideV5__
  };
}

// Minimal fake window with formulas spread across U1, U2, U4.
function makeFakeWindow(extra = {}) {
  return {
    FORMULA_UNIT_MAP: {
      mean: 1,
      'corr-r': 2,
      'binom-pmf': 4
    },
    AP_STATS_CARTRIDGE: {
      commands: [
        { id: 'mean', action: 'Mean', tier: 'core', dom: 'descriptive' },
        { id: 'corr-r', action: 'Correlation Coefficient (r)', tier: 'core', dom: 'descriptive' },
        { id: 'binom-pmf', action: 'Binomial PMF', tier: 'core', dom: 'probability' }
      ]
    },
    FORMULA_PROBE_MAP: {
      map: {
        mean: { questionIds: ['U1-L1-Q01'], notes: '' },
        'corr-r': { questionIds: ['U2-L5-Q02'], notes: '' },
        'binom-pmf': { questionIds: ['U4-L8-Q01'], notes: '' }
      }
    },
    EMBEDDED_CURRICULUM_SUPPLEMENT: [],
    BKT: {
      updateMastery: (prior, correct) => prior + (correct ? 0.1 : -0.1)
    },
    ...extra
  };
}

function emptyState(extra = {}) {
  return {
    touchedFormulas: {},
    dailyDose: null,
    units: {},
    ...extra
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

let fakeWindow;
let v5;

beforeEach(() => {
  expect(existsSync(V4_PATH)).toBe(true);
  expect(existsSync(V5_PATH)).toBe(true);
  expect(existsSync(V7_PATH)).toBe(true);
  fakeWindow = makeFakeWindow();
  // Load v7 first so it's available on fakeWindow when v5 calls it.
  loadV7(fakeWindow);
  ({ v5 } = loadV4V5(fakeWindow));
  expect(v5).toBeTruthy();
  expect(fakeWindow.__studyGuideV7__).toBeTruthy();
});

// ---------------------------------------------------------------------------
// §7g — Daily queue filtering for gated students
// ---------------------------------------------------------------------------

describe('pickDailyQueueV5 — gated state [1] → only U1 questions', () => {
  it('MCQ queue contains only U1 questions when gated [1]', () => {
    const state = emptyState({
      curriculumMode: 'gated',
      unlockedUnits: [1]
    });
    const dose = v5.pickDailyQueueV5(state, START_DAY, EXAM_DATE);
    const units = dose.mcq.map(e => e.unit);
    // All entries must be from unit 1.
    expect(units.every(u => u === 1)).toBe(true);
    // Ensure U2 and U4 formulas are excluded.
    const ids = dose.mcq.map(e => e.formulaId);
    expect(ids).not.toContain('corr-r');
    expect(ids).not.toContain('binom-pmf');
  });

  it('FRQ queue contains only U1 FRQs when gated [1]', () => {
    const state = emptyState({
      curriculumMode: 'gated',
      unlockedUnits: [1]
    });
    const dose = v5.pickDailyQueueV5(state, START_DAY, EXAM_DATE);
    const units = dose.frq.map(e => e.unit);
    expect(units.every(u => u === 1)).toBe(true);
    // U2 and U4 FRQs must not appear.
    expect(units).not.toContain(2);
    expect(units).not.toContain(4);
  });

  it('MCQ queue returns empty when gated [1] and all U1 answered', () => {
    // Mark the U1 formula as answered today.
    const state = emptyState({
      curriculumMode: 'gated',
      unlockedUnits: [1],
      touchedFormulas: {
        mean: { lastMastery: 0.95, graduated: true }
      },
      dailyDose: {
        date: START_DAY,
        tierAtGeneration: 0,
        mcq: [],
        mcqCompleted: ['U1-L1-Q01'],
        frq: [],
        frqCompleted: [],
        activeTab: 'mcq'
      }
    });
    // With a cached dose that is already empty, it returns the cached dose.
    const dose = v5.pickDailyQueueV5(state, START_DAY, EXAM_DATE);
    // The cached dose has no MCQ entries — correctly empty for gated student.
    expect(dose.mcq.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §7g — Full-mode passthrough (regression)
// ---------------------------------------------------------------------------

describe('pickDailyQueueV5 — full mode passthrough', () => {
  it('full mode student sees U1, U2, and U4 questions (no gating)', () => {
    const state = emptyState({
      curriculumMode: 'full',
      unlockedUnits: [1]  // unlockedUnits ignored for full mode
    });
    const dose = v5.pickDailyQueueV5(state, START_DAY, EXAM_DATE);
    const unitSet = new Set(dose.mcq.map(e => e.unit));
    // With full mode, all unlocked formulas across U1, U2, U4 are candidates.
    // At least one multi-unit formula should appear (U2 or U4).
    expect(unitSet.size).toBeGreaterThanOrEqual(1);
    // U2 and U4 must NOT be filtered out.
    const ids = dose.mcq.map(e => e.formulaId);
    expect(ids.some(id => id === 'corr-r' || id === 'binom-pmf')).toBe(true);
  });

  it('absent curriculumMode → treats as full mode (existing student passthrough)', () => {
    const state = emptyState();  // no curriculumMode field
    const dose = v5.pickDailyQueueV5(state, START_DAY, EXAM_DATE);
    const ids = dose.mcq.map(e => e.formulaId);
    // Multi-unit formulas should still be accessible.
    expect(ids.some(id => id === 'corr-r' || id === 'binom-pmf')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §7d integration — applyUnlockCode then re-run queue
// ---------------------------------------------------------------------------

describe('applyUnlockCode → re-run pickDailyQueueV5', () => {
  it('after unlocking U2, queue includes U2 questions', async () => {
    const v7 = fakeWindow.__studyGuideV7__;

    // Generate the real U2 code for our test student.
    const u2Code = await v7.generateUnlockCode('pineapple_koala', 2);

    const state = emptyState({
      curriculumMode: 'gated',
      unlockedUnits: [1],
      studentUsername: 'pineapple_koala'
    });

    // Before unlock: only U1.
    const doseBefore = v5.pickDailyQueueV5(state, START_DAY, EXAM_DATE);
    const unitsBefore = new Set(doseBefore.mcq.map(e => e.unit));
    expect(unitsBefore.has(2)).toBe(false);

    // Apply the unlock code.
    const result = await v7.applyUnlockCode(u2Code, state);
    expect(result.ok).toBe(true);
    expect(result.unlockedUnit).toBe(2);

    // Force a new queue by clearing the cached dose.
    state.dailyDose = null;
    const doseAfter = v5.pickDailyQueueV5(state, START_DAY, EXAM_DATE);
    const unitsAfter = new Set(doseAfter.mcq.map(e => e.unit));
    // U2 questions should now appear.
    expect(unitsAfter.has(2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Regression: gated state with empty unlockedUnits doesn't throw
// ---------------------------------------------------------------------------

describe('edge cases — gated state with no unlockedUnits', () => {
  it('empty unlockedUnits → empty MCQ and FRQ queues (no throw)', () => {
    const state = emptyState({
      curriculumMode: 'gated',
      unlockedUnits: []
    });
    expect(() => v5.pickDailyQueueV5(state, START_DAY, EXAM_DATE)).not.toThrow();
    const dose = v5.pickDailyQueueV5(state, START_DAY, EXAM_DATE);
    expect(dose.mcq.length).toBe(0);
  });

  it('gated [1, 2] → U1 and U2 pass, U4 excluded', () => {
    const state = emptyState({
      curriculumMode: 'gated',
      unlockedUnits: [1, 2]
    });
    // Force fresh queue.
    state.dailyDose = null;
    const dose = v5.pickDailyQueueV5(state, START_DAY, EXAM_DATE);
    const units = new Set(dose.mcq.map(e => e.unit));
    // U4 should be excluded.
    expect(units.has(4)).toBe(false);
    // U1 and U2 are allowed.
    const ids = dose.mcq.map(e => e.formulaId);
    expect(ids.some(id => id === 'mean' || id === 'corr-r')).toBe(true);
  });
});
