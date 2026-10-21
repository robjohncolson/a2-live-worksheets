// Class Log observer cards (school/class-log/OBSERVER_CARD_DB_SPEC.md).
//
//   GET  /class-log/cards?date=YYYY-MM-DD   phone, Bearer CLASS_LOG_TOKEN, ETag/304
//   POST /class-log/cards/:id/outcome       phone, Bearer CLASS_LOG_TOKEN
//   PUT  /teacher/cards                     Desk script, requireTeacher
//   GET  /teacher/cards?date=YYYY-MM-DD     Desk (draft script), requireTeacher
//
// Tables come from migrations 0041/0042 (schema a2 via the service client).
// CLASS_LOG_TOKEN unset => the phone routes answer 503. mountObserverCards (phone)
// goes BEFORE the app-wide express.json so auth runs before any body is parsed;
// mountTeacherCards goes after the password gate like the other teacher routes.
import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { createServiceClient } from './ledger-db.js';
import { requireTeacher } from './teacher-auth.js';
import { isIsoDate, validateCard, validateOutcome, LIMITS } from './observer-card-rules.js';

export { isIsoDate, validateCard, validateOutcome } from './observer-card-rules.js';

// Fields compared before a PUT writes; equal content leaves the row alone.
const CONTENT_FIELDS = ['lesson', 'title', 'mode', 'minutes', 'frame', 'body', 'source'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Bearer check against CLASS_LOG_TOKEN. Returns 'ok' | 'unconfigured' | 'denied'.
export function checkClassLogToken(req, env = process.env) {
  const expected = env.CLASS_LOG_TOKEN;
  if (!expected) return 'unconfigured';
  const header = req.get('authorization');
  const match = typeof header === 'string' && header.match(/^Bearer\s+(\S+)\s*$/i);
  if (!match) return 'denied';
  const a = createHash('sha256').update(match[1]).digest();
  const b = createHash('sha256').update(expected).digest();
  // Hashing first gives equal-length buffers, so timingSafeEqual never throws on length.
  return timingSafeEqual(a, b) ? 'ok' : 'denied';
}

// Strong ETag over the full content of the day's rows: every column of every row,
// rows sorted by id, keys sorted. Any edit (including a direct SQL edit that leaves
// updated_at alone), insert or delete changes it.
export function cardsEtag(cards) {
  if (!cards.length) return '"empty"';
  const rows = [...cards].sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(row => Object.keys(row).sort().map(key => [key, row[key] ?? null]));
  const hash = createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16);
  return `"${cards.length}-${hash}"`;
}

export function sameContent(existing, card) {
  return CONTENT_FIELDS.every(field => (existing[field] ?? null) === (card[field] ?? null));
}

const isUniqueViolation = error => error?.code === '23505';

// Supabase-backed store. Every method throws on a database error.
export function createObserverCardStore(client = createServiceClient()) {
  const check = ({ data, error }) => { if (error) throw error; return data; };
  return {
    async listByDate(date) {
      return check(await client.from('observer_cards').select('*').eq('date', date).order('course').order('section')) || [];
    },
    async getCard(id) {
      return check(await client.from('observer_cards').select('id, date').eq('id', id).maybeSingle());
    },
    async upsertOutcome(row) {
      check(await client.from('observer_card_outcomes').upsert(row, { onConflict: 'card_id,section,device' }));
    },
    // NULL sections are distinct under the 0041 unique constraint, so match with IS
    // NULL explicitly. Never maybeSingle: if duplicates ever exist (before 0042),
    // return the most recently updated one instead of failing forever.
    async findCard(date, course, section) {
      let query = client.from('observer_cards').select('*').eq('date', date).eq('course', course);
      query = section === null ? query.is('section', null) : query.eq('section', section);
      const rows = check(await query) || [];
      return rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] || null;
    },
    async updateCard(id, fields) {
      check(await client.from('observer_cards').update(fields).eq('id', id));
    },
    async insertCard(row) {
      check(await client.from('observer_cards').insert(row));
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
    if (!stores.has(app)) stores.set(app, createObserverCardStore());
    return stores.get(app);
  };
}
const unavailable = res => res.status(503).json({ error: 'Observer card service unavailable' });

// Phone routes. Mount BEFORE the app-wide express.json: the bearer check runs
// first, then a bounded route-local parser.
export function mountObserverCards(app, { store, env = process.env, now = () => new Date() }) {
  const storage = storageFor(app, store);

  const phoneAuth = (req, res, next) => {
    const verdict = checkClassLogToken(req, env);
    if (verdict === 'ok') return next();
    res.set('Cache-Control', 'no-store');
    if (verdict === 'unconfigured') return res.status(503).json({ error: 'Class Log cards are not configured' });
    res.status(401).end();
  };
  const phoneJson = express.json({ limit: '64kb' });

  app.get('/class-log/cards', phoneAuth, async (req, res) => {
    const date = req.query.date;
    if (!isIsoDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    let cards;
    try { cards = await storage().listByDate(date); } catch { return unavailable(res); }
    const etag = cardsEtag(cards);
    const headers = { ETag: etag, 'Cache-Control': 'no-cache' };
    // Exact match only, ignoring a weak prefix: the compression layer in front of the
    // app turns our strong ETag into W/"..." on the wire, and the phone echoes that back.
    // The 200 goes out through res.end so Express's own freshness check (*, lists) cannot turn it into a 304.
    const sent = String(req.get('if-none-match') || '').trim().replace(/^W\//, '');
    if (sent === etag) return res.status(304).set(headers).end();
    res.status(200).set({ ...headers, 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ date, cards }));
  }, parserErrors);

  app.post('/class-log/cards/:id/outcome', phoneAuth, phoneJson, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let outcome;
    try { outcome = validateOutcome(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const id = req.params.id;
    try {
      const card = UUID.test(id) ? await storage().getCard(id) : null;
      if (!card) return res.status(404).json({ error: 'Card not found' });
      await storage().upsertOutcome({
        card_id: card.id, date: card.date, section: outcome.section, ran: outcome.ran,
        at: outcome.at, device: outcome.device, recorded_at: now().toISOString(),
      });
      res.json({ ok: true });
    } catch { unavailable(res); }
  }, parserErrors);
}

// Desk route. Mounted after the password gate (which needs the parsed body), so
// in createApp the app-wide parser has already run; the 2 MB route parser bounds
// the body when this is mounted on an app without one (and in tests).
export function mountTeacherCards(app, { db, store, now = () => new Date() }) {
  const storage = storageFor(app, store);
  const teacherAuth = async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    let ok = false;
    try { ok = await requireTeacher(req, db); } catch { ok = false; }
    if (!ok) return res.status(403).json({ error: 'Teacher sign-in required' });
    next();
  };
  const teacherJson = express.json({ limit: '2mb' });

  // The Desk's own read of a day's cards (scripts/draft-observer-cards.mjs): the
  // same {date, cards} rows as the phone GET, without the ETag.
  app.get('/teacher/cards', teacherAuth, async (req, res) => {
    const date = req.query.date;
    if (!isIsoDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    let cards;
    try { cards = await storage().listByDate(date); } catch { return unavailable(res); }
    res.json({ date, cards });
  });

  app.put('/teacher/cards', teacherAuth, teacherJson, async (req, res) => {
    if (!Array.isArray(req.body) || req.body.length === 0) return res.status(400).json({ error: 'body must be a non-empty array of cards' });
    if (req.body.length > LIMITS.cardsPerPut) return res.status(400).json({ error: `at most ${LIMITS.cardsPerPut} cards per request` });
    let cards;
    try { cards = req.body.map(validateCard); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const keys = new Set();
    for (const card of cards) {
      const key = [card.date, card.course, card.section ?? ''].join('|');
      if (keys.has(key)) return res.status(400).json({ error: `duplicate card for ${card.date} ${card.course} ${card.section ?? '(all sections)'}` });
      keys.add(key);
    }
    let written = 0, unchanged = 0;
    const update = async (existing, card) => {
      if (sameContent(existing, card)) { unchanged++; return; }
      const fields = Object.fromEntries(CONTENT_FIELDS.map(field => [field, card[field]]));
      await storage().updateCard(existing.id, { ...fields, updated_at: now().toISOString() });
      written++;
    };
    try {
      for (const card of cards) {
        const existing = await storage().findCard(card.date, card.course, card.section);
        if (existing) { await update(existing, card); continue; }
        try {
          await storage().insertCard({ ...card, updated_at: now().toISOString() });
          written++;
        } catch (error) {
          // Lost a race with another first push for the same key: take the update path.
          if (!isUniqueViolation(error)) throw error;
          const winner = await storage().findCard(card.date, card.course, card.section);
          if (!winner) throw error;
          await update(winner, card);
        }
      }
    } catch { return res.status(503).json({ error: 'Observer card service unavailable', written, unchanged }); }
    res.json({ ok: true, written, unchanged });
  }, parserErrors);
}
