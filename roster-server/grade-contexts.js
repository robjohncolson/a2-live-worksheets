// @ts-check
// grade-contexts.js — M2b school-year grade-context registry + resolver.
//
// ACTIVE_SCHOOL_YEAR = SY2627 (G8: summer kids are the SY2627 cohort).
// SY2526 loads DURABLE freeze files and FAILS LOUD if any freeze is missing,
// malformed, or structurally invalid (history must never silently recompute
// on live data). SY2627 loads LIVE sources with legacy schedule priority
//   env LESSON_SCHEDULE_PATH → bundled roster-server/data → repo-root data.
//
// getGradeContext(year) / resolveProductionGradeInputs(year) return values FOR
// the requested year (no silent live override).

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PHASE3_CONFIG } from './grade-config.js';
import { keyVersionHash } from './grade-answer-key.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

/** Pre-M2a Blooket presence count snapshotted in the SY2526 freeze. */
const SY2526_BLOOKET_COUNT = 77;
/** Pre-M2a lesson-schedule key count (server production snapshot). */
const SY2526_SCHEDULE_MIN_KEYS = 70;
const SY2526_SCHEDULE_EXPECTED_KEYS = 77;
const SY2627_ANSWER_KEY_FREEZE = 'answer-key.SY2627.json';
let didWarnAnswerKeyFallback = false;

/** @typedef {'SY2526'|'SY2627'} SchoolYear */

export const ACTIVE_SCHOOL_YEAR = /** @type {SchoolYear} */ ('SY2627');


function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

function loadJsonSoft(absPath) {
  if (!existsSync(absPath)) return null;
  try {
    return JSON.parse(readFileSync(absPath, 'utf8'));
  } catch {
    return null;
  }
}

/** True under vitest / NODE_ENV=test. GRADE_FREEZE_DIR is honored only here. */
export function isTestEnv() {
  const v = process.env.VITEST;
  if (v === 'true' || v === '1') return true;
  return process.env.NODE_ENV === 'test';
}

/**
 * Directory for SY2526 freeze files.
 * Production: always the committed roster-server/data/ freezes.
 * GRADE_FREEZE_DIR is TEST-ONLY (VITEST or NODE_ENV=test); production ignores
 * it by throwing if set so a misconfigured host cannot silently redirect history.
 */
export function freezeDir() {
  if (process.env.GRADE_FREEZE_DIR) {
    if (!isTestEnv()) {
      throw new Error(
        'GRADE_FREEZE_DIR is test-only; unset it in production ' +
          '(committed roster-server/data/*sy2526-freeze.json is the only source)',
      );
    }
    return resolve(process.env.GRADE_FREEZE_DIR);
  }
  return resolve(__dirname, 'data');
}

function freezePath(filename) {
  return resolve(freezeDir(), filename);
}

/**
 * Fail-loud JSON load for SY2526 freezes — missing/malformed THROWS.
 * @param {string} filename
 * @param {string} label
 */
function loadFreezeJsonOrThrow(filename, label) {
  const absPath = freezePath(filename);
  if (!existsSync(absPath)) {
    throw new Error(`SY2526 freeze missing: ${label} (${absPath})`);
  }
  let doc;
  try {
    doc = JSON.parse(readFileSync(absPath, 'utf8'));
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    throw new Error(`SY2526 freeze malformed: ${label} (${absPath}): ${msg}`);
  }
  if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`SY2526 freeze invalid: ${label} is not a JSON object (${absPath})`);
  }
  return doc;
}

function sameStringSet(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const sb = new Set(b);
  if (sb.size !== b.length) return false; // dups in b
  const sa = new Set(a);
  if (sa.size !== a.length) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

/**
 * Pre-M2a blooket freeze: topics = requiredTopics = allTopics = 77.
 * A single-topic stub must not pass.
 * @param {any} doc
 */
export function validateBlooketFreeze(doc) {
  if (!Array.isArray(doc.topics)) {
    throw new Error(
      `SY2526 freeze invalid: blooket topics must have length ${SY2526_BLOOKET_COUNT} ` +
        `(got ${Array.isArray(doc.topics) ? doc.topics.length : typeof doc.topics})`,
    );
  }
  if (!Array.isArray(doc.requiredTopics) || false) {
    throw new Error(
      `SY2526 freeze invalid: requiredTopics must have length ${SY2526_BLOOKET_COUNT} ` +
        `(pre-M2a presence=required; got ${Array.isArray(doc.requiredTopics) ? doc.requiredTopics.length : typeof doc.requiredTopics})`,
    );
  }
  if (!sameStringSet(doc.topics, doc.requiredTopics)) {
    throw new Error(
      'SY2526 freeze invalid: requiredTopics must equal topics (pre-M2a presence=required)',
    );
  }
  if (Array.isArray(doc.allTopics)) {
    if (!sameStringSet(doc.topics, doc.allTopics)) {
      throw new Error(
        `SY2526 freeze invalid: allTopics must match topics (${SY2526_BLOOKET_COUNT})`,
      );
    }
  }
  if (Array.isArray(doc.bonusTopics) && doc.bonusTopics.length !== 0) {
    throw new Error(
      'SY2526 freeze invalid: bonusTopics must be empty for pre-M2a SY2526 freeze',
    );
  }
}

/**
 * Full grade-config contract computeGrade / Phase-6+v3 read.
 * {C:85} alone must throw.
 * @param {any} doc
 */
export function validateConfigFreeze(doc) {
  if (typeof doc.C !== 'number' || !Number.isFinite(doc.C)) {
    throw new Error('SY2526 freeze invalid: grade-config must include numeric C');
  }
  if (typeof doc.useV3 !== 'boolean') {
    throw new Error('SY2526 freeze invalid: grade-config must include boolean useV3');
  }
  if (
    !doc.feederWeights ||
    typeof doc.feederWeights !== 'object' ||
    typeof doc.feederWeights.W !== 'number' ||
    typeof doc.feederWeights.Q !== 'number'
  ) {
    throw new Error('SY2526 freeze invalid: grade-config must include feederWeights.{W,Q}');
  }
  if (
    !doc.lessonFeederWeights ||
    typeof doc.lessonFeederWeights !== 'object' ||
    typeof doc.lessonFeederWeights.ws !== 'number' ||
    typeof doc.lessonFeederWeights.W !== 'number' ||
    typeof doc.lessonFeederWeights.Q !== 'number'
  ) {
    throw new Error('SY2526 freeze invalid: grade-config must include lessonFeederWeights.{ws,W,Q}');
  }
  if (
    !doc.frqBand ||
    typeof doc.frqBand !== 'object' ||
    typeof doc.frqBand.E !== 'number' ||
    typeof doc.frqBand.P !== 'number' ||
    typeof doc.frqBand.I !== 'number'
  ) {
    throw new Error('SY2526 freeze invalid: grade-config must include frqBand.{E,P,I}');
  }
  if (!doc.quarters || typeof doc.quarters !== 'object' || Array.isArray(doc.quarters)) {
    throw new Error('SY2526 freeze invalid: grade-config must include quarters{Q1..Q4}');
  }
  // computeGrade iterates EVERY Object.keys(config.quarters) entry — an extra
  // malformed quarter would validate and then change computation. Exactly Q1-Q4.
  const extraQuarters = Object.keys(doc.quarters).filter((k) => !['Q1', 'Q2', 'Q3', 'Q4'].includes(k));
  if (extraQuarters.length) {
    throw new Error(`SY2526 freeze invalid: unexpected quarters key(s): ${extraQuarters.join(', ')}`);
  }
  for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
    const band = doc.quarters[q];
    if (!band || typeof band !== 'object') {
      throw new Error(`SY2526 freeze invalid: grade-config.quarters.${q} missing`);
    }
    if (!Array.isArray(band.units) || band.units.length === 0) {
      throw new Error(`SY2526 freeze invalid: grade-config.quarters.${q}.units[] required`);
    }
    if (!band.units.every((u) => typeof u === 'number' && Number.isFinite(u))) {
      throw new Error(`SY2526 freeze invalid: grade-config.quarters.${q}.units must be numbers`);
    }
    if (typeof band.start !== 'string' || !band.start) {
      throw new Error(`SY2526 freeze invalid: grade-config.quarters.${q}.start required`);
    }
    if (typeof band.end !== 'string' || !band.end) {
      throw new Error(`SY2526 freeze invalid: grade-config.quarters.${q}.end required`);
    }

  }
  if (
    !doc.v3WorkWeights ||
    typeof doc.v3WorkWeights !== 'object' ||
    typeof doc.v3WorkWeights.lessons !== 'number' ||
    typeof doc.v3WorkWeights.quizzes !== 'number' ||
    typeof doc.v3WorkWeights.blooket !== 'number'
  ) {
    throw new Error(
      'SY2526 freeze invalid: grade-config must include v3WorkWeights (lessons/quizzes/blooket)',
    );
  }
  // Remaining knobs the computeGrade→computeQuarterV3 path reads (Codex final-round
  // closure: lesson-grade.js ~855-866/1054/1102-1120) — all must be frozen-typed.
  if (typeof doc.v3LessonsExcludeQuiz !== 'boolean') {
    throw new Error('SY2526 freeze invalid: grade-config must include boolean v3LessonsExcludeQuiz');
  }
  if (typeof doc.v3FixCwsReveal !== 'boolean') {
    throw new Error('SY2526 freeze invalid: grade-config must include boolean v3FixCwsReveal');
  }
  if (typeof doc.v3FixQuizZero !== 'boolean') {
    throw new Error('SY2526 freeze invalid: grade-config must include boolean v3FixQuizZero');
  }
  if (typeof doc.v3AheadOfScheduleLessons !== 'string' || !doc.v3AheadOfScheduleLessons) {
    throw new Error('SY2526 freeze invalid: grade-config must include v3AheadOfScheduleLessons');
  }
  if (
    !doc.v3Gates ||
    typeof doc.v3Gates !== 'object' ||
    typeof doc.v3Gates.floor !== 'number' ||
    typeof doc.v3Gates.ceiling !== 'number'
  ) {
    throw new Error('SY2526 freeze invalid: grade-config must include v3Gates.{floor,ceiling}');
  }
  if (typeof doc.schoolTz !== 'string' || !doc.schoolTz) {
    throw new Error('SY2526 freeze invalid: grade-config must include schoolTz');
  }
  if (typeof doc.gradingWindowStart !== 'string' || !doc.gradingWindowStart) {
    throw new Error('SY2526 freeze invalid: grade-config must include gradingWindowStart');
  }
}

/**
 * Schedule freeze: lessons must be a non-array object with ~77 keys, each with periods.
 * {lessons:[]} must throw.
 * @param {any} doc
 */
export function validateScheduleFreeze(doc) {
  if (doc.lessons == null) {
    throw new Error('SY2526 freeze invalid: lesson-schedule must have lessons{}');
  }
  if (Array.isArray(doc.lessons)) {
    throw new Error(
      'SY2526 freeze invalid: lesson-schedule.lessons must be a non-array object (not [])',
    );
  }
  if (typeof doc.lessons !== 'object') {
    throw new Error('SY2526 freeze invalid: lesson-schedule.lessons must be an object');
  }
  const keys = Object.keys(doc.lessons);
  for (const k of keys) {
    const entry = doc.lessons[k];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`SY2526 freeze invalid: lesson-schedule.lessons[${k}] must be an object`);
    }
    if (!entry.periods || typeof entry.periods !== 'object' || Array.isArray(entry.periods)) {
      throw new Error(
        `SY2526 freeze invalid: lesson-schedule.lessons[${k}].periods required`,
      );
    }
  }
}

/**
 * Frozen answer-key document consumed by every server-side grading path.
 * @param {any} doc
 */
export function validateAnswerKeyFreeze(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('SY2627 freeze invalid: answer-key must be a JSON object');
  }
  if (typeof doc.generatedFrom !== 'string' || !doc.generatedFrom.trim()) {
    throw new Error('SY2627 freeze invalid: answer-key.generatedFrom required');
  }
  if (!doc.answerKey || typeof doc.answerKey !== 'object' || Array.isArray(doc.answerKey)) {
    throw new Error('SY2627 freeze invalid: answer-key.answerKey must be an object');
  }
  const ids = Object.keys(doc.answerKey);
  for (const id of ids) {
    const entry = doc.answerKey[id];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('SY2627 freeze invalid: answer-key entry ' + id + ' must be an object');
    }
    const value = entry.answerKey;
    if (value !== null && typeof value !== 'string' && typeof value !== 'number') {
      throw new Error(
        'SY2627 freeze invalid: answer-key entry ' + id + '.answerKey must be string, number, or null',
      );
    }
  }
}

/** Legacy schedule priority: env → bundled → repo-root (server.js contract). */
export function loadLessonScheduleWithPriority() {
  if (process.env.LESSON_SCHEDULE_PATH) {
    const doc = loadJsonSoft(process.env.LESSON_SCHEDULE_PATH);
    if (doc && doc.lessons && typeof doc.lessons === 'object' && !Array.isArray(doc.lessons)) {
      return doc.lessons;
    }
  }
  const bundled = resolve(__dirname, 'data', 'lesson-schedule.json');
  if (existsSync(bundled)) {
    const doc = loadJsonSoft(bundled);
    if (doc && doc.lessons && typeof doc.lessons === 'object' && !Array.isArray(doc.lessons)) {
      return doc.lessons;
    }
  }
  const root = resolve(REPO_ROOT, 'data', 'lesson-schedule.json');
  const doc = loadJsonSoft(root);
  if (doc && doc.lessons && typeof doc.lessons === 'object' && !Array.isArray(doc.lessons)) {
    return doc.lessons;
  }
  return null;
}

export function loadEventScheduleWithPriority() {
  const paths = [process.env.LESSON_SCHEDULE_PATH, resolve(__dirname, 'data', 'lesson-schedule.json'), resolve(REPO_ROOT, 'data', 'lesson-schedule.json')];
  for (const path of paths.filter(Boolean)) {
    const doc = loadJsonSoft(path);
    if (doc && doc.lessons) return Array.isArray(doc.topicAssessments) ? { topicAssessments: doc.topicAssessments } : null;
  }
  return null;
}

function resolveLiveAnswerKeyPath() {
  if (process.env.ANSWER_KEY_PATH) return process.env.ANSWER_KEY_PATH;
  const bundled = resolve(__dirname, 'data', 'answer-key.json');
  if (existsSync(bundled)) return bundled;
  return resolve(REPO_ROOT, 'data', 'answer-key.json');
}

function loadAnswerKeyDocLive() {
  const absPath = resolveLiveAnswerKeyPath();
  let doc;
  try {
    doc = JSON.parse(readFileSync(absPath, 'utf8'));
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    throw new Error('SY2627 live answer-key fallback unavailable (' + absPath + '): ' + msg);
  }
  validateAnswerKeyFreeze(doc);
  return doc;
}

/**
 * Load the SY2627 answer-key freeze.
 * The optional path keeps the production/test failure policy directly testable.
 * @param {string} [absPath]
 */
export function loadAnswerKeySy2627(absPath = freezePath(SY2627_ANSWER_KEY_FREEZE)) {
  if (!existsSync(absPath)) {
    if (ACTIVE_SCHOOL_YEAR === 'SY2627' && !isTestEnv()) {
      throw new Error('SY2627 freeze missing: answer-key (' + absPath + ')');
    }
    if (!didWarnAnswerKeyFallback) {
      didWarnAnswerKeyFallback = true;
      console.warn(
        '[grade-contexts] SY2627 answer-key freeze missing; using live answer key for this boot:',
        absPath,
      );
    }
    return loadAnswerKeyDocLive();
  }

  let doc;
  try {
    doc = JSON.parse(readFileSync(absPath, 'utf8'));
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    throw new Error('SY2627 freeze malformed: answer-key (' + absPath + '): ' + msg);
  }
  validateAnswerKeyFreeze(doc);
  return doc;
}

function loadBlooketDocLive() {
  return loadJsonSoft(resolve(__dirname, 'data', 'blooket-lessons.json')) || {};
}

function loadBlooketDocSy2526() {
  const doc = loadFreezeJsonOrThrow(
    'blooket-lessons.sy2526-freeze.json',
    'blooket-lessons.sy2526-freeze.json',
  );
  validateBlooketFreeze(doc);
  return doc;
}

function splitBlooket(doc) {
  const presence = Array.isArray(doc.topics)
    ? doc.topics.slice()
    : Array.isArray(doc.allTopics)
      ? doc.allTopics.slice()
      : [];
  const required = Array.isArray(doc.requiredTopics)
    ? doc.requiredTopics.slice()
    : presence.slice(); // pre-split freeze: all present were required
  const bonus = Array.isArray(doc.bonusTopics) ? doc.bonusTopics.slice() : [];
  return { presence, required, bonus };
}

function loadConfigSy2526() {
  const freeze = loadFreezeJsonOrThrow(
    'grade-config.sy2526-freeze.json',
    'grade-config.sy2526-freeze.json',
  );
  validateConfigFreeze(freeze);
  // Freeze file's knobs WIN — including useV3. No env / PHASE3_CONFIG import.
  const cfg = { ...freeze };
  delete cfg.note;
  return cfg;
}

function loadConfigSy2627() {
  // Live knobs from PHASE3_CONFIG (env-aware useV3).
  return JSON.parse(JSON.stringify(PHASE3_CONFIG));
}

function loadScheduleSy2526() {
  // Production freeze = server copy snapshot (1.1 B = 2026-09-09). NO live fallback.
  const doc = loadFreezeJsonOrThrow(
    'lesson-schedule.sy2526-freeze.json',
    'lesson-schedule.sy2526-freeze.json',
  );
  validateScheduleFreeze(doc);
  return doc.lessons;
}

function buildContext(year) {
  if (year === 'SY2526') {
    const bl = splitBlooket(loadBlooketDocSy2526());
    return deepFreeze({
      year: /** @type {SchoolYear} */ ('SY2526'),
      config: loadConfigSy2526(),
      lessonSchedule: loadScheduleSy2526(),
      eventSchedule: null, 
      blooketPresence: bl.presence,
      blooketRequired: bl.required,
      blooketBonusTopics: bl.bonus,
      blooketTopics: bl.presence,
      answerKey: null,
      answerKeyHash: null,
    });
  }
  // SY2627 live
  const bl = splitBlooket(loadBlooketDocLive());
  const answerKey = loadAnswerKeySy2627();
  return deepFreeze({
    year: /** @type {SchoolYear} */ ('SY2627'),
    config: loadConfigSy2627(),
    lessonSchedule: loadLessonScheduleWithPriority(),
    eventSchedule: loadEventScheduleWithPriority(),
    blooketPresence: bl.presence,
    blooketRequired: bl.required,
    blooketBonusTopics: bl.bonus,
    blooketTopics: bl.presence,
    answerKey,
    answerKeyHash: keyVersionHash(answerKey.answerKey, {}),
  });
}

// Lazy build so env LESSON_SCHEDULE_PATH / GRADE_FREEZE_DIR is read at resolve
// time. Rebuild each getGradeContext call for honesty of env overrides.
export const GRADE_CONTEXTS = Object.freeze({
  get SY2526() {
    return buildContext('SY2526');
  },
  get SY2627() {
    return buildContext('SY2627');
  },
});

/**
 * @param {SchoolYear|string} [year]
 * @returns {GradeContext}
 */
export function getGradeContext(year = ACTIVE_SCHOOL_YEAR) {
  const key = year === 'SY2526' || year === 'SY2627' ? year : ACTIVE_SCHOOL_YEAR;
  return buildContext(/** @type {SchoolYear} */ (key));
}

/**
 * Production helper — returns concrete values FOR the requested year.
 * Call ONCE at createApp/boot and thread the same object to all mounts.
 * @param {SchoolYear|string} [year]
 */
export function resolveProductionGradeInputs(year = ACTIVE_SCHOOL_YEAR) {
  const ctx = getGradeContext(year);
  // Fresh config clone so callers can merge overrides without mutating freeze.
  return {
    year: ctx.year,
    config: JSON.parse(JSON.stringify(ctx.config)),
    lessonSchedule: ctx.lessonSchedule
      ? JSON.parse(JSON.stringify(ctx.lessonSchedule))
      : null,
    eventSchedule: ctx.eventSchedule
      ? JSON.parse(JSON.stringify(ctx.eventSchedule))
      : null,
    blooketPresence: ctx.blooketPresence.slice(),
    blooketRequired: ctx.blooketRequired.slice(),
    blooketBonusTopics: ctx.blooketBonusTopics.slice(),
    // back-compat alias
    blooketTopics: ctx.blooketPresence.slice(),
    answerKey: ctx.answerKey
      ? JSON.parse(JSON.stringify(ctx.answerKey))
      : null,
    answerKeyHash: ctx.answerKeyHash,
  };
}
