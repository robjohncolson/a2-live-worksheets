// @vitest-environment node
/**
 * M2b H — AUDITABLE invariance harness.
 *
 * Snapshots computeGrade JSON via resolveProductionGradeInputs (NOT bare module
 * defaults) for four ledger scenarios + one SY2526-PC ledger. Also covers:
 *   - env LESSON_SCHEDULE_PATH override via the RESOLVER itself
 *   - transcript artifactHash via the REAL transcript.js export
 *   - full frozen config including useV3
 *   - hasBlooketSample via lessonKey (buildLessonsArray field)
 *
 * Expected outputs: tests/fixtures/m2b-invariance/*.json
 * Regenerate: UPDATE_M2B_GOLDEN=1 npx vitest run tests/m2b-grade-invariance.test.js
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeGrade } from '../grade.js';
import { resolveProductionGradeInputs } from '../grade-contexts.js';
import { artifactHash } from '../transcript.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIX_DIR = resolve(here, 'fixtures/m2b-invariance');
const UPDATE = process.env.UPDATE_M2B_GOLDEN === '1';

function loadAnswerKey() {
  const p = resolve(here, '../data/answer-key.json');
  return JSON.parse(readFileSync(p, 'utf8'));
}

function answerKeyMap(doc) {
  return (doc && doc.answerKey && typeof doc.answerKey === 'object') ? doc.answerKey : doc;
}

function row(item_id, response, extra = {}) {
  return {
    student_id: 'inv-student',
    source: extra.source || 'curriculum_quiz',
    item_id,
    response,
    unit: extra.unit ?? null,
    score: extra.score ?? null,
    attempt: extra.attempt ?? 1,
    recorded_at: extra.recorded_at || '2026-10-15T12:00:00.000Z',
  };
}

function scenarios() {
  return {
    empty: [],
    quiz_partial: [
      row('U1-L1-Q01', 'B', { unit: '1' }),
      row('U1-L1-Q02', 'C', { unit: '1' }),
    ],
    frq_work: [
      row('WS-U1L1-reflect1', null, { source: 'worksheet', unit: 'U1', score: 1 }),
      row('WS-U1L1-reflect2', null, { source: 'worksheet', unit: 'U1', score: 0.5 }),
    ],
    mixed: [
      row('U1-L1-Q01', 'B', { unit: '1' }),
      row('U1-L1-Q02', 'A', { unit: '1' }),
      row('WS-U1L1-reflect1', null, { source: 'worksheet', unit: 'U1', score: 1 }),
      row('BL-U1L1', null, { source: 'blooket', unit: 'U1', score: 0.85 }),
    ],
    sy2526_pc: [
      row('U1-PC-MCQ-A-Q01', 'A', { source: 'progress_check', unit: '1' }),
      row('U1-PC-MCQ-A-Q02', 'D', { source: 'progress_check', unit: '1' }),
      row('U1-L1-Q01', 'B', { unit: '1' }),
    ],
  };
}

function projectGrade(g) {
  // buildLessonsArray emits lessonKey (not topicKey/id).
  const keyOf = (L) => L.lessonKey || L.topicKey || L.id;
  return {
    units: g.units,
    quarters: g.quarters,
    completion: g.completion,
    lessonsCount: Array.isArray(g.lessons) ? g.lessons.length : 0,
    hasBlooketSample: (g.lessons || [])
      .filter((L) => L && (keyOf(L) === '1.1' || keyOf(L) === '2.9'))
      .map((L) => ({
        topic: keyOf(L),
        hasBlooket: !!L.hasBlooket,
      }))
      .sort((a, b) => String(a.topic).localeCompare(String(b.topic))),
  };
}

function pinConfig(cfg) {
  // Full frozen config (deep-equal against grade-config.sy2526-freeze.json minus note).
  return JSON.parse(JSON.stringify(cfg));
}

function gradeViaResolver(year, rows, { configOverride } = {}) {
  const prod = resolveProductionGradeInputs(year);
  const answerKeyDoc = loadAnswerKey();
  const answerKey = answerKeyMap(answerKeyDoc);
  const schedule = prod.lessonSchedule;
  const config = configOverride ? { ...prod.config, ...configOverride } : prod.config;
  const grade = computeGrade(rows, answerKey, config, {
    lessonSchedule: schedule,
    eventSchedule: prod.eventSchedule || null, // SY2627: PC dates keyed by NEW unit (null for the frozen year)
    section: 'B',
    asOf: new Date('2026-10-20T16:00:00.000Z').getTime(),
    blooketPresence: prod.blooketPresence,
    blooketRequired: prod.blooketRequired,
  });
  // REAL transcript path (not a local reimplementation)
  const artHash = artifactHash({
    answerKeyDoc,
    lessonSchedule: schedule,
    blooketPresence: prod.blooketPresence,
    blooketRequired: prod.blooketRequired,
  });
  return {
    year: prod.year,
    blooketPresenceLen: prod.blooketPresence.length,
    blooketRequiredLen: prod.blooketRequired.length,
    schedule_1_1_B: schedule && schedule['1.1'] ? schedule['1.1'].periods.B : null,
    pcUnitsFromEvents: prod.eventSchedule && prod.eventSchedule.progressChecks ? Object.keys(prod.eventSchedule.progressChecks) : null,
    frozenConfig: pinConfig(prod.config),
    artHash,
    grade: projectGrade(grade),
  };
}

function readGolden(name) {
  const p = resolve(FIX_DIR, name);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function writeGolden(name, obj) {
  mkdirSync(FIX_DIR, { recursive: true });
  writeFileSync(resolve(FIX_DIR, name), JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function assertOrUpdate(name, actual) {
  if (UPDATE) {
    writeGolden(name, actual);
    return;
  }
  const expected = readGolden(name);
  expect(expected, `missing golden ${name} — run with UPDATE_M2B_GOLDEN=1`).toBeTruthy();
  expect(actual).toEqual(expected);
}

describe('M2b auditable invariance (resolver path)', () => {
  const prevEnv = process.env.LESSON_SCHEDULE_PATH;
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.LESSON_SCHEDULE_PATH;
    else process.env.LESSON_SCHEDULE_PATH = prevEnv;
  });

  it('SY2627: four ledger scenarios snapshot via resolver', () => {
    const sc = scenarios();
    for (const name of ['empty', 'quiz_partial', 'frq_work', 'mixed']) {
      const actual = gradeViaResolver('SY2627', sc[name]);
      expect(actual.year).toBe('SY2627');
      expect(actual.blooketPresenceLen).toBe(0);
      expect(actual.blooketRequiredLen).toBe(0);
      // Presence sample must be non-empty when schedule produces lessons
      if (actual.grade.lessonsCount > 0) {
        expect(actual.grade.hasBlooketSample.length).toBeGreaterThan(0);
      }
      assertOrUpdate(`sy2627-${name}.json`, actual);
    }
  });

  

  it('SY2526 + useV3:true override exercises V3 math on frozen empty A2 fixtures', () => {
    const actual = gradeViaResolver('SY2526', scenarios().sy2526_pc, {
      configOverride: { useV3: true },
    });
    expect(actual.blooketRequiredLen).toBe(0);
    // V3 surface fields should appear on quarters when useV3 is on
    const q1 = actual.grade.quarters && actual.grade.quarters.Q1;
    expect(q1).toBeTruthy();
    assertOrUpdate('sy2526-pc-v3.json', actual);
  });

  it('env LESSON_SCHEDULE_PATH override via resolveProductionGradeInputs (no injection)', () => {
    const tmp = resolve(here, 'fixtures/_tmp-m2b-sched-override.json');
    const overrideDoc = {
      lessons: {
        '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2099-06-01', E: '2099-06-01' } },
        '1.2': { unit: 1, topicKey: '1.2', worksheetKey: '2', periods: { B: '2099-06-02', E: '2099-06-02' } },
        '2.9': { unit: 2, topicKey: '2.9', worksheetKey: '9', periods: { B: '2099-06-03', E: '2099-06-03' } },
      },
    };
    writeFileSync(tmp, JSON.stringify(overrideDoc), 'utf8');
    try {
      process.env.LESSON_SCHEDULE_PATH = tmp;
      // No schedule override injection — resolver must honor env itself.
      const actual = gradeViaResolver('SY2627', scenarios().mixed);
      expect(actual.schedule_1_1_B).toBe('2099-06-01');
      assertOrUpdate('sy2627-env-schedule-override.json', actual);
    } finally {
      try { unlinkSync(tmp); } catch (_) { /* ignore */ }
    }
  });

  it('artHash via REAL transcript.artifactHash; legacy blooketLessons matches computeGrade', () => {
    const answerKeyDoc = loadAnswerKey();
    const prod26 = resolveProductionGradeInputs('SY2627');
    const prod25 = resolveProductionGradeInputs('SY2526');
    const h26 = artifactHash({
      answerKeyDoc,
      lessonSchedule: prod26.lessonSchedule,
      blooketPresence: prod26.blooketPresence,
      blooketRequired: prod26.blooketRequired,
    });
    const h25 = artifactHash({
      answerKeyDoc,
      lessonSchedule: prod25.lessonSchedule,
      blooketPresence: prod25.blooketPresence,
      blooketRequired: prod25.blooketRequired,
    });
    expect(h26).toMatch(/^[a-f0-9]{64}$/);
    expect(h25).toMatch(/^[a-f0-9]{64}$/);
    expect(h26).toBe(h25);

    // Legacy single-list mount: artHash uses resolveBlooketLists — required falls
    // to module BLOOKET_REQUIRED (67), presence = the list. Must NOT treat the
    // list as both.
    const legacyOnly = artifactHash({
      answerKeyDoc,
      lessonSchedule: prod26.lessonSchedule,
      blooketLessons: prod26.blooketPresence, // presence-only legacy
    });
    const explicitBoth = artifactHash({
      answerKeyDoc,
      lessonSchedule: prod26.lessonSchedule,
      blooketPresence: prod26.blooketPresence,
      blooketRequired: prod26.blooketRequired,
    });
    // Same presence + module-required (67) path — should equal explicit both when
    // module REQUIRED matches prod required (live SY2627).
    expect(legacyOnly).toBe(explicitBoth);

    assertOrUpdate('art-hashes.json', {
      sy2627: h26,
      sy2526: h25,
      sy2627_legacy_lessons_only: legacyOnly,
    });
  });
});
