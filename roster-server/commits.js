// commits.js — the progress "proto-git": GET /commits computes a deterministic,
// signed, prev-chained history of a student's work from the immutable item_ledger
// receipts. No new table/migration: the chain is recomputed from the same input
// each call, so existing commits never change and new work appends at the head.
//
//   blob   = a signed ledger receipt (one per answered item)
//   commit = a signed manifest over a QR-sized chunk of receipts + prev root
//   chain  = commits linked by prev (root of the previous commit)
//
// Sessions = time-bursts of activity (gap > SESSION_GAP_MS starts a new session).
// Each session is split into chunks of MAX_PER_COMMIT receipts so a single commit
// (manifest + its receipts) fits in one QR code.

import crypto from 'node:crypto';
import { issueCommitReceipt } from './receipts.js';

const SESSION_GAP_MS = 25 * 60 * 1000; // >25 min idle = new session
const MAX_PER_COMMIT = 8;              // receipts per commit (keeps the QR self-contained)

function extractToken(req) {
  const authHeader = typeof req.headers['authorization'] === 'string' ? req.headers['authorization'] : '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const q = req.query && req.query.token;
  if (typeof q === 'string' && q.trim()) return q;
  return null;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

// Order-independent root over a chunk's receipt ids (mirrors the transcript root).
function commitRoot(ids) {
  return sha256Hex(ids.slice().sort().join('\n'));
}

async function resolveUsername(db, sid) {
  try {
    if (db && typeof db.findByStudentId === 'function') {
      const { data } = await db.findByStudentId(sid);
      if (data && data.login_username) return data.login_username;
    }
  } catch (_) { /* best-effort */ }
  return undefined;
}

export function buildCommits(rows, { sid, u }) {
  // rows: [{ id, compact, i, src, sc, ts }] — receipts only, any order.
  const ordered = rows
    .slice()
    .sort((a, b) => (a.ts - b.ts) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const commits = [];
  let prev = null, seq = 0, session = 0, lastTs = null, buf = [];

  function flush() {
    if (!buf.length) return;
    session += 1;
    for (let i = 0; i < buf.length; i += MAX_PER_COMMIT) {
      const chunk = buf.slice(i, i + MAX_PER_COMMIT);
      const ids = chunk.map((c) => c.id);
      if (new Set(ids).size !== ids.length) continue; // skip a chunk with duplicate ids
      const root = commitRoot(ids);
      seq += 1;
      const from = chunk[0].ts, to = chunk[chunk.length - 1].ts;
      const manifest = issueCommitReceipt({ sid, u, seq, prev, root, cnt: chunk.length, from, to });
      commits.push({
        seq,
        session,
        prev: prev || null,
        root,
        cnt: chunk.length,
        from,
        to,
        items: chunk.map((c) => ({ i: c.i, src: c.src, sc: c.sc })),
        manifest: manifest ? manifest.compact : null,
        receipts: chunk.map((c) => c.compact)
      });
      prev = root;
    }
    buf = [];
  }

  for (const row of ordered) {
    if (lastTs !== null && (row.ts - lastTs) > SESSION_GAP_MS) flush();
    buf.push(row);
    lastTs = row.ts;
  }
  flush();

  return { commits, head: prev };
}

export function mountCommits(app, { verifyToken, ledgerDb, db }) {
  app.get('/commits', async (req, res) => {
    const rawToken = extractToken(req);
    if (!rawToken) return res.status(401).json({ ok: false, error: 'Token required' });
    const sid = verifyToken(rawToken);
    if (!sid) return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    try {
      const u = await resolveUsername(db, sid);
      const result = await ledgerDb.getLedgerByStudent(sid);
      if (result && result.error) {
        console.error('GET /commits ledger error:', result.error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      const rows = (result && Array.isArray(result.data) ? result.data : [])
        .filter((x) => x.receipt_id && x.receipt_compact)
        .map((x) => ({
          id: x.receipt_id,
          compact: x.receipt_compact,
          i: x.item_id,
          src: x.source,
          sc: x.score,
          ts: Date.parse(x.recorded_at) || 0
        }));
      const { commits, head } = buildCommits(rows, { sid, u });
      return res.json({ ok: true, sid, u, head, count: commits.length, commits });
    } catch (err) {
      console.error('GET /commits error:', err);
      return res.status(500).json({ ok: false, error: 'Commits unavailable' });
    }
  });
}
