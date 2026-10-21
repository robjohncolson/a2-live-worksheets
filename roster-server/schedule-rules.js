// Pure validation rules for Class Log schedule overrides, shared by the server
// (schedule-overrides.js) and the Desk seed script (scripts/push-schedule.mjs).
// No I/O. Lengths count characters (Unicode code points), not bytes.
import { CARD_SOURCES, charLength, isIsoDate } from './observer-card-rules.js';

export { isIsoDate, charLength } from './observer-card-rules.js';
export const SCHEDULE_LIMITS = { section: 16, note: 200, rowsPerPut: 200, rangeDays: 31 };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isHhMm = value => typeof value === 'string' && HHMM.test(value);

function note(value, where) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error(`${where}: note must be a string or null`);
  const text = value.trim();
  if (text.includes('\u0000')) throw new Error(`${where}: note must not contain U+0000`);
  if (charLength(text) > SCHEDULE_LIMITS.note) throw new Error(`${where}: note must be at most ${SCHEDULE_LIMITS.note} characters`);
  return text || null;
}

// One override as sent to PUT /teacher/schedule-overrides. Returns the database
// row (without updated_at); throws on any problem. A cancelled row carries no times.
export function validateOverride(row, index = 0) {
  const where = `override ${index}`;
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`${where}: must be an object`);
  if (!isIsoDate(row.date)) throw new Error(`${where}: date must be a real YYYY-MM-DD date`);
  if (typeof row.section !== 'string' || !row.section.trim()) throw new Error(`${where}: section must be a non-empty string`);
  const section = row.section.trim();
  if (section.includes('\u0000')) throw new Error(`${where}: section must not contain U+0000`);
  if (charLength(section) > SCHEDULE_LIMITS.section) throw new Error(`${where}: section must be at most ${SCHEDULE_LIMITS.section} characters`);
  const cancelled = row.cancelled ?? false;
  if (typeof cancelled !== 'boolean') throw new Error(`${where}: cancelled must be a boolean`);
  let start = null, end = null;
  if (!cancelled) {
    if (!isHhMm(row.start) || !isHhMm(row.end)) throw new Error(`${where}: start and end must be HH:MM unless cancelled`);
    if (row.start >= row.end) throw new Error(`${where}: start must be before end`);
    ({ start, end } = row);
  } else if ((row.start ?? null) !== null || (row.end ?? null) !== null) {
    throw new Error(`${where}: a cancelled section has no start or end`);
  }
  const source = row.source ?? 'desk';
  if (!CARD_SOURCES.includes(source)) throw new Error(`${where}: source must be desk or manual`);
  return { date: row.date, section, start, end, cancelled, note: note(row.note, where), source };
}

// A day off: "YYYY-MM-DD" or {date, note}.
export function validateDayOff(value, index = 0) {
  const where = `dayOff ${index}`;
  const row = typeof value === 'string' ? { date: value } : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`${where}: must be a date string or an object`);
  if (!isIsoDate(row.date)) throw new Error(`${where}: date must be a real YYYY-MM-DD date`);
  return { date: row.date, note: note(row.note, where) };
}

// Body of PUT /teacher/schedule-overrides. Returns {overrides, daysOff}; throws
// on any problem, including duplicate keys and more than rowsPerPut rows in all.
export function validateSchedulePut(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body must be an object');
  const rawOverrides = body.overrides ?? [];
  const rawDaysOff = body.daysOff ?? [];
  if (!Array.isArray(rawOverrides) || !Array.isArray(rawDaysOff)) throw new Error('overrides and daysOff must be arrays');
  const total = rawOverrides.length + rawDaysOff.length;
  if (total === 0) throw new Error('nothing to write: overrides and daysOff are both empty');
  if (total > SCHEDULE_LIMITS.rowsPerPut) throw new Error(`at most ${SCHEDULE_LIMITS.rowsPerPut} rows per request`);
  const overrides = rawOverrides.map(validateOverride);
  const daysOff = rawDaysOff.map(validateDayOff);
  const keys = new Set();
  for (const row of overrides) {
    const key = `${row.date}|${row.section}`;
    if (keys.has(key)) throw new Error(`duplicate override for ${row.date} ${row.section}`);
    keys.add(key);
  }
  const days = new Set();
  for (const row of daysOff) {
    if (days.has(row.date)) throw new Error(`duplicate day off ${row.date}`);
    days.add(row.date);
  }
  return { overrides, daysOff };
}

// Inclusive day count from..to, or null when either date is not real or to < from.
export function rangeDays(from, to) {
  if (!isIsoDate(from) || !isIsoDate(to)) return null;
  const days = (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000 + 1;
  return days >= 1 ? days : null;
}
