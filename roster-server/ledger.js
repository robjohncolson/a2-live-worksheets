import { districtItemsFromLedger } from './district-ledger.js';
import { PHASE3_CONFIG, quarterOfDate } from './grade-config.js';
import { todayInTz } from './lesson-grade.js';
// ledger.js — mounts /ledger routes onto an Express app.
// Implements FROZEN CONTRACT 2 exactly.
// Call mountLedger(app, { db, verifyToken }) from createApp().

// Detect the "source not provisioned" condition: the body's `source` value is
// not yet in the item_ledger source CHECK because its migration hasn't been
// run. Mirrors class.js's isBlooketSourceMissing: only this specific
// pre-migration condition maps to 503; every other DB error is a real 500.
// Without this, a check_violation surfaces as a generic 500 "Database error"
// and the writer dies silently (how study_guide_diagnostic was lost for weeks).
import { issueLedgerReceipt, recordReceiptPersistFailure, verifyReviewGrant } from './receipts.js';
import { requireTeacher } from './teacher-auth.js';
import { createHash } from 'node:crypto';
import { parseServerReflectionItemId } from './frq-prompt.js';

let receiptPersistenceNotProvisionedLogged = false;
let frqMigrationDegradedLogged = false;
const FRQ_RESPONSE_MAX_BYTES = 8 * 1024;
const APPEAL_MAX_BYTES = 2 * 1024;
const FRQ_APPEAL_LIMIT = 3;
const RATE_WINDOW_MS = 60_000;
const STUDENT_WINDOW_SWEEP_THRESHOLD = 5_000;
const STUDENT_WINDOW_MAX_KEYS = 20_000;

function isReceiptPersistenceNotProvisioned(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return code === '42703' || msg.includes('undefined_column') || msg.includes('undefined column');
}

function handleReceiptPersistenceError(err, ledgerId) {
  if (isReceiptPersistenceNotProvisioned(err)) {
    if (!receiptPersistenceNotProvisionedLogged) {
      receiptPersistenceNotProvisionedLogged = true;
      console.info('receipt persistence not provisioned; continuing without stored receipt columns');
    }
    return;
  }
  recordReceiptPersistFailure();
  console.warn('Receipt persistence failed for ledgerId:', ledgerId, err);
}

async function resolveReceiptUsername(resolveUsername, studentId) {
  if (typeof resolveUsername !== 'function') return undefined;
  try {
    const username = await resolveUsername(studentId);
    return username || undefined;
  } catch (_) {
    return undefined;
  }
}

function isSourceNotProvisioned(e) {
  if (!e) return false;
  const code = String(e.code || '');
  const msg = String(e.message || '').toLowerCase();
  if (code === '23514') return true; // check_violation (the source CHECK rejects the value)
  return msg.includes('item_ledger_source_check');
}

function requiresReviewGrant(source) {
  return source === 'quiz_review' || source === 'quiz_exception';
}

function validGrantCredit(credit) {
  return typeof credit === 'number' && Number.isFinite(credit) && credit >= 0 && credit <= 1;
}

function normalizeWorksheetAnswer(value) {
  return String(value || '').toLowerCase().trim().replace(/[^\w\s./-]/g, '');
}

export function scoreWorksheetAnswer(dataAnswer, response) {
  const accepted = String(dataAnswer).split('|').map(normalizeWorksheetAnswer);
  const user = normalizeWorksheetAnswer(response);
  // An empty answer is never partial credit (every string `.includes('')`), and
  // the client never records empty blanks — match that: empty → incorrect.
  if (!user) return 0;
  if (accepted.includes(user)) return 1;
  if (accepted.some(answer => user.includes(answer) || answer.includes(user))) return 0.5;
  return 0;
}

function findWorksheetAnswer(worksheetKey, itemId) {
  if (!worksheetKey || typeof worksheetKey !== 'object') return undefined;
  const values = worksheetKey.worksheetKey && typeof worksheetKey.worksheetKey === 'object'
    ? worksheetKey.worksheetKey
    : worksheetKey;
  return values[itemId] === undefined ? undefined : String(values[itemId]);
}

function resolveFrqMode(frqMode) {
  let value;
  try {
    value = typeof frqMode === 'function' ? frqMode() : frqMode;
  } catch (_) {
    value = 'off';
  }
  return ['off', 'shadow', 'authoritative'].includes(value) ? value : 'off';
}

export function authoritativeForStudent(mode, studentId, canaryEnv) {
  if (!studentId || resolveFrqMode(mode) !== 'authoritative') return false;
  let rawCanary;
  try {
    rawCanary = typeof canaryEnv === 'function' ? canaryEnv() : canaryEnv;
  } catch (_) {
    return false;
  }
  const students = String(rawCanary || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return students.includes('*') || students.includes(studentId);
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// The roster service is a single Railway instance today. These per-student
// sliding windows deliberately live in-process; move them to shared storage if
// the service is horizontally scaled.
export function createStudentSlidingWindow(limit, options = {}) {
  const startsByStudent = new Map();
  const sweepThreshold = positiveInteger(
    options.sweepThreshold,
    STUDENT_WINDOW_SWEEP_THRESHOLD,
  );
  const maxKeys = positiveInteger(options.maxKeys, STUDENT_WINDOW_MAX_KEYS);

  function sweepExpired(cutoff) {
    for (const [key, starts] of startsByStudent) {
      const recent = starts.filter((startedAt) => startedAt > cutoff);
      if (recent.length === 0) startsByStudent.delete(key);
      else if (recent.length !== starts.length) startsByStudent.set(key, recent);
    }
  }

  return (studentId, at = Date.now()) => {
    const cutoff = at - RATE_WINDOW_MS;
    const isNewStudent = !startsByStudent.has(studentId);
    if (startsByStudent.size >= sweepThreshold
      || (isNewStudent && startsByStudent.size >= maxKeys)) {
      sweepExpired(cutoff);
    }

    const recent = (startsByStudent.get(studentId) || []).filter((startedAt) => startedAt > cutoff);
    const maximum = positiveInteger(limit(), 1);
    if (recent.length >= maximum) {
      startsByStudent.set(studentId, recent);
      return false;
    }
    if (!startsByStudent.has(studentId) && startsByStudent.size >= maxKeys) {
      // Fail closed instead of evicting a live student's active count.
      return false;
    }
    recent.push(at);
    startsByStudent.set(studentId, recent);
    return true;
  };
}

function bearerStudentId(req, verifyToken) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (typeof header !== 'string' || !/^Bearer\s+/i.test(header)) return null;
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    return verifyToken(token) || null;
  } catch (_) {
    return null;
  }
}

function frqBundleVersion(bundle) {
  if (!bundle) return null;
  const digest = String(bundle.sourceDigest || '').replace(/^sha256:/, '');
  return digest ? `${bundle.schoolYear || 'unknown'}:${digest}` : null;
}

function lookupFrqItem(bundle, itemId) {
  if (!bundle) return null;
  try {
    return parseServerReflectionItemId(bundle, itemId);
  } catch (_) {
    return null;
  }
}

function rpcFirst(result) {
  if (!result) return null;
  if (Array.isArray(result)) return result[0] || null;
  if (Array.isArray(result.data)) return result.data[0] || null;
  if (result.data && typeof result.data === 'object') return result.data;
  if (!Object.hasOwn(result, 'data') && !result.error && !result.degraded) return result;
  return null;
}

function isNumericFrqScore(value) {
  const number = Number(value);
  return value !== null && value !== undefined
    && (number === 0 || number === 0.5 || number === 1);
}

function deriveFrqStatus(row, at = Date.now()) {
  const now = Number(at);
  const leaseLive = row.frq_claimed_until
    && Date.parse(row.frq_claimed_until) > now;
  if (isNumericFrqScore(row.score) && row.frq_appeal_pending) {
    return leaseLive ? 'appeal-grading' : 'appeal-queued';
  }
  if (isNumericFrqScore(row.score)) return 'graded';
  if (leaseLive) return 'grading';
  if (String(row.frq_next_attempt_at || '').toLowerCase() === 'infinity') return 'failed';
  if (row.frq_next_attempt_at && Date.parse(row.frq_next_attempt_at) > now) return 'retrying';
  const readyAt = row.frq_ready_at ? Date.parse(row.frq_ready_at) : Number.NaN;
  if (typeof row.response !== 'string'
    || [...row.response].length < 20
    || !Number.isFinite(readyAt)
    || readyAt > now) return 'draft';
  return 'queued';
}

function sanitizedFrqResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = {};
  if (isNumericFrqScore(value.score)) result.score = Number(value.score);
  for (const field of ['feedback', 'suggestion', 'provider', 'model']) {
    if (typeof value[field] === 'string') result[field] = value[field].slice(0, 2_048);
  }
  for (const field of ['matched', 'missing']) {
    if (Array.isArray(value[field])) {
      result[field] = value[field].slice(0, 32).map((entry) => String(entry).slice(0, 512));
    }
  }
  if (value.revisedTextUsed === true) result.revisedTextUsed = true;
  return result;
}

// ── Route mounter ─────────────────────────────────────────────────────────────

export function mountLedger(app, {
  config = PHASE3_CONFIG, lessonSchedule = {}, eventSchedule = null,
  db,
  verifyToken,
  resolveUsername,
  worksheetKey,
  rosterDb,
  frqDb,
  frqBundle,
  frqMode,
}) {
  const allowFrqRecord = createStudentSlidingWindow(
    () => positiveInteger(process.env.FRQ_RECORD_MAX_PER_MINUTE, 30),
  );
  const allowFrqAppeal = createStudentSlidingWindow(
    () => positiveInteger(process.env.FRQ_APPEAL_MAX_PER_MINUTE, 5),
  );
  const allowFrqRead = createStudentSlidingWindow(
    () => positiveInteger(process.env.FRQ_STATUS_MAX_PER_MINUTE, 120),
  );

  async function persistFrqReceipt(row, score, provenance) {
    const username = await resolveReceiptUsername(resolveUsername, row.student_id);
    const receipt = issueLedgerReceipt({
      studentId: row.student_id,
      username,
      source: 'frq',
      itemId: row.item_id,
      score,
      attempt: row.attempt ?? 1,
      evidenceTier: row.evidence_tier || 'practice',
      response: row.response,
      gradingProvenance: provenance,
    });
    if (!receipt || !row.ledger_id || !frqDb
      || typeof frqDb.updateFrqReceiptIfScore !== 'function') return receipt;
    try {
      const persisted = await frqDb.updateFrqReceiptIfScore(
        row.ledger_id,
        score,
        receipt.receiptId,
        receipt.compact,
      );
      if (persisted && persisted.error) handleReceiptPersistenceError(persisted.error, row.ledger_id);
    } catch (error) {
      handleReceiptPersistenceError(error, row.ledger_id);
    }
    return receipt;
  }

  // ── POST /ledger/record ─────────────────────────────────────────────────────
  // FROZEN CONTRACT 2:
  //   Body: { token (req), source (req), itemId (req), response (req), unit?, topic?,
  //           skill?, score?, attempt?=1 }
  //   Header (optional): x-proctor-secret
  //   Behavior: verifyToken(token) → studentId; 401 if absent/expired.
  //     evidence_tier DERIVED server-side from x-proctor-secret header — body field ignored.
  //     Upsert on (student_id, source, item_id, attempt).
  //   → 200 { ok:true, ledgerId, evidenceTier }
  //   → 400 missing required fields
  //   → 401 bad token
  //   → 503 source not in the item_ledger CHECK yet (run the latest migration)
  app.post('/ledger/record', async (req, res) => {
    const {
      token,
      source,
      itemId,
      response,
      unit,
      topic,
      skill,
      score,
      attempt,
      grant,
      requestGrade,
    } = req.body || {};

    // Validate required fields
    if (!token) {
      return res.status(401).json({ ok: false, error: 'invalid token' });
    }

    if (!source || !itemId || response === undefined) {
      return res.status(400).json({ ok: false, error: 'source, itemId, and response are required' });
    }
    const allowedSources = ['lesson-check', 'try-it', 'topic-assessment', 'flashcard', 'worksheet', 'frq', 'curriculum_quiz', 'blooket', 'quiz_exception', 'quiz_review'];
    if (!allowedSources.includes(source)) {
      return res.status(400).json({ ok: false, error: 'Unsupported ledger source' });
    }

    // Resolve studentId from token
    const studentId = verifyToken(token);
    if (!studentId) {
      return res.status(401).json({ ok: false, error: 'invalid token' });
    }

    if (['try-it', 'topic-assessment', 'lesson-check'].includes(source) && !await requireTeacher(req, rosterDb)) {
      return res.status(403).json({ ok: false, error: 'Teacher or trusted lesson-check scorer required' });
    }
    if (['try-it', 'topic-assessment', 'lesson-check', 'flashcard'].includes(source)) {
      const today = todayInTz(config.schoolTz || 'America/New_York');
      const roster = rosterDb?.findByStudentId ? (await rosterDb.findByStudentId(studentId)).data : null;
      const definitions = districtItemsFromLedger([], lessonSchedule || {}, roster?.section,
        { ...config, today, useDistrictFormula: false }, eventSchedule?.topicAssessments || config.a2Items || []);
      const definition = definitions.find(item => item.itemId === itemId && item.source === source);
      if (!definition) return res.status(400).json({ ok: false, error: 'Unknown scheduled A2 item' });
      const quarter = config.quarters[definition.quarter];
      if (today > quarter.end) return res.status(409).json({ ok: false, error: 'Quarter is closed' });
      if (source === 'try-it') {
        const cutoff = lessonSchedule?.[definition.lessonKey]?.topicAssessmentDate;
        if (cutoff && today > cutoff) return res.status(409).json({ ok: false, error: 'Try-It rescore window is closed' });
      }
    }
    const limits = { 'try-it': 2, 'topic-assessment': 100, 'lesson-check': 10, flashcard: 100 };
    if (source in limits && (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > limits[source]
      || source === 'try-it' && !Number.isInteger(score))) {
      return res.status(400).json({ ok: false, error: 'Invalid A2 score' });
    }

    const studentIsAuthoritative = source === 'frq' && authoritativeForStudent(
      frqMode,
      studentId,
      process.env.FRQ_CANARY_STUDENTS,
    );
    if (studentIsAuthoritative) {
      if (!allowFrqRecord(studentId)) {
        return res.status(429).json({ error: 'rate limit exceeded', retryable: true });
      }
      if (!frqBundle) {
        return res.status(503).json({ ok: false, error: 'FRQ grading unavailable' });
      }
      if (!lookupFrqItem(frqBundle, itemId)) {
        return res.status(400).json({ error: 'unknown item' });
      }
      if (attempt !== undefined && attempt !== 1) {
        return res.status(400).json({ error: 'attempt must be 1' });
      }

      const canonicalResponse = String(response).trim();
      if (Buffer.byteLength(canonicalResponse, 'utf8') > FRQ_RESPONSE_MAX_BYTES) {
        return res.status(400).json({ error: 'response too large' });
      }
      if (!frqDb || typeof frqDb.recordFrqDraft !== 'function') {
        return res.status(503).json({ ok: false, error: 'FRQ grading unavailable' });
      }

      const responseHash = createHash('sha256').update(canonicalResponse, 'utf8').digest('hex');
      const hasLegacyScore = typeof score === 'number' && Number.isFinite(score);
      const readyDelayMs = requestGrade === true || hasLegacyScore ? 2_000 : 20_000;
      let draftResult;
      try {
        draftResult = await frqDb.recordFrqDraft({
          studentId,
          itemId,
          response: canonicalResponse,
          responseHash,
          readyAt: new Date(Date.now() + readyDelayMs).toISOString(),
        });
      } catch (error) {
        console.error('FRQ draft RPC error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }

      if (draftResult && draftResult.degraded) {
        if (!frqMigrationDegradedLogged) {
          frqMigrationDegradedLogged = true;
          console.warn('[frq] grading storage unavailable; authoritative writes are retryable');
        }
        return res.status(503).json({ error: 'grading storage unavailable', retryable: true });
      }
      if (draftResult && draftResult.error) {
        console.error('FRQ draft RPC error:', draftResult.error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      const ticket = rpcFirst(draftResult);
      if (!ticket) return res.status(500).json({ ok: false, error: 'Database error' });
      return res.json({
        ok: true,
        applied: false,
        ledgerId: ticket.ledger_id ?? ticket.ledgerId,
        status: ticket.status,
        responseVersion: Number(ticket.response_version ?? ticket.responseVersion),
        clientScoreIgnored: true,
      });
    }

    const keyedWorksheetAnswer = source === 'worksheet' ? findWorksheetAnswer(worksheetKey, itemId) : undefined;
    let effectiveScore = keyedWorksheetAnswer === undefined
      ? score
      : scoreWorksheetAnswer(keyedWorksheetAnswer, response);
    let gradingProvenance = source === 'worksheet' ? 'self' : undefined;
    if (keyedWorksheetAnswer !== undefined) gradingProvenance = 'key';

    if (requiresReviewGrant(source)) {
      const payload = verifyReviewGrant(grant);
      const validGrant = payload
        && payload.t === 'review-grant'
        && payload.sid === studentId
        && payload.item === itemId
        && Number(payload.exp) > Date.now()
        && validGrantCredit(payload.credit);

      if (!validGrant) {
        return res.status(400).json({ ok: false, error: 'review grant required' });
      }

      effectiveScore = payload.credit;
    }

    // FRQ durable floor (2026-08-19). Worksheet reflections are written by three
    // client paths: DRAFT saves (score undefined) while typing, GRADED writes
    // (E/P/I → 1/0.5/0) from the AI pass, and appeals. The upsert key is
    // (student, source, item, attempt), so a draft after a grade used to NULL the
    // stored score, and a later weaker regrade could lower it. Every client path
    // already promises "never downgrade" in memory; this makes it durable:
    //   - a null/undefined incoming score never replaces a stored number
    //     (the response text still updates — drafts keep flowing);
    //   - a lower incoming score never replaces a higher stored one.
    // Grade math is untouched (this only decides what the row holds).
    if (['frq', 'lesson-check', 'topic-assessment', 'flashcard'].includes(source) && typeof db.getLedgerByStudent === 'function') {
      try {
        const attemptNo = attempt ?? 1;
        const { data: rows } = await db.getLedgerByStudent(studentId, { prefix: itemId });
        const existing = Array.isArray(rows)
          ? rows.find((r) => r && r.item_id === itemId && r.source === source && Number(r.attempt ?? 1) === Number(attemptNo))
          : null;
        const stored = existing && existing.score !== null && existing.score !== undefined ? Number(existing.score) : null;
        if (stored !== null && Number.isFinite(stored)) {
          const incoming = (effectiveScore === null || effectiveScore === undefined || effectiveScore === '') ? null : Number(effectiveScore);
          if (incoming === null || !Number.isFinite(incoming) || incoming < stored) {
            effectiveScore = stored;   // floor holds; the response text is still refreshed
          }
        }
      } catch (_) { /* best-effort: a read failure must never block the write */ }
    }

    // Derive evidence_tier server-side (decision L-C).
    // Any client-supplied evidenceTier in the body is IGNORED.
    const proctorSecret = process.env.ROSTER_PROCTOR_SECRET;
    const providedProctor = req.headers['x-proctor-secret'];
    const evidenceTier = (proctorSecret && providedProctor === proctorSecret)
      ? 'proctored'
      : 'practice';

    const { data, error } = await db.insertLedgerRow({
      studentId,
      source,
      itemId,
      unit,
      topic,
      skill,
      response,
      score: effectiveScore,
      evidenceTier,
      attempt: attempt ?? 1
    });

    if (error) {
      if (isSourceNotProvisioned(error)) {
        return res.status(503).json({ ok: false, error: `source '${source}' not provisioned (run the latest item_ledger migration)` });
      }
      console.error('Ledger insert error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    // A database trigger may preserve a higher score during a concurrent retry.
    if (data.score != null) effectiveScore = Number(data.score);
    const body = {
      ok: true,
      ledgerId:     data.ledger_id,
      evidenceTier: data.evidence_tier
    };
    const username = await resolveReceiptUsername(resolveUsername, studentId);
    const receipt = issueLedgerReceipt({
      studentId,
      username,
      source,
      itemId,
      score: effectiveScore,
      attempt: attempt ?? 1,
      evidenceTier: data.evidence_tier,
      response,
      gradingProvenance
    });
    if (receipt) body.receipt = receipt;
    if (receipt && data.ledger_id && db && typeof db.updateLedgerReceipt === 'function') {
      try {
        const persistResult = await db.updateLedgerReceipt(data.ledger_id, {
          receiptId: receipt.receiptId,
          receiptCompact: receipt.compact
        });
        if (persistResult && persistResult.error) {
          handleReceiptPersistenceError(persistResult.error, data.ledger_id);
        }
      } catch (err) {
        handleReceiptPersistenceError(err, data.ledger_id);
      }
    }

    return res.json(body);
  });

  // ── GET /ledger/frq-config ────────────────────────────────────────────────
  app.get('/ledger/frq-config', (req, res) => {
    const studentId = bearerStudentId(req, verifyToken);
    if (!studentId) return res.status(401).json({ ok: false, error: 'forbidden' });
    if (!allowFrqRead(studentId)) {
      return res.status(429).json({ error: 'rate limit exceeded', retryable: true });
    }
    const mode = resolveFrqMode(frqMode);
    return res.json({
      mode,
      bundleVersion: frqBundleVersion(frqBundle),
      pollMs: 2_000,
      authoritative: authoritativeForStudent(mode, studentId, process.env.FRQ_CANARY_STUDENTS),
    });
  });

  // ── GET /ledger/frq-status ────────────────────────────────────────────────
  app.get('/ledger/frq-status', async (req, res) => {
    const studentId = bearerStudentId(req, verifyToken);
    if (!studentId) return res.status(401).json({ ok: false, error: 'forbidden' });
    if (!allowFrqRead(studentId)) {
      return res.status(429).json({ error: 'rate limit exceeded', retryable: true });
    }
    const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : '';
    const worksheet = frqBundle && frqBundle.worksheets && frqBundle.worksheets[prefix];
    if (!worksheet) return res.status(400).json({ error: 'unknown worksheet' });
    if (!frqDb || typeof frqDb.getFrqStatusRows !== 'function') {
      return res.status(503).json({ ok: false, error: 'FRQ grading unavailable' });
    }

    const itemIds = Object.keys(worksheet.items || {}).map((id) => `${prefix}-${id}`);
    let result;
    try {
      result = await frqDb.getFrqStatusRows(studentId, itemIds);
    } catch (error) {
      console.error('FRQ status DB error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    if (result && result.degraded) {
      return res.status(503).json({ ok: false, error: 'FRQ grading unavailable' });
    }
    if (result && result.error) {
      console.error('FRQ status DB error:', result.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    const rows = (Array.isArray(result && result.data) ? result.data : [])
      .filter((row) => !row.student_id || row.student_id === studentId);
    const now = Date.now();
    const pendingCount = rows.filter((row) => deriveFrqStatus(row, now) !== 'graded').length;
    const items = {};
    for (const row of rows) {
      if (!itemIds.includes(row.item_id)) continue;
      const status = deriveFrqStatus(row, now);
      let responseHash = row.frq_response_hash || null;
      if (status === 'graded' && !responseHash) {
        // Migration 0031 left pre-Phase-2 graded rows without hashes. Derive the
        // ingress-canonical hash here, but do not backfill it: a GET must not mutate.
        responseHash = createHash('sha256')
          .update(String(row.response).trim(), 'utf8')
          .digest('hex');
      }
      const item = {
        status,
        score: isNumericFrqScore(row.score) ? Number(row.score) : null,
        responseHash,
        appealCount: Number(row.frq_appeal_count ?? 0),
        appealLimit: FRQ_APPEAL_LIMIT,
        lastAppeal: row.frq_last_appeal
          && typeof row.frq_last_appeal.text === 'string'
          && typeof row.frq_last_appeal.at === 'string'
          && ['raised', 'maintained'].includes(row.frq_last_appeal.outcome)
          ? {
              text: row.frq_last_appeal.text,
              at: row.frq_last_appeal.at,
              outcome: row.frq_last_appeal.outcome,
            }
          : null,
        retryAt: status === 'failed' ? null : (row.frq_next_attempt_at || null),
        estimatedWaitMs: status === 'graded' ? 0 : pendingCount * 3_000,
      };
      if (isNumericFrqScore(row.score)) {
        item.result = sanitizedFrqResult(row.frq_result);
        item.gradedAt = row.graded_at || null;
        item.rubricVersion = row.frq_rubric_version || null;
        item.receiptId = row.receipt_id || null;
        item.receiptCompact = row.receipt_compact || null;
        item.receipt = row.receipt_id && row.receipt_compact
          ? { receiptId: row.receipt_id, compact: row.receipt_compact }
          : null;
      }
      items[row.item_id] = item;
    }
    return res.json({
      ok: true,
      mode: resolveFrqMode(frqMode),
      bundleVersion: frqBundleVersion(frqBundle),
      items,
    });
  });

  // ── POST /ledger/frq-appeal ───────────────────────────────────────────────
  app.post('/ledger/frq-appeal', async (req, res) => {
    const studentId = bearerStudentId(req, verifyToken);
    if (!studentId) return res.status(401).json({ ok: false, error: 'forbidden' });
    if (!authoritativeForStudent(frqMode, studentId, process.env.FRQ_CANARY_STUDENTS)) {
      return res.status(409).json({ error: 'appeals not enabled' });
    }
    if (!allowFrqAppeal(studentId)) {
      return res.status(429).json({ error: 'rate limit exceeded', retryable: true });
    }
    const { itemId } = req.body || {};
    if (typeof req.body?.appealText !== 'string') {
      return res.status(400).json({ error: 'appealText must be a string' });
    }
    if (req.body?.revisedText !== undefined && typeof req.body.revisedText !== 'string') {
      return res.status(400).json({ error: 'revisedText must be a string' });
    }
    const appealText = req.body.appealText.trim();
    const revisedText = typeof req.body.revisedText === 'string'
      ? req.body.revisedText.trim()
      : null;
    if (!lookupFrqItem(frqBundle, itemId)) {
      return res.status(400).json({ error: 'unknown item' });
    }
    if ([...appealText].length < 10 || Buffer.byteLength(appealText, 'utf8') > APPEAL_MAX_BYTES) {
      return res.status(400).json({ error: 'appealText must be at least 10 characters and at most 2048 bytes' });
    }
    if (revisedText !== null && Buffer.byteLength(revisedText, 'utf8') > FRQ_RESPONSE_MAX_BYTES) {
      return res.status(400).json({ error: 'revisedText must be at most 8192 bytes' });
    }
    if (!frqDb || typeof frqDb.queueFrqAppeal !== 'function') {
      return res.status(503).json({ ok: false, error: 'FRQ grading unavailable' });
    }

    let queuedRevisedText = revisedText;
    if (revisedText !== null) {
      if (typeof frqDb.getFrqStatusRows !== 'function') {
        return res.status(503).json({ ok: false, error: 'FRQ grading unavailable' });
      }
      let statusResult;
      try {
        statusResult = await frqDb.getFrqStatusRows(studentId, [itemId]);
      } catch (error) {
        console.error('FRQ revised appeal lookup error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      if (statusResult && statusResult.degraded) {
        return res.status(503).json({ ok: false, error: 'FRQ grading unavailable' });
      }
      if (statusResult && statusResult.error) {
        console.error('FRQ revised appeal lookup error:', statusResult.error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      const storedRow = Array.isArray(statusResult?.data) ? statusResult.data[0] : null;
      if (storedRow) {
        const storedHash = storedRow.frq_response_hash || createHash('sha256')
          .update(String(storedRow.response).trim(), 'utf8')
          .digest('hex');
        const revisedHash = createHash('sha256').update(revisedText, 'utf8').digest('hex');
        if (revisedHash === String(storedHash).toLowerCase()) queuedRevisedText = null;
      }
    }

    let result;
    try {
      result = await frqDb.queueFrqAppeal({
        studentId,
        itemId,
        appealText,
        revisedText: queuedRevisedText,
      });
    } catch (error) {
      console.error('FRQ appeal DB error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    if (result && result.degraded) {
      return res.status(503).json({ ok: false, error: 'FRQ grading unavailable' });
    }
    if (result && result.error) {
      console.error('FRQ appeal DB error:', result.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    const queued = rpcFirst(result);
    if (!queued) return res.status(500).json({ ok: false, error: 'Database error' });
    const appealCount = Number(queued.appeal_count ?? queued.appealCount ?? 0);
    if (queued.queued) return res.json({ ok: true, queued: true, appealCount });
    const reason = queued.reason || 'rejected';
    if (reason === 'not_found') return res.status(404).json({ ok: false, error: reason, appealCount });
    if (reason === 'limit' || reason === 'cooldown') {
      return res.status(429).json({ ok: false, error: reason, appealCount });
    }
    return res.status(409).json({ ok: false, error: reason, appealCount });
  });

  // ── POST /ledger/frq-regrade (teacher-gated) ───────────────────────────────
  // FRQ COVERAGE (2026-08-19): apply an AI/teacher verdict to an EXISTING
  // worksheet-reflection row that was left ungraded (score null) or graded low —
  // the server-side half of "every answered reflection gets graded" that does not
  // depend on the student's browser ever reloading. Body:
  //   { studentId, itemId, score (1 | 0.5 | 0), attempt? = 1, provenance? }
  // Rules: the row MUST already exist for (student, 'frq', item, attempt) — this
  // route never creates rows and never changes response text; the FRQ floor
  // applies (a lower score never replaces a higher one). Same receipt path as a
  // normal write. Auth: x-teacher-secret or a teacher-role token.
  //   → 200 { ok:true, applied:true|false, ledgerId, score }   applied=false when the floor held
  //   → 400 bad body · 401 · 404 no such frq row
  app.post('/ledger/frq-regrade', async (req, res) => {
    if (!await requireTeacher(req, rosterDb)) return res.status(401).json({ ok: false, error: 'forbidden' });
    const {
      studentId,
      itemId,
      score,
      attempt,
      provenance,
      responseHash,
      rubricVersion,
      feedback,
      matched,
      missing,
      suggestion,
      feedbackOnly,
    } = req.body || {};
    if (!studentId || !itemId) return res.status(400).json({ ok: false, error: 'studentId and itemId are required' });
    const incoming = Number(score);
    if (!(incoming === 1 || incoming === 0.5 || incoming === 0)) {
      return res.status(400).json({ ok: false, error: 'score must be 1, 0.5 or 0' });
    }
    // 2026-09-09: the hourly batch grader used to send the verdict WITHOUT its feedback, so a
    // student whose saved answers were graded overnight saw a lower grade and no reason. Keep
    // the grader's feedback (capped like sanitizedFrqResult) and label the provider honestly.
    const feedbackText = typeof feedback === 'string' ? feedback.trim().slice(0, 2_048) : '';
    const elementDetails = sanitizedFrqResult({ matched, missing, suggestion });
    const providerLabel = provenance === 'teacher' ? 'teacher' : 'ai-batch';   // same default as the receipt's gradingProvenance
    const attemptNo = attempt ?? 1;

    // Both modes use the same feedback-only write, bypassing every score and
    // receipt path. The conditional update also protects concurrent grading.
    if (feedbackOnly === true) {
      if (!responseHash || !rubricVersion || !Array.isArray(missing)) {
        return res.status(400).json({ ok: false, error: 'responseHash, rubricVersion and missing are required' });
      }
      if (typeof db.updateFrqFeedback !== 'function') {
        return res.status(503).json({ ok: false, error: 'FRQ feedback unavailable' });
      }
      try {
        const lookup = await db.getLedgerByStudent(studentId, { prefix: itemId });
        if (lookup.error) throw lookup.error;
        const existing = lookup.data?.find(row => row.item_id === itemId && row.source === 'frq'
          && Number(row.attempt ?? 1) === Number(attemptNo));
        if (!existing) return res.status(404).json({ ok: false, error: 'no such frq row' });
        if (existing.score == null) return res.status(409).json({ ok: false, error: 'ungraded-row' });
        const currentHash = createHash('sha256').update(String(existing.response).trim(), 'utf8').digest('hex');
        if (currentHash !== responseHash) return res.status(409).json({ error: 'stale-response' });
        if (Array.isArray(existing.frq_result?.missing)) {
          return res.json({ ok: true, applied: false, ledgerId: existing.ledger_id, score: existing.score });
        }
        const result = {
          score: existing.score,
          responseHash,
          provider: 'ai-backfill',
          model: 'external-regrade',
          ...(feedbackText ? { feedback: feedbackText } : {}),
          ...elementDetails,
        };
        const saved = await db.updateFrqFeedback(existing, result);
        if (saved.error) throw saved.error;
        if (!saved.data?.length) return res.status(409).json({ error: 'stale-response' });
        return res.json({ ok: true, applied: true, ledgerId: existing.ledger_id, score: saved.data[0].score });
      } catch (error) {
        console.error('Ledger FRQ feedback backfill error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
    }

    if (authoritativeForStudent(
      frqMode,
      studentId,
      process.env.FRQ_CANARY_STUDENTS,
    )) {
      if (!responseHash || !rubricVersion) {
        return res.status(400).json({ ok: false, error: 'responseHash and rubricVersion are required' });
      }
      if (!frqDb || typeof frqDb.applyFrqVerdict !== 'function'
        || typeof frqDb.getFrqStatusRows !== 'function') {
        return res.status(503).json({ ok: false, error: 'FRQ grading unavailable' });
      }

      let existingResult;
      try {
        existingResult = await frqDb.getFrqStatusRows(studentId, [itemId]);
      } catch (error) {
        console.error('Ledger frq-regrade lookup error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      if (existingResult && existingResult.degraded) {
        return res.status(503).json({ ok: false, error: 'FRQ grading unavailable' });
      }
      if (existingResult && existingResult.error) {
        console.error('Ledger frq-regrade lookup error:', existingResult.error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      const existingRows = Array.isArray(existingResult && existingResult.data)
        ? existingResult.data
        : [];
      const atomicExisting = existingRows.find((row) => row.item_id === itemId
        && Number(row.attempt ?? 1) === Number(attemptNo));
      if (!atomicExisting) return res.status(404).json({ ok: false, error: 'no such frq row' });

      let appliedResult;
      try {
        appliedResult = await frqDb.applyFrqVerdict({
          ledgerId: atomicExisting.ledger_id,
          claimToken: null,
          responseVersion: atomicExisting.frq_response_version,
          score: incoming,
          result: {
            score: incoming,
            responseHash: String(responseHash),
            provider: providerLabel,
            model: 'external-regrade',
            ...(feedbackText ? { feedback: feedbackText } : {}),
            ...elementDetails,
          },
          rubricVersion: String(rubricVersion),
          gradedAt: new Date().toISOString(),
          teacher: true,
        });
      } catch (error) {
        console.error('Ledger frq-regrade apply error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      if (appliedResult && appliedResult.degraded) {
        return res.status(503).json({ ok: false, error: 'FRQ grading unavailable' });
      }
      if (appliedResult && appliedResult.error) {
        console.error('Ledger frq-regrade apply error:', appliedResult.error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      const outcome = rpcFirst(appliedResult);
      if (!outcome) return res.status(500).json({ ok: false, error: 'Database error' });
      if (outcome.stale) return res.status(409).json({ error: 'stale-response' });

      const body = {
        ok: true,
        applied: Boolean(outcome.applied),
        ledgerId: outcome.ledger_id || atomicExisting.ledger_id,
        score: Number(outcome.score),
      };
      if (outcome.applied) {
        const receipt = await persistFrqReceipt(
          atomicExisting,
          Number(outcome.score),
          provenance ? String(provenance).slice(0, 32) : 'ai-batch',
        );
        if (receipt) body.receipt = receipt;
      }
      return res.json(body);
    }

    let existing = null;
    try {
      const { data: rows } = await db.getLedgerByStudent(studentId, { prefix: itemId });
      existing = Array.isArray(rows)
        ? rows.find((r) => r && r.item_id === itemId && r.source === 'frq' && Number(r.attempt ?? 1) === Number(attemptNo))
        : null;
    } catch (_) { existing = null; }
    if (!existing) return res.status(404).json({ ok: false, error: 'no such frq row' });
    const stored = (existing.score === null || existing.score === undefined) ? null : Number(existing.score);
    if (stored !== null && Number.isFinite(stored) && incoming <= stored) {
      return res.json({ ok: true, applied: false, ledgerId: existing.ledger_id, score: stored });
    }
    const { data, error } = await db.insertLedgerRow({
      studentId,
      source: 'frq',
      itemId,
      unit: existing.unit,
      topic: existing.topic,
      skill: existing.skill,
      response: existing.response,
      score: incoming,
      evidenceTier: existing.evidence_tier || 'practice',
      attempt: attemptNo,
      // 2026-09-09: the legacy path keeps the verdict + feedback too (same shape as the
      // authoritative result) so a non-canary student's worksheet can explain the grade.
      frqResult: {
        score: incoming,
        provider: providerLabel,
        model: 'external-regrade',
        ...(responseHash ? { responseHash: String(responseHash) } : {}),
        ...(feedbackText ? { feedback: feedbackText } : {}),
        ...elementDetails,
      },
      gradedAt: new Date().toISOString()
    });
    if (error) {
      console.error('Ledger frq-regrade error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const body = { ok: true, applied: true, ledgerId: data.ledger_id, score: incoming };
    const username = await resolveReceiptUsername(resolveUsername, studentId);
    const receipt = issueLedgerReceipt({
      studentId, username, source: 'frq', itemId, score: incoming, attempt: attemptNo,
      evidenceTier: data.evidence_tier, response: existing.response,
      gradingProvenance: provenance ? String(provenance).slice(0, 32) : 'ai-batch'
    });
    if (receipt) body.receipt = receipt;
    if (receipt && data.ledger_id && db && typeof db.updateLedgerReceipt === 'function') {
      try {
        const persistResult = await db.updateLedgerReceipt(data.ledger_id, { receiptId: receipt.receiptId, receiptCompact: receipt.compact });
        if (persistResult && persistResult.error) handleReceiptPersistenceError(persistResult.error, data.ledger_id);
      } catch (err) { handleReceiptPersistenceError(err, data.ledger_id); }
    }
    return res.json(body);
  });

  // ── GET /ledger/student/:studentId ──────────────────────────────────────────
  // PERSISTENT_ANSWERS_BUILD.md §3 extension:
  //   Query: prefix (optional) — strict prefix filter on item_id. Rejects any
  //          non-[A-Za-z0-9-] characters with 400. Underscore is excluded too:
  //          Supabase .like() treats _ as a single-char wildcard, so allowing it
  //          would silently widen the filter. Real item_ids only use [A-Za-z0-9-].
  //
  //   Auth (ANY):
  //     - Header  x-teacher-secret == process.env.ROSTER_TEACHER_SECRET, OR
  //     - Header  Authorization: Bearer <token> OR query ?token=<token>
  //               AND verifyToken(token) === :studentId (self-read), OR
  //     - A token whose sid != :studentId but whose role === 'teacher'
  //               (teacher view-as: read any student's ledger read-only).
  //
  //   Auth precedence: teacher secret beats token. If teacher header is absent
  //   AND a token is present but verifyToken(token) !== :studentId AND the token
  //   is NOT a teacher → 403 (clearer signal than 401 for cross-student attempts).
  //
  //   → 200 { ok:true, rows:[ item_ledger rows ] }   newest first
  //   → 400 { ok:false, error:'bad prefix' }          invalid prefix chars
  //   → 401 { ok:false, error:'forbidden' }           no valid auth
  //   → 403 { ok:false, error:'cross-student' }       token sid != :studentId
  //   → 500 { ok:false, error:'Database error' }
  app.get('/ledger/student/:studentId', async (req, res) => {
    const { studentId } = req.params;

    // ── Auth resolution ────────────────────────────────────────────────────
    const teacherOk = await requireTeacher(req, rosterDb);

    // Extract token from Authorization: Bearer <t> OR ?token=<t>.
    let token = null;
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
      token = authHeader.replace(/^Bearer\s+/i, '').trim() || null;
    }
    if (!token && typeof req.query.token === 'string' && req.query.token) {
      token = req.query.token;
    }

    if (!teacherOk) {
      if (!token) {
        return res.status(401).json({ ok: false, error: 'forbidden' });
      }
      const tokenSid = verifyToken(token);
      if (!tokenSid) {
        return res.status(401).json({ ok: false, error: 'forbidden' });
      }
      if (tokenSid !== studentId) {
        // A verified teacher may read ANY student's ledger — this powers the
        // read-only "view as student" worksheet (a teacher's own token, the
        // target student's :studentId). Role lookup goes through the ROSTER db
        // (rosterDb), not the ledger db, and degrades to 'student' on any error
        // or when rosterDb isn't wired, so a DB hiccup never widens access.
        // Anyone else reading a different student is a genuine cross-student
        // attempt.
        let role = 'student';
        try {
          if (rosterDb && typeof rosterDb.getRoleByStudentId === 'function') {
            role = await rosterDb.getRoleByStudentId(tokenSid);
          }
        } catch (_) {
          role = 'student';
        }
        if (role !== 'teacher') {
          return res.status(403).json({ ok: false, error: 'cross-student' });
        }
      }
    }

    // ── Optional prefix sanitization ───────────────────────────────────────
    const prefixRaw = req.query.prefix;
    let prefix;
    if (prefixRaw !== undefined && prefixRaw !== null && prefixRaw !== '') {
      if (typeof prefixRaw !== 'string' || !/^[A-Za-z0-9\-]+$/.test(prefixRaw)) {
        return res.status(400).json({ ok: false, error: 'bad prefix' });
      }
      prefix = prefixRaw;
    }

    const { data, error } = await db.getLedgerByStudent(studentId, prefix ? { prefix } : undefined);

    if (error) {
      console.error('Ledger fetch error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    const rows = data || [];
    // Nightly Review augment (NIGHTLY_REVIEW_SPEC.md §4): attach each row's review state
    // (LEFT JOIN review_marks by ledger_id) so the student's "My Ledger" can render the
    // "👁 seen / 💬 comment" badges. Best-effort + degrades silently pre-migration-0025:
    // a missing table / DB hiccup just leaves rows without a `review` field.
    if (rosterDb && typeof rosterDb.listReviewMarksByStudent === 'function') {
      try {
        const mr = await rosterDb.listReviewMarksByStudent(studentId);
        if (mr && !mr.error && Array.isArray(mr.data)) {
          const byLedger = {};
          for (const m of mr.data) byLedger[m.ledger_id] = m;
          for (const row of rows) {
            const mark = byLedger[row.ledger_id];
            row.review = mark
              ? { seenAt: mark.seen_at, teacher: mark.teacher_username, comment: mark.comment ?? null }
              : null;
          }
        }
      } catch (_) { /* pre-migration / DB hiccup → no review field, students still see their work */ }
    }

    return res.json({ ok: true, rows });
  });
}
