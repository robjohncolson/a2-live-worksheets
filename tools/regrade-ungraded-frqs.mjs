#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildServerReflectionPrompt,
  loadFrqRubricRegistry,
  validateFrqRubricRegistry,
} from '../roster-server/frq-prompt.js';
import { verdictToScore } from '../roster-server/frq-verdict.js';

export { verdictToScore };

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(THIS_FILE), '..');
const DEFAULT_CONFIG_PATH = join(homedir(), 'grade-backups', 'config.json');
const DEFAULT_LOG_PATH = join(homedir(), 'grade-backups', 'frq-regrade.log');
const FIXED_SAMPLE_ANSWER = '__APSTATS_FRQ_SAMPLE_7f4c5e2d91b8436aa76f0d39c821e5b7__';
const EXPECTED_WORKSHEET_COUNT = 69;
const EXPECTED_ITEM_COUNT = 212;
const MAX_RUBRIC_BUNDLE_BYTES = Math.floor(1.5 * 1024 * 1024);
export const MINIMUM_ROW_AGE_MS = 10 * 60 * 1_000;
export const GRADER_INTERVAL_MS = 60_000 / 20;

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function parseRecordedTime(record) {
  const value = record.recorded_at ?? record.recordedAt ?? record.ts;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !value) return Number.NaN;
  return Date.parse(value);
}

export function indexManifest(manifest) {
  const byItemId = new Map();
  for (const [prefix, worksheet] of Object.entries(manifest.worksheets || {})) {
    for (const textareaId of Object.keys(worksheet.items || {})) {
      const itemId = `${prefix}-${textareaId}`;
      if (byItemId.has(itemId)) throw new Error(`duplicate manifest itemId: ${itemId}`);
      byItemId.set(itemId, { prefix, worksheet, textareaId });
    }
  }
  return byItemId;
}

function redactedRow(student, record, itemId) {
  return {
    studentId: student.studentId,
    username: student.username,
    itemId,
    attempt: record.attempt ?? 1,
  };
}

export function classifyUngradedFrqRows(snapshot, manifest, options = {}) {
  const now = options.now ?? Date.now();
  const minimumAgeMs = options.minimumAgeMs ?? MINIMUM_ROW_AGE_MS;
  const byItemId = indexManifest(manifest);
  const candidates = [];
  const unknownItems = [];
  const invalidTimestamps = [];

  for (const student of snapshot.students || []) {
    if (options.student && student.username !== options.student) continue;

    for (const record of student.bundle?.records || []) {
      if (record.source !== 'frq') continue;
      const hasScore = record.score !== null && record.score !== undefined;
      if (options.backfillFeedback) {
        if (!hasScore || Array.isArray(record.frq_result?.missing)) continue;
      } else if (hasScore) continue;
      if (typeof record.response !== 'string' || record.response.trim().length < 20) continue;

      const itemId = record.itemId ?? record.item_id;
      const recordedAt = parseRecordedTime(record);
      if (!Number.isFinite(recordedAt)) {
        invalidTimestamps.push(redactedRow(student, record, itemId));
        continue;
      }
      if (now - recordedAt < minimumAgeMs) continue;

      const match = byItemId.get(itemId);
      if (!match) {
        unknownItems.push(redactedRow(student, record, itemId));
        continue;
      }

      candidates.push({
        studentId: student.studentId,
        username: student.username,
        itemId,
        response: record.response,
        attempt: record.attempt ?? 1,
        prefix: match.prefix,
        worksheet: match.worksheet,
        textareaId: match.textareaId,
        record,
      });
    }
  }

  return { candidates, unknownItems, invalidTimestamps };
}

export function selectUngradedFrqRows(snapshot, manifest, options = {}) {
  return classifyUngradedFrqRows(snapshot, manifest, options).candidates;
}

export const selectEligibleRows = selectUngradedFrqRows;

export function buildPrompt(registry, prefix, textareaId, response) {
  return buildServerReflectionPrompt(registry, prefix, textareaId, response);
}

export function buildGraderRequest(worksheet, textareaId, response, prompt, lessonContext) {
  return {
    scenario: {
      topic: worksheet.topic,
      questionId: textareaId,
      lessonContext,
    },
    answers: { answer: response },
    prompt,
  };
}

// verdict (optional): the grader's response — its feedback rides along so the student sees WHY.
export function buildRegradeRequest(candidate, score, registry, verdict = null, { feedbackOnly = false } = {}) {
  const canonicalResponse = String(candidate.response).trim();
  const responseHash = createHash('sha256')
    .update(canonicalResponse, 'utf8')
    .digest('hex');
  const sourceDigest = String(registry?.sourceDigest || '').replace(/^sha256:/, '');
  const body = {
    studentId: candidate.studentId,
    itemId: candidate.itemId,
    score,
    provenance: 'ai-batch',
    responseHash,
    rubricVersion: `${registry?.schoolYear || 'unknown'}:${sourceDigest}`,
  };
  if (Number(candidate.attempt) !== 1) body.attempt = candidate.attempt;
  const feedback = verdict && typeof verdict.feedback === 'string' ? verdict.feedback.trim().slice(0, 2000) : '';
  if (feedback) body.feedback = feedback;
  for (const field of ['matched', 'missing']) {
    if (Array.isArray(verdict?.[field])) {
      body[field] = verdict[field].slice(0, 32).map(entry => String(entry).slice(0, 512));
    }
  }
  if (typeof verdict?.suggestion === 'string') body.suggestion = verdict.suggestion.slice(0, 2000);
  if (feedbackOnly) body.feedbackOnly = true;
  return body;
}

export class IntervalRateLimiter {
  constructor({ intervalMs = GRADER_INTERVAL_MS, now = Date.now, sleep = delay } = {}) {
    this.intervalMs = intervalMs;
    this.now = now;
    this.sleep = sleep;
    this.nextStartAt = 0;
  }

  async wait() {
    const current = this.now();
    const waitMs = Math.max(0, this.nextStartAt - current);
    if (waitMs) await this.sleep(waitMs);
    this.nextStartAt = Math.max(this.nextStartAt, this.now()) + this.intervalMs;
  }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function addDigestPart(hash, label, value) {
  const bytes = Buffer.from(value, 'utf8');
  hash.update(`${Buffer.byteLength(label, 'utf8')}:${label}:${bytes.length}:`);
  hash.update(bytes);
}

function computeCurrentSourceDigest(rootDir, manifestSource, manifest) {
  const hash = createHash('sha256');
  addDigestPart(hash, 'data/frq-regrade-manifest.json', manifestSource);
  const promptsFiles = [...new Set(
    (manifest.worksheets || []).map((worksheet) => worksheet.promptsFile),
  )].sort((left, right) => left.localeCompare(right));

  for (const promptsFile of promptsFiles) {
    const source = readFileSync(resolve(rootDir, promptsFile), 'utf8');
    addDigestPart(hash, promptsFile, source);
  }
  return `sha256:${hash.digest('hex')}`;
}

function assertBundleCounts(registry, bundleBytes) {
  const worksheetCount = Object.keys(registry.worksheets).length;
  const itemCount = indexManifest(registry).size;
  if (worksheetCount !== EXPECTED_WORKSHEET_COUNT) {
    throw new Error(
      `invalid FRQ rubric bundle: expected ${EXPECTED_WORKSHEET_COUNT} worksheets, found ${worksheetCount}`,
    );
  }
  if (itemCount !== EXPECTED_ITEM_COUNT) {
    throw new Error(
      `invalid FRQ rubric bundle: expected ${EXPECTED_ITEM_COUNT} items, found ${itemCount}`,
    );
  }
  if (bundleBytes > MAX_RUBRIC_BUNDLE_BYTES) {
    throw new Error(
      `invalid FRQ rubric bundle: ${bundleBytes} bytes exceeds ${MAX_RUBRIC_BUNDLE_BYTES}`,
    );
  }

  for (const [prefix, worksheet] of Object.entries(registry.worksheets)) {
    for (const [textareaId, item] of Object.entries(worksheet.items)) {
      const samplePrompt = item.promptBeforeAnswer + FIXED_SAMPLE_ANSWER + item.promptAfterAnswer;
      const actualHash = createHash('sha256').update(samplePrompt).digest('hex');
      if (item.samplePromptSha256 !== actualHash) {
        throw new Error(
          `invalid FRQ rubric bundle: sample hash mismatch for ${prefix}-${textareaId}`,
        );
      }
    }
  }
}

export function loadRubricBundle(rootDir = ROOT) {
  const bundlePath = resolve(rootDir, 'roster-server/data/frq-rubrics.SY2627.json');
  let bundleSource;
  try {
    bundleSource = readFileSync(bundlePath, 'utf8');
  } catch (error) {
    throw new Error(`${bundlePath}: FRQ rubric bundle is missing: ${error.message}`);
  }

  let registry;
  try {
    registry = loadFrqRubricRegistry(bundleSource);
  } catch (error) {
    throw new Error(`${bundlePath}: ${error.message}`);
  }
  assertBundleCounts(registry, Buffer.byteLength(bundleSource, 'utf8'));

  const manifestPath = resolve(rootDir, 'data/frq-regrade-manifest.json');
  let manifestSource;
  let manifest;
  try {
    manifestSource = readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(manifestSource);
  } catch (error) {
    throw new Error(`${manifestPath}: could not validate FRQ rubric bundle: ${error.message}`);
  }
  if (!manifest.railwayServerUrl || !Array.isArray(manifest.worksheets)) {
    throw new Error(`${manifestPath}: FRQ regrade manifest is malformed`);
  }

  const currentDigest = computeCurrentSourceDigest(rootDir, manifestSource, manifest);
  if (registry.sourceDigest !== currentDigest) {
    throw new Error(
      `${bundlePath}: FRQ rubric bundle is stale `
      + `(expected ${currentDigest}, found ${registry.sourceDigest})`,
    );
  }

  return { registry, railwayServerUrl: manifest.railwayServerUrl };
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

export async function fetchSnapshot(config, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`${stripTrailingSlash(config.rosterUrl)}/admin/snapshot`, {
    headers: { 'x-teacher-secret': config.teacherKey },
  });
  if (!response.ok) throw new Error(`snapshot request failed with HTTP ${response.status}`);
  const snapshot = await readJsonResponse(response);
  if (!snapshot || !Array.isArray(snapshot.students)) throw new Error('snapshot response was malformed');
  return snapshot;
}

function worksheetCounts(candidates) {
  const counts = {};
  for (const candidate of candidates) {
    counts[candidate.worksheet.filename] = (counts[candidate.worksheet.filename] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

export async function runRegradeJob(options) {
  const {
    config,
    registry: providedRegistry,
    railwayServerUrl: providedRailwayServerUrl,
    apply = false,
    backfillFeedback = false,
    limit = Number.POSITIVE_INFINITY,
    student,
    rootDir = ROOT,
    now = Date.now(),
    fetchImpl = globalThis.fetch,
    rateLimiter = new IntervalRateLimiter(),
    onEvent = () => {},
    // 2026-09-11: the grader intermittently 500s ("Empty response from deepseek" —
    // DeepSeek's default-on thinking mode hit the token cap). One transient 500 on
    // one row used to fail the whole hourly run. Retry each row with backoff, and
    // treat transient grader failures as non-fatal (the row is picked up again next
    // hour) — only permanent classification failures or a total wipe-out fail the job.
    graderAttempts = 3,
    retryBackoffMs = [2_000, 6_000],
    sleep = delay,
  } = options;

  let registry = providedRegistry;
  let railwayServerUrl = providedRailwayServerUrl;
  if (!registry || !railwayServerUrl) {
    const loaded = loadRubricBundle(rootDir);
    registry ||= loaded.registry;
    railwayServerUrl ||= loaded.railwayServerUrl;
  }
  validateFrqRubricRegistry(registry);

  const snapshot = await fetchSnapshot(config, fetchImpl);
  const classified = classifyUngradedFrqRows(snapshot, registry, { now, student, backfillFeedback });
  const allCandidates = classified.candidates;
  const boundedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : allCandidates.length;
  const candidates = allCandidates.slice(0, boundedLimit);
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    backfillFeedback,
    found: candidates.length,
    graded: 0,
    applied: 0,
    floorHeld: 0,
    stale: 0,
    failed: 0,
    unknownItems: classified.unknownItems.length,
    invalidTimestamps: classified.invalidTimestamps.length,
    worksheetCounts: worksheetCounts(candidates),
    grader5xx: false,
    retried: 0,
    transientFailures: 0,
  };

  for (const row of classified.unknownItems) {
    onEvent({
      type: 'unknown-item',
      username: row.username,
      itemId: row.itemId,
      reason: 'itemId is not present in the FRQ rubric bundle',
    });
  }
  for (const row of classified.invalidTimestamps) {
    onEvent({
      type: 'invalid-timestamp',
      username: row.username,
      itemId: row.itemId,
      reason: 'recorded timestamp is missing or unparseable',
    });
  }

  const permanentFailureCount = summary.unknownItems + summary.invalidTimestamps;
  if (!apply) {
    return { summary, candidates, exitCode: permanentFailureCount > 0 ? 1 : 0 };
  }

  const graderUrl = `${stripTrailingSlash(railwayServerUrl)}/api/ai/grade`;
  const regradeUrl = `${stripTrailingSlash(config.rosterUrl)}/ledger/frq-regrade`;

  for (const candidate of candidates) {
    try {
      const prompt = buildPrompt(
        registry,
        candidate.prefix,
        candidate.textareaId,
        candidate.response,
      );
      const graderBody = buildGraderRequest(
        candidate.worksheet,
        candidate.textareaId,
        candidate.response,
        prompt,
        candidate.worksheet.lessonContext,
      );

      let result = null;
      let score = null;
      let lastReason = '';
      for (let attempt = 1; attempt <= graderAttempts; attempt += 1) {
        if (attempt > 1) {
          const backoff = retryBackoffMs[Math.min(attempt - 2, retryBackoffMs.length - 1)] || 0;
          summary.retried += 1;
          onEvent({ type: 'retry', username: candidate.username, itemId: candidate.itemId, attempt, backoffMs: backoff, reason: lastReason });
          if (backoff) await sleep(backoff);
        }
        await rateLimiter.wait();
        let graderResponse;
        try {
          graderResponse = await fetchImpl(graderUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(graderBody),
          });
        } catch (networkError) {
          lastReason = `grader network error: ${networkError && networkError.message}`;
          continue;
        }
        if (graderResponse.status >= 500 && graderResponse.status <= 599) summary.grader5xx = true;
        if (!graderResponse.ok) {
          let snippet = '';
          try { snippet = String(await graderResponse.text()).slice(0, 160).replace(/\s+/g, ' '); } catch (_) {}
          lastReason = `grader HTTP ${graderResponse.status} ${snippet}`;
          if (graderResponse.status < 500) break;   // 4xx is not transient — do not burn retries
          continue;
        }
        const parsed = await readJsonResponse(graderResponse);
        const parsedScore = verdictToScore(parsed);
        if (parsedScore === null || (backfillFeedback && !Array.isArray(parsed?.missing))) {
          lastReason = `unusable verdict: ${JSON.stringify(parsed && parsed.score)} (missing=${JSON.stringify(parsed && parsed.missing)})`;
          continue;
        }
        result = parsed;
        score = parsedScore;
        break;
      }
      if (score === null) {
        summary.failed += 1;
        if (/^grader HTTP 5[0-9][0-9]|^grader network error|^unusable verdict/.test(lastReason)) summary.transientFailures += 1;
        onEvent({ type: 'failed', username: candidate.username, itemId: candidate.itemId, reason: lastReason });
        continue;
      }
      summary.graded += 1;

      const regradeResponse = await fetchImpl(regradeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-teacher-secret': config.teacherKey,
        },
        body: JSON.stringify(buildRegradeRequest(candidate, score, registry, result, { feedbackOnly: backfillFeedback })),
      });
      const appliedResult = await readJsonResponse(regradeResponse);
      if (regradeResponse.status === 409 && appliedResult?.error === 'stale-response') {
        summary.stale += 1;
        onEvent({
          type: 'stale-response',
          username: candidate.username,
          itemId: candidate.itemId,
          score,
          reason: 'student response changed after the snapshot',
        });
        continue;
      }
      if (!regradeResponse.ok) {
        summary.failed += 1;
        onEvent({ type: 'failed', username: candidate.username, itemId: candidate.itemId, score, reason: `regrade HTTP ${regradeResponse.status}` });
        continue;
      }

      if (appliedResult?.applied === false) {
        summary.floorHeld += 1;
        onEvent({ type: 'floor-held', username: candidate.username, itemId: candidate.itemId, score });
        continue;
      }
      if (appliedResult?.applied !== true) {
        summary.failed += 1;
        onEvent({
          type: 'failed',
          username: candidate.username,
          itemId: candidate.itemId,
          score,
          reason: 'regrade response was malformed',
        });
        continue;
      }

      summary.applied += 1;
      onEvent({ type: 'applied', username: candidate.username, itemId: candidate.itemId, score });
    } catch (error) {
      summary.failed += 1;
      onEvent({
        type: 'failed',
        username: candidate.username,
        itemId: candidate.itemId,
        reason: `processing error: ${error.message}`,
      });
    }
  }

  // Exit policy (2026-09-11): permanent classification failures always fail the
  // job; transient grader failures fail it only when NOTHING got through (every
  // candidate failed) — a systemic outage, not one stubborn row.
  const settled = summary.applied + summary.floorHeld + summary.stale;
  const wipeout = candidates.length > 0 && settled === 0 && summary.failed === candidates.length;
  const nonTransientFailures = summary.failed - summary.transientFailures;
  const hasFailures = permanentFailureCount > 0 || nonTransientFailures > 0 || wipeout;
  return { summary, candidates, exitCode: hasFailures ? 1 : 0 };
}

export function parseArgs(argv) {
  const options = {
    apply: false,
    backfillFeedback: false,
    limit: Number.POSITIVE_INFINITY,
    student: undefined,
    configPath: DEFAULT_CONFIG_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--backfill-feedback') {
      options.backfillFeedback = true;
      continue;
    }
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.apply = false;
      continue;
    }
    if (arg === '--limit') {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 0) throw new Error('--limit requires a non-negative integer');
      options.limit = value;
      index += 1;
      continue;
    }
    if (arg === '--student') {
      options.student = argv[index + 1];
      if (!options.student) throw new Error('--student requires a username');
      index += 1;
      continue;
    }
    if (arg === '--config') {
      options.configPath = resolve(argv[index + 1] || '');
      if (!argv[index + 1]) throw new Error('--config requires a path');
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  // The explicit backfill command writes feedback; --dry-run always wins.
  if (options.backfillFeedback) options.apply = !argv.includes('--dry-run');
  return options;
}

// Config comes from ~/grade-backups/config.json on the teacher's box, or from
// APSTATS_ROSTER_URL / APSTATS_TEACHER_KEY in the environment (the hourly GitHub
// Actions sweep, .github/workflows/frq-regrade.yml). Env wins when both are set,
// so the Actions runner never depends on a file.
export function loadConfig(configPath = DEFAULT_CONFIG_PATH, env = process.env) {
  const fromEnv = { rosterUrl: env.APSTATS_ROSTER_URL, teacherKey: env.APSTATS_TEACHER_KEY };
  if (fromEnv.rosterUrl && fromEnv.teacherKey) return fromEnv;

  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  if (!config.rosterUrl || !config.teacherKey) {
    throw new Error(`${configPath}: rosterUrl and teacherKey are required`);
  }
  return { rosterUrl: config.rosterUrl, teacherKey: config.teacherKey };
}

export function appendSummary(summary, logPath = DEFAULT_LOG_PATH) {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), ...summary })}\n`);
}

function printSummary(summary) {
  if (summary.mode === 'dry-run') {
    console.log(`Dry run: ${summary.found} FRQ row(s) would be graded.`);
    for (const [filename, count] of Object.entries(summary.worksheetCounts)) {
      console.log(`${filename}: ${count}`);
    }
  }
  console.log(
    `Summary: found=${summary.found} graded=${summary.graded} applied=${summary.applied} `
      + `floorHeld=${summary.floorHeld} stale=${summary.stale} failed=${summary.failed} `
      + `unknownItems=${summary.unknownItems} invalidTimestamps=${summary.invalidTimestamps}`,
  );
}

export async function main(argv = process.argv.slice(2)) {
  const cli = parseArgs(argv);
  const config = loadConfig(cli.configPath);
  const { registry, railwayServerUrl } = loadRubricBundle();
  const result = await runRegradeJob({
    config,
    registry,
    railwayServerUrl,
    apply: cli.apply,
    backfillFeedback: cli.backfillFeedback,
    limit: cli.limit,
    student: cli.student,
    onEvent(event) {
      if (event.type === 'applied') {
        console.log(`Applied ${event.username} ${event.itemId} score=${event.score}`);
      } else if (event.type === 'floor-held') {
        console.log(`Floor held ${event.username} ${event.itemId} score=${event.score}`);
      } else if (event.type === 'stale-response') {
        console.log(`Skipped stale response ${event.username} ${event.itemId}`);
      } else {
        console.error(`Failed ${event.username} ${event.itemId}${event.score === undefined ? '' : ` score=${event.score}`}${event.reason ? ` — ${event.reason}` : ''}`);
      }
    },
  });
  printSummary(result.summary);
  appendSummary({
    ...result.summary,
    student: cli.student || null,
    limit: Number.isFinite(cli.limit) ? cli.limit : null,
  });
  return result.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === THIS_FILE) {
  main()
    .then((exitCode) => { process.exitCode = exitCode; })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
