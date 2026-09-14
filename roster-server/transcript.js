import crypto from 'node:crypto';
import { PHASE3_CONFIG, quarterOfDate } from './grade-config.js';
import { computeGrade, resolveBlooketLists } from './grade.js';
import { todayInTz } from './lesson-grade.js';
import { answerKeyMapOrNull, stableLedgerSort } from './scoring.js';
import { codeHash } from './code-hash.js';
import { canonicalizeTranscript, hashTranscriptGradeProjection } from './transcript-canonical.js';
import { issueTranscriptReceipt } from './receipts.js';
import { backfillStudentReceipts } from './backfill.js';

function extractToken(req) {
  const authHeader =
    typeof req.headers['authorization'] === 'string' ? req.headers['authorization'] : '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const q = req.query?.token;
  if (typeof q === 'string' && q.trim()) return q;
  return null;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Hash the grade artifacts computeGrade actually used.
 * Blooket lists are resolved via resolveBlooketLists (same as computeGrade) so a
 * legacy single blooketLessons mount cannot hash a different required denom.
 * Exported for the auditable invariance harness (real path, not a copy).
 */
export function artifactHash({ answerKeyDoc, lessonSchedule, blooketLessons, blooketPresence, blooketRequired }) {
  const lists = resolveBlooketLists({ blooketLessons, blooketPresence, blooketRequired });
  const parts = [
    sha256Hex(canonicalizeTranscript(answerKeyDoc || {})),
    sha256Hex(canonicalizeTranscript(lessonSchedule || {})),
    sha256Hex(canonicalizeTranscript({ p: lists.blooketPresence, r: lists.blooketRequired })),
  ];
  return sha256Hex(parts.sort().join(''));
}

function receiptRoot(members) {
  const ids = members.map((member) => member.id);
  const cnt = ids.length;
  if (new Set(ids).size !== cnt) return null;
  return sha256Hex(ids.sort().join('\n'));
}

async function resolveRoster(db, sid) {
  if (!db || typeof db.findByStudentId !== 'function') return { username: undefined, section: null };
  try {
    const { data } = await db.findByStudentId(sid);
    return {
      username: data && data.login_username ? data.login_username : undefined,
      section: data && data.section ? data.section : null
    };
  } catch (_) {
    return { username: undefined, section: null };
  }
}

function currentQuarter(asOfDateNY, config) {
  const byDate = quarterOfDate(asOfDateNY, config);
  if (byDate) return byDate;
  return Object.keys(config.quarters || {})[0] || 'Q1';
}

function oneDpFloat(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

export function mountTranscript(app, {
  verifyToken,
  ledgerDb,
  loadAnswerKey,
  lessonSchedule,
  eventSchedule = null,
  db,
  config = PHASE3_CONFIG,
  worksheetBlankCounts = null,
  blooketLessons = null,
  blooketPresence = null,
  blooketRequired = null,
}) {
  // Resolve once at mount — same effective lists for computeGrade + artHash.
  const _lists = resolveBlooketLists({ blooketLessons, blooketPresence, blooketRequired });
  app.get('/transcript', async (req, res) => {
    const rawToken = extractToken(req);
    if (!rawToken) return res.status(401).json({ ok: false, error: 'Token required' });

    const sid = verifyToken(rawToken);
    if (!sid) return res.status(401).json({ ok: false, error: 'Invalid or expired token' });

    try {
      const roster = await resolveRoster(db, sid);
      const ledgerResult = await ledgerDb.getLedgerByStudent(sid);
      if (ledgerResult && ledgerResult.error) {
        console.error('GET /transcript ledger error:', ledgerResult.error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }

      const rows = stableLedgerSort(ledgerResult && Array.isArray(ledgerResult.data) ? ledgerResult.data : []);
      await backfillStudentReceipts(rows, ledgerDb, roster.username);

      const members = rows
        .filter((row) => row.receipt_id && row.receipt_compact)
        .map((row) => ({ id: row.receipt_id, compact: row.receipt_compact }));
      const root = receiptRoot(members);
      if (!root) return res.status(409).json({ ok: false, error: 'Duplicate receipt ids' });

      const answerKeyDoc = await loadAnswerKey();
      const answerKey = answerKeyMapOrNull(answerKeyDoc);
      if (!answerKey) return res.status(500).json({ ok: false, error: 'Answer key malformed' });

      const asOf = Date.now();
      const schoolTz = (config && config.schoolTz) || 'America/New_York';
      const asOfDateNY = todayInTz(schoolTz, asOf);
      const grade = computeGrade(rows, answerKey, config, {
        asOf,
        lessonSchedule,
        eventSchedule,
        section: roster.section,
        worksheetBlankCounts,
        blooketPresence: _lists.blooketPresence,
        blooketRequired: _lists.blooketRequired,
      });

      const gq = currentQuarter(asOfDateNY, config);
      const g = oneDpFloat(grade.quarters && grade.quarters[gq] && grade.quarters[gq].quarterGrade);
      const resolvedConfig = { ...config };
      const manifest = issueTranscriptReceipt({
        sid,
        u: roster.username,
        asOf,
        asOfDateNY,
        cnt: members.length,
        root,
        g,
        gq,
        gradeHash: hashTranscriptGradeProjection(grade),
        cfgHash: sha256Hex(canonicalizeTranscript(resolvedConfig)),
        artHash: artifactHash({
          answerKeyDoc,
          lessonSchedule,
          blooketPresence: _lists.blooketPresence,
          blooketRequired: _lists.blooketRequired,
        }),
        codeHash: codeHash()
      });

      return res.json({
        ok: true,
        transcript: {
          format: 'ap-stats-sealed-transcript',
          schema: 1,
          verifyUrl: 'https://robjohncolson.github.io/curriculum_render/verify.html',
          sid,
          u: roster.username,
          issuedAt: asOf,
          grade: g,
          quarter: gq,
          count: members.length,
          manifest: manifest ? manifest.compact : null,
          receipts: members.map((member) => member.compact),
          breakdown: grade,
          config: resolvedConfig
        }
      });
    } catch (err) {
      console.error('GET /transcript error:', err);
      return res.status(500).json({ ok: false, error: 'Transcript unavailable' });
    }
  });
}
