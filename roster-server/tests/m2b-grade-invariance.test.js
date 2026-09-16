// @vitest-environment node
// Resolver snapshots use hand-derived A2 contracts, never UPDATE-style blessing.
// Legacy fixture filenames are stable batch paths, not AP content or behavior.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { computeGrade, BLOOKET_REQUIRED } from '../grade.js';
import { resolveProductionGradeInputs } from '../grade-contexts.js';
import { artifactHash } from '../transcript.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIX_DIR = resolve(here, 'fixtures/m2b-invariance');
const AS_OF = Date.parse('2026-10-15T16:00:00.000Z');
const ENV_KEYS = ['LESSON_SCHEDULE_PATH', 'GRADE_FREEZE_DIR'];
let tempDir;
let originalEnv;

function readGolden(name) {
  return JSON.parse(readFileSync(resolve(FIX_DIR, name), 'utf8'));
}

function installScenario(fixture) {
  const schedulePath = resolve(tempDir, 'schedule.json');
  writeFileSync(schedulePath, JSON.stringify(fixture.schedule));
  process.env.LESSON_SCHEDULE_PATH = schedulePath;
  if (fixture.year !== 'SY2526') return;
  process.env.GRADE_FREEZE_DIR = tempDir;
  const freezes = {
    'grade-config.sy2526-freeze.json': fixture.config,
    'lesson-schedule.sy2526-freeze.json': fixture.schedule,
    'blooket-lessons.sy2526-freeze.json': { topics: [], requiredTopics: [], allTopics: [] },
  };
  for (const [name, doc] of Object.entries(freezes)) {
    writeFileSync(resolve(tempDir, name), JSON.stringify(doc));
  }
}

function gradeViaResolver(fixture, section, asOf = AS_OF) {
  const prod = resolveProductionGradeInputs(fixture.year);
  const config = fixture.year === 'SY2526'
    ? prod.config
    : { ...prod.config, useDistrictFormula: true, useV3: false };
  const grade = computeGrade(fixture.rows, prod.answerKey?.answerKey || {}, config, {
    lessonSchedule: prod.lessonSchedule,
    eventSchedule: prod.eventSchedule,
    // Historical resolver has no event schedule. Supply an explicit synthetic
    // topic assessment definition so missing mastery still counts in gate tests.
    ...(fixture.year === 'SY2526' ? { items: fixture.schedule.topicAssessments } : {}),
    section, asOf,
    blooketPresence: prod.blooketPresence,
    blooketRequired: prod.blooketRequired,
  });
  return { prod, grade };
}

function projectGrade(g) {
  const quarter = g.quarters.Q1;
  return {
    formula: g.formula,
    quarterGrade: quarter.quarterGrade,
    lessonsDue: quarter.lessonsDue,
    lessonsGraded: quarter.lessonsGraded,
    lessonsTotal: quarter.lessonsTotal,
    points: Object.fromEntries(g.items.map(item => [item.itemId, item.points])),
  };
}

beforeEach(() => {
  originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  tempDir = mkdtempSync(resolve(tmpdir(), 'a2-m2b-'));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  rmSync(tempDir, { recursive: true, force: true });
});

describe('A2 resolver grade contracts', () => {
  for (const name of ['empty', 'quiz_partial', 'frq_work', 'mixed', 'env-schedule-override']) {
    it.each(['C', 'D', 'G'])(`${name}: resolver schedule and district points for %s`, section => {
      const fixture = readGolden(`sy2627-${name}.json`);
      installScenario(fixture);
      const { prod, grade } = gradeViaResolver(fixture, section);
      expect(prod.year).toBe('SY2627');
      expect(prod.lessonSchedule).toEqual(fixture.schedule.lessons);
      expect(prod.eventSchedule).toEqual(fixture.schedule.topicAssessments
        ? { topicAssessments: fixture.schedule.topicAssessments } : null);
      expect(prod.blooketPresence).toEqual([]);
      expect(prod.blooketRequired).toEqual([]);
      expect(projectGrade(grade)).toEqual(fixture.expected);
      expect(grade.items.map(item => item.maxPoints)).toEqual(
        name === 'mixed' ? [10, 2, 2, 1, 100] : [10, 2, 2, 1]);
      expect(prod.config.a2Categories).toEqual({
        assessments: { weight: 0.5, min: 4 },
        assignments: { weight: 0.4, min: 10 },
        engagement: { weight: 0.1, min: 10 },
      });
      if (name === 'env-schedule-override') {
        expect(grade.items.every(item => item.quarter === 'Q2' && !item.due)).toBe(true);
        expect(grade.quarters.Q2.lessonsTotal).toBe(1);
      } else {
        expect(grade.items.every(item => item.quarter === 'Q1' && item.due)).toBe(true);
        expect(grade.quarters.Q1.categoryBreakdown.assessments.minimumMet).toBe(false);
      }
    });
  }

  it.each(['D', 'G'])('Wednesday is a lesson day for %s; missing work becomes zero the next day', section => {
    const fixture = readGolden('sy2627-empty.json');
    installScenario(fixture);
    const onDay = gradeViaResolver(fixture, section, Date.parse('2026-10-14T16:00:00Z')).grade;
    expect(onDay.quarters.Q1.quarterGrade).toBeNull();
    expect(onDay.items.every(item => !item.due)).toBe(true);
    expect(gradeViaResolver(fixture, section).grade.quarters.Q1.quarterGrade).toBe(0);
  });

  it('historical year keeps the full synthetic frozen config and explicitly selects A2 v3', () => {
    const fixture = readGolden('sy2526-pc-v3.json');
    installScenario(fixture);
    const { prod, grade } = gradeViaResolver(fixture, 'D');
    expect(prod.year).toBe('SY2526');
    expect(prod.config).toEqual(fixture.config);
    expect(prod.lessonSchedule).toEqual(fixture.schedule.lessons);
    expect(prod.eventSchedule).toBeNull();
    expect(projectGrade(grade)).toEqual(fixture.expected);
    expect(grade.quarters.Q1.masteryAvg).toBe(100);
    expect(grade.quarters.Q1.workAvg).toBe(100);
    const missingMastery = { ...fixture, rows: fixture.rows.filter(row => row.source !== 'topic-assessment') };
    expect(gradeViaResolver(missingMastery, 'D').grade.quarters.Q1.quarterGrade).toBeCloseTo(70);
    prod.config.v3Gates.floor = 0.99;
    prod.lessonSchedule['1.1'].periods.D = '2099-01-01';
    expect(resolveProductionGradeInputs('SY2526').config).toEqual(fixture.config);
    expect(resolveProductionGradeInputs('SY2526').lessonSchedule).toEqual(fixture.schedule.lessons);
  });

  it('default live resolver retains the bundled empty A2 schedule', () => {
    const prod = resolveProductionGradeInputs('SY2627');
    const bundled = JSON.parse(readFileSync(resolve(here, '../data/lesson-schedule.json'), 'utf8'));
    expect(prod.lessonSchedule).toEqual(bundled.lessons);
    const grade = computeGrade([], prod.answerKey.answerKey, { ...prod.config, useDistrictFormula: true }, {
      section: 'C', lessonSchedule: prod.lessonSchedule, eventSchedule: prod.eventSchedule, asOf: AS_OF,
    });
    expect(grade.formula).toBe('district');
    expect(grade.lessons).toEqual([]);
    expect(grade.quarters.Q1.quarterGrade).toBeNull();
  });

  it('real transcript hashes are stable and bind A2 schedule, answers, presence and requirements', () => {
    const vector = readGolden('art-hashes.json');
    expect(artifactHash(vector.input)).toBe(vector.expected);
    const fixture = readGolden('sy2627-mixed.json');
    installScenario(fixture);
    const prod = resolveProductionGradeInputs('SY2627');
    const input = { answerKeyDoc: { answerKey: { 'LC-U1-L1-Q1': { answerKey: '2' } } },
      lessonSchedule: prod.lessonSchedule, blooketPresence: ['1.1'], blooketRequired: [] };
    const original = artifactHash(input);
    expect(original).toMatch(/^[a-f0-9]{64}$/);
    expect(artifactHash(JSON.parse(JSON.stringify(input)))).toBe(original);
    expect(artifactHash({ ...input, answerKeyDoc: {} })).not.toBe(original);
    expect(artifactHash({ ...input, lessonSchedule: {} })).not.toBe(original);
    expect(artifactHash({ ...input, blooketPresence: [] })).not.toBe(original);
    expect(artifactHash({ ...input, blooketRequired: ['1.1'] })).not.toBe(original);
    const { blooketPresence, blooketRequired, ...legacyInput } = input;
    expect(artifactHash({ ...legacyInput, blooketLessons: blooketPresence })).toBe(
      artifactHash({ ...input, blooketRequired: BLOOKET_REQUIRED }));
  });
});
