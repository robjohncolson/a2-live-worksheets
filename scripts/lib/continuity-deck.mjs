// Daily reminders come from this section's last recording. They are not lesson
// knowledge, so they deliberately have no node/lesson and use the phone's streak rule.
import { DECK_LIMITS, isIsoDate, itemId } from '../../roster-server/deck-rules.js';
import { continuityFor } from './class-continuity.mjs';

export const MAX_CONTINUITY_CUES = 3;
const SECTION = /^(?:Period\s*)?([CDG])$/i;
const sectionOf = value => SECTION.exec(String(value ?? '').trim())?.[1].toUpperCase() || null;
const normalized = value => String(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

// The phone retains a nodeless item's streak by id. A corrected answer must be
// practiced again, while a saved deck with the same text must replay unchanged.
export const continuityCueId = (front, back) => `daily_${itemId('cue', `${String(front).trim()}\n${String(back).trim()}`)}`;

// A shared server card must never acquire one section's private handoff, including
// --section runs where buildTargets resolves just that section to a course-wide id.
export function continuityForTarget({ target, serverCards, entries = [], summaries, date }) {
  if (target.sections?.length !== 1) return null;
  const section = sectionOf(target.sections[0]);
  if (!section) return null;
  const serverCard = (serverCards || []).find(card => card.id === target.cardId);
  if (serverCard && sectionOf(serverCard.section) !== section) return null;
  const entry = entries.find(row => row?.date === date && sectionOf(row.section) === section)
    || { date, section, lesson: target.lesson };
  return continuityFor({ summaries, entry: { ...entry, section }, entries });
}

function completeLines(lines) {
  const selected = [];
  let omitted = false;
  for (const line of lines) {
    const candidate = [...selected, line].join('\n');
    // Android checks String.length (UTF-16 units), which is stricter than the
    // server's code-point limit for supplementary characters such as emoji.
    if (candidate.length > DECK_LIMITS.back) { omitted = true; continue; }
    selected.push(line);
  }
  if (!selected.length) return '';
  if (omitted) {
    const notice = 'See the source summary for other items.';
    while (selected.length && [...selected, notice].join('\n').length > DECK_LIMITS.back) selected.pop();
    // Never replace the only useful complete line with a content-free reminder.
    if (selected.length) selected.push(notice);
    else return lines.find(line => line.length <= DECK_LIMITS.back) || '';
  }
  return selected.join('\n');
}

export function continuityCues({ continuity, section, date }) {
  const ownSection = sectionOf(section);
  if (!continuity || !ownSection || !isIsoDate(date)
      || !isIsoDate(continuity.sourceDate) || continuity.sourceDate >= date) return [];
  const seen = new Set();
  const fresh = (values, prefix = '') => (Array.isArray(values) ? values : []).flatMap(value => {
    if (typeof value !== 'string' || !value.trim()) return [];
    const text = value.trim();
    const key = normalized(text);
    if (seen.has(key)) return [];
    seen.add(key);
    return [prefix + text];
  });
  // A promise is more useful than a second copy under prep or landed.
  const promises = completeLines(fresh(continuity.promises));
  const prep = completeLines([...fresh(continuity.nextPrep, 'Prep: '), ...fresh(continuity.questions, 'Question: ')]);
  const landed = completeLines(fresh(continuity.landed));
  const prefix = `${ownSection} ${date} | recording ${continuity.sourceDate}: `;
  return [
    ['Where did we stop?', landed],
    ['What promises must I check?', promises],
    ['What needs preparation or a follow-up?', prep],
  ].filter(([question, back]) => back && (prefix + question).length <= DECK_LIMITS.front).map(([question, back], index) => {
    const front = prefix + question;
    return { id: continuityCueId(front, back), type: 'cue', front, back, order: index + 1, after: [], minute: null };
  });
}

function retainedEdges(items, kept) {
  const byId = new Map(items.map(item => [item.id, item]));
  const ids = new Set(kept.map(item => item.id));
  const memo = new Map();
  const nearest = id => {
    if (ids.has(id)) return [id];
    if (memo.has(id)) return memo.get(id);
    memo.set(id, []);
    const found = [...new Set((byId.get(id)?.after || []).flatMap(nearest))];
    memo.set(id, found);
    return found;
  };
  return kept.map(item => ({ ...item, after: [...new Set((item.after || []).flatMap(nearest))].filter(id => id !== item.id) }));
}

// Tree callers reserve the space before selecting complete TE prompt groups.
// A model draft has 10–12 items; its last item may yield to a third daily cue.
export function appendContinuityCues(items, cues) {
  if (!cues?.length) return items;
  const unique = [...new Map(cues.map(cue => [cue.id, cue])).values()].slice(0, MAX_CONTINUITY_CUES);
  const cueIds = new Set(unique.map(cue => cue.id));
  const base = items.filter(item => !cueIds.has(item.id));
  const capacity = DECK_LIMITS.maxItems - unique.length;
  if (base.length > capacity && base.some(item => item.node)) {
    throw new Error('reserve daily cue space before selecting lesson-tree items');
  }
  const kept = retainedEdges(base, base.slice(0, capacity));
  return [...unique, ...kept].map((item, index) => ({ ...item, order: index + 1 }));
}
