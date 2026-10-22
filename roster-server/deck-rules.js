// Pure validation rules for Class Log card decks (school/class-log/REHEARSAL_SPEC.md,
// WP-1), shared by the server (card-decks.js) and the Desk draft script
// (scripts/draft-card-decks.mjs). No I/O. Lengths count characters (Unicode code
// points), not bytes. The phone mirrors the item rules.
import { createHash } from 'node:crypto';
import { charLength, isIsoDate } from './observer-card-rules.js';

export { charLength, isIsoDate } from './observer-card-rules.js';

export const DECK_TYPES = ['frame', 'anchor', 'trap', 'step', 'cue'];
export const DECK_GRADES = ['again', 'got_it'];
export const DECK_LIMITS = {
  minItems: 8, maxItems: 14, idMin: 8, idMax: 40, front: 240, back: 320, maxOrder: 999, maxMinute: 180,
  decksPerPut: 20, resultsPerPost: 200, device: 32, section: 16, model: 64, maxSession: 1000, maxLatencyMs: 3600000,
};
const ID = /^[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = value => typeof value === 'string' && UUID.test(value);
const isItemId = value => typeof value === 'string' && ID.test(value) && value.length >= DECK_LIMITS.idMin && value.length <= DECK_LIMITS.idMax;

// Stable item id: the first 12 hex of SHA-256 of type + front.
export const itemId = (type, front) => createHash('sha256').update(String(type) + String(front)).digest('hex').slice(0, 12);

// Postgres text/jsonb cannot hold U+0000; refuse it up front (400) instead of a retryable 503.
function noNul(text, name) { if (text.includes('\u0000')) throw new Error(`${name} must not contain U+0000`); }

function requiredText(value, name, max) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  const out = value.trim();
  noNul(out, name);
  if (charLength(out) > max) throw new Error(`${name} must be at most ${max} characters`);
  return out;
}

// One item. Returns the normalized item (unknown keys dropped); throws on any problem.
export function validateItem(item, index = 0) {
  const where = `item ${index}`;
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${where}: must be an object`);
  if (!isItemId(item.id)) throw new Error(`${where}: id must be ${DECK_LIMITS.idMin}-${DECK_LIMITS.idMax} characters of A-Z a-z 0-9 _ -`);
  if (!DECK_TYPES.includes(item.type)) throw new Error(`${where}: type must be one of ${DECK_TYPES.join(', ')}`);
  const front = requiredText(item.front, `${where}: front`, DECK_LIMITS.front);
  const back = requiredText(item.back, `${where}: back`, DECK_LIMITS.back);
  if (!Number.isInteger(item.order) || item.order < 0 || item.order > DECK_LIMITS.maxOrder) throw new Error(`${where}: order must be an integer 0-${DECK_LIMITS.maxOrder}`);
  const after = item.after ?? [];
  if (!Array.isArray(after) || after.some(id => typeof id !== 'string')) throw new Error(`${where}: after must be an array of item ids`);
  if (new Set(after).size !== after.length) throw new Error(`${where}: after must not repeat an id`);
  if (after.includes(item.id)) throw new Error(`${where}: after must not include the item itself`);
  // A step carries its minute of the routine (required); every other type has none.
  const minute = item.minute ?? null;
  if (item.type === 'step') {
    if (!Number.isInteger(minute) || minute < 0 || minute > DECK_LIMITS.maxMinute) throw new Error(`${where}: a step needs minute, an integer 0-${DECK_LIMITS.maxMinute}`);
  } else if (minute !== null) {
    throw new Error(`${where}: minute is for steps only (null otherwise)`);
  }
  return { id: item.id, type: item.type, front, back, order: item.order, after: [...after], minute };
}

// A deck's items: 8 to 14, ids unique, `after` only naming ids in the deck and acyclic.
export function validateItems(items) {
  if (!Array.isArray(items)) throw new Error('items must be an array');
  if (items.length < DECK_LIMITS.minItems || items.length > DECK_LIMITS.maxItems) {
    throw new Error(`items must have ${DECK_LIMITS.minItems} to ${DECK_LIMITS.maxItems} entries (got ${items.length})`);
  }
  const out = items.map(validateItem);
  const byId = new Map();
  for (const item of out) {
    if (byId.has(item.id)) throw new Error(`duplicate item id ${item.id}`);
    byId.set(item.id, item);
  }
  for (const item of out) {
    for (const id of item.after) if (!byId.has(id)) throw new Error(`item ${item.id}: after names unknown id ${id}`);
  }
  const state = new Map(); // id -> 1 visiting, 2 done
  const visit = (id, path) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) throw new Error(`after has a cycle: ${[...path, id].join(' -> ')}`);
    state.set(id, 1);
    for (const next of byId.get(id).after) visit(next, [...path, id]);
    state.set(id, 2);
  };
  for (const item of out) visit(item.id, []);
  return out;
}

// Hash of what a deck says: its normalized items and the model. generatedAt is
// left out so re-pushing the same file never rewrites the row.
export function deckContentHash(items, model = null) {
  const canon = items.map(item => [item.id, item.type, item.front, item.back, item.order, item.after, item.minute]);
  return createHash('sha256').update(JSON.stringify([canon, model ?? null])).digest('hex').slice(0, 32);
}

function optionalModel(value, where) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error(`${where}: model must be a string or null`);
  const out = value.trim();
  noNul(out, `${where}: model`);
  if (charLength(out) > DECK_LIMITS.model) throw new Error(`${where}: model must be at most ${DECK_LIMITS.model} characters`);
  return out || null;
}

function optionalTimestamp(value, name) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} must be null or an ISO 8601 timestamp`);
  }
  return new Date(value).toISOString();
}

// One deck of PUT /teacher/decks. Returns {cardId, items, model, generatedAt, contentHash}.
export function validateDeck(deck, index = 0) {
  const where = `deck ${index}`;
  if (!deck || typeof deck !== 'object' || Array.isArray(deck)) throw new Error(`${where}: must be an object`);
  if (!isUuid(deck.cardId)) throw new Error(`${where}: cardId must be a card uuid`);
  let items;
  try { items = validateItems(deck.items); } catch (error) { throw new Error(`${where}: ${error.message}`); }
  const model = optionalModel(deck.model, where);
  const generatedAt = optionalTimestamp(deck.generatedAt, `${where}: generatedAt`);
  return { cardId: deck.cardId.toLowerCase(), items, model, generatedAt, contentHash: deckContentHash(items, model) };
}

// Body of PUT /teacher/decks: {decks: [...]}, 1 to 20 decks, one per card.
export function validateDeckPut(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body must be an object');
  if (!Array.isArray(body.decks) || !body.decks.length) throw new Error('decks must be a non-empty array');
  if (body.decks.length > DECK_LIMITS.decksPerPut) throw new Error(`at most ${DECK_LIMITS.decksPerPut} decks per request`);
  const decks = body.decks.map(validateDeck);
  const seen = new Set();
  for (const deck of decks) {
    if (seen.has(deck.cardId)) throw new Error(`more than one deck for card ${deck.cardId}`);
    seen.add(deck.cardId);
  }
  return decks;
}

function shortText(value, name, max) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  const out = value.trim();
  noNul(out, name);
  if (charLength(out) > max) throw new Error(`${name} must be at most ${max} characters`);
  return out;
}

// Body of POST /class-log/deck-results. Returns {device, cardId, section, date,
// results: [{session, itemId, grade, at, latencyMs}]} with exact repeats (same
// session, item and at) removed; `at` is normalized to ISO UTC.
export function validateResults(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body must be an object');
  const device = shortText(body.device ?? 's24', 'device', DECK_LIMITS.device);
  if (!isUuid(body.cardId)) throw new Error('cardId must be a card uuid');
  const section = shortText(body.section, 'section', DECK_LIMITS.section);
  if (!isIsoDate(body.date)) throw new Error('date must be a real YYYY-MM-DD date');
  if (!Array.isArray(body.results) || !body.results.length) throw new Error('results must be a non-empty array');
  if (body.results.length > DECK_LIMITS.resultsPerPost) throw new Error(`at most ${DECK_LIMITS.resultsPerPost} results per request`);
  const seen = new Set();
  const results = [];
  body.results.forEach((row, i) => {
    const where = `results[${i}]`;
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`${where} must be an object`);
    if (!Number.isInteger(row.session) || row.session < 1 || row.session > DECK_LIMITS.maxSession) throw new Error(`${where}.session must be an integer 1-${DECK_LIMITS.maxSession}`);
    if (!isItemId(row.itemId)) throw new Error(`${where}.itemId must be an item id`);
    if (!DECK_GRADES.includes(row.grade)) throw new Error(`${where}.grade must be again or got_it`);
    const at = optionalTimestamp(row.at, `${where}.at`);
    if (at === null) throw new Error(`${where}.at must be an ISO 8601 timestamp`);
    const latencyMs = row.latencyMs ?? null;
    if (latencyMs !== null && (!Number.isInteger(latencyMs) || latencyMs < 0 || latencyMs > DECK_LIMITS.maxLatencyMs)) {
      throw new Error(`${where}.latencyMs must be null or an integer 0-${DECK_LIMITS.maxLatencyMs}`);
    }
    const key = `${row.session}|${row.itemId}|${at}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ session: row.session, itemId: row.itemId, grade: row.grade, at, latencyMs });
  });
  return { device, cardId: body.cardId.toLowerCase(), section, date: body.date, results };
}

// Roster first names found in any item's front or back (whole word, case-sensitive).
// Returns [{id, name}]; empty when clean or when no names are given.
export function rosterNameHits(items, firstNames) {
  const names = [...new Set((firstNames || []).map(name => String(name).trim()).filter(name => name.length >= 2))];
  if (!names.length) return [];
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hits = [];
  for (const item of items || []) {
    for (const name of names) {
      const pattern = new RegExp(`(^|[^\\p{L}])${escape(name)}(?![\\p{L}])`, 'u');
      if (pattern.test(String(item.front ?? '')) || pattern.test(String(item.back ?? ''))) hits.push({ id: item.id, name });
    }
  }
  return hits;
}
