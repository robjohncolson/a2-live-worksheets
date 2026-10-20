// Class Log lesson summaries (school/class-log/POLISH2_SPEC.md, WP-C).
//
//   POST /class-log/summaries                          phone, Bearer CLASS_LOG_TOKEN
//   GET  /teacher/summaries?from=YYYY-MM-DD&to=...     Desk, requireTeacher
//
// Table from migration 0043 (a2.class_summaries via the service client). Until
// it exists, both routes answer 503 and the phone retries. Same middleware
// order as observer-cards.js: mountClassSummaries (phone) goes BEFORE the
// app-wide express.json so auth runs before any body is parsed;
// mountTeacherSummaries goes after the password gate.
import express from 'express';
import { createServiceClient } from './ledger-db.js';
import { requireTeacher } from './teacher-auth.js';
import { checkClassLogToken } from './observer-cards.js';
import { CARD_COURSES, charLength, isIsoDate } from './observer-card-rules.js';

export const SUMMARY_LIMITS = {
  section: 16, model: 64, markdown: 40000, path: 200, items: 40, item: 400, rangeDays: 62,
  // 40 000 four-byte characters plus 4 x 40 x 400 four-byte items, with JSON escaping headroom.
  bodyBytes: '1mb',
};
// [body field, column]
export const SUMMARY_LISTS = [
  ['landed', 'landed'], ['studentQuestions', 'student_questions'], ['promises', 'promises'], ['nextPrep', 'next_prep'],
];

function optionalText(value, name, max) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error(`${name} must be a string or null`);
  const text = value.trim();
  noNul(text, name);
  if (charLength(text) > max) throw new Error(`${name} must be at most ${max} characters`);
  return text || null;
}

// Postgres text/jsonb cannot hold U+0000; refuse it up front (400) instead of a retryable 503.
function noNul(text, name) { if (text.includes('\u0000')) throw new Error(`${name} must not contain U+0000`); }

function textList(value, name) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${name} must be an array of strings`);
  if (value.length > SUMMARY_LIMITS.items) throw new Error(`${name} must have at most ${SUMMARY_LIMITS.items} items`);
  return value.map((item, i) => {
    if (typeof item !== 'string') throw new Error(`${name}[${i}] must be a string`);
    const text = item.trim();
    noNul(text, `${name}[${i}]`);
    if (charLength(text) > SUMMARY_LIMITS.item) throw new Error(`${name}[${i}] must be at most ${SUMMARY_LIMITS.item} characters`);
    return text;
  }).filter(Boolean);
}

// Body of POST /class-log/summaries. Returns the database row (without
// recorded_at); throws on any problem. Lengths count characters, not bytes.
export function validateSummary(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body must be an object');
  if (!isIsoDate(body.date)) throw new Error('date must be a real YYYY-MM-DD date');
  if (!CARD_COURSES.includes(body.course)) throw new Error(`course must be one of ${CARD_COURSES.join(', ')}`);
  if (typeof body.section !== 'string' || !body.section.trim()) throw new Error('section must be a non-empty string');
  const section = body.section.trim();
  noNul(section, 'section');
  if (charLength(section) > SUMMARY_LIMITS.section) throw new Error(`section must be at most ${SUMMARY_LIMITS.section} characters`);
  const model = optionalText(body.model, 'model', SUMMARY_LIMITS.model);
  if (typeof body.markdown !== 'string' || !body.markdown.trim()) throw new Error('markdown is required');
  noNul(body.markdown, 'markdown');
  if (charLength(body.markdown) > SUMMARY_LIMITS.markdown) throw new Error(`markdown must be at most ${SUMMARY_LIMITS.markdown} characters`);
  const row = { date: body.date, course: body.course, section, model, markdown: body.markdown };
  for (const [field, column] of SUMMARY_LISTS) row[column] = textList(body[field], field);
  row.transcript_path = optionalText(body.transcriptPath, 'transcriptPath', SUMMARY_LIMITS.path);
  row.summary_path = optionalText(body.summaryPath, 'summaryPath', SUMMARY_LIMITS.path);
  return row;
}

// Inclusive day count from..to, or null when either date is not real or to < from.
export function rangeDays(from, to) {
  if (!isIsoDate(from) || !isIsoDate(to)) return null;
  const days = (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000 + 1;
  return days >= 1 ? days : null;
}

// Database row -> the Desk's camelCase shape (same names as the POST body).
export function summaryFromRow(row) {
  const out = { date: row.date, course: row.course, section: row.section, model: row.model ?? null, markdown: row.markdown };
  for (const [field, column] of SUMMARY_LISTS) out[field] = Array.isArray(row[column]) ? row[column] : [];
  out.transcriptPath = row.transcript_path ?? null;
  out.summaryPath = row.summary_path ?? null;
  out.recordedAt = row.recorded_at;
  return out;
}

// Supabase-backed store. Every method throws on a database error (including a
// missing table before 0043 runs).
const PAGE = 500;

export function createClassSummaryStore(client = createServiceClient()) {
  const check = ({ data, error }) => { if (error) throw error; return data; };
  return {
    async upsertSummary(row) {
      check(await client.from('class_summaries').upsert(row, { onConflict: 'date,course,section' }));
    },
    // Pages of PAGE rows in the stable (date, section, course) order, so PostgREST's row cap
    // (1000 on Supabase by default) can never truncate a range silently.
    async listRange(from, to) {
      const rows = [];
      for (let start = 0; ; start += PAGE) {
        const page = check(await client.from('class_summaries').select('*').gte('date', from).lte('date', to)
          .order('date').order('section').order('course').range(start, start + PAGE - 1)) || [];
        rows.push(...page);
        if (page.length < PAGE) return rows;
      }
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
    if (!stores.has(app)) stores.set(app, createClassSummaryStore());
    return stores.get(app);
  };
}
const unavailable = res => res.status(503).json({ error: 'Class summary service unavailable' });

// Phone route. Mount BEFORE the app-wide express.json: the bearer check runs
// first, then a bounded route-local parser.
export function mountClassSummaries(app, { store, env = process.env, now = () => new Date() }) {
  const storage = storageFor(app, store);

  const phoneAuth = (req, res, next) => {
    const verdict = checkClassLogToken(req, env);
    if (verdict === 'ok') return next();
    res.set('Cache-Control', 'no-store');
    if (verdict === 'unconfigured') return res.status(503).json({ error: 'Class Log summaries are not configured' });
    res.status(401).end();
  };
  const phoneJson = express.json({ limit: SUMMARY_LIMITS.bodyBytes });

  app.post('/class-log/summaries', phoneAuth, phoneJson, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let row;
    try { row = validateSummary(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    try {
      await storage().upsertSummary({ ...row, recorded_at: now().toISOString() });
      res.json({ ok: true });
    } catch { unavailable(res); }
  }, parserErrors);
}

// Desk route. Mounted after the password gate like the other teacher routes.
export function mountTeacherSummaries(app, { db, store }) {
  const storage = storageFor(app, store);
  const teacherAuth = async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    let ok = false;
    try { ok = await requireTeacher(req, db); } catch { ok = false; }
    if (!ok) return res.status(403).json({ error: 'Teacher sign-in required' });
    next();
  };

  app.get('/teacher/summaries', teacherAuth, async (req, res) => {
    const { from, to } = req.query;
    if (!isIsoDate(from) || !isIsoDate(to)) return res.status(400).json({ error: 'from and to must be YYYY-MM-DD' });
    const days = rangeDays(from, to);
    if (days === null) return res.status(400).json({ error: 'to must not be before from' });
    if (days > SUMMARY_LIMITS.rangeDays) return res.status(400).json({ error: `range must be at most ${SUMMARY_LIMITS.rangeDays} days` });
    let rows;
    try { rows = await storage().listRange(from, to); } catch { return unavailable(res); }
    res.json({ from, to, summaries: rows.map(summaryFromRow) });
  });
}
