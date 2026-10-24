// Class Log node mastery (school/class-log/KNOWLEDGE_TREE_SPEC.md, WP-1 1.3).
//
//   PUT /class-log/mastery                 phone, Bearer CLASS_LOG_TOKEN, <= 200 nodes, newer updatedAt wins
//   GET /teacher/mastery?course=&lesson=   Desk, requireTeacher: the rows plus per lesson {nodes, known, weakest}
//
// The phone owns the BKT probability `p` of every lesson-tree node; this mirrors it so
// the Desk can say how ready the teacher is. Table and RPC from migration 0047
// (a2.node_mastery, a2.put_node_mastery); until it runs both routes answer 503.
// Same middleware order as card-decks.js: mountClassLogMastery (phone) goes BEFORE the
// app-wide express.json so auth runs before any body is parsed; mountTeacherMastery
// goes after the password gate. (Named node-mastery, not mastery: mastery.js is the
// students' skill BKT, a different thing.)
import express from 'express';
import { createServiceClient } from './ledger-db.js';
import { requireTeacher } from './teacher-auth.js';
import { checkClassLogToken } from './observer-cards.js';
import { DECK_LIMITS, NODE_ID, charLength } from './deck-rules.js';

export const MASTERY_LIMITS = { nodesPerPut: 200, maxCount: 1000000, weakest: 3 };
export const COURSES = ['algebra2', 'apstats'];
export const KNOWN_P = 0.9;
// p is stored as `real` (float4): 0.90 comes back as 0.8999999762, so "known" allows
// for that rounding instead of turning a just-known node unknown on the round trip.
export const isKnown = p => typeof p === 'number' && p + 1e-6 >= KNOWN_P;

function shortText(value, name, max) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  const out = value.trim();
  if (out.includes('\u0000')) throw new Error(`${name} must not contain U+0000`);
  if (charLength(out) > max) throw new Error(`${name} must be at most ${max} characters`);
  return out;
}
// A lesson key from the phone: at most 16 code points, no NUL; '' is allowed (a node
// whose deck item had no lesson).
function lessonText(value, name) {
  if (typeof value !== 'string') throw new Error(`${name} must be a string`);
  const out = value.trim();
  if (out.includes('\u0000')) throw new Error(`${name} must not contain U+0000`);
  if (charLength(out) > DECK_LIMITS.lesson) throw new Error(`${name} must be at most ${DECK_LIMITS.lesson} characters`);
  return out;
}
function timestamp(value, name, { optional = false } = {}) {
  if (optional && (value === undefined || value === null)) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} must be ${optional ? 'null or ' : ''}an ISO 8601 timestamp`);
  }
  return new Date(value).toISOString();
}
function count(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > MASTERY_LIMITS.maxCount) throw new Error(`${name} must be an integer 0-${MASTERY_LIMITS.maxCount}`);
  return value;
}

// Body of PUT /class-log/mastery. Returns {device, course, nodes: [{nodeId, lesson, p,
// asked, again, knownAt, updatedAt}]} with one entry per node (the newest updatedAt
// when the body repeats a node). Throws on any problem.
export function validateMasteryPut(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body must be an object');
  const device = shortText(body.device ?? 's24', 'device', DECK_LIMITS.device);
  if (!COURSES.includes(body.course)) throw new Error(`course must be one of ${COURSES.join(', ')}`);
  if (!Array.isArray(body.nodes) || !body.nodes.length) throw new Error('nodes must be a non-empty array');
  if (body.nodes.length > MASTERY_LIMITS.nodesPerPut) throw new Error(`at most ${MASTERY_LIMITS.nodesPerPut} nodes per request`);
  const byNode = new Map();
  body.nodes.forEach((node, i) => {
    const where = `nodes[${i}]`;
    if (!node || typeof node !== 'object' || Array.isArray(node)) throw new Error(`${where} must be an object`);
    if (typeof node.nodeId !== 'string' || !NODE_ID.test(node.nodeId)) throw new Error(`${where}.nodeId must be 12 lowercase hex characters`);
    if (typeof node.p !== 'number' || !Number.isFinite(node.p) || node.p < 0 || node.p > 1) throw new Error(`${where}.p must be a number 0-1`);
    const row = {
      nodeId: node.nodeId, lesson: lessonText(node.lesson, `${where}.lesson`), p: node.p,
      asked: count(node.asked, `${where}.asked`), again: count(node.again, `${where}.again`),
      knownAt: timestamp(node.knownAt, `${where}.knownAt`, { optional: true }), updatedAt: timestamp(node.updatedAt, `${where}.updatedAt`),
    };
    const held = byNode.get(row.nodeId);
    if (!held || held.updatedAt < row.updatedAt) byNode.set(row.nodeId, row);
  });
  return { device, course: body.course, nodes: [...byNode.values()] };
}

// Database row -> the API shape.
export function masteryFromRow(row) {
  return {
    device: row.device, course: row.course, nodeId: row.node_id, lesson: row.lesson, p: Number(row.p),
    asked: row.asked, again: row.again, knownAt: row.known_at ?? null, updatedAt: row.updated_at,
  };
}

// Per lesson: how many nodes have a row, how many are known, and the three lowest p
// (ties by node id, so the answer is stable). Lesson keys come from the phone, so the
// buckets are a Map and the output has no prototype: a lesson named "__proto__" or
// "constructor" is just a key.
export function masterySummary(rows) {
  const lessons = new Map();
  for (const row of rows) {
    if (!lessons.has(row.lesson)) lessons.set(row.lesson, []);
    lessons.get(row.lesson).push(row);
  }
  const out = Object.create(null);
  for (const lesson of [...lessons.keys()].sort()) {
    const list = lessons.get(lesson);
    const weakest = [...list].sort((a, b) => a.p - b.p || a.nodeId.localeCompare(b.nodeId)).slice(0, MASTERY_LIMITS.weakest)
      .map(row => ({ nodeId: row.nodeId, device: row.device, p: row.p }));
    out[lesson] = { nodes: list.length, known: list.filter(row => isKnown(row.p)).length, weakest };
  }
  return out;
}

// Supabase-backed store. Every method throws on a database error (including the
// missing table before 0047 runs).
const PAGE = 500;
export function createNodeMasteryStore(client = createServiceClient(), { page = PAGE } = {}) {
  const check = ({ data, error }) => { if (error) throw error; return data; };
  return {
    // One statement (a2.put_node_mastery): a row is replaced only by a newer updatedAt.
    async putNodes(device, course, nodes) {
      const data = check(await client.rpc('put_node_mastery', {
        p_device: device, p_course: course,
        p_nodes: nodes.map(n => ({ node_id: n.nodeId, lesson: n.lesson, p: n.p, asked: n.asked, again: n.again, known_at: n.knownAt, updated_at: n.updatedAt })),
      }));
      return Number(data?.written) || 0;
    },
    // Rows for a course (optionally one lesson, optionally one device), in pages so
    // PostgREST's row cap never truncates silently.
    async list({ course, lesson = null, device = null }) {
      const rows = [];
      for (let start = 0; ; start += page) {
        let query = client.from('node_mastery').select('*').eq('course', course);
        if (lesson) query = query.eq('lesson', lesson);
        if (device) query = query.eq('device', device);
        const chunk = check(await query.order('lesson').order('node_id').order('device').range(start, start + page - 1)) || [];
        rows.push(...chunk);
        if (chunk.length < page) return rows;
      }
    },
  };
}

function parserErrors(error, _req, res, next) {
  if (!error || !error.type) return next(error);
  if (error.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'too_large' });
  return res.status(400).json({ ok: false, error: 'bad_json' });
}

// One lazily created store per app, shared by the phone and teacher routes (and by
// GET /teacher/decks for `ready`).
const stores = new WeakMap();
export function masteryStorageFor(app, store) {
  return () => {
    if (store) return store;
    if (!stores.has(app)) stores.set(app, createNodeMasteryStore());
    return stores.get(app);
  };
}
const unavailable = res => res.status(503).json({ error: 'Mastery service unavailable' });

// Phone route. Mount BEFORE the app-wide express.json: the bearer check runs first,
// then a bounded route-local parser (200 nodes of about 200 bytes, with headroom).
export function mountClassLogMastery(app, { store, env = process.env } = {}) {
  const storage = masteryStorageFor(app, store);
  const phoneAuth = (req, res, next) => {
    const verdict = checkClassLogToken(req, env);
    if (verdict === 'ok') return next();
    res.set('Cache-Control', 'no-store');
    if (verdict === 'unconfigured') return res.status(503).json({ error: 'Class Log mastery is not configured' });
    res.status(401).end();
  };
  const phoneJson = express.json({ limit: '64kb' });

  app.put('/class-log/mastery', phoneAuth, phoneJson, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let body;
    try { body = validateMasteryPut(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    let written;
    try { written = await storage().putNodes(body.device, body.course, body.nodes); } catch { return unavailable(res); }
    res.json({ ok: true, written });
  }, parserErrors);
}

// Desk route, mounted after the password gate like the other teacher routes.
export function mountTeacherMastery(app, { db, store } = {}) {
  const storage = masteryStorageFor(app, store);
  app.get('/teacher/mastery', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let ok = false;
    try { ok = await requireTeacher(req, db); } catch { ok = false; }
    if (!ok) return res.status(403).json({ error: 'Teacher sign-in required' });
    const course = req.query.course ?? 'algebra2';
    if (!COURSES.includes(course)) return res.status(400).json({ error: `course must be one of ${COURSES.join(', ')}` });
    const lesson = typeof req.query.lesson === 'string' && req.query.lesson.trim() ? req.query.lesson.trim() : null;
    if (lesson && charLength(lesson) > DECK_LIMITS.lesson) return res.status(400).json({ error: `lesson must be at most ${DECK_LIMITS.lesson} characters` });
    // Rows, summary and body all inside the try: anything odd in stored data is a
    // short 503, never an unhandled rejection.
    let body;
    try {
      const rows = (await storage().list({ course, lesson })).map(masteryFromRow);
      body = JSON.stringify({ course, lesson, rows, lessons: masterySummary(rows) });
    } catch { return unavailable(res); }
    res.type('application/json').send(body);
  });
}
