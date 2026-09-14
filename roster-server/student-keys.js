// student-keys.js — the STUDENT trust set for the offline-grading mesh
// (OFFLINE_GRADING_MESH_SPEC.md §0.1-0.3). Three routes:
//
//   POST /student-keys/register  → AUTHENTICATED key binding (§0.2): the sid comes
//        from the caller's OWN roster token — never from the body — so a student
//        can only ever bind a pubkey to themselves. One-sid-per-pubkey, and a
//        revoked key can never come back (terminal, unlike trusted_issuers).
//   GET  /student-keys           → the served student trust set (pubkey, sid,
//        revoked). Any signed-in student or the teacher may read it — devices
//        need it to verify gossiped submissions, and the revoked flag must
//        travel (an absence is indistinguishable from "not yet synced").
//   POST /student-keys/revoke    → teacher-only. Lost/stolen device.
//
// Domain separation (§0.1c): student keys and issuer keys are DISJOINT sets.
// Registration refuses a pubkey that is already a trusted issuer, and the
// trusted-issuers route refuses a pubkey that is already a student key.
//
// Until migration 0027 runs these routes 503 (service stays up) — the standard
// pre-migration convention.

import { requireTeacher } from './teacher-auth.js';
import { verifyToken } from './token.js';
import { isValidIssuerPubkey, getTrustedIssuerPubkeys } from './receipts.js';

const LABEL_MAX = 100;
const REGISTER_MAX_PER_HOUR = 10;   // per student — a device registers once, ever

function isStudentKeysMissing(e) {
  if (!e) return false;
  const code = String(e.code || '');
  if (['42P01', 'PGRST205'].includes(code)) return true;
  const msg = String(e.message || '').toLowerCase();
  return msg.includes('student_keys')
    && (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('could not find'));
}
function notProvisioned(res) {
  return res.status(503).json({ ok: false, error: 'student keys not provisioned (run migration 0027)' });
}

function extractToken(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'];
  if (typeof h === 'string' && /^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, '').trim() || null;
  if (req.query && typeof req.query.token === 'string' && req.query.token) return req.query.token;
  return null;
}

// Tiny in-memory rate gate: registration is a once-per-device event, so a burst
// is either a bug or abuse. Sliding 1-hour window per sid.
const registerHits = new Map();
function registerAllowed(sid, nowMs = Date.now()) {
  const floor = nowMs - 3600000;
  const hits = (registerHits.get(sid) || []).filter((t) => t >= floor);
  if (hits.length >= REGISTER_MAX_PER_HOUR) { registerHits.set(sid, hits); return false; }
  hits.push(nowMs);
  registerHits.set(sid, hits);
  return true;
}

export function mountStudentKeys(app, { db }) {

  // ── POST /student-keys/register  { pubkey, label? } ─────────────────────────
  app.post('/student-keys/register', async (req, res) => {
    const token = extractToken(req);
    const sid = token ? verifyToken(token) : null;
    if (!sid) return res.status(401).json({ ok: false, error: 'forbidden' });

    const body = req.body || {};
    const pubkey = typeof body.pubkey === 'string' ? body.pubkey.trim() : '';
    if (!isValidIssuerPubkey(pubkey)) return res.status(400).json({ ok: false, error: 'invalid pubkey' });
    let label = typeof body.label === 'string' ? body.label.trim().slice(0, LABEL_MAX) : null;
    if (!label) label = null;

    // The caller must be a real roster student (a stale token for a deleted
    // account must not create an orphan binding — the FK would also catch it,
    // but reject cleanly first).
    try {
      const sr = await db.findByStudentId(sid);
      if (!sr || !sr.data) return res.status(401).json({ ok: false, error: 'forbidden' });
    } catch (_) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    // §0.1c disjointness: a trusted ISSUER key can never double as a student key.
    if (getTrustedIssuerPubkeys().includes(pubkey)) {
      return res.status(409).json({ ok: false, error: 'pubkey is a trusted issuer key' });
    }

    if (typeof db.findStudentKey !== 'function' || typeof db.insertStudentKey !== 'function') {
      return notProvisioned(res);
    }

    let existing;
    try { existing = await db.findStudentKey(pubkey); } catch (e) { existing = { error: e }; }
    if (existing && existing.error) {
      if (isStudentKeysMissing(existing.error)) return notProvisioned(res);
      console.error('POST /student-keys/register lookup error:', existing.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const row = existing && existing.data;
    if (row) {
      // Terminal revocation (§0.3): a revoked key never comes back, not even
      // for its own student.
      if (row.revoked) return res.status(403).json({ ok: false, error: 'pubkey revoked' });
      // One-sid-per-pubkey (§0.5): a key can never re-bind to another student.
      if (String(row.student_id) !== String(sid)) {
        return res.status(409).json({ ok: false, error: 'pubkey bound to another student' });
      }
      return res.json({ ok: true, pubkey, studentId: sid, existing: true });
    }

    // Rate-limit only GENUINE new-key inserts (an idempotent retry of an
    // already-registered key returned above, so it never burns budget).
    if (!registerAllowed(sid)) return res.status(429).json({ ok: false, error: 'too many registrations' });

    const ins = await db.insertStudentKey({ pubkey, studentId: sid, label });
    if (ins && ins.error) {
      if (isStudentKeysMissing(ins.error)) return notProvisioned(res);
      // Unique-violation race (two devices, same key — only possible with a
      // copied key): re-read and apply the same rules.
      if (String(ins.error.code || '') === '23505') {
        const again = await db.findStudentKey(pubkey);
        const r2 = again && again.data;
        if (r2 && !r2.revoked && String(r2.student_id) === String(sid)) {
          return res.json({ ok: true, pubkey, studentId: sid, existing: true });
        }
        return res.status(409).json({ ok: false, error: 'pubkey bound to another student' });
      }
      console.error('POST /student-keys/register insert error:', ins.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    return res.json({ ok: true, pubkey, studentId: sid, existing: false });
  });

  // ── GET /student-keys — the served trust set ────────────────────────────────
  app.get('/student-keys', async (req, res) => {
    const token = extractToken(req);
    const callerSid = token ? verifyToken(token) : null;
    if (!callerSid && !(await requireTeacher(req, db))) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }
    if (typeof db.listStudentKeys !== 'function') return notProvisioned(res);
    let r;
    try { r = await db.listStudentKeys(); } catch (e) { r = { error: e }; }
    if (r && r.error) {
      if (isStudentKeysMissing(r.error)) return notProvisioned(res);
      console.error('GET /student-keys error:', r.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const keys = (r.data || []).map((k) => ({
      pubkey: k.pubkey,
      sid: k.student_id,
      revoked: !!k.revoked
    }));
    return res.json({ ok: true, keys });
  });

  // ── POST /student-keys/revoke  { pubkey } — teacher only ────────────────────
  app.post('/student-keys/revoke', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    const pubkey = (req.body && typeof req.body.pubkey === 'string') ? req.body.pubkey.trim() : '';
    if (!pubkey) return res.status(400).json({ ok: false, error: 'pubkey required' });
    if (typeof db.revokeStudentKey !== 'function') return notProvisioned(res);
    let r;
    try { r = await db.revokeStudentKey({ pubkey }); } catch (e) { r = { error: e }; }
    if (r && r.error) {
      if (isStudentKeysMissing(r.error)) return notProvisioned(res);
      console.error('POST /student-keys/revoke error:', r.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    if (!r || !r.data) return res.status(404).json({ ok: false, error: 'unknown pubkey' });
    return res.json({ ok: true, pubkey, revoked: true });
  });
}
