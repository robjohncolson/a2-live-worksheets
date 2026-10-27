// The phone's concise class plan is a view of the day log. Keep observerCard
// intact as the detailed routine used by the lesson tree and rehearsal decks.
import { CARD_MODES, LIMITS } from './observer-card-rules.js';

// Android CardParser counts UTF-16 units, as JavaScript's string.length does.
// Matching it prevents a brief with supplementary characters from being cut.
const MAX_PHONE_BODY = 2000;

function briefText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`teacherBrief.${field} must be a nonempty string`);
  }
  return value.trim();
}

function briefList(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`teacherBrief.${field} must be a nonempty array of strings`);
  }
  return value.map((item, index) => briefText(item, `${field}[${index}]`));
}

export function teacherCardFor(entry, { continuity = null } = {}) {
  const routine = entry?.observerCard;
  const brief = entry?.teacherBrief;
  if (brief == null) return withContinuity(routine, entry, continuity);
  if (typeof brief !== 'object' || Array.isArray(brief)) {
    throw new Error('teacherBrief must be an object');
  }
  if (!routine || typeof routine !== 'object' || Array.isArray(routine)) {
    throw new Error('teacherBrief requires an observerCard routine');
  }

  const title = briefText(brief.title, 'title');
  const ixl = briefList(brief.ixl, 'ixl');
  const lastClass = briefText(brief.lastClass, 'lastClass');
  const today = briefList(brief.today, 'today');
  const next = brief.next == null ? null : briefText(brief.next, 'next');
  const mode = brief.mode == null ? routine.mode : briefText(brief.mode, 'mode');
  const minutes = brief.minutes ?? routine.minutes;
  if (brief.mode != null && !CARD_MODES.includes(mode)) {
    throw new Error(`teacherBrief.mode must be one of ${CARD_MODES.join(', ')}`);
  }
  if (brief.minutes != null && (!Number.isInteger(minutes) || minutes < LIMITS.minMinutes || minutes > LIMITS.maxMinutes)) {
    throw new Error(`teacherBrief.minutes must be an integer ${LIMITS.minMinutes}-${LIMITS.maxMinutes}`);
  }

  // Blank lines keep each item separate in Android's heading/paragraph renderer.
  const sections = [
    `## IXL drills\n${ixl.join('\n\n')}`,
    `## Last class\n${lastClass}`,
    `## Today\n${today.map((item, index) => `${index + 1}. ${item}`).join('\n\n')}`,
  ];
  if (next) sections.push(`## Next\n${next}`);
  const body = sections.join('\n\n');
  if (body.length > MAX_PHONE_BODY) {
    throw new Error(`teacherBrief body must be at most ${MAX_PHONE_BODY} Android text units (got ${body.length}); shorten the brief`);
  }

  return withContinuity({ ...routine, title, mode, minutes, frame: null, body }, entry, continuity);
}

// Recording evidence is a dated overlay. The authored plan and the detailed
// rehearsal routine stay untouched; a promise is a reminder to check, not proof
// that it is still outstanding. Whole source lines preserve qualifications.
function withContinuity(card, entry, continuity) {
  if (!card || !continuity) return card;
  const date = continuity.sourceDate;
  const landed = continuity.landed || [];
  const promises = continuity.promises || [];
  const prep = continuity.nextPrep || [];
  const questions = continuity.questions || [];
  if (![landed, promises, prep, questions].some(list => list.length)) return card;

  const original = String(card.body || '').split(/\n\n(?=## )/);
  const fixed = original.filter(block => !/^## Last class\n/.test(block));
  const selected = { landed: [], followUps: [] };
  const omittedNote = `More context in the ${date} class summary.`;
  const render = (more = false) => {
    const recap = selected.landed.length ? `## Last recording (${date})\n${selected.landed.join('\n\n')}` : null;
    const followUps = selected.followUps.length ? `## Follow-ups (${date})\n${selected.followUps.join('\n\n')}` : null;
    const evidence = [recap, followUps].filter(Boolean);
    const blocks = fixed.slice();
    // Keep IXL at the top of a teacher brief, then the recording handoff.
    blocks.splice(entry.teacherBrief ? 1 : 0, 0, ...evidence);
    if (more) blocks.push(omittedNote);
    return blocks.join('\n\n');
  };
  const candidates = [];
  const add = (kind, text) => { if (text) candidates.push({ kind, text }); };
  add('landed', landed.at(-1));
  add('followUps', promises[0] && `Promise to check: ${promises[0]}`);
  add('followUps', prep[0] && `Follow-up: ${prep[0]}`);
  for (const text of landed.slice(0, -1).reverse()) add('landed', text);
  for (const text of promises.slice(1)) add('followUps', `Promise to check: ${text}`);
  for (const text of prep.slice(1)) add('followUps', `Follow-up: ${text}`);
  for (const text of questions) add('followUps', `Previously asked: ${text}`);

  let kept = 0;
  for (const { kind, text } of candidates) {
    selected[kind].push(text);
    if (render(true).length <= MAX_PHONE_BODY) kept++;
    else selected[kind].pop();
  }
  if (!kept) throw new Error('teacherBrief needs room for the recording handoff; shorten the authored card');
  return { ...card, body: render(kept < candidates.length) };
}
