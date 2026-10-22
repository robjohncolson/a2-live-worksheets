// Class Log card decks (school/class-log/REHEARSAL_SPEC.md, WP-1).
//
//   GET    /class-log/decks?date=YYYY-MM-DD   phone, Bearer CLASS_LOG_TOKEN, ETag/304
//   POST   /class-log/deck-results            phone, Bearer CLASS_LOG_TOKEN, <= 200 results
//   PUT    /teacher/decks                     Desk script, requireTeacher, <= 20 decks, one transaction (RPC a2.put_card_decks)
//   GET    /teacher/decks?date=YYYY-MM-DD     Desk (Rehearsal line), requireTeacher
//   DELETE /teacher/decks?cardId=UUID         Desk, requireTeacher
//
// Tables from migration 0046 (a2.card_decks, a2.deck_results via the service
// client). Until it runs, every route answers 503. Same middleware order as
// observer-cards.js: mountCardDecks (phone) goes BEFORE the app-wide express.json
// so auth runs before any body is parsed; mountTeacherDecks goes after the
// password gate.
import { createHash } from 'node:crypto';
import express from 'express';
import { createServiceClient } from './ledger-db.js';
import { requireTeacher } from './teacher-auth.js';
import { checkClassLogToken } from './observer-cards.js';
import { DECK_LIMITS, isIsoDate, isUuid, validateDeckPut, validateResults } from './deck-rules.js';

export { validateDeckPut, validateResults, validateItems, deckContentHash, itemId } from './deck-rules.js';

// Database row -> the phone's deck shape. items is validated on every write, but
// the 0046 check only pins the jsonb type (array), so a hand edit in the SQL
// editor can leave a non-object entry; those are dropped here instead of
// crashing deckStats (an uncaught throw in an Express 4 async handler is an
// unhandled rejection, which exits the process).
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function deckFromRow(row) {
  return {
    cardId: row.card_id, course: row.course, section: row.section ?? null, items: Array.isArray(row.items) ? row.items.filter(isObject) : [],
    model: row.model ?? null, generatedAt: row.generated_at ?? null, updatedAt: row.updated_at,
  };
}

// Strong ETag over the date and the full content of the day's deck rows: every
// column of every row (content_hash and updated_at included), rows sorted by
// card id, keys sorted. Any push, hand edit, insert or delete changes it.
export function decksEtag(date, rows) {
  const canon = [...rows].sort((a, b) => String(a.card_id).localeCompare(String(b.card_id)))
    .map(row => Object.keys(row).sort().map(key => [key, row[key] ?? null]));
  const hash = createHash('sha256').update(JSON.stringify([date, canon])).digest('hex').slice(0, 16);
  return rows.length ? `"${rows.length}-${hash}"` : `"empty-${hash}"`;
}

// Per-deck result counts for the Desk: sessions (distinct device + session),
// asked (grades), again, and the three items most often missed (again > 0, ties
// by the item's order).
export function deckStats(items, results) {
  const sessions = new Set(results.map(row => `${row.device}|${row.session}`));
  const again = new Map();
  for (const row of results) if (row.grade === 'again') again.set(row.item_id, (again.get(row.item_id) || 0) + 1);
  const known = new Map(items.map((item, i) => [item.id, { item, i }]));
  const missed = [...again].filter(([id]) => known.has(id))
    .sort((a, b) => b[1] - a[1] || known.get(a[0]).item.order - known.get(b[0]).item.order || known.get(a[0]).i - known.get(b[0]).i)
    .slice(0, 3)
    .map(([id, count]) => ({ itemId: id, type: known.get(id).item.type, front: known.get(id).item.front, again: count }));
  return {
    results: { sessions: sessions.size, asked: results.length, again: results.filter(row => row.grade === 'again').length },
    missed,
  };
}

// Supabase-backed store. Every method throws on a database error (including a
// missing table before 0046 runs).
const PAGE = 500;
const RESULT_KEY = 'card_id,device,session,item_id,at';
export function createCardDeckStore(client = createServiceClient(), { page = PAGE } = {}) {
  const check = ({ data, error }) => { if (error) throw error; return data; };
  return {
    async listByDate(date) {
      return check(await client.from('card_decks').select('*').eq('date', date).order('course').order('section').order('card_id')) || [];
    },
    async getCard(id) {
      return check(await client.from('observer_cards').select('id, date, course, section').eq('id', id).maybeSingle());
    },
    // One transaction (a2.put_card_decks, migration 0046): every card checked, only
    // changed decks written. Throws the database error as is (P0002 card_not_found:<id>).
    async putDecks(decks) {
      const data = check(await client.rpc('put_card_decks', { p_decks: decks }));
      return { written: Number(data?.written) || 0, unchanged: Number(data?.unchanged) || 0 };
    },
    async deleteDeck(cardId) {
      return (check(await client.from('card_decks').delete().eq('card_id', cardId).select('card_id')) || []).length;
    },
    // ON CONFLICT DO NOTHING on the unique key; returns how many rows were new.
    async insertResults(rows) {
      return (check(await client.from('deck_results').upsert(rows, { onConflict: RESULT_KEY, ignoreDuplicates: true }).select('id')) || []).length;
    },
    // Pages of PAGE rows in id order, so PostgREST's row cap never truncates silently.
    async listResults(cardIds) {
      if (!cardIds.length) return [];
      const rows = [];
      for (let start = 0; ; start += page) {
        const chunk = check(await client.from('deck_results').select('card_id, device, session, item_id, grade')
          .in('card_id', cardIds).order('id').range(start, start + page - 1)) || [];
        rows.push(...chunk);
        if (chunk.length < page) return rows;
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
    if (!stores.has(app)) stores.set(app, createCardDeckStore());
    return stores.get(app);
  };
}
const unavailable = res => res.status(503).json({ error: 'Card deck service unavailable' });

// Phone routes. Mount BEFORE the app-wide express.json: the bearer check runs
// first, then a bounded route-local parser.
export function mountCardDecks(app, { store, env = process.env, now = () => new Date() }) {
  const storage = storageFor(app, store);
  const phoneAuth = (req, res, next) => {
    const verdict = checkClassLogToken(req, env);
    if (verdict === 'ok') return next();
    res.set('Cache-Control', 'no-store');
    if (verdict === 'unconfigured') return res.status(503).json({ error: 'Class Log decks are not configured' });
    res.status(401).end();
  };
  // 200 results of a few hundred bytes each, with headroom.
  const phoneJson = express.json({ limit: '128kb' });

  app.get('/class-log/decks', phoneAuth, async (req, res) => {
    const date = req.query.date;
    if (!isIsoDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    let rows;
    try { rows = await storage().listByDate(date); } catch { return unavailable(res); }
    const etag = decksEtag(date, rows);
    const headers = { ETag: etag, 'Cache-Control': 'no-cache' };
    // Exact match only, ignoring a weak prefix (the compression layer weakens the tag
    // on the wire and the phone echoes it back). The 200 goes out through res.end so
    // Express's own freshness check cannot turn it into a 304.
    const sent = String(req.get('if-none-match') || '').trim().replace(/^W\//, '');
    if (sent === etag) return res.status(304).set(headers).end();
    res.status(200).set({ ...headers, 'Content-Type': 'application/json; charset=utf-8' })
      .end(JSON.stringify({ date, decks: rows.map(deckFromRow) }));
  }, parserErrors);

  app.post('/class-log/deck-results', phoneAuth, phoneJson, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let body;
    try { body = validateResults(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    try {
      const card = await storage().getCard(body.cardId);
      if (!card) return res.status(404).json({ error: 'Card not found' });
      const received = now().toISOString();
      // The row's date is the card's own date (the body's date is checked for shape only).
      const rows = body.results.map(row => ({
        card_id: card.id, device: body.device, section: body.section, date: card.date, session: row.session,
        item_id: row.itemId, grade: row.grade, at: row.at, latency_ms: row.latencyMs, received_at: received,
      }));
      const inserted = await storage().insertResults(rows);
      res.json({ ok: true, inserted });
    } catch { unavailable(res); }
  }, parserErrors);
}

// Desk routes. Mounted after the password gate like the other teacher routes; the
// route parser bounds the body when mounted on an app without the global one.
export function mountTeacherDecks(app, { db, store }) {
  const storage = storageFor(app, store);
  const teacherAuth = async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    let ok = false;
    try { ok = await requireTeacher(req, db); } catch { ok = false; }
    if (!ok) return res.status(403).json({ error: 'Teacher sign-in required' });
    next();
  };
  const teacherJson = express.json({ limit: '512kb' });

  app.put('/teacher/decks', teacherAuth, teacherJson, async (req, res) => {
    let decks;
    try { decks = validateDeckPut(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    // All or nothing in one database transaction: a missing card (404) or any
    // failure (503, no details) leaves every deck as it was.
    let counts;
    try {
      counts = await storage().putDecks(decks.map(deck => ({
        card_id: deck.cardId, items: deck.items, model: deck.model, generated_at: deck.generatedAt, content_hash: deck.contentHash,
      })));
    } catch (error) {
      const missing = error?.code === 'P0002' && /^card_not_found:([0-9a-f-]{36})$/i.exec(String(error.message || ''));
      if (missing) return res.status(404).json({ error: `Card not found: ${missing[1].toLowerCase()}` });
      return unavailable(res);
    }
    res.json({ ok: true, ...counts });
  }, parserErrors);

  app.get('/teacher/decks', teacherAuth, async (req, res) => {
    const date = req.query.date;
    if (!isIsoDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    let rows, results;
    try {
      rows = await storage().listByDate(date);
      results = await storage().listResults(rows.map(row => row.card_id));
    } catch { return unavailable(res); }
    const byCard = new Map();
    for (const row of results) {
      if (!byCard.has(row.card_id)) byCard.set(row.card_id, []);
      byCard.get(row.card_id).push(row);
    }
    res.json({ date, decks: rows.map(row => {
      const deck = deckFromRow(row);
      return { ...deck, ...deckStats(deck.items, byCard.get(row.card_id) || []) };
    }) });
  });

  app.delete('/teacher/decks', teacherAuth, async (req, res) => {
    const cardId = req.query.cardId;
    if (!isUuid(cardId)) return res.status(400).json({ error: 'cardId must be a card uuid' });
    let deleted;
    try { deleted = await storage().deleteDeck(cardId.toLowerCase()); } catch { return unavailable(res); }
    res.json({ ok: true, deleted });
  });
}

export { DECK_LIMITS };
