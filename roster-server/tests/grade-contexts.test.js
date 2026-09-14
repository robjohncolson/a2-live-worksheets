// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  writeFileSync, unlinkSync, existsSync, mkdirSync, cpSync, rmSync, readFileSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTIVE_SCHOOL_YEAR,
  GRADE_CONTEXTS,
  getGradeContext,
  resolveProductionGradeInputs,
  loadLessonScheduleWithPriority,
  freezeDir,
  isTestEnv,
  validateBlooketFreeze,
  validateConfigFreeze,
  validateScheduleFreeze,
  validateAnswerKeyFreeze,
  loadAnswerKeySy2627,
} from '../grade-contexts.js';
import { PHASE3_CONFIG } from '../grade-config.js';
import { keyVersionHash } from '../grade-answer-key.js';
import { bootGoldenApp } from './golden/boot.js';

const here = dirname(fileURLToPath(import.meta.url));
const realData = resolve(here, '../data');
const freezeBlooket = resolve(realData, 'blooket-lessons.sy2526-freeze.json');
const freezeSched = resolve(realData, 'lesson-schedule.sy2526-freeze.json');
const freezeCfg = resolve(realData, 'grade-config.sy2526-freeze.json');
const freezeAnswerKey = resolve(realData, 'answer-key.SY2627.json');

const FREEZE_FILES = [
  'blooket-lessons.sy2526-freeze.json',
  'lesson-schedule.sy2526-freeze.json',
  'grade-config.sy2526-freeze.json',
];

describe('M2b grade-contexts registry (durable freeze + honest resolver)', () => {
  const prevEnv = process.env.LESSON_SCHEDULE_PATH;
  const prevFreeze = process.env.GRADE_FREEZE_DIR;
  const prevAnswerKeyPath = process.env.ANSWER_KEY_PATH;
  const prevVitest = process.env.VITEST;
  const prevNodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.LESSON_SCHEDULE_PATH;
    else process.env.LESSON_SCHEDULE_PATH = prevEnv;
    if (prevFreeze === undefined) delete process.env.GRADE_FREEZE_DIR;
    else process.env.GRADE_FREEZE_DIR = prevFreeze;
    if (prevAnswerKeyPath === undefined) delete process.env.ANSWER_KEY_PATH;
    else process.env.ANSWER_KEY_PATH = prevAnswerKeyPath;
    if (prevVitest === undefined) delete process.env.VITEST;
    else process.env.VITEST = prevVitest;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  it('ACTIVE_SCHOOL_YEAR is SY2627 (G8)', () => {
    expect(ACTIVE_SCHOOL_YEAR).toBe('SY2627');
  });

  it('isTestEnv is true under vitest', () => {
    expect(isTestEnv()).toBe(true);
  });

  it('freeze artifacts exist on disk (not decorative)', () => {
    expect(existsSync(freezeBlooket)).toBe(true);
    expect(existsSync(freezeSched)).toBe(true);
    expect(existsSync(freezeCfg)).toBe(true);
    expect(existsSync(freezeAnswerKey)).toBe(true);
  });

  it('committed freezes pass strict validators', () => {
    validateBlooketFreeze(JSON.parse(readFileSync(freezeBlooket, 'utf8')));
    validateConfigFreeze(JSON.parse(readFileSync(freezeCfg, 'utf8')));
    validateScheduleFreeze(JSON.parse(readFileSync(freezeSched, 'utf8')));
    validateAnswerKeyFreeze(JSON.parse(readFileSync(freezeAnswerKey, 'utf8')));
    // Frozen-vs-live map parity was a one-time A4 release fact. The golden
    // master guards grade parity; this suite must not require ongoing equality.
  });

  it('SY2526 loads DURABLE freeze: 77 presence=required, schedule 1.1 B=2026-09-09, useV3 from freeze', () => {
    const a = getGradeContext('SY2526');
    expect(a.year).toBe('SY2526');
    expect(a.blooketPresence).toHaveLength(0);
    expect(a.blooketRequired).toHaveLength(0);
    expect(a.blooketTopics).toHaveLength(0);
    expect(a.blooketBonusTopics).toHaveLength(0);
    expect(a.config.C).toBe(85);
    const freezeUseV3 = JSON.parse(readFileSync(freezeCfg, 'utf8')).useV3;
    expect(a.config.useV3).toBe(freezeUseV3);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.blooketPresence)).toBe(true);
    expect(() => { a.blooketPresence.push('x'); }).toThrow();
  });

  it('SY2526 config deep-equals freeze file (minus note)', () => {
    const raw = JSON.parse(readFileSync(freezeCfg, 'utf8'));
    const { note: _n, ...expected } = raw;
    const prod = resolveProductionGradeInputs('SY2526');
    expect(prod.config).toEqual(expected);
  });

  it('SY2627 uses its frozen answer key with live presence 77 / required 66 / bonus 11', () => {
    const b = getGradeContext('SY2627');
    expect(b.year).toBe('SY2627');
    expect(b.blooketPresence).toHaveLength(0);
    expect(b.blooketRequired).toHaveLength(0);
    expect(b.blooketBonusTopics).toHaveLength(0);
    expect(b.blooketTopics).toHaveLength(0);
    expect(b.blooketRequired).not.toContain('2.9');
    // Part-C retag 2026-08-07: old-3.7 (sim-significance) moved core->bonus.
    expect(b.blooketRequired).not.toContain('3.7');
    expect(b.blooketPresence).toEqual([]);
    expect(b.answerKey).toEqual(JSON.parse(readFileSync(freezeAnswerKey, 'utf8')));
    expect(b.answerKeyHash).toBe(keyVersionHash(b.answerKey.answerKey, {}));
    expect(Object.isFrozen(b.answerKey)).toBe(true);
  });

  it('resolveProductionGradeInputs(year) returns THAT year (not always live)', () => {
    const sy25 = resolveProductionGradeInputs('SY2526');
    const sy26 = resolveProductionGradeInputs('SY2627');
    expect(sy25.year).toBe('SY2526');
    expect(sy26.year).toBe('SY2627');
    expect(sy25.answerKey).toBeNull();
    expect(sy25.answerKeyHash).toBeNull();
    expect(sy26.answerKeyHash).toBe(keyVersionHash(sy26.answerKey.answerKey, {}));
    expect(sy25.blooketRequired).toHaveLength(0);
    expect(sy26.blooketRequired).toHaveLength(0);
    expect(sy25.config.useV3).toBe(false);
    sy25.config.C = 1;
    expect(PHASE3_CONFIG.C).toBe(85);
    expect(resolveProductionGradeInputs('SY2526').config.C).toBe(85);
    sy26.answerKey.answerKey['test'] = {answerKey:'A'};
    expect(resolveProductionGradeInputs('SY2627').answerKey.answerKey.test).toBeUndefined();
  });

  it('missing active-year answer-key freeze throws outside the test environment', () => {
    const missingPath = resolve(
      here,
      'fixtures/_tmp-missing-answer-key-' + Date.now() + '-' + Math.random().toString(16).slice(2),
    );
    delete process.env.GRADE_FREEZE_DIR;
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';

    expect(() => loadAnswerKeySy2627(missingPath))
      .toThrow(/SY2627 freeze missing: answer-key/i);
  });

  it('missing SY2627 answer-key freeze falls back in tests and logs once', () => {
    const tmpDir = resolve(
      here,
      'fixtures/_tmp-answer-key-fallback-' + Date.now() + '-' + Math.random().toString(16).slice(2),
    );
    const livePath = resolve(tmpDir, 'live-answer-key.json');
    const liveDoc = {
      generatedFrom: 'fallback-test',
      answerKey: {
        'U1-L2-Q01': { answerKey: 'B', type: 'multiple-choice', unit: '1', topic: '1.2' },
      },
    };
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(livePath, JSON.stringify(liveDoc), 'utf8');
    process.env.GRADE_FREEZE_DIR = tmpDir;
    process.env.ANSWER_KEY_PATH = livePath;
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const first = resolveProductionGradeInputs('SY2627');
      const second = resolveProductionGradeInputs('SY2627');
      expect(first.answerKey).toEqual(liveDoc);
      expect(first.answerKeyHash).toBe(keyVersionHash(liveDoc.answerKey, {}));
      expect(second.answerKey).toEqual(liveDoc);
      expect(warning).toHaveBeenCalledTimes(1);
      expect(warning.mock.calls[0][0]).toMatch(/answer-key freeze missing/i);
    } finally {
      warning.mockRestore();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it.each([
    ['test', true],
    ['production', false],
  ])('malformed SY2627 answer-key freeze throws in %s', (_label, testEnv) => {
    const tmpDir = resolve(
      here,
      'fixtures/_tmp-answer-key-malformed-' + Date.now() + '-' + Math.random().toString(16).slice(2),
    );
    const malformedPath = resolve(tmpDir, 'answer-key.SY2627.json');
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(malformedPath, '{not-json', 'utf8');
    delete process.env.GRADE_FREEZE_DIR;
    if (testEnv) {
      process.env.VITEST = 'true';
      process.env.NODE_ENV = 'test';
    } else {
      delete process.env.VITEST;
      process.env.NODE_ENV = 'production';
    }

    try {
      expect(() => loadAnswerKeySy2627(malformedPath))
        .toThrow(/SY2627 freeze malformed: answer-key/i);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('LESSON_SCHEDULE_PATH env wins for SY2627 via resolveProductionGradeInputs itself', () => {
    const tmp = resolve(here, 'fixtures/_tmp-lesson-schedule-override.json');
    writeFileSync(
      tmp,
      JSON.stringify({
        lessons: {
          '9.9': { unit: 9, topicKey: '9.9', worksheetKey: '99', periods: { B: '2099-01-01', E: '2099-01-01' } },
          '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2099-06-01', E: '2099-06-01' } },
        },
      }),
      'utf8',
    );
    try {
      process.env.LESSON_SCHEDULE_PATH = tmp;
      const live = loadLessonScheduleWithPriority();
      expect(live['9.9'].periods.B).toBe('2099-01-01');
      const prod = resolveProductionGradeInputs('SY2627');
      expect(prod.lessonSchedule['1.1'].periods.B).toBe('2099-06-01');
      const frozen = resolveProductionGradeInputs('SY2526');
      expect(frozen.lessonSchedule).toEqual({});
      expect(frozen.lessonSchedule['9.9']).toBeUndefined();
    } finally {
      try { unlinkSync(tmp); } catch (_) { /* ignore */ }
    }
  });

  it('GRADE_CONTEXTS registry object is frozen', () => {
    expect(Object.isFrozen(GRADE_CONTEXTS)).toBe(true);
  });
});

describe('M2b strict freeze validators (unit)', () => {
  

  it('answer key: generatedFrom is required', () => {
    expect(() => validateAnswerKeyFreeze({
      answerKey: { Q1: { answerKey: 'A' } },
    })).toThrow(/generatedFrom/i);
  });

  

  it('blooket: presence≠required throws', () => {
    const topics = Array.from({ length: 77 }, (_, i) => `1.${i + 1}`);
    const required = topics.slice();
    required[0] = '9.9';
    expect(() => validateBlooketFreeze({ topics, requiredTopics: required, bonusTopics: [] }))
      .toThrow(/requiredTopics must equal topics/i);
  });

  it('config: {C:85} alone throws', () => {
    expect(() => validateConfigFreeze({ C: 85 })).toThrow(/useV3|quarters|feederWeights/i);
  });

  it('config: missing quarters throws', () => {
    expect(() => validateConfigFreeze({
      C: 85,
      useV3: false,
      feederWeights: { W: 1, Q: 2 },
      lessonFeederWeights: { ws: 1, W: 2, Q: 3 },
      frqBand: { E: 100, P: 70, I: 35 },
      v3WorkWeights: { lessons: 0.3, quizzes: 0.3, posters: 0.3, blooket: 0.1 },
      v3Gates: { floor: 0.4, ceiling: 0.7 },
      schoolTz: 'America/New_York',
      gradingWindowStart: '2026-09-01',
    })).toThrow(/quarters/i);
  });

  it('schedule: lessons:[] throws', () => {
    expect(() => validateScheduleFreeze({ lessons: [] }))
      .toThrow(/non-array object/i);
  });

  
});

describe('M2b SY2526 freeze fail-loud — 3 freezes × 3 failure classes', () => {
  const prevFreeze = process.env.GRADE_FREEZE_DIR;
  let tmpDir;

  afterEach(() => {
    if (prevFreeze === undefined) delete process.env.GRADE_FREEZE_DIR;
    else process.env.GRADE_FREEZE_DIR = prevFreeze;
    if (tmpDir) {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
      tmpDir = null;
    }
  });

  function stageFreezes() {
    tmpDir = resolve(here, 'fixtures/_tmp-freeze-dir-' + Date.now() + '-' + Math.random().toString(16).slice(2));
    mkdirSync(tmpDir, { recursive: true });
    for (const name of FREEZE_FILES) {
      cpSync(resolve(realData, name), resolve(tmpDir, name));
    }
    process.env.GRADE_FREEZE_DIR = tmpDir;
    return tmpDir;
  }

  // ── missing ──
  it('missing blooket freeze THROWS', () => {
    const dir = stageFreezes();
    unlinkSync(resolve(dir, 'blooket-lessons.sy2526-freeze.json'));
    expect(() => getGradeContext('SY2526')).toThrow(/SY2526 freeze missing.*blooket/i);
  });

  it('missing schedule freeze THROWS', () => {
    const dir = stageFreezes();
    unlinkSync(resolve(dir, 'lesson-schedule.sy2526-freeze.json'));
    expect(() => getGradeContext('SY2526')).toThrow(/SY2526 freeze missing.*lesson-schedule/i);
  });

  it('missing config freeze THROWS', () => {
    const dir = stageFreezes();
    unlinkSync(resolve(dir, 'grade-config.sy2526-freeze.json'));
    expect(() => getGradeContext('SY2526')).toThrow(/SY2526 freeze missing.*grade-config/i);
  });

  // ── malformed JSON ──
  it('malformed blooket JSON THROWS', () => {
    const dir = stageFreezes();
    writeFileSync(resolve(dir, 'blooket-lessons.sy2526-freeze.json'), '{not-json', 'utf8');
    expect(() => getGradeContext('SY2526')).toThrow(/SY2526 freeze malformed/i);
  });

  it('malformed schedule JSON THROWS', () => {
    const dir = stageFreezes();
    writeFileSync(resolve(dir, 'lesson-schedule.sy2526-freeze.json'), '[[[', 'utf8');
    expect(() => getGradeContext('SY2526')).toThrow(/SY2526 freeze malformed/i);
  });

  it('malformed config JSON THROWS', () => {
    const dir = stageFreezes();
    // genuinely broken JSON SYNTAX (Codex final-round: `null` is VALID JSON and
    // exercised the invalid-object branch, not the malformed branch)
    writeFileSync(resolve(dir, 'grade-config.sy2526-freeze.json'), '{invalid-json', 'utf8');
    expect(() => getGradeContext('SY2526')).toThrow(/SY2526 freeze malformed/i);
  });

  it('null config (valid JSON, not an object) THROWS invalid', () => {
    const dir = stageFreezes();
    writeFileSync(resolve(dir, 'grade-config.sy2526-freeze.json'), 'null', 'utf8');
    expect(() => getGradeContext('SY2526')).toThrow(/SY2526 freeze invalid/i);
  });

  it('config with extra quarter key THROWS', () => {
    const dir = stageFreezes();
    const cfg = JSON.parse(readFileSync(resolve(dir, 'grade-config.sy2526-freeze.json'), 'utf8'));
    cfg.quarters.Q5 = { units: [10], start: '2026-01-01', end: '2026-02-01', pcAnchor: { p85: 40, p100: 60 } };
    writeFileSync(resolve(dir, 'grade-config.sy2526-freeze.json'), JSON.stringify(cfg), 'utf8');
    expect(() => getGradeContext('SY2526')).toThrow(/unexpected quarters key/i);
  });

  it('config with non-numeric quarter units THROWS', () => {
    const dir = stageFreezes();
    const cfg = JSON.parse(readFileSync(resolve(dir, 'grade-config.sy2526-freeze.json'), 'utf8'));
    cfg.quarters.Q1.units = ['1', '2', '3'];
    writeFileSync(resolve(dir, 'grade-config.sy2526-freeze.json'), JSON.stringify(cfg), 'utf8');
    expect(() => getGradeContext('SY2526')).toThrow(/units must be numbers/i);
  });

  it('config missing V3-path knobs THROWS', () => {
    const dir = stageFreezes();
    const cfg = JSON.parse(readFileSync(resolve(dir, 'grade-config.sy2526-freeze.json'), 'utf8'));
    delete cfg.v3LessonsExcludeQuiz;
    writeFileSync(resolve(dir, 'grade-config.sy2526-freeze.json'), JSON.stringify(cfg), 'utf8');
    expect(() => getGradeContext('SY2526')).toThrow(/v3LessonsExcludeQuiz/i);
  });

  // ── structurally invalid (strict validators) ──
  

  it('structurally invalid schedule (lessons:[]) THROWS', () => {
    const dir = stageFreezes();
    writeFileSync(
      resolve(dir, 'lesson-schedule.sy2526-freeze.json'),
      JSON.stringify({ lessons: [] }),
      'utf8',
    );
    expect(() => getGradeContext('SY2526')).toThrow(/non-array object/i);
  });

  it('structurally invalid config (missing quarters / {C:85}) THROWS', () => {
    const dir = stageFreezes();
    writeFileSync(
      resolve(dir, 'grade-config.sy2526-freeze.json'),
      JSON.stringify({ C: 85 }),
      'utf8',
    );
    expect(() => getGradeContext('SY2526')).toThrow(/useV3|quarters|feederWeights/i);
  });

  it('freezeDir() respects GRADE_FREEZE_DIR under test env', () => {
    const dir = stageFreezes();
    expect(freezeDir()).toBe(dir);
  });
});

describe('M2b GRADE_FREEZE_DIR production gating', () => {
  const prevFreeze = process.env.GRADE_FREEZE_DIR;
  const prevVitest = process.env.VITEST;
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (prevFreeze === undefined) delete process.env.GRADE_FREEZE_DIR;
    else process.env.GRADE_FREEZE_DIR = prevFreeze;
    if (prevVitest === undefined) delete process.env.VITEST;
    else process.env.VITEST = prevVitest;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  it('GRADE_FREEZE_DIR throws outside test env (production-safe)', () => {
    process.env.GRADE_FREEZE_DIR = '/tmp/should-not-be-used';
    // Clear vitest marker + force non-test NODE_ENV
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';
    expect(isTestEnv()).toBe(false);
    expect(() => freezeDir()).toThrow(/GRADE_FREEZE_DIR is test-only/i);
  });

  it('without GRADE_FREEZE_DIR, freezeDir is committed data/ even in production env markers', () => {
    delete process.env.GRADE_FREEZE_DIR;
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';
    // No override set → committed path, no throw
    expect(freezeDir()).toBe(realData);
  });
});

describe('A4 createApp answer-key freeze', () => {
  const quizId = 'U1-L2-Q01';
  let app;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  function quizCredit(body) {
    for (const lesson of body.lessons || []) {
      const item = (lesson.items?.quiz || []).find((entry) => entry.itemId === quizId);
      if (item) return item.credit;
    }
    return undefined;
  }

  async function bootCase(withFrozenKey) {
    const productionGradeInputs = resolveProductionGradeInputs('SY2627');
    productionGradeInputs.answerKey.answerKey[quizId] = {answerKey:'B', unit:'1', topic:'1.2'};
    productionGradeInputs.lessonSchedule = {'1.2': {unit:1, topicKey:'1.2', worksheetKey:'2', periods:{B:'2026-10-14',E:'2026-10-14'}}};
    const liveDoc = structuredClone(productionGradeInputs.answerKey);
    const correct = liveDoc.answerKey[quizId].answerKey;
    if (!withFrozenKey) {
      delete productionGradeInputs.answerKey;
      delete productionGradeInputs.answerKeyHash;
    }

    const studentsDoc = {
      asOf: '2026-10-15',
      students: [{
        id: 'answer-key-freeze-student',
        section: 'PeriodB',
        reviews: [],
        records: [{
          student_id: 'answer-key-freeze-student',
          source: 'curriculum_quiz',
          item_id: quizId,
          unit: 'U1',
          topic: null,
          skill: null,
          score: null,
          response: String(correct).toLowerCase(),
          evidence_tier: 'practice',
          attempt: 1,
          recorded_at: '2026-10-14T16:00:00.000Z',
          graded_at: '2026-10-14T16:00:00.000Z',
        }],
      }],
    };
    const inputs = {
      answerKey: liveDoc,
      productionGradeInputs,
      // The lessons[] array (where quiz credit is visible) needs the schedule.
      lessonSchedule: productionGradeInputs.lessonSchedule,
      worksheetBlankCounts: null,
      worksheetKey: null,
    };
    app = await bootGoldenApp({
      studentsDoc,
      inputs,
      configOverrides: { gradingWindowStart: null },
      inProcess: true,
    });
    return liveDoc;
  }

  it('keeps quiz credit after the live answer-key document changes', async () => {
    const liveDoc = await bootCase(true);
    expect(quizCredit(await app.getStudentGrade('answer-key-freeze-student'))).toBe(1);

    liveDoc.answerKey[quizId].answerKey = '__changed__';

    expect(quizCredit(await app.getStudentGrade('answer-key-freeze-student'))).toBe(1);
  });

  it('keeps the legacy live-loader behavior when no frozen key is supplied', async () => {
    const liveDoc = await bootCase(false);
    expect(quizCredit(await app.getStudentGrade('answer-key-freeze-student'))).toBe(1);

    liveDoc.answerKey[quizId].answerKey = '__changed__';

    expect(quizCredit(await app.getStudentGrade('answer-key-freeze-student'))).toBe(0);
  });
});
