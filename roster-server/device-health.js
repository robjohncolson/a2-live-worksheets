// Class Log device health ping (school/class-log/POLISH3_SPEC.md, WP-H H2).
//
//   POST /class-log/health   phone, Bearer CLASS_LOG_TOKEN, body <= 8 KB
//   GET  /teacher/health     Desk, requireTeacher
//
// Tables from migration 0045 (a2.device_health, a2.device_health_log via the
// service client). Until it runs, both routes answer 503 and the phone logs the
// failure at most hourly. Same middleware order as observer-cards.js:
// mountDeviceHealth (phone) goes BEFORE the app-wide express.json so auth runs
// before any body is parsed; mountTeacherHealth goes after the password gate.
import express from 'express';
import { createServiceClient } from './ledger-db.js';
import { requireTeacher } from './teacher-auth.js';
import { checkClassLogToken } from './observer-cards.js';
import { charLength } from './observer-card-rules.js';

export const HEALTH_LIMITS = { device: 32, bodyBytes: '8kb', keepDays: 30 };

// Body of POST /class-log/health. Returns {device, at, payload}; throws on any
// problem. The whole body is kept as the payload; only device and at are read.
export function validateHealth(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body must be an object');
  const rawDevice = body.device ?? 's24';
  if (typeof rawDevice !== 'string' || !rawDevice.trim()) throw new Error('device must be a non-empty string');
  const device = rawDevice.trim();
  if (charLength(device) > HEALTH_LIMITS.device) throw new Error(`device must be at most ${HEALTH_LIMITS.device} characters`);
  let at = null;
  if (body.at !== undefined && body.at !== null) {
    if (typeof body.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(body.at) || !Number.isFinite(Date.parse(body.at))) {
      throw new Error('at must be null or an ISO 8601 timestamp');
    }
    at = new Date(body.at).toISOString();
  }
  // Postgres jsonb cannot hold U+0000; refuse it up front (400) instead of a retryable 503.
  if (JSON.stringify(body).includes('\\u0000')) throw new Error('body must not contain U+0000');
  return { device, at, payload: { ...body, device } };
}

// Database row -> the Desk's shape. ageMinutes is minutes since the server received it.
export function healthFromRow(row, now = new Date()) {
  const received = Date.parse(row.received_at);
  const ageMinutes = Number.isFinite(received) ? Math.max(0, Math.floor((now.getTime() - received) / 60000)) : null;
  return { device: row.device, at: row.at ?? null, receivedAt: row.received_at, ageMinutes, payload: row.payload };
}

// Supabase-backed store. Every method throws on a database error (including a
// missing table before 0045 runs).
export function createDeviceHealthStore(client = createServiceClient()) {
  const check = ({ data, error }) => { if (error) throw error; return data; };
  return {
    async upsertCurrent(row) {
      check(await client.from('device_health').upsert(row, { onConflict: 'device' }));
    },
    async appendLog(row) {
      check(await client.from('device_health_log').insert(row));
    },
    async pruneLog(before) {
      check(await client.from('device_health_log').delete().lt('received_at', before));
    },
    async listCurrent() {
      return check(await client.from('device_health').select('*').order('device')) || [];
    },
  };
}

// Route-local error handler: body-parser failures become short JSON, never a stack.
function parserErrors(error, _req, res, next) {
  if (!error || !error.type) return next(error);
  if (error.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'too_large' });
  return res.status(400).json({ ok: false, error: 'bad_json' });
}

// One lazily created store per app, shared by the phone and teacher routes.
const stores = new WeakMap();
function storageFor(app, store) {
  return () => {
    if (store) return store;
    if (!stores.has(app)) stores.set(app, createDeviceHealthStore());
    return stores.get(app);
  };
}
const unavailable = res => res.status(503).json({ error: 'Device health service unavailable' });

// Phone route. Mount BEFORE the app-wide express.json: the bearer check runs
// first, then a bounded (8 KB) route-local parser.
export function mountDeviceHealth(app, { store, env = process.env, now = () => new Date() }) {
  const storage = storageFor(app, store);
  const phoneAuth = (req, res, next) => {
    const verdict = checkClassLogToken(req, env);
    if (verdict === 'ok') return next();
    res.set('Cache-Control', 'no-store');
    if (verdict === 'unconfigured') return res.status(503).json({ error: 'Class Log health is not configured' });
    res.status(401).end();
  };
  const phoneJson = express.json({ limit: HEALTH_LIMITS.bodyBytes });

  app.post('/class-log/health', phoneAuth, phoneJson, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let ping;
    try { ping = validateHealth(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    try {
      const received = now();
      const row = { device: ping.device, at: ping.at, payload: ping.payload, received_at: received.toISOString() };
      await storage().upsertCurrent(row);
      await storage().appendLog(row);
      await storage().pruneLog(new Date(received.getTime() - HEALTH_LIMITS.keepDays * 86400000).toISOString());
      res.json({ ok: true });
    } catch { unavailable(res); }
  }, parserErrors);
}

// Desk route. Mounted after the password gate like the other teacher routes.
export function mountTeacherHealth(app, { db, store, now = () => new Date() }) {
  const storage = storageFor(app, store);
  const teacherAuth = async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    let ok = false;
    try { ok = await requireTeacher(req, db); } catch { ok = false; }
    if (!ok) return res.status(403).json({ error: 'Teacher sign-in required' });
    next();
  };

  app.get('/teacher/health', teacherAuth, async (_req, res) => {
    let rows;
    try { rows = await storage().listCurrent(); } catch { return unavailable(res); }
    const at = now();
    res.json({ devices: rows.map(row => healthFromRow(row, at)) });
  });
}
