// Recorded class evidence for the next card/deck. Plans never count as evidence
// that an activity happened, and reviewed edits belong to one summary revision.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const DAY = 86_400_000;
const MAX_AGE_DAYS = 14;
const FIELDS = ['landed', 'promises', 'nextPrep', 'questions'];
const sanitizers = new WeakMap();
const trim = value => typeof value === 'string' ? value.trim() : '';
const sectionOf = value => trim(value).replace(/^period\s*/i, '').toUpperCase();

function dateTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return null;
  return time;
}

function unusable(source, markdown = '') {
  if (source?.unusable === true || source?.poor === true || trim(source?.quality).toLowerCase() === 'poor') return true;
  const document = markdown || trim(source?.markdown);
  return /(?:^|\n)\s*[-*_]?\s*(?:The )?(?:recording|transcript)(?: was| is)? (?:unusable|unintelligible)\b/i.test(document)
    || /(?:^|\n)\s*(?:transcriptQuality|quality):\s*["']?poor\b/i.test(document)
    || /(?:^|\n)\s*Transcript quality:\s*poor\b/i.test(document);
}

function csvCells(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      cells.push(cell); cell = '';
    } else cell += character;
  }
  cells.push(cell);
  return cells;
}

// Only roster exports are read. Names stay inside the sanitizer, never in output
// metadata or errors. Full-name variants prevent a surname surviving replacement.
function rosterNames(directory) {
  if (!existsSync(directory)) return [];
  const names = new Set();
  for (const file of readdirSync(directory).filter(name => /^roster-view-.*\.csv$/i.test(name)).sort()) {
    const lines = readFileSync(resolve(directory, file), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    const column = csvCells(lines[0] || '').findIndex(cell => cell.trim() === 'realName');
    if (column < 0) continue;
    for (const line of lines.slice(1)) {
      const name = trim(csvCells(line)[column]);
      if (!name) continue;
      names.add(name);
      const comma = name.indexOf(',');
      const given = comma >= 0 ? name.slice(comma + 1).trim() : name;
      const first = given.split(/\s+/)[0];
      if (first.length > 1) names.add(first);
      if (comma >= 0) {
        const family = name.slice(0, comma).trim();
        names.add(`${given} ${family}`);
        names.add(`${first} ${family}`);
      }
    }
  }
  return [...names].sort((a, b) => b.length - a.length);
}

function privacyFilter(names = []) {
  const escaped = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = escaped.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${escaped.join('|')})(?![\\p{L}\\p{N}_])`, 'giu') : null;
  return value => {
    const original = trim(value);
    if (!original) return '';
    let named = false;
    const clean = pattern ? original.replace(pattern, () => { named = true; return 'a student'; }) : original;
    const individual = named || /\b(?:a|one|another|the) student\b|\b(?:he|she|his|her)\b/i.test(clean);
    // An individual's numerical result is not a whole-class continuity cue.
    // Keep policy thresholds and mathematical numbers in other source lines.
    const score = /\b(?:scor(?:e|ed|es|ing)|grades?)\b.{0,45}\b\d+(?:\.\d+)?\b/i.test(clean)
      || /\b(?:earned|got|received|had|has|reached)\s+(?:a\s+)?\d+(?:\.\d+)?\s*(?:%|percent|points?|out of\s+\d+|\/\s*\d+|on (?:the )?(?:quiz|test|assessment|IXL))/i.test(clean)
      || /\b\d+(?:\.\d+)?\s*(?:%|percent|points?|out of\s+\d+|\/\s*\d+)\b.{0,25}\b(?:quiz|test|assessment|IXL|grade|score)\b/i.test(clean)
      || /\b(?:quiz|test|assessment|IXL|grade|score)\b.{0,25}\b\d+(?:\.\d+)?\s*(?:%|percent|points?|out of\s+\d+|\/\s*\d+)/i.test(clean);
    if (individual && score) return '';
    return clean;
  };
}

function emptyStatement(value) {
  const plain = value.replace(/^[\s(*_-]+|[\s).*_!\-]+$/g, '').toLowerCase();
  return /^(?:none(?: (?:recorded|heard|reported))?|n\/?a|nothing(?: (?:recorded|heard|reported))?|no (?:student )?(?:questions|promises|next prep|follow[- ]?ups?|items)(?: (?:recorded|heard|reported))?)$/.test(plain);
}

function cleanList(value, sanitize) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const cleaned = sanitize(item);
    if (!cleaned || emptyStatement(cleaned)) continue;
    const key = cleaned.toLocaleLowerCase('en-US');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

/** Read the generated summary cache and its quality evidence; never writes. */
export function loadContinuitySources(root, indexPath = resolve(root, 'roster-local/class-summaries/index.json')) {
  const index = resolve(indexPath);
  const directory = dirname(index);
  if (!existsSync(index)) return [];
  let rows;
  try { rows = JSON.parse(readFileSync(index, 'utf8')); }
  catch { throw new Error('Class continuity summary index is not readable JSON'); }
  if (!Array.isArray(rows)) throw new Error('Class continuity summary index must be an array');
  const sanitize = privacyFilter(rosterNames(resolve(root, 'roster-local')));
  return rows.filter(row => row && typeof row === 'object' && !Array.isArray(row)).map(row => {
    const file = trim(row.file);
    // The generated index uses flat filenames. Never follow a supplied path.
    const safeFile = file && basename(file) === file && !/[\\/]/.test(file) && file.endsWith('.md');
    const markdown = safeFile && existsSync(resolve(directory, file)) ? readFileSync(resolve(directory, file), 'utf8') : '';
    const source = {
      date: row.date, course: row.course, section: row.section, recordedAt: row.recordedAt ?? null,
      unusable: unusable(row, markdown),
      landed: cleanList(row.landed, sanitize), promises: cleanList(row.promises, sanitize),
      nextPrep: cleanList(row.nextPrep, sanitize), questions: cleanList(row.questions ?? row.studentQuestions, sanitize),
    };
    sanitizers.set(source, sanitize);
    return source;
  });
}

/** Latest usable evidence strictly before this class, with revision-bound review. */
export function continuityFor({ summaries, entry, entries = [] }) {
  const targetTime = dateTime(entry?.date);
  const section = sectionOf(entry?.section);
  if (targetTime === null || !['C', 'D', 'G'].includes(section)) return null;
  if (entry.course != null && entry.course !== 'algebra2') return null;
  const eligible = (Array.isArray(summaries) ? summaries : []).filter(source => {
    const time = dateTime(source?.date);
    return source?.course === 'algebra2' && sectionOf(source.section) === section && time !== null && time < targetTime;
  });
  eligible.sort((a, b) => b.date.localeCompare(a.date)
    || (Date.parse(b.recordedAt) || 0) - (Date.parse(a.recordedAt) || 0));
  const source = eligible[0];
  if (!source || targetTime - dateTime(source.date) > MAX_AGE_DAYS * DAY || unusable(source)) return null;
  const sanitize = sanitizers.get(source) || privacyFilter();
  const reviewed = entry.continuity;
  const matches = reviewed && reviewed.sourceDate === source.date
    && typeof reviewed.sourceRecordedAt === 'string' && reviewed.sourceRecordedAt === source.recordedAt;
  const result = { sourceDate: source.date, recordedAt: source.recordedAt ?? null };
  for (const field of FIELDS) {
    const original = field === 'questions' ? source.questions ?? source.studentQuestions : source[field];
    const items = matches && Object.hasOwn(reviewed, field) ? reviewed[field] : original;
    if (matches && Object.hasOwn(reviewed, field) && (!Array.isArray(items) || items.some(item => typeof item !== 'string'))) {
      throw new Error(`continuity.${field} must be an array of strings`);
    }
    result[field] = cleanList(items, sanitize);
  }
  if (matches && reviewed.resolved != null) {
    if (!Array.isArray(reviewed.resolved) || reviewed.resolved.some(item => typeof item !== 'string')) {
      throw new Error('continuity.resolved must be an array of strings');
    }
    const resolved = new Set(reviewed.resolved.map(sanitize).filter(Boolean));
    result.promises = result.promises.filter(item => !resolved.has(item));
    result.nextPrep = result.nextPrep.filter(item => !resolved.has(item));
  }
  return FIELDS.some(field => result[field].length) ? result : null;
}
