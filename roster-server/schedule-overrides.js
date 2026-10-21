// Class Log schedule overrides (school/class-log/POLISH3_SPEC.md, WP-S S1).
//
//   GET    /class-log/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD   phone, Bearer CLASS_LOG_TOKEN, ETag/304
//   GET    /teacher/schedule-overrides?from=&to=               Desk (health strip), requireTeacher
//   PUT    /teacher/schedule-overrides                         Desk script, requireTeacher
//   DELETE /teacher/schedule-overrides?date=&section=          Desk, requireTeacher (no section => the day off)
//
// Tables from migration 0044 (a2.schedule_overrides, a2.schedule_days_off via the
// service client). Until it runs, every route answers 503. Same middleware order
// as observer-cards.js: mountScheduleOverrides (phone) goes BEFORE the app-wide
// express.json so auth runs before anything else; mountTeacherSchedule goes after
// the password gate.
import { createHash } from 'node:crypto';
import express from 'express';
import { createServiceClient } from './ledger-db.js';
import { requireTeacher } from './teacher-auth.js';
import { checkClassLogToken } from './observer-cards.js';
import { SCHEDULE_LIMITS, charLength, isIsoDate, rangeDays, validateSchedulePut } from './schedule-rules.js';

export { validateSchedulePut, validateOverride, validateDayOff } from './schedule-rules.js';

// Fields compared before a PUT writes; equal content leaves the row alone.
const OVERRIDE_FIELDS = ['start', 'end', 'cancelled', 'note', 'source'];
const DAY_OFF_FIELDS = ['note'];
const hhmm = value => (value == null ? null : String(value).slice(0, 5));

// Database rows -> the phone's payload shape. Times "HH:MM:SS" -> "HH:MM".
export function schedulePayload(from, to, overrides, daysOff) {
  return {
    from, to,
    overrides: overrides.map(row => ({
      date: row.date, section: row.section, start: hhmm(row.start), end: hhmm(row.end), cancelled: row.cancelled === true, note: row.note ?? null,
    })),
    daysOff: daysOff.map(row => row.date),
  };
}

// Strong ETag over the range and its full content: from/to plus every column of
// every row of both tables (sorted by key, keys sorted), so any write, hand edit,
// insert or delete in the range changes it, and a different range (a rolling
// window, even an empty one) never matches another range's tag.
export function scheduleEtag(from, to, overrides, daysOff) {
  const canon = rows => rows.map(row => Object.keys(row).sort().map(key => [key, row[key] ?? null]));
  const sortedOverrides = [...overrides].sort((a, b) => `${a.date}|${a.section}`.localeCompare(`${b.date}|${b.section}`));
  const sortedDays = [...daysOff].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const hash = createHash('sha256').update(JSON.stringify([from, to, canon(sortedOverrides), canon(sortedDays)])).digest('hex').slice(0, 16);
  if (!overrides.length && !daysOff.length) return `"empty-${hash}"`;
  return `"${overrides.length}.${daysOff.length}-${hash}"`;
}

const same = (fields, a, b) => fields.every(field => (a[field] ?? null) === (b[field] ?? null));
// Postgres returns time as HH:MM:SS; compare on HH:MM like the validated body.
const normalizeOverride = row => ({ ...row, start: hhmm(row.start), end: hhmm(row.end) });

// Supabase-backed store. Every method throws on a database error (including a
// missing table before 0044 runs).
const PAGE = 500;
export function createScheduleStore(client = createServiceClient(), { page = PAGE } = {}) {
  const check = ({ data, error }) => { if (error) throw error; return data; };
  // Pages of PAGE rows in a stable order so PostgREST's row cap never truncates silently.
  const paged = async (table, from, to, orders) => {
    const rows = [];
    for (let start = 0; ; start += page) {
      let query = client.from(table).select('*').gte('date', from).lte('date', to);
      for (const column of orders) query = query.order(column);
      const chunk = check(await query.range(start, start + page - 1)) || [];
      rows.push(...chunk);
      if (chunk.length < page) return rows;
    }
  };
  return {
    listOverrides: (from, to) => paged('schedule_overrides', from, to, ['date', 'section']),
    listDaysOff: (from, to) => paged('schedule_days_off', from, to, ['date']),
    async upsertOverrides(rows) {
      if (rows.length) check(await client.from('schedule_overrides').upsert(rows, { onConflict: 'date,section' }));
    },
    async upsertDaysOff(rows) {
      if (rows.length) check(await client.from('schedule_days_off').upsert(rows, { onConflict: 'date' }));
    },
    async deleteOverride(date, section) {
      return (check(await client.from('schedule_overrides').delete().eq('date', date).eq('section', section).select('date')) || []).length;
    },
    async deleteDayOff(date) {
      return (check(await client.from('schedule_days_off').delete().eq('date', date).select('date')) || []).length;
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
    if (!stores.has(app)) stores.set(app, createScheduleStore());
    return stores.get(app);
  };
}
const unavailable = res => res.status(503).json({ error: 'Schedule service unavailable' });

function rangeProblem(from, to) {
  if (!isIsoDate(from) || !isIsoDate(to)) return 'from and to must be YYYY-MM-DD';
  const days = rangeDays(from, to);
  if (days === null) return 'to must not be before from';
  if (days > SCHEDULE_LIMITS.rangeDays) return `range must be at most ${SCHEDULE_LIMITS.rangeDays} days`;
  return null;
}

// Phone route. Mount BEFORE the app-wide express.json: the bearer check runs first.
export function mountScheduleOverrides(app, { store, env = process.env }) {
  const storage = storageFor(app, store);
  const phoneAuth = (req, res, next) => {
    const verdict = checkClassLogToken(req, env);
    if (verdict === 'ok') return next();
    res.set('Cache-Control', 'no-store');
    if (verdict === 'unconfigured') return res.status(503).json({ error: 'Class Log schedule is not configured' });
    res.status(401).end();
  };

  app.get('/class-log/schedule', phoneAuth, async (req, res) => {
    const { from, to } = req.query;
    const problem = rangeProblem(from, to);
    if (problem) return res.status(400).json({ error: problem });
    let overrides, daysOff;
    try { [overrides, daysOff] = await Promise.all([storage().listOverrides(from, to), storage().listDaysOff(from, to)]); }
    catch { return unavailable(res); }
    const etag = scheduleEtag(from, to, overrides, daysOff);
    const headers = { ETag: etag, 'Cache-Control': 'no-cache' };
    // Exact match only, ignoring a weak prefix (the compression layer weakens the tag
    // on the wire and the phone echoes it back). The 200 goes out through res.end so
    // Express's own freshness check cannot turn it into a 304.
    const sent = String(req.get('if-none-match') || '').trim().replace(/^W\//, '');
    if (sent === etag) return res.status(304).set(headers).end();
    res.status(200).set({ ...headers, 'Content-Type': 'application/json; charset=utf-8' })
      .end(JSON.stringify(schedulePayload(from, to, overrides, daysOff)));
  }, parserErrors);
}

// Desk routes. Mounted after the password gate like the other teacher routes; the
// route parser bounds the body when mounted on an app without the global one.
export function mountTeacherSchedule(app, { db, store, now = () => new Date() }) {
  const storage = storageFor(app, store);
  const teacherAuth = async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    let ok = false;
    try { ok = await requireTeacher(req, db); } catch { ok = false; }
    if (!ok) return res.status(403).json({ error: 'Teacher sign-in required' });
    next();
  };
  const teacherJson = express.json({ limit: '256kb' });

  // The Desk's own read (the health strip compares today's blocks with the phone):
  // the same payload as the phone GET, without the ETag handling.
  app.get('/teacher/schedule-overrides', teacherAuth, async (req, res) => {
    const { from, to } = req.query;
    const problem = rangeProblem(from, to);
    if (problem) return res.status(400).json({ error: problem });
    let overrides, daysOff;
    try { [overrides, daysOff] = await Promise.all([storage().listOverrides(from, to), storage().listDaysOff(from, to)]); }
    catch { return unavailable(res); }
    res.json(schedulePayload(from, to, overrides, daysOff));
  });

  app.put('/teacher/schedule-overrides', teacherAuth, teacherJson, async (req, res) => {
    let body;
    try { body = validateSchedulePut(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const dates = [...body.overrides, ...body.daysOff].map(row => row.date).sort();
    const from = dates[0], to = dates.at(-1);
    let written, unchanged;
    try {
      const stamp = now().toISOString();
      const existingOverrides = new Map((await storage().listOverrides(from, to)).map(row => [`${row.date}|${row.section}`, normalizeOverride(row)]));
      const existingDays = new Map((await storage().listDaysOff(from, to)).map(row => [row.date, row]));
      const overrides = body.overrides.filter(row => {
        const existing = existingOverrides.get(`${row.date}|${row.section}`);
        return !(existing && same(OVERRIDE_FIELDS, existing, row));
      });
      const daysOff = body.daysOff.filter(row => {
        const existing = existingDays.get(row.date);
        return !(existing && same(DAY_OFF_FIELDS, existing, row));
      });
      await storage().upsertOverrides(overrides.map(row => ({ ...row, updated_at: stamp })));
      await storage().upsertDaysOff(daysOff.map(row => ({ ...row, updated_at: stamp })));
      written = overrides.length + daysOff.length;
      unchanged = body.overrides.length + body.daysOff.length - written;
    } catch { return unavailable(res); }
    res.json({ ok: true, written, unchanged });
  }, parserErrors);

  app.delete('/teacher/schedule-overrides', teacherAuth, async (req, res) => {
    const { date, section } = req.query;
    if (!isIsoDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    if (section !== undefined && (typeof section !== 'string' || !section.trim() || section.includes('\u0000') || charLength(section.trim()) > SCHEDULE_LIMITS.section)) {
      return res.status(400).json({ error: `section must be 1-${SCHEDULE_LIMITS.section} characters` });
    }
    let deleted;
    try { deleted = section === undefined ? await storage().deleteDayOff(date) : await storage().deleteOverride(date, section.trim()); }
    catch { return unavailable(res); }
    res.json({ ok: true, deleted });
  });
}
