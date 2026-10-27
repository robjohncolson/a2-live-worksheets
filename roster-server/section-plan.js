// One deterministic class plan produces the phone card and its practice deck.
// All lesson assets, evidence, teacher decisions and commitments are explicit
// inputs so the server can rebuild without the planning computer or a model.
import { createHash } from 'node:crypto';
import { isIsoDate, validateCard } from './observer-card-rules.js';
import { DECK_LIMITS, itemId, validateItems } from './deck-rules.js';
import { cardLessons, selectDeck } from './lesson-deck.js';
import { teacherCardFor } from './teacher-card.js';
import { sanitizePlanInput } from './plan-privacy.js';
export { sanitizePlanInput } from './plan-privacy.js';

export const PLAN_SCHEMA_VERSION = 1;
export const PLAN_MODEL = 'section-plan-v1';
const MAX_CARD_BODY = 2000;
const MAX_DAILY_CUES = 3;
const STATUS = new Set(['open', 'done', 'deferred', 'cancelled']);
const DECISION_FIELDS = new Set([
  'teacherBrief.title', 'teacherBrief.ixl', 'teacherBrief.lastClass', 'teacherBrief.today',
  'teacherBrief.next', 'teacherBrief.mode', 'teacherBrief.minutes',
  'observerCard.title', 'observerCard.body', 'observerCard.frame', 'observerCard.mode', 'observerCard.minutes',
  'source.landed', 'source.promises', 'source.questions', 'source.nextPrep',
]);
const clone = value => JSON.parse(JSON.stringify(value));
const sectionOf = value => String(value ?? '').trim().replace(/^period\s*/i, '').toUpperCase();
const sameTimestamp = (left, right) => typeof left === 'string' && typeof right === 'string'
  && Number.isFinite(Date.parse(left)) && Date.parse(left) === Date.parse(right);
const factualField = field => field.startsWith('source.') || field === 'teacherBrief.lastClass';
const sourceMatches = (decision, source) => !decision.sourceBinding || decision.sourceBinding.sourceDate === source?.sourceDate;

export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).filter(key => value[key] !== undefined).sort()
      .map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export const planHash = value => createHash('sha256').update(canonicalJson(value)).digest('hex');

function text(value, field, max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0') || value.trim().length > max) {
    throw new Error(`${field} must be nonempty text of at most ${max} UTF-16 units`);
  }
  return value.trim();
}

function lines(value, field) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return [...new Set(value.map((line, index) => text(line, `${field}[${index}]`)))];
}

// The ID is the idempotency key. A later explicit edit uses a new ID; reusing an
// ID with different content is rejected rather than silently changing history.
export function mergeDecisionJournal(existing = [], additions = []) {
  if (!Array.isArray(existing) || !Array.isArray(additions)) throw new Error('decisions must be an array');
  const byId = new Map();
  for (const raw of [...existing, ...additions]) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('decision must be an object');
    const id = text(raw.id, 'decision.id', 120);
    if (!raw.set || typeof raw.set !== 'object' || Array.isArray(raw.set) || !Object.keys(raw.set).length) {
      throw new Error('decision.set must contain explicit field overrides');
    }
    for (const field of Object.keys(raw.set)) {
      if (!DECISION_FIELDS.has(field)) throw new Error(`unsupported decision field ${field}`);
    }
    let sourceBinding;
    if (raw.sourceBinding != null) {
      if (!isIsoDate(raw.sourceBinding.sourceDate) || !Number.isFinite(Date.parse(raw.sourceBinding.recordedAt))) {
        throw new Error('decision.sourceBinding needs a sourceDate and recordedAt');
      }
      sourceBinding = { sourceDate: raw.sourceBinding.sourceDate, recordedAt: raw.sourceBinding.recordedAt };
    }
    const decision = { id, ...(raw.at ? { at: text(raw.at, 'decision.at', 64) } : {}),
      ...(sourceBinding ? { sourceBinding } : {}), set: clone(raw.set) };
    const previous = byId.get(id);
    if (previous && (canonicalJson(previous.set) !== canonicalJson(decision.set)
        || previous.sourceBinding && sourceBinding && canonicalJson(previous.sourceBinding) !== canonicalJson(sourceBinding))) {
      throw new Error(`decision ${id} was already recorded with different edits`);
    }
    if (!previous) byId.set(id, decision);
  }
  return [...byId.values()];
}

// Factual corrections belong to the class recording being corrected. They
// survive a new automatic summary of that same class, but are never relabelled
// as observations from a different class day. Plan directives remain persistent.
export function bindDecisionSources(decisions, source) {
  const journal = mergeDecisionJournal(decisions || []);
  const sourceDate = source?.sourceDate ?? source?.date;
  if (!isIsoDate(sourceDate) || !Number.isFinite(Date.parse(source?.recordedAt))) return journal;
  return journal.map(decision => !decision.sourceBinding && Object.keys(decision.set).some(factualField)
    ? { ...decision, sourceBinding: { sourceDate, recordedAt: source.recordedAt } } : decision);
}

export function reviewedHandoffDecisions(entry, source) {
  const review = entry?.continuity;
  if (!review || !source || review.sourceDate !== (source.sourceDate ?? source.date)
      || !sameTimestamp(review.sourceRecordedAt, source.recordedAt)) return [];
  const set = {};
  for (const field of ['landed', 'promises', 'nextPrep', 'questions']) {
    if (Object.hasOwn(review, field)) set[`source.${field}`] = lines(review[field], `continuity.${field}`);
  }
  if (!Object.keys(set).length) return [];
  const identity = { date: entry.date, section: entry.section, sourceDate: review.sourceDate, sourceRecordedAt: review.sourceRecordedAt, set };
  return [{ id: `reviewed-handoff-${planHash(identity).slice(0, 24)}`,
    sourceBinding: { sourceDate: review.sourceDate, recordedAt: review.sourceRecordedAt }, set }];
}

// One-time adoption of an existing teacher-reviewed handoff. Only commitments
// proven to originate from that exact recording revision may be superseded.
// Other source dates and every already-resolved status survive unchanged.
export function adoptReviewedContinuity(inputs, commitments, summary = inputs.source) {
  const entry = inputs.lessonInputs?.entry;
  const decisions = reviewedHandoffDecisions(entry, summary);
  if (!decisions.length) return { inputs, commitments };
  const review = entry.continuity;
  const normalizedText = value => value.replace(/\s+/g, ' ').trim();
  const resolved = new Set(lines(review.resolved, 'continuity.resolved').map(normalizedText));
  const next = commitments.map(item => clone(item));
  const byId = new Map(next.map(item => [item.id, item]));
  for (const [field, kind] of [['promises', 'promise'], ['nextPrep', 'prep']]) {
    if (!Object.hasOwn(review, field)) continue;
    const reviewed = lines(review[field], `continuity.${field}`).map(normalizedText);
    const incoming = new Map(reviewed.map(value => [
      createHash('md5').update(`${inputs.course}|${sectionOf(inputs.section)}|${kind}|${value.toLowerCase()}`).digest('hex'), value,
    ]));
    for (const item of next) {
      const sameSource = item.kind === kind && (item.source?.date ?? item.sourceDate) === review.sourceDate
        && sameTimestamp(item.source?.recordedAt, review.sourceRecordedAt);
      if (!sameSource || !['open', 'deferred'].includes(item.status)) continue;
      const status = resolved.has(normalizedText(item.text)) ? 'done' : !incoming.has(item.id) ? 'cancelled' : item.status;
      if (status !== item.status) {
        item.status = status;
        item.version = (item.version || 0) + 1;
        item.reviewDecisionId = decisions[0].id;
      }
    }
    for (const [id, value] of incoming) {
      if (byId.has(id)) continue;
      const item = { id, course: inputs.course, section: sectionOf(inputs.section), kind, text: value,
        status: resolved.has(value) ? 'done' : 'open', version: 1, sourceDate: review.sourceDate,
        source: { date: review.sourceDate, recordedAt: review.sourceRecordedAt, kind, reviewDecisionId: decisions[0].id },
        dueDate: null, deferredUntil: null };
      next.push(item);
      byId.set(id, item);
    }
  }
  return {
    inputs: { ...inputs, decisions: mergeDecisionJournal(decisions, inputs.decisions || []) },
    commitments: next.sort((a, b) => (a.sourceDate || '').localeCompare(b.sourceDate || '') || a.id.localeCompare(b.id)),
  };
}

function evidenceFor(source, scope) {
  if (source == null) return null;
  if (source.course != null && source.course !== scope.course) throw new Error('source course does not match plan');
  if (source.section != null && sectionOf(source.section) !== scope.section) throw new Error('source section does not match plan');
  const sourceDate = source.sourceDate ?? source.date;
  if (!isIsoDate(sourceDate) || sourceDate >= scope.date) throw new Error('source must precede the target class date');
  return {
    ...clone(source), sourceDate, recordedAt: source.recordedAt ?? null,
    landed: lines(source.landed, 'source.landed'),
    promises: lines(source.promises, 'source.promises'),
    questions: lines(source.questions ?? source.studentQuestions, 'source.questions'),
    nextPrep: lines(source.nextPrep, 'source.nextPrep'),
  };
}

function commitmentsFor(values, scope) {
  if (!Array.isArray(values)) throw new Error('commitments must be an array');
  const ids = new Set();
  return values.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('commitment must be an object');
    if (raw.course != null && raw.course !== scope.course) throw new Error('commitment course does not match plan');
    if (raw.section != null && sectionOf(raw.section) !== scope.section) throw new Error('commitment section does not match plan');
    const id = text(raw.id, 'commitment.id', 120);
    if (ids.has(id)) throw new Error(`duplicate commitment ${id}`);
    ids.add(id);
    if (!STATUS.has(raw.status)) throw new Error(`commitment ${id} has an invalid status`);
    const sourceDate = raw.sourceDate ?? raw.source?.date ?? null;
    if (sourceDate != null && !isIsoDate(sourceDate)) throw new Error(`commitment ${id} has an invalid source date`);
    const dueDate = raw.dueDate ?? null;
    if (dueDate != null && !isIsoDate(dueDate)) throw new Error(`commitment ${id} has an invalid due date`);
    const deferredUntil = raw.deferredUntil ?? null;
    if (deferredUntil != null && !isIsoDate(deferredUntil)) throw new Error(`commitment ${id} has an invalid deferral date`);
    return { ...clone(raw), id, text: text(raw.text, 'commitment.text'), status: raw.status, sourceDate, dueDate, deferredUntil };
  }).sort((a, b) => (a.dueDate ?? a.sourceDate ?? '').localeCompare(b.dueDate ?? b.sourceDate ?? '') || a.id.localeCompare(b.id));
}

function activeCommitments(commitments, date) {
  const due = item => item.status === 'deferred' ? item.deferredUntil ?? item.dueDate : item.dueDate;
  return commitments.filter(item => (item.status === 'open' || item.status === 'deferred' && due(item) && due(item) <= date)
    && (!item.sourceDate || item.sourceDate < date) && (!item.dueDate || item.dueDate <= date))
    .sort((a, b) => Number(Boolean(due(b))) - Number(Boolean(due(a)))
      || (due(a) || '').localeCompare(due(b) || '')
      || (b.sourceDate || '').localeCompare(a.sourceDate || '')
      || Number(b.kind === 'promise') - Number(a.kind === 'promise') || a.id.localeCompare(b.id));
}

function applyDecisions(entry, source, journal) {
  const effective = { entry: clone(entry), source: source ? clone(source) : null };
  for (const decision of journal) {
    for (const [field, value] of Object.entries(decision.set)) {
      if (factualField(field) && !sourceMatches(decision, source)) continue;
      const [group, key] = field.split('.');
      if (group === 'source') {
        if (!effective.source) throw new Error('source correction needs saved recording evidence');
        effective.source[key] = lines(value, field);
      } else {
        if (!effective.entry[group]) throw new Error(`${group} override needs an authored ${group}`);
        effective.entry[group][key] = clone(value);
      }
    }
  }
  // A teacher correction of the last-class account also governs the recap cue.
  if (effective.source && journal.some(decision => sourceMatches(decision, source) && Object.hasOwn(decision.set, 'teacherBrief.lastClass'))) {
    effective.source.landed = [text(effective.entry.teacherBrief.lastClass, 'teacherBrief.lastClass')];
  }
  return effective;
}

function renderCard(entry, source, open, preserveLastClass = false) {
  const base = teacherCardFor(entry);
  if (!base) throw new Error('plan needs an authored observerCard');
  let blocks = String(base.body || '').split(/\n\n(?=## )/);
  if (source && !preserveLastClass) blocks = blocks.filter(block => !/^## Last class\n/.test(block));
  const ixl = entry.teacherBrief && /^## IXL drills\n/.test(blocks[0]) ? blocks.shift() : null;
  const fixed = blocks.join('\n\n');
  if (fixed.length > MAX_CARD_BODY) throw new Error('authored card must fit the phone before adding continuity');
  const selected = [];
  const candidates = [
    ...(source?.landed.length && !preserveLastClass ? [`## Last recording (${source.sourceDate})\n${source.landed.at(-1)}`] : []),
    ...open.map(item => `## Follow-up${item.sourceDate ? ` (${item.sourceDate})` : ''}\n${item.text}`),
  ];
  const notice = 'More context and open commitments are saved with this class plan.';
  const render = more => [ixl, ...selected, fixed, ...(more ? [notice] : [])].filter(Boolean).join('\n\n');
  let omitted = false;
  for (const candidate of candidates) {
    selected.push(candidate);
    if (render(true).length > MAX_CARD_BODY) { selected.pop(); omitted = true; }
  }
  // Never let a long summary fragment invalidate an otherwise usable authored plan.
  const body = render(omitted && render(true).length <= MAX_CARD_BODY);
  return { ...base, body };
}

// Exactly one action or source statement per cue. Whole lines only; no generated
// paraphrase can erase a qualifier. Oversized items remain in saved plan context.
function dailyItems(scope, source, open) {
  const labels = new Map();
  const candidates = open.map(item => {
    const kind = item.kind === 'promise' ? 'Promise' : item.kind === 'prep' ? 'Preparation' : 'Follow-up';
    const number = (labels.get(kind) || 0) + 1;
    labels.set(kind, number);
    return { key: item.id,
      front: `${scope.section} ${scope.date}: ${kind} ${number}${item.sourceDate ? ` from ${item.sourceDate}` : ''}: what must I check?`,
      back: item.text };
  });
  if (source?.landed.length) candidates.push({ key: 'landed',
    front: `${scope.section} ${scope.date}: Where did we stop in the ${source.sourceDate} recording?`, back: source.landed.at(-1) });
  for (const [index, question] of (source?.questions || []).entries()) candidates.push({ key: `question-${index}`,
    front: `${scope.section} ${scope.date}: What prior question should I review from ${source.sourceDate}?`, back: question });
  const seen = new Set();
  return candidates.filter(candidate => {
    const key = candidate.back.normalize('NFKC').toLowerCase();
    if (seen.has(key) || candidate.front.length > DECK_LIMITS.front || candidate.back.length > DECK_LIMITS.back) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_DAILY_CUES).map(({ key, front, back }, index) => ({
    id: `daily_${itemId('cue', `${key}\n${front}\n${back}`)}`, type: 'cue', front, back,
    order: index + 1, after: [], minute: null,
  }));
}

function fallbackDeck(items, capacity) {
  const valid = validateItems(items);
  if (valid.some(item => item.node)) throw new Error('lesson-node fallback needs the source lesson trees');
  const kept = valid.slice(0, capacity);
  const byId = new Map(valid.map(item => [item.id, item]));
  const ids = new Set(kept.map(item => item.id));
  const nearest = (id, seen = new Set()) => {
    if (ids.has(id)) return [id];
    if (seen.has(id)) return [];
    return (byId.get(id)?.after || []).flatMap(parent => nearest(parent, new Set([...seen, id])));
  };
  return kept.map(item => ({ ...item, after: [...new Set(item.after.flatMap(id => nearest(id)))] }));
}

export function compileSectionPlan(raw) {
  if (!raw || typeof raw !== 'object' || raw.schemaVersion !== PLAN_SCHEMA_VERSION) throw new Error('plan schemaVersion must be 1');
  if (!isIsoDate(raw.date) || raw.course !== 'algebra2' || !['C', 'D', 'G'].includes(sectionOf(raw.section))) {
    throw new Error('plan needs a valid date, algebra2 course and C/D/G section');
  }
  const scope = { date: raw.date, course: raw.course, section: sectionOf(raw.section) };
  const inputs = sanitizePlanInput(raw, raw.privacyNames || []);
  inputs.section = scope.section;
  if (!inputs.lessonInputs?.entry || !inputs.lessonInputs.trees || typeof inputs.lessonInputs.trees !== 'object') {
    throw new Error('plan needs an authored entry and explicit lesson trees');
  }
  const authored = inputs.lessonInputs.entry;
  if (authored.date !== scope.date || sectionOf(authored.section) !== scope.section) throw new Error('authored entry does not match plan scope');
  inputs.source = evidenceFor(inputs.source, scope);
  inputs.decisions = bindDecisionSources(inputs.decisions, inputs.source);
  inputs.commitments = commitmentsFor(inputs.commitments || [], scope);
  inputs.lessonInputs.knownNodeIds = [...new Set(inputs.lessonInputs.knownNodeIds || [])].sort();
  const { entry, source } = applyDecisions(authored, inputs.source, inputs.decisions);
  const open = activeCommitments(inputs.commitments, scope.date);
  const display = renderCard(entry, source, open, inputs.decisions.some(decision => sourceMatches(decision, source) && Object.hasOwn(decision.set, 'teacherBrief.lastClass')));
  const card = validateCard({ ...scope, lesson: entry.lesson ?? null, title: display.title,
    body: display.body, mode: display.mode, minutes: display.minutes, frame: display.frame, source: 'desk' });
  if (card.title.length > 200 || card.body.length > MAX_CARD_BODY || (card.frame?.length || 0) > 500) {
    throw new Error('card exceeds Android text limits');
  }
  const cues = dailyItems(scope, source, open);
  const trees = inputs.lessonInputs.trees;
  const lessons = cardLessons(entry.lesson, entry.observerCard, trees);
  let lessonItems;
  if (lessons.length) {
    lessonItems = selectDeck({ trees, lessons, card: entry.observerCard, date: scope.date, sections: [scope.section],
      known: new Set(inputs.lessonInputs.knownNodeIds), maxItems: DECK_LIMITS.maxItems - cues.length }).items;
  } else if (inputs.lessonInputs.fallbackItems) {
    lessonItems = fallbackDeck(inputs.lessonInputs.fallbackItems, DECK_LIMITS.maxItems - cues.length);
  } else throw new Error(`no lesson tree or approved fallback deck for ${entry.lesson ?? 'this class'}`);
  const items = validateItems([...cues, ...lessonItems].map((item, index) => ({ ...item, order: index + 1 })));
  if (items.some(item => item.front.length > DECK_LIMITS.front || item.back.length > DECK_LIMITS.back)) {
    throw new Error('deck exceeds Android text limits');
  }
  const deck = { model: PLAN_MODEL, items };
  // Transport clocks, status audit timestamps and teacher note timestamps are
  // deliberately outside content identity. Provenance and explicit edits remain.
  const identity = { schemaVersion: PLAN_SCHEMA_VERSION, ...scope, card, deck, source, routine: clone(entry.observerCard),
    commitments: inputs.commitments.map(item => ({ id: item.id, text: item.text, status: item.status,
      sourceDate: item.sourceDate, dueDate: item.dueDate, deferredUntil: item.deferredUntil, kind: item.kind ?? null })),
    decisions: inputs.decisions.map(({ id, set, sourceBinding }) => ({ id, set, ...(sourceBinding ? { sourceBinding } : {}) })) };
  return { ...identity, revision: planHash(identity), inputs, commitments: inputs.commitments };
}
