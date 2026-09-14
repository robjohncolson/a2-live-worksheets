#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveProductionGradeInputs } from '../grade-contexts.js';
import { buildWorksheetBlankCounts } from '../lesson-grade.js';
import { normalizeResponse } from '../scoring.js';
import { bootGoldenApp } from '../tests/golden/boot.js';
import { stripVolatile, VOLATILE_VERSION } from '../tests/golden/volatile.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(SCRIPT_DIR, '..');
const REPO_DIR = resolve(SERVER_DIR, '..');
const DEFAULT_OUT = resolve(SERVER_DIR, 'tests', 'fixtures', 'golden-local');
const DEFAULT_SALT = 'apstats-golden-master-v1';
const SNAPSHOT_SCHEMA = 'apstats-ledger-snapshot/v1';
const BUNDLE_SCHEMA = 'apstats-offline-export/v1';

const VALUE_FLAGS = new Set(['snapshot', 'asOf', 'out', 'salt']);

function parseArgs(argv) {
  const parsed = { accept: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--accept') {
      parsed.accept = true;
      continue;
    }

    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const equalsAt = arg.indexOf('=');
    const name = arg.slice(2, equalsAt === -1 ? undefined : equalsAt);
    if (!VALUE_FLAGS.has(name)) {
      throw new Error(`Unknown flag: --${name}`);
    }

    const value = equalsAt === -1 ? argv[index + 1] : arg.slice(equalsAt + 1);
    if (!value || value.startsWith('--')) {
      throw new Error(`--${name} requires a value`);
    }
    parsed[name] = value;
    if (equalsAt === -1) index += 1;
  }

  return parsed;
}

function expandHome(inputPath) {
  if (inputPath === '~') return homedir();
  if (inputPath.startsWith('~/')) return resolve(homedir(), inputPath.slice(2));
  return resolve(process.cwd(), inputPath);
}

async function newestDefaultSnapshot() {
  const snapshotDir = resolve(homedir(), 'grade-backups', 'snapshots');
  let entries;
  try {
    entries = await readdir(snapshotDir, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Could not read default snapshot directory ${snapshotDir}: ${error.message}`);
  }

  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map(async (entry) => {
        const path = join(snapshotDir, entry.name);
        const info = await stat(path);
        return { path, name: entry.name, mtimeMs: info.mtimeMs };
      }),
  );

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs || compareCodePoints(b.name, a.name));
  if (!candidates.length) {
    throw new Error(`No JSON snapshots found in ${snapshotDir}`);
  }
  return candidates[0].path;
}

function assertAsOf(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
    throw new Error(`Invalid --asOf value ${JSON.stringify(value)}; expected YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid --asOf calendar date: ${value}`);
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function pseudonym(studentId, salt) {
  return `gm-${sha256(`${studentId}${salt}`).slice(0, 12)}`;
}

function pick(record, snakeName, camelName = null) {
  if (record[snakeName] !== undefined) return record[snakeName];
  if (camelName && record[camelName] !== undefined) return record[camelName];
  return null;
}

function compareCodePoints(a, b) {
  const left = String(a);
  const right = String(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function keepsResponse(source, itemId) {
  if (source === 'curriculum_quiz') return true;
  return source === 'pc' && /^U\d+-PC-/i.test(String(itemId || '')) && !/-PAPER$/i.test(itemId);
}

function sanitizeRecord(record) {
  const source = pick(record, 'source');
  const itemId = pick(record, 'item_id', 'itemId');
  return {
    source,
    item_id: itemId,
    unit: pick(record, 'unit'),
    topic: pick(record, 'topic'),
    skill: pick(record, 'skill'),
    score: pick(record, 'score'),
    evidence_tier: pick(record, 'evidence_tier', 'evidenceTier'),
    attempt: pick(record, 'attempt') ?? 1,
    recorded_at: pick(record, 'recorded_at', 'recordedAt'),
    graded_at: pick(record, 'graded_at', 'gradedAt'),
    response: keepsResponse(source, itemId) ? normalizeResponse(record.response) : null,
  };
}

function sanitizeReview(review) {
  const itemId = pick(review, 'item_id', 'itemId');
  const rawGrade = review.grade ?? review.mark ?? review.rating ?? null;
  const normalizedGrade = typeof rawGrade === 'string'
    ? rawGrade.trim().toUpperCase()
    : null;
  const grade = ['E', 'P', 'I'].includes(normalizedGrade) ? normalizedGrade : null;

  const rawCredit = review.credit ?? review.score ?? (
    typeof rawGrade === 'number' ? rawGrade : null
  );
  const numericCredit = rawCredit === null || rawCredit === '' ? null : Number(rawCredit);
  const credit = Number.isFinite(numericCredit) ? numericCredit : null;

  // review_marks backup rows contain teacher and comment metadata, but none of
  // that participates in grade computation. Keep only actual grading reviews.
  if (!itemId || (grade === null && credit === null)) return null;

  return {
    item_id: itemId,
    grade,
    credit,
    recorded_at: pick(review, 'recorded_at', 'recordedAt')
      ?? pick(review, 'seen_at', 'seenAt'),
    graded_at: pick(review, 'graded_at', 'gradedAt'),
  };
}

function comparable(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function compareRecords(a, b) {
  const item = compareCodePoints(comparable(a.item_id), comparable(b.item_id));
  if (item !== 0) return item;

  const attempt = (Number(a.attempt) || 0) - (Number(b.attempt) || 0);
  if (attempt !== 0) return attempt;

  const recordedAt = compareCodePoints(comparable(a.recorded_at), comparable(b.recorded_at));
  if (recordedAt !== 0) return recordedAt;

  const source = compareCodePoints(comparable(a.source), comparable(b.source));
  if (source !== 0) return source;

  return compareCodePoints(comparable(a), comparable(b));
}

function buildStudents(snapshot, asOf, salt, snapshotSha256) {
  if (!snapshot || snapshot.schema !== SNAPSHOT_SCHEMA || !Array.isArray(snapshot.students)) {
    throw new Error(`Snapshot must use schema ${SNAPSHOT_SCHEMA} and contain students[]`);
  }

  const students = snapshot.students.map((student, index) => {
    const studentId = student && student.studentId;
    if (typeof studentId !== 'string' || !studentId) {
      throw new Error(`Snapshot student at index ${index} has no studentId`);
    }
    if (!student.bundle || student.bundle.schema !== BUNDLE_SCHEMA) {
      throw new Error(`Snapshot student at index ${index} has no ${BUNDLE_SCHEMA} bundle`);
    }

    const rawRecords = Array.isArray(student.bundle.records) ? student.bundle.records : [];
    const rawReviews = Array.isArray(student.bundle.reviews) ? student.bundle.reviews : [];
    const records = rawRecords.map(sanitizeRecord).sort(compareRecords);
    const reviews = rawReviews
      .map(sanitizeReview)
      .filter(Boolean)
      .sort((a, b) => compareCodePoints(comparable(a), comparable(b)));

    return {
      id: pseudonym(studentId, salt),
      section: student.section ?? null,
      records,
      reviews,
    };
  });

  students.sort((a, b) => compareCodePoints(a.id, b.id));
  const ids = students.map((student) => student.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('Pseudonym collision detected; choose a different --salt');
  }

  return {
    schema: 'apstats-golden/v1',
    asOf,
    builtFrom: {
      snapshotSha256,
      generatedAt: snapshot.generatedAt ?? null,
    },
    students,
  };
}

function productionDataPath(envName, filename) {
  if (process.env[envName]) return resolve(process.env[envName]);
  const bundled = resolve(SERVER_DIR, 'data', filename);
  if (existsSync(bundled)) return bundled;
  return resolve(REPO_DIR, 'data', filename);
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not load ${label} from ${path}: ${error.message}`);
  }
}

async function loadInputs() {
  const answerKeyPath = productionDataPath('ANSWER_KEY_PATH', 'answer-key.json');
  const manifestPath = productionDataPath('WORK_MANIFEST_PATH', 'work-manifest.json');
  const worksheetKeyPath = productionDataPath('WORKSHEET_KEY_PATH', 'worksheet-key.json');

  const answerKey = await readJson(answerKeyPath, 'production answer key');
  const manifest = await readJson(manifestPath, 'production work manifest');
  const worksheetKey = existsSync(worksheetKeyPath)
    ? await readJson(worksheetKeyPath, 'production worksheet key')
    : null;
  const productionGradeInputs = resolveProductionGradeInputs('SY2627');

  return {
    schema: 'apstats-golden-inputs/v1',
    answerKey,
    productionGradeInputs,
    lessonSchedule: productionGradeInputs.lessonSchedule,
    worksheetBlankCounts: buildWorksheetBlankCounts(manifest),
    worksheetKey,
  };
}

function walkStrings(value, visit) {
  if (typeof value === 'string') {
    visit(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => walkStrings(entry, visit));
    return;
  }
  if (!value || typeof value !== 'object') return;
  Object.values(value).forEach((entry) => walkStrings(entry, visit));
}

function sensitiveStrings(snapshot) {
  const values = new Set();
  for (const student of snapshot.students) {
    for (const value of [student.studentId, student.username, student.realName]) {
      if (typeof value === 'string' && value) values.add(value);
    }
    const bundleStudent = student.bundle && student.bundle.student;
    if (bundleStudent) {
      for (const value of [bundleStudent.studentId, bundleStudent.username, bundleStudent.realName]) {
        if (typeof value === 'string' && value) values.add(value);
      }
    }
  }
  return [...values];
}

export function privacySelfCheck(outputs, snapshot) {
  const violations = [];
  const sensitive = sensitiveStrings(snapshot);

  for (const [filename, output] of Object.entries(outputs)) {
    walkStrings(output, (value) => {
      if (value.includes('@')) violations.push(`${filename}: contains @`);
      for (const privateValue of sensitive) {
        if (value === privateValue || (privateValue.length >= 4 && value.includes(privateValue))) {
          violations.push(`${filename}: contains a source identity value`);
          break;
        }
      }
    });
  }

  for (const student of outputs['students.json'].students) {
    for (const record of student.records) {
      const mayKeepResponse = keepsResponse(record.source, record.item_id);
      if (!mayKeepResponse && record.response !== null) {
        violations.push(`students.json: disallowed response on item ${record.item_id}`);
        continue;
      }
      if (
        mayKeepResponse &&
        record.response !== null &&
        !/^[a-z0-9][a-z0-9 .,\/-]{0,7}$/.test(record.response)
      ) {
        violations.push(`students.json: unsafe response on item ${record.item_id}`);
      }
    }
  }

  if (violations.length) {
    const unique = [...new Set(violations)];
    throw new Error(`Privacy self-check failed:\n- ${unique.join('\n- ')}`);
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;

  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = stableValue(value[key]);
  }
  return sorted;
}

function jsonText(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

async function writeJsonAtomic(path, value) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, jsonText(value), 'utf8');
  await rename(temporary, path);
}

async function buildExpected(studentsDocIn, inputsIn) {
  // Round-trip through the EXACT bytes that will be written (stable key order) so
  // the builder and the test boot from identical inputs — float summation order
  // over config objects follows key order (see build-golden-synthetic.mjs).
  const studentsDoc = JSON.parse(jsonText(studentsDocIn));
  const inputs = JSON.parse(jsonText(inputsIn));
  const goldenApp = await bootGoldenApp({ studentsDoc, inputs });

  try {
    const perStudent = {};

    for (const student of studentsDoc.students) {
      const body = await goldenApp.getStudentGrade(student.id);
      perStudent[student.id] = stripVolatile(body);
    }

    const classBody = await goldenApp.getClassGrades();

    return {
      volatileVersion: VOLATILE_VERSION,
      perStudent,
      classGrades: stripVolatile(classBody),
    };
  } finally {
    await goldenApp.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const snapshotPath = args.snapshot ? expandHome(args.snapshot) : await newestDefaultSnapshot();
  const outDir = args.out ? expandHome(args.out) : DEFAULT_OUT;
  const salt = args.salt ?? DEFAULT_SALT;
  const snapshotRaw = await readFile(snapshotPath);
  const snapshotSha256 = sha256(snapshotRaw);

  let snapshot;
  try {
    snapshot = JSON.parse(snapshotRaw.toString('utf8'));
  } catch (error) {
    throw new Error(`Snapshot is not valid JSON: ${error.message}`);
  }

  const asOf = args.asOf ?? snapshot.asOfDateNY;
  assertAsOf(asOf);
  const studentsDoc = buildStudents(snapshot, asOf, salt, snapshotSha256);
  const inputs = await loadInputs();
  const outputs = {
    'students.json': studentsDoc,
    'inputs.json': inputs,
  };
  let expected = null;

  if (args.accept) {
    expected = await buildExpected(studentsDoc, inputs);
    outputs['expected.json'] = expected;
  }

  // Production runs with USE_V3_GRADING=true (Railway). The frozen config captured
  // here decides the oracle's shape, so say what was captured — loudly.
  {
    const cfg = (inputs.productionGradeInputs && inputs.productionGradeInputs.config) || {};
    const useV3 = cfg.useV3 === true;
    console.log(`Captured config flags: useV3=${useV3}`);
    if (!useV3) console.warn('WARNING: useV3=false captured — production runs USE_V3_GRADING=true; rebuild with `USE_V3_GRADING=true node scripts/build-golden-fixture.mjs --accept` for a production-shaped oracle.');
  }
  privacySelfCheck(outputs, snapshot);
  await mkdir(outDir, { recursive: true });
  await writeJsonAtomic(resolve(outDir, 'students.json'), studentsDoc);
  await writeJsonAtomic(resolve(outDir, 'inputs.json'), inputs);
  if (args.accept) {
    await writeJsonAtomic(resolve(outDir, 'expected.json'), expected);
  }

  const recordCount = studentsDoc.students.reduce(
    (total, student) => total + student.records.length,
    0,
  );
  console.log(`Golden fixture: ${studentsDoc.students.length} students, ${recordCount} records`);
  console.log(`Snapshot SHA-256: ${snapshotSha256}`);
  console.log(`Wrote: ${resolve(outDir, 'students.json')}`);
  console.log(`Wrote: ${resolve(outDir, 'inputs.json')}`);
  if (args.accept) console.log(`Accepted: ${resolve(outDir, 'expected.json')}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(`build-golden-fixture: ${error.message}`);
    process.exitCode = 1;
  });
}
