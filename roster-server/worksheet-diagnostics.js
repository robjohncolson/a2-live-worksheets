// Operational worksheet summaries only. Never grade evidence or answer storage.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { requireTeacher } from './teacher-auth.js';
import { createRateLimiter } from './rate-limit.js';

export const DIAGNOSTICS_BUCKET = 'worksheet-diagnostics';
const WEEK = 7 * 86400000;
const OUTCOMES = new Set(['loaded', 'empty', 'auth', 'network', 'timeout', 'invalid-response', 'no-identity', 'stale-session', 'config', 'client-error']);
const COUNTS = ['fields', 'downloaded', 'saved', 'restored', 'matched', 'edited', 'filled'];

// Expired but authentic sessions may REPORT their own failure for 30 days.
// This is deliberately isolated from normal auth: it grants no reads or grade writes.
export function diagnosticIdentity(token, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 2048) return null;
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra || !process.env.ROSTER_TOKEN_SECRET) return null;
    const expected = createHmac('sha256', process.env.ROSTER_TOKEN_SECRET).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof data.sid !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(data.sid) || !Number.isFinite(data.exp)) return null;
    if (data.exp < now - 30 * 86400000) return null;
    return { studentId: data.sid, expired: data.exp < now };
  } catch (_) { return null; }
}

export function sanitizeReport(body, now = Date.now()) {
  if (!body || !/^[a-f0-9]{24}$/.test(body.deviceId || '') || !/^[a-f0-9]{24}$/.test(body.reportId || '')) return null;
  if (!/^WS-U\d{1,2}L\d{1,2}(?:-\d{1,2})*$/.test(body.worksheet || '') || !OUTCOMES.has(body.outcome)) return null;
  if (!Number.isFinite(body.observedAt) || body.observedAt < now - WEEK || body.observedAt > now + 300000) return null;
  const result = { deviceId: body.deviceId, reportId: body.reportId, worksheet: body.worksheet, outcome: body.outcome, observedAt: body.observedAt };
  result.build = typeof body.build === 'string' && /^[a-zA-Z0-9.-]{1,40}$/.test(body.build) ? body.build : 'unknown';
  result.httpStatus = Number.isInteger(body.httpStatus) && body.httpStatus >= 100 && body.httpStatus <= 599 ? body.httpStatus : null;
  result.online = body.online === true;
  result.serviceWorker = body.serviceWorker === true;
  for (const key of COUNTS) {
    if (!Number.isInteger(body[key]) || body[key] < 0 || body[key] > 3000) return null;
    result[key] = body[key];
  }
  return result;
}

export function createDiagnosticsStore(storage) {
  const bucket = storage.from(DIAGNOSTICS_BUCKET);
  const locks = new Map();
  const sectionPath = section => /^[a-zA-Z0-9_-]{1,60}$/.test(section || '') ? section : 'unassigned';
  async function download(path) {
    const { data, error } = await bucket.download(path);
    if (error) {
      if (String(error.statusCode || error.status) === '404' || /not found/i.test(error.message || '')) return null;
      throw new Error('Diagnostic storage unavailable');
    }
    return JSON.parse(await data.text());
  }
  async function put(row) {
    const path = sectionPath(row.section) + '/' + [row.studentId, row.deviceId, row.worksheet, row.mode].join('--') + '.json';
    const previous = locks.get(path) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      const old = await download(path);
      if (old && old.observedAt > row.observedAt) return;
      if (row.outcome !== 'loaded' && row.outcome !== 'empty') {
        row.lastFailure = { outcome: row.outcome, observedAt: row.observedAt, httpStatus: row.httpStatus };
      } else if (old && old.lastFailure && old.lastFailure.observedAt >= Date.now() - WEEK) {
        row.lastFailure = old.lastFailure;
      }
      const { error } = await bucket.upload(path, JSON.stringify(row), { upsert: true, contentType: 'application/json', cacheControl: '0' });
      if (error) throw new Error('Diagnostic storage unavailable');
    });
    locks.set(path, task);
    try { await task; } finally { if (locks.get(path) === task) locks.delete(path); }
  }
  async function list(section) {
    let sections;
    if (section) sections = [sectionPath(section)];
    else {
      const { data, error } = await bucket.list('', { limit: 100 });
      if (error) throw new Error('Diagnostic storage unavailable');
      sections = (data || []).filter(x => !x.id).map(x => x.name);
    }
    const paths = [];
    let truncated = false;
    for (const folder of sections) {
      const files = [];
      for (let offset = 0; offset < 10000; offset += 1000) {
        const { data, error } = await bucket.list(folder, { limit: 1000, offset, sortBy: { column: 'updated_at', order: 'desc' } });
        if (error) throw new Error('Diagnostic storage unavailable');
        files.push(...(data || []));
        if (!data || data.length < 1000) break;
        if (offset === 9000) truncated = true;
      }
      const expired = [];
      let recent = 0;
      for (const file of files) {
        if (!file.id) continue;
        if (Date.parse(file.updated_at) < Date.now() - WEEK) expired.push(folder + '/' + file.name);
        else if (recent++ < 200 && paths.length < 400) paths.push(folder + '/' + file.name);
        else truncated = true;
      }
      // Retention cleanup is best effort; reports never affect classroom availability.
      for (let i = 0; i < expired.length; i += 1000) await bucket.remove(expired.slice(i, i + 1000)).catch(() => {});
    }
    const rows = [];
    // Avoid firing hundreds of simultaneous object reads during a class load.
    for (let i = 0; i < paths.length; i += 10) {
      const batch = await Promise.all(paths.slice(i, i + 10).map(download));
      rows.push(...batch.filter(Boolean));
    }
    return { rows: rows.filter(r => r.observedAt >= Date.now() - WEEK).sort((a, b) => b.observedAt - a.observedAt), truncated };
  }
  return { put, list };
}

export function createLiveDiagnosticsStore() {
  if (!process.env.ROSTER_SUPABASE_URL || !process.env.ROSTER_SUPABASE_SERVICE_KEY) return null;
  return createDiagnosticsStore(createClient(process.env.ROSTER_SUPABASE_URL, process.env.ROSTER_SUPABASE_SERVICE_KEY, { db: { schema: process.env.ROSTER_DB_SCHEMA || 'a2' } }).storage);
}

export function mountWorksheetDiagnostics(app, { db, store }) {
  const allow = createRateLimiter({ windowMs: 60000, max: 30 });
  const daily = createRateLimiter({ windowMs: 86400000, max: 500 });
  app.post('/student/worksheet-diagnostics', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const identity = diagnosticIdentity(token);
    if (!identity) return res.status(401).json({ ok: false, error: 'sign-in-required' });
    if (!allow(identity.studentId) || !daily(identity.studentId)) return res.status(429).json({ ok: false, error: 'retry-later' });
    const report = sanitizeReport(req.body);
    if (!report) return res.status(400).json({ ok: false, error: 'invalid-report' });
    if (!store) return res.status(503).json({ ok: false, error: 'diagnostics-unavailable' });
    try {
      const caller = await db.findByStudentId(identity.studentId);
      if (caller.error) throw new Error('roster unavailable');
      if (!caller.data || caller.data.status === 'archived') return res.status(403).json({ ok: false, error: 'inactive-account' });
      const isTeacher = caller.data.role === 'teacher';
      const target = req.body.studentId || identity.studentId;
      if (typeof target !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(target)) return res.status(400).json({ ok: false, error: 'invalid-student' });
      if (target !== identity.studentId && (!isTeacher || identity.expired)) return res.status(403).json({ ok: false, error: 'wrong-account' });
      const subject = target === identity.studentId ? caller : await db.findByStudentId(target);
      if (subject.error || !subject.data) return res.status(404).json({ ok: false, error: 'unknown-student' });
      await store.put({ ...report, studentId: target, username: subject.data.login_username, realName: subject.data.real_name, section: subject.data.section,
        mode: isTeacher ? 'teacher-preview' : 'student', session: identity.expired ? 'expired' : 'valid', receivedAt: Date.now() });
      return res.json({ ok: true });
    } catch (_) { return res.status(503).json({ ok: false, error: 'diagnostics-unavailable' }); }
  });
  app.get('/teacher/worksheet-diagnostics', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    const section = req.query.section || '';
    if (typeof section !== 'string' || (section && !/^[a-zA-Z0-9_-]{1,60}$/.test(section))) return res.status(400).json({ ok: false, error: 'invalid-section' });
    if (!store) return res.status(503).json({ ok: false, error: 'diagnostics-unavailable' });
    try { return res.json({ ok: true, ...(await store.list(section)) }); }
    catch (_) { return res.status(503).json({ ok: false, error: 'diagnostics-unavailable' }); }
  });
}
