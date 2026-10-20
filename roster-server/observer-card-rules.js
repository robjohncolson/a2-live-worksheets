// Pure validation rules for Class Log observer cards, shared by the server
// (observer-cards.js) and the Desk push script (scripts/push-observer-cards.mjs).
// No imports, no I/O. Lengths count characters (Unicode code points), not bytes.

export const CARD_MODES = ['whiteboards', 'ipad', 'poster', 'pairs', 'jam', 'other'];
export const CARD_COURSES = ['algebra2', 'apstats'];
export const CARD_SOURCES = ['desk', 'manual'];
export const LIMITS = { section: 16, device: 32, title: 200, lesson: 32, frame: 500, body: 4000, cardsPerPut: 500, minMinutes: 1, maxMinutes: 180 };

export const charLength = value => [...value].length;

export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function optionalText(value, name, max) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error(`${name} must be a string or null`);
  const text = value.trim();
  if (charLength(text) > max) throw new Error(`${name} must be at most ${max} characters`);
  return text || null;
}

function requiredText(value, name, max) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  const text = value.trim();
  if (charLength(text) > max) throw new Error(`${name} must be at most ${max} characters`);
  return text;
}

// A card as sent to PUT /teacher/cards (no id). Returns the normalized row; throws on any problem.
export function validateCard(card, index = 0) {
  const where = `card ${index}`;
  if (!card || typeof card !== 'object' || Array.isArray(card)) throw new Error(`${where}: must be an object`);
  if ('id' in card) throw new Error(`${where}: id is assigned by the server`);
  if (!isIsoDate(card.date)) throw new Error(`${where}: date must be a real YYYY-MM-DD date`);
  if (!CARD_COURSES.includes(card.course)) throw new Error(`${where}: course must be one of ${CARD_COURSES.join(', ')}`);
  const section = optionalText(card.section, `${where}: section`, LIMITS.section);
  const lesson = optionalText(card.lesson, `${where}: lesson`, LIMITS.lesson);
  const title = requiredText(card.title, `${where}: title`, LIMITS.title);
  const mode = card.mode ?? 'whiteboards';
  if (!CARD_MODES.includes(mode)) throw new Error(`${where}: mode must be one of ${CARD_MODES.join(', ')}`);
  const minutes = card.minutes ?? 10;
  if (!Number.isInteger(minutes) || minutes < LIMITS.minMinutes || minutes > LIMITS.maxMinutes) {
    throw new Error(`${where}: minutes must be an integer ${LIMITS.minMinutes}-${LIMITS.maxMinutes}`);
  }
  const frame = optionalText(card.frame, `${where}: frame`, LIMITS.frame);
  const body = requiredText(card.body, `${where}: body`, LIMITS.body);
  const source = card.source ?? 'desk';
  if (!CARD_SOURCES.includes(source)) throw new Error(`${where}: source must be desk or manual`);
  return { date: card.date, course: card.course, section, lesson, title, mode, minutes, frame, body, source };
}

// Body of POST /class-log/cards/:id/outcome.
export function validateOutcome(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body must be an object');
  if (typeof body.section !== 'string' || !body.section.trim()) throw new Error('section must be a non-empty string');
  const section = body.section.trim();
  if (charLength(section) > LIMITS.section) throw new Error(`section must be at most ${LIMITS.section} characters`);
  if (typeof body.ran !== 'boolean') throw new Error('ran must be a boolean');
  const at = body.at ?? null;
  if (at !== null && (typeof at !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(at))) throw new Error('at must be null or HH:MM');
  const rawDevice = body.device ?? 's24';
  if (typeof rawDevice !== 'string' || !rawDevice.trim()) throw new Error('device must be a non-empty string');
  const device = rawDevice.trim();
  if (charLength(device) > LIMITS.device) throw new Error(`device must be at most ${LIMITS.device} characters`);
  return { section, ran: body.ran, at, device };
}
