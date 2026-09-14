

import crypto from 'crypto';
import { requireTeacher } from './teacher-auth.js';
import { verifyToken } from './token.js';
import { issueReviewReceipt, receiptInternals } from './receipts.js';
import { todayInTz } from './lesson-grade.js';
import { computeGrade } from './grade.js';
import { answerKeyMapOrNull, unitOf } from './scoring.js';
import { computeMisconceptions } from './misconceptions.js';
import { loadMisconceptionAssets } from './misconception-assets.js';

const SESSION_GAP_MS = 25 * 60 * 1000;   // > 25 min idle starts a new session burst (mirrors commits.js)
const N_DAYS_FLAG = 5;                    // "not reviewed in N school days" flag (spec §13 default)
const COMMENT_MAX = 500;                  // stored comment cap
const NUDGE_MAX = 280;                    // teacher→student message cap (mirrors nudge.js)
const MAX_ITEMS_PER_STUDENT = 80;         // cap the queue's per-student ITEM PAYLOAD (counts are never capped)
const MAX_TARGETS = 500;                  // cap one mark request (v2: truncation is reported, not silent)
const DEFAULT_WINDOW_DAYS = 14;           // v2 §0.7: ONE default window for badge + both views (?days=all → full history)

// Migration 0025 not run yet → tables/fn absent. 42P01 undefined_table, 42883 undefined_function,
// PGRST205 schema-cache miss (table), PGRST202 function-not-found.
function isReviewMissing(e) {
  if (!e) return false;
  const code = String(e.code || '');
  const msg = String(e.message || '').toLowerCase();
  if (['42P01', '42883', 'PGRST205', 'PGRST202'].includes(code)) return true;
  return msg.includes('review_marks')
    && (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('could not find'));
}
function notProvisioned(res) {
  return res.status(503).json({ ok: false, error: 'nightly review not provisioned (run migration 0025)' });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractToken(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'];
  if (typeof h === 'string' && /^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, '').trim() || null;
  if (req.query && typeof req.query.token === 'string' && req.query.token) return req.query.token;
  return null;
}

// Per-item review priority (spec §5): human-eyes-needed work floats up.
//   FRQ / free-response > low scores / appeals > proctored > auto-graded MC/worksheet.
export function itemPriority(row) {
  const src = String(row.source || '');
  const score = (row.score === null || row.score === undefined) ? null : Number(row.score);
  // 1. Free-response / self- or AI-graded — needs real human eyes.
  if (src === 'frq' || src === 'ai' || src === 'ai-graded' || src === 'self-graded' || src === 'reflection') return 100;
  // 2. Appeals / exceptions, then low scores.
  if (src === 'quiz_review' || src === 'quiz_exception') return 90;
  if (score !== null && Number.isFinite(score) && score < 0.5) return 80;
  // 3. Proctored over practice.
  if (row.evidence_tier === 'proctored') return 60;
  // 4. Everything else (auto-graded MC/worksheet) — fine to bulk "mark all seen".
  return 10;
}

// A short, safe preview of the student's response for the queue row.
export function responseSnippet(response) {
  if (response === null || response === undefined) return '';
  let s;
  if (typeof response === 'string') s = response;
  else if (typeof response === 'number' || typeof response === 'boolean') s = String(response);
  else { try { s = JSON.stringify(response); } catch (_) { s = ''; } }
  s = s.trim();
  return s.length > 140 ? s.slice(0, 140) + '…' : s;
}

// v2 §0.5: hash of the response bytes the teacher is looking at — the same recipe as the
// ledger receipt's `ah` (sha256(stringifyResponse(x)).hex.slice(0,16)), shared via
// receiptInternals so issuer and reviewer can never drift.
export function responseHash(response) {
  if (response === null || response === undefined) return null;
  try {
    const s = receiptInternals.stringifyResponse(response);
    return crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);
  } catch (_) {
    return null;
  }
}

export function aiGradedRow(row) {
  if (!row) return false;
  if (row.evidence_tier === 'proctored') return false;
  const src = String(row.source || '');
  if (src === 'quiz_review' || src === 'quiz_exception') return true;
  if (src === 'pc' && /-SG$/.test(String(row.item_id || ''))) return true;
  if (src === 'frq' && row.score !== null && row.score !== undefined) return true;
  return false;
}

// v2 §0.7: ONE window definition shared by the badge, the by-student queue, and the
// by-item view. Absent/invalid → DEFAULT_WINDOW_DAYS; 'all' → full history; else 1..365.
export function windowFloorFrom(daysQuery, nowMs = Date.now()) {
  const raw = (daysQuery === undefined || daysQuery === null) ? '' : String(daysQuery).trim();
  if (raw.toLowerCase() === 'all') return { days: null, floor: null };
  const n = Number(raw);
  const days = (raw !== '' && Number.isFinite(n) && n > 0) ? Math.min(n, 365) : DEFAULT_WINDOW_DAYS;
  return { days, floor: nowMs - days * 86400000 };
}

// Numeric equality with null-awareness (mirrors snapshot-verify's numEq semantics).
function numEq(a, b) {
  const an = (a === null || a === undefined) ? null : Number(a);
  const bn = (b === null || b === undefined) ? null : Number(b);
  if (an === null || bn === null) return an === bn;
  return Math.abs(an - bn) < 1e-9;
}

// Assign a session index to each row (rows in ANY order in → map keyed by ledger_id).
// A gap > SESSION_GAP_MS between consecutive (time-sorted) rows starts a new session.
function sessionize(rows) {
  const sorted = rows.slice().sort((a, b) => (Date.parse(a.recorded_at) || 0) - (Date.parse(b.recorded_at) || 0));
  const byId = {};
  let session = 0, lastTs = null;
  for (const r of sorted) {
    const ts = Date.parse(r.recorded_at) || 0;
    if (lastTs !== null && (ts - lastTs) > SESSION_GAP_MS) session += 1;
    byId[r.ledger_id] = session;
    lastTs = ts;
  }
  return byId;
}

// Best-effort "current grade" headline (the last quarter with a numeric grade). Never
// throws — the queue's job is the work list; a grade hiccup must not 500 it.
function currentGradeOf(ledgerRows, answerKey, config, opts) {
  try {
    if (!answerKey || typeof computeGrade !== 'function') return null;
    const computed = computeGrade(ledgerRows, answerKey, config, opts);
    const quarters = (computed && Array.isArray(computed.quarters)) ? computed.quarters : [];
    let g = null;
    for (const q of quarters) {
      if (q && typeof q.quarterGrade === 'number' && Number.isFinite(q.quarterGrade)) g = q.quarterGrade;
    }
    return g === null ? null : Math.round(g);
  } catch (_) {
    return null;
  }
}

// ── Route mounter ─────────────────────────────────────────────────────────────
export function mountReview(app, {
  db, ledgerDb, nudgesDb, loadAnswerKey, lessonSchedule, eventSchedule = null, config, worksheetBlankCounts,
  schoolTz = 'America/New_York',
  blooketPresence = null, blooketRequired = null, blooketLessons = null,
}) {
  const _presence = blooketPresence || blooketLessons || null;
  const _required = blooketRequired || null;

  // Resolve the acting teacher's login_username for the receipt `by` + the mark's
  // teacher_username + the notify sender. Bearer token → that teacher's username;
  // the x-teacher-secret break-glass path → the single roster teacher; else 'teacher'.
  async function resolveTeacherUsername(req) {
    const token = extractToken(req);
    if (token) {
      try {
        const sid = verifyToken(token);
        if (sid) {
          const r = await db.findByStudentId(sid);
          if (r && r.data && r.data.login_username) return r.data.login_username;
        }
      } catch (_) { /* fall through */ }
    }
    try {
      const t = await db.findTeacherUsername();
      if (t && t.data && t.data.login_username) return t.data.login_username;
    } catch (_) { /* fall through */ }
    return 'teacher';
  }

  // ── GET /class/review-queue?section=&days= ──────────────────────────────────
  app.get('/class/review-queue', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    const section = (req.query.section && String(req.query.section).trim()) || null;
    const { days, floor: windowFloor } = windowFloorFrom(req.query.days);

    let rosterRes;
    try { rosterRes = await db.listRoster(section); } catch (e) { rosterRes = { error: e }; }
    if (rosterRes && rosterRes.error) {
      console.error('GET /class/review-queue roster error:', rosterRes.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const rosterRows = (Array.isArray(rosterRes.data) ? rosterRes.data : [])
      .filter((r) => r && r.student_id && r.role !== 'teacher');
    const studentIds = rosterRows.map((r) => r.student_id);

    const marksRes = await db.listReviewMarksByStudents(studentIds);
    if (marksRes && marksRes.error) {
      if (isReviewMissing(marksRes.error)) return notProvisioned(res);
      console.error('GET /class/review-queue marks error:', marksRes.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const markByLedger = Object.create(null);
    for (const m of (marksRes.data || [])) markByLedger[m.ledger_id] = m;

    // Optional grade context (best-effort; never blocks the queue).
    let answerKey = null;
    if (typeof loadAnswerKey === 'function') {
      try { answerKey = answerKeyMapOrNull(await loadAnswerKey()); } catch (_) { answerKey = null; }
    }
    const todayStr = todayInTz(schoolTz);

    const students = [];
    let unseenTotal = 0;
    for (const r of rosterRows) {
      const sid = r.student_id;
      let rows = [];
      try { const lr = await ledgerDb.getLedgerByStudent(sid); rows = (lr && lr.data) || []; } catch (_) { rows = []; }

      const sessionByLedger = sessionize(rows);
      // Window filter (fixed lookback) — newest first (getLedgerByStudent already sorts desc).
      const windowed = windowFloor
        ? rows.filter((row) => (Date.parse(row.recorded_at) || 0) >= windowFloor)
        : rows;

      // v2 §0.7: unseen counts (and the priority inputs) run over the FULL windowed set;
      // MAX_ITEMS_PER_STUDENT caps only the item payload (itemsTruncated flags it).
      const items = [];
      let unseen = 0;
      let maxUnseenPriority = 0;
      for (const row of windowed) {
        const mark = markByLedger[row.ledger_id] || null;
        const seen = !!mark;
        const priority = itemPriority(row);
        if (!seen) {
          unseen += 1;
          if (priority > maxUnseenPriority) maxUnseenPriority = priority;
        }
        if (items.length >= MAX_ITEMS_PER_STUDENT) continue;
        items.push({
          ledgerId: row.ledger_id,
          source: row.source,
          itemId: row.item_id,
          score: (row.score === undefined ? null : row.score),
          recordedAt: row.recorded_at,
          responseSnippet: responseSnippet(row.response),
          sessionId: sessionByLedger[row.ledger_id] ?? null,
          priority,
          seen,
          seenAt: mark ? mark.seen_at : null,
          comment: mark ? (mark.comment ?? null) : null,
          rh: responseHash(row.response),
          draftable: aiGradedRow(row),
        });
      }
      unseenTotal += unseen;

      // Last reviewed (across ALL of this student's marks, not just the window).
      let lastReviewedAt = null;
      for (const m of (marksRes.data || [])) {
        if (m.student_id === sid && m.seen_at && (!lastReviewedAt || m.seen_at > lastReviewedAt)) lastReviewedAt = m.seen_at;
      }
      const daysSinceReview = lastReviewedAt
        ? Math.floor((Date.now() - (Date.parse(lastReviewedAt) || 0)) / 86400000)
        : null;

      // Student priority = max UNSEEN item priority + a nudge for staleness.
      const stalenessNudge = (daysSinceReview === null) ? 25 : Math.min(daysSinceReview * 5, 50);
      const priority = unseen > 0 ? maxUnseenPriority + stalenessNudge : 0;

      students.push({
        studentId: sid,
        username: r.login_username,
        realName: r.real_name ?? null,
        section: r.section ?? null,
        currentGrade: currentGradeOf(rows, answerKey, config, {
          lessonSchedule,
          eventSchedule,
          section: r.section,
          worksheetBlankCounts,
          blooketPresence: _presence || undefined,
          blooketRequired: _required || undefined,
          blooketLessons: _presence || undefined,
        }),
        lastReviewedAt,
        daysSinceReview,
        stale: daysSinceReview !== null && daysSinceReview >= N_DAYS_FLAG,
        unseen,
        priority,
        items,
        itemsTruncated: windowed.length > MAX_ITEMS_PER_STUDENT,
      });
    }

    students.sort((a, b) => b.priority - a.priority || b.unseen - a.unseen);

    return res.json({
      ok: true,
      asOf: new Date().toISOString(),
      section,
      windowDays: days,
      nDaysFlag: N_DAYS_FLAG,
      unseenTotal,
      students,
    });
  });

  // ── GET /class/review-item/:ledgerId (v2) ───────────────────────────────────
  // One row's full context, fetched on-demand when the teacher taps ✨ Draft.
  // §0.1: the full response leaves the server ONLY for rows already on the
  // AI-grading trust boundary (aiGradedRow) — everything else comes back redacted.
  // §0.4: the row must belong to a current roster student (no arbitrary ledgerId
  // probing); the endpoint is teacher-gated like every /class/review* route.
  app.get('/class/review-item/:ledgerId', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    const ledgerId = String(req.params.ledgerId || '');
    if (!UUID_RE.test(ledgerId)) return res.status(400).json({ ok: false, error: 'bad ledgerId' });

    let rowsRes;
    try { rowsRes = await ledgerDb.getRowsByLedgerIds([ledgerId]); } catch (e) { rowsRes = { error: e }; }
    if (rowsRes && rowsRes.error) {
      console.error('GET /class/review-item error:', rowsRes.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const row = ((rowsRes && rowsRes.data) || [])[0];
    if (!row) return res.status(404).json({ ok: false, error: 'not found' });

    let student = null;
    try { const sr = await db.findByStudentId(row.student_id); student = (sr && sr.data) || null; } catch (_) { student = null; }
    if (!student) return res.status(404).json({ ok: false, error: 'not found' });

    // Existing mark, best-effort (pre-0025 this endpoint still serves the response).
    let mark = null;
    try {
      const mr = await db.listReviewMarksByStudents([row.student_id]);
      for (const m of ((mr && mr.data) || [])) if (m.ledger_id === ledgerId) mark = m;
    } catch (_) { mark = null; }

    const draftable = aiGradedRow(row);
    return res.json({
      ok: true,
      ledgerId,
      studentId: row.student_id,
      username: student.login_username ?? null,
      realName: student.real_name ?? null,
      itemId: row.item_id,
      source: row.source,
      score: (row.score === undefined ? null : row.score),
      evidenceTier: row.evidence_tier ?? null,
      recordedAt: row.recorded_at,
      rh: responseHash(row.response),
      draftable,
      response: draftable ? row.response : null,
      redacted: !draftable,
      seen: !!mark,
      comment: mark ? (mark.comment ?? null) : null,
    });
  });

  // ── GET /class/review-by-item?section=&days= (v2) ───────────────────────────
  // The transpose of the queue: recent work grouped by itemId, all students
  // side-by-side, so "8 kids botched the same FRQ" is visible at a glance.
  // §0.6: the row universe is IDENTICAL to the by-student queue (same roster fetch,
  // same getLedgerByStudent, same window) with NO per-student cap; §0.7: same
  // shared window default; §0.8: labels derive from the answer key (unitOf/topic),
  // row.topic is best-effort display only.
  app.get('/class/review-by-item', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    const section = (req.query.section && String(req.query.section).trim()) || null;
    const { days, floor: windowFloor } = windowFloorFrom(req.query.days);

    let rosterRes;
    try { rosterRes = await db.listRoster(section); } catch (e) { rosterRes = { error: e }; }
    if (rosterRes && rosterRes.error) {
      console.error('GET /class/review-by-item roster error:', rosterRes.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const rosterRows = (Array.isArray(rosterRes.data) ? rosterRes.data : [])
      .filter((r) => r && r.student_id && r.role !== 'teacher');
    const studentIds = rosterRows.map((r) => r.student_id);

    const marksRes = await db.listReviewMarksByStudents(studentIds);
    if (marksRes && marksRes.error) {
      if (isReviewMissing(marksRes.error)) return notProvisioned(res);
      console.error('GET /class/review-by-item marks error:', marksRes.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const markByLedger = Object.create(null);
    for (const m of (marksRes.data || [])) markByLedger[m.ledger_id] = m;

    // Answer key for item labels (best-effort; never blocks the view).
    let answerKey = null;
    if (typeof loadAnswerKey === 'function') {
      try { answerKey = answerKeyMapOrNull(await loadAnswerKey()); } catch (_) { answerKey = null; }
    }

    // Null-prototype: item_id is CLIENT-supplied text — a planted '__proto__' /
    // 'constructor' row must group like any other item, not walk the prototype
    // chain (Object.prototype pollution → a thrown TypeError would crash the
    // shared server on every By-item load).
    const groups = Object.create(null);
    const misconceptionFan = [];
    let unseenTotal = 0;
    for (const r of rosterRows) {
      const sid = r.student_id;
      let rows = [];
      try { const lr = await ledgerDb.getLedgerByStudent(sid); rows = (lr && lr.data) || []; } catch (_) { rows = []; }
      misconceptionFan.push({ roster: r, ledgerRows: rows });
      const windowed = windowFloor
        ? rows.filter((row) => (Date.parse(row.recorded_at) || 0) >= windowFloor)
        : rows;

      for (const row of windowed) {
        const mark = markByLedger[row.ledger_id] || null;
        const seen = !!mark;
        if (!seen) unseenTotal += 1;

        const key = String(row.item_id);
        let g = groups[key];
        if (!g) {
          const keyEntry = answerKey ? answerKey[key] : null;
          g = groups[key] = {
            itemId: row.item_id,
            source: row.source,
            unit: unitOf(row.item_id, keyEntry),
            topic: (keyEntry && keyEntry.topic != null && String(keyEntry.topic).trim() !== '')
              ? String(keyEntry.topic)
              : (row.topic ?? null),
            priority: 0,
            unseen: 0,
            count: 0,
            meanScore: null,
            draftable: false,
            answers: [],
          };
        }
        const priority = itemPriority(row);
        if (priority > g.priority) g.priority = priority;
        g.count += 1;
        if (!seen) g.unseen += 1;
        const draftable = aiGradedRow(row);
        if (draftable) g.draftable = true;
        g.answers.push({
          ledgerId: row.ledger_id,
          studentId: sid,
          username: r.login_username,
          realName: r.real_name ?? null,
          score: (row.score === undefined ? null : row.score),
          source: row.source,
          evidenceTier: row.evidence_tier ?? null,
          recordedAt: row.recorded_at,
          responseSnippet: responseSnippet(row.response),
          rh: responseHash(row.response),
          draftable,
          seen,
          seenAt: mark ? mark.seen_at : null,
          comment: mark ? (mark.comment ?? null) : null,
        });
      }
    }

    // Mean score in the item's native scale; sort keys normalize >1 scores (percent
    // scales like the Desk's *-DESK_DONE rows) so low-mean FRQs still float first.
    const normScore = (s) => {
      const v = Number(s);
      if (!Number.isFinite(v)) return null;
      return v > 1 ? v / 100 : v;
    };
    const items = Object.values(groups);
    for (const g of items) {
      let sum = 0, n = 0, normSum = 0;
      for (const a of g.answers) {
        if (a.score === null || !Number.isFinite(Number(a.score))) continue;
        sum += Number(a.score);
        normSum += normScore(a.score);
        n += 1;
      }
      g.meanScore = n ? sum / n : null;
      g._meanNorm = n ? normSum / n : null;
      g.answers.sort((a, b) => {
        const as = (a.score === null) ? Infinity : Number(a.score);
        const bs = (b.score === null) ? Infinity : Number(b.score);
        return (as - bs)
          || String(a.realName || a.username || '').localeCompare(String(b.realName || b.username || ''));
      });
    }
    items.sort((a, b) => (b.priority - a.priority)
      || (((a._meanNorm === null) ? 2 : a._meanNorm) - ((b._meanNorm === null) ? 2 : b._meanNorm))
      || (b.unseen - a.unseen));
    for (const g of items) delete g._meanNorm;

    const misconceptions = computeMisconceptions(misconceptionFan, loadMisconceptionAssets(answerKey || {}),
      { section, days: days ?? 0, config: config?.misconceptions });

    return res.json({
      ok: true,
      asOf: new Date().toISOString(),
      section,
      windowDays: days,
      unseenTotal,
      items,
      topMisconceptions: misconceptions.class.slice(0, 3).map(({ key, label, students }) => ({ key, label, students })),
      topMisconceptionsDraft: misconceptions.class.slice(0, 3).some(entry => entry.draft),
      frequent: misconceptions.frequent,
    });
  });

  // Resolve the set of target ledger rows for a mark request. Either an explicit
  // ledgerIds[] (the primary path — the UI sends exactly what it wants marked, be it
  // one item, a session's items, or all), or a server-resolved {studentId, scope}.
  async function resolveTargets(body) {
    if (Array.isArray(body.ledgerIds) && body.ledgerIds.length) {
      const valid = body.ledgerIds.filter((x) => typeof x === 'string' && UUID_RE.test(x));
      const ids = valid.slice(0, MAX_TARGETS);
      if (!ids.length) return { rows: [], requested: 0, truncated: false };
      const r = await ledgerDb.getRowsByLedgerIds(ids);
      // v2 §0.9: a "comment to many" that exceeds MAX_TARGETS must WARN, not silently
      // drop the tail — requested/truncated ride to the response.
      return { ...r, requested: valid.length, truncated: valid.length > MAX_TARGETS };
    }
    const sid = body.studentId;
    const scope = body.scope;
    if (typeof sid === 'string' && UUID_RE.test(sid) && scope) {
      const lr = await ledgerDb.getLedgerByStudent(sid);
      if (lr && lr.error) return { error: lr.error };
      let rows = (lr && lr.data) || [];
      if (scope === 'day' && typeof body.date === 'string') {
        rows = rows.filter((row) => todayInTz(schoolTz, Date.parse(row.recorded_at) || 0) === body.date);
      } else if (scope === 'session' && body.sessionId !== undefined && body.sessionId !== null) {
        const sessionByLedger = sessionize(rows);
        rows = rows.filter((row) => sessionByLedger[row.ledger_id] === Number(body.sessionId));
      } else if (scope !== 'all') {
        return { rows: [], requested: 0, truncated: false };
      }
      return { data: rows.slice(0, MAX_TARGETS), requested: rows.length, truncated: rows.length > MAX_TARGETS };
    }
    return { rows: [], requested: 0, truncated: false };
  }

  // ── POST /class/review ──────────────────────────────────────────────────────
  // Body: { ledgerIds:[...] } OR { studentId, scope:'all'|'day'|'session', date?, sessionId? },
  //       plus optional { comment, notify }.
  app.post('/class/review', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    const body = req.body || {};
    let comment = (typeof body.comment === 'string') ? body.comment.trim() : '';
    if (comment.length > COMMENT_MAX) comment = comment.slice(0, COMMENT_MAX);
    const notify = body.notify !== false; // default on; only fires when there's a comment

    const targetRes = await resolveTargets(body);
    if (targetRes && targetRes.error) {
      if (isReviewMissing(targetRes.error)) return notProvisioned(res);
      console.error('POST /class/review resolve error:', targetRes.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const targets = (targetRes.data || targetRes.rows || []).filter((row) => row && row.ledger_id && row.student_id);
    if (!targets.length) return res.status(400).json({ ok: false, error: 'no items to review' });

    // v2 §0.5 TOCTOU guard: the client may pin what it was LOOKING AT via
    // expected: [{ ledgerId, rh?, score? }]. Worksheets are revisable IN PLACE
    // (the ledger upsert keeps the same ledger_id), so a row can mutate between
    // the Draft fetch and the mark — any pinned row that changed rejects the WHOLE
    // request with 409 so a comment never lands on content the teacher hasn't seen.
    const expected = Array.isArray(body.expected) ? body.expected : [];
    if (expected.length) {
      const byLedger = Object.create(null);   // exp.ledgerId is client text — no prototype walk
      for (const row of targets) byLedger[row.ledger_id] = row;
      const stale = [];
      for (const exp of expected) {
        if (!exp || typeof exp.ledgerId !== 'string') continue;
        const row = byLedger[exp.ledgerId];
        if (!row) continue;
        // rh: null is a REAL pin ("I saw a row with no response") — only an
        // absent (undefined) rh skips the check, so null→answer revisions 409 too.
        if (exp.rh !== undefined && exp.rh !== responseHash(row.response)) {
          stale.push(exp.ledgerId);
          continue;
        }
        if (exp.score !== undefined && !numEq(exp.score, row.score)) stale.push(exp.ledgerId);
      }
      if (stale.length) return res.status(409).json({ ok: false, error: 'stale', stale });
    }

    const teacherUsername = await resolveTeacherUsername(req);
    const seenAtMs = Date.now();
    const seenAtIso = new Date(seenAtMs).toISOString();
    const nyDate = todayInTz(schoolTz, seenAtMs);

    const marks = [];
    try {
      for (const row of targets) {
        const receipt = issueReviewReceipt({
          ledgerId: row.ledger_id,
          studentId: row.student_id,
          teacher: teacherUsername,
          seenAt: seenAtMs,
          comment: comment || undefined,
          // v2 §0.5: bind the response the teacher reviewed into the signed payload,
          // so post-review drift is detectable like grade tampering.
          responseHash: responseHash(row.response) || undefined,
        });
        const up = await db.upsertReviewMark({
          ledgerId: row.ledger_id,
          studentId: row.student_id,
          teacherUsername,
          seenAt: seenAtIso,
          comment: comment || null,
          receiptId: receipt ? receipt.receiptId : null,
          receiptCompact: receipt ? receipt.compact : null,
        });
        if (up && up.error) {
          if (isReviewMissing(up.error)) return notProvisioned(res);
          console.error('POST /class/review upsert error:', up.error);
          return res.status(500).json({ ok: false, error: 'Database error' });
        }
        marks.push({ ledgerId: row.ledger_id, studentId: row.student_id, seenAt: seenAtIso, comment: comment || null });
      }
    } catch (e) {
      if (isReviewMissing(e)) return notProvisioned(res);
      console.error('POST /class/review error:', e);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    // Notify: one teacher→student message per distinct student, ONLY when a comment exists.
    let notified = 0;
    if (comment && notify && nudgesDb && typeof nudgesDb.insertNudges === 'function') {
      const distinctStudents = Array.from(new Set(targets.map((t) => t.student_id)));
      const text = comment.slice(0, NUDGE_MAX);
      for (const studentId of distinctStudents) {
        try {
          const sr = await db.findByStudentId(studentId);
          const recipient = sr && sr.data && sr.data.login_username;
          const sect = sr && sr.data ? sr.data.section : null;
          if (!recipient) continue;
          await nudgesDb.insertNudges({
            nudgeId: 'review-' + studentId + '-' + seenAtMs,
            senderUsername: teacherUsername,
            recipientUsernames: [recipient],
            text,
            section: sect,
            deliveredUsernames: [],
          });
          notified += 1;
        } catch (e) {
          console.warn('POST /class/review notify failed for', studentId, e && e.message);
        }
      }
    }

    return res.json({
      ok: true,
      marked: marks.length,
      requested: targetRes.requested ?? targets.length,
      truncated: !!targetRes.truncated,
      notified,
      marks,
    });
  });
}
