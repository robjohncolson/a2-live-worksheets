// Lesson tree: every rehearsable thing the Teacher's Edition says for one lesson,
// as nodes with stable ids and `after` edges (school/class-log/KNOWLEDGE_TREE_SPEC.md,
// WP-1 1.1). Pure: no I/O, no model, the same prep entry always gives the same tree.
//
// A node id is the first 12 hex of SHA-256 of `lesson + '|' + sourcePath`, where the
// source path names the prep field (by key, never by wording), so editing a sentence
// keeps the id and only moving the entry changes it.
import { createHash } from 'node:crypto';
import { DECK_LIMITS, DECK_TYPES, charLength } from '../../roster-server/deck-rules.js';

// A full TE lesson can have many prompts; only the selected daily deck goes to
// Android, where the separate 14-item limit still applies.
export const TREE_LIMITS = { minNodes: 6, maxNodes: 256 };
const NODE_ID = /^[0-9a-f]{12}$/;

export const nodeId = (lesson, sourcePath) => createHash('sha256').update(`${lesson}|${sourcePath}`).digest('hex').slice(0, 12);

const text = value => (typeof value === 'string' ? value.trim() : '');

// Clip to `max` characters (code points) at a sentence boundary with an ellipsis.
// A sentence end in the first third would throw most of the text away, so then
// (or with no sentence end at all) the cut falls on the last space instead.
export function clip(value, max) {
  const out = text(value);
  if (charLength(out) <= max) return out;
  const room = [...out].slice(0, max - 2).join('');
  const ends = [...room.matchAll(/[.!?](?=\s)/g)];
  const lastEnd = ends.length ? ends[ends.length - 1].index + 1 : -1;
  if (lastEnd >= room.length / 3) return room.slice(0, lastEnd) + ' …';
  const lastSpace = room.lastIndexOf(' ');
  const cut = lastSpace > 0 ? room.slice(0, lastSpace) : room;
  return cut.trimEnd() + ' …';
}

// "…, using the words piece, interval, open circle and closed circle." -> the words.
export function languageWords(sentence) {
  const match = /using the words\s+(.+?)\s*(?:[.;]|$)/i.exec(text(sentence));
  if (!match) return [];
  const words = match[1].split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map(word => word.trim()).filter(Boolean);
  return [...new Set(words)];
}

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const namesWord = (sentence, word) => new RegExp(`(^|[^\\p{L}])${escapeRegex(word)}(s|es)?(?![\\p{L}])`, 'iu').test(sentence);

// Misconceptions written on an observer card: lines `Trap: <student words> -> <response>`
// anywhere, or every line under a `## Traps` heading. A line without the arrow has no
// response, so it makes no trap.
export function cardTraps(body) {
  const traps = [];
  let underTraps = false;
  for (const line of String(body ?? '').split(/\r?\n/)) {
    if (/^\s*##\s/.test(line)) { underTraps = /^\s*##\s*traps?\b/i.test(line); continue; }
    const tagged = /^\s*(?:[-*]\s*)?trap:\s*(.+)$/i.exec(line);
    const raw = tagged ? tagged[1] : underTraps ? line.replace(/^\s*[-*]\s*/, '') : '';
    const parts = raw.split(/\s*(?:→|->)\s*/);
    if (parts.length < 2) continue;
    const front = parts[0].trim().replace(/^["“]|["”]$/g, '').trim();
    const back = parts.slice(1).join(' → ').trim();
    if (front && back) traps.push({ front, back });
  }
  return traps;
}

const isCore = entry => typeof entry?.role === 'string' && /^core\b/i.test(entry.role.trim());

// Day-log cards for this lesson, oldest first.
function lessonCards(dayLog, lesson) {
  return (dayLog?.entries || [])
    .filter(entry => entry && entry.lesson === lesson && entry.observerCard)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.section).localeCompare(String(b.section)));
}

const quizFront = (n, rest) => (n === '' ? `Quiz item ${rest}` : `Quiz item ${n} ${rest}`);

const PROMPT_LABELS = {
  PurposefulQuestions: 'Purposeful question', GeneralizeETP: 'Connect representations',
  ElicitEvidence: 'Check student thinking', HabitsOfMind: 'Reasoning',
  CommonError: 'Common error', RtISupport: 'Support', RtIExtend: 'Extend thinking',
};

// Keep the complete teacher response, including a correction after a long
// misconception. Each part fits the phone, and the selector keeps parts together.
function guidanceParts(value, max) {
  const parts = [];
  let rest = text(value);
  while (charLength(rest) > max) {
    const room = [...rest].slice(0, max).join('');
    const ends = [...room.matchAll(/[.!?](?=\s)/g)];
    const sentenceEnd = ends.length ? ends[ends.length - 1].index + 1 : -1;
    const wordEnd = room.lastIndexOf(' ');
    const cut = sentenceEnd > room.length / 3 ? sentenceEnd : wordEnd > 0 ? wordEnd : room.length;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

// One lesson-prep entry (plus the day log for the cards' traps and minutes) -> the tree.
export function buildTree(lesson, prep, dayLog = null) {
  const nodes = [];
  const fronts = new Map();
  // Returns the new node's id, or null when a field is empty (an empty field makes no node).
  const add = (type, sourcePath, front, back, after, extra = {}) => {
    if (!text(front) || !text(back)) return null;
    // Two nodes with the same question (two "Before, whole class" TE questions) would
    // be indistinguishable on the phone, so a repeat gets its count.
    const seen = (fronts.get(text(front)) || 0) + 1;
    fronts.set(text(front), seen);
    const shownFront = seen > 1 ? `${text(front)} (${seen})` : text(front);
    const id = nodeId(lesson, sourcePath);
    nodes.push({
      id, type, front: clip(shownFront, DECK_LIMITS.front), back: clip(back, DECK_LIMITS.back),
      order: nodes.length + 1, after: [...new Set(after.filter(Boolean))], minute: extra.minute ?? null, source: sourcePath,
      ...(extra.card ? { card: extra.card } : {}),
      ...(extra.teaching ? { teaching: extra.teaching } : {}),
    });
    return id;
  };
  const objectives = prep?.objectives || {};
  const quiz = prep?.quizFocus || {};
  const discuss = prep?.modelDiscuss || {};
  const cards = lessonCards(dayLog, lesson);

  const frame = add('frame', 'objectives.essentialQuestion', 'Essential question?', objectives.essentialQuestion, []);
  const rootOf = () => (frame ? [frame] : []);

  // Vocabulary: one anchor per language word; the definition is the first quiz need
  // that names the word, else the language objective itself.
  const needs = Array.isArray(quiz.needs) ? quiz.needs : [];
  const vocab = [];
  for (const word of languageWords(objectives.language)) {
    const definition = needs.find(need => namesWord(text(need), word)) || objectives.language;
    const id = add('anchor', `objectives.language.words.${word.toLowerCase()}`, `Define: ${word}`, definition, rootOf());
    if (id) vocab.push({ id, word });
  }
  const afterVocab = vocab.length ? vocab.map(v => v.id) : rootOf();

  // Quiz focus: what the item asks and its answer, then what students need for it.
  const n = quiz.item ?? '';
  const asks = add('anchor', 'quizFocus.what', quizFront(n, 'asks?'), quiz.what, afterVocab);
  const answer = add('anchor', 'quizFocus.answer', quizFront(n, 'answer?'), quiz.answer, afterVocab);
  const quizRoot = asks ? [asks] : afterVocab;
  needs.forEach((need, i) => add('anchor', `quizFocus.needs[${i}]`, `Before quiz item ${n === '' ? '' : n + ' '}students need?`, need, quizRoot));
  for (const [k, value] of Object.entries(quiz.items || {})) add('anchor', `quizFocus.items.${k}`, `Quiz item ${k} is covered by?`, value, quizRoot);

  // Topic Assessment items this lesson owns (the end goal; the quiz is the step toward it):
  // one anchor per item after the quiz anchors, keyed by item number.
  const topicTest = prep?.topicAssessment || {};
  const topicLabel = Number.isInteger(topicTest.topic) ? `Topic ${topicTest.topic} test` : 'Topic test';
  for (const [k, value] of Object.entries(topicTest.items || {})) add('anchor', `topicAssessment.items.${k}`, `${topicLabel} item ${k} is covered by?`, value, quizRoot);

  // Kept examples are the routine: a chain of steps after the quiz anchors. Minutes
  // split the first card's minutes evenly, cumulative (null without a card).
  const kept = (prep?.examples || []).filter(example => example && example.keep === true);
  const minutes = cards.map(entry => entry.observerCard.minutes).find(m => Number.isInteger(m) && m > 0) ?? null;
  const stepOf = new Map();
  let previous = [asks, answer].filter(Boolean);
  if (!previous.length) previous = afterVocab;
  kept.forEach((example, i) => {
    const back = [text(example.title), example.dok ? `DOK ${example.dok}` : '', example.practice ? `practice ${example.practice}` : '', text(example.why)]
      .filter(Boolean).join(' · ');
    const minute = minutes === null ? null : Math.round((minutes * (i + 1)) / kept.length);
    const id = add('step', `examples[n=${example.n}]`, `Example ${example.n}: ?`, back, previous, { minute });
    if (!id) return;
    stepOf.set(example.n, id);
    previous = [id];
  });
  const lastStep = stepOf.size ? [...stepOf.values()].pop() : null;

  // Rehearse the TE's questions alongside the example they guide. The question
  // stays visible on the front; the back names the thinking to listen for.
  // Source keys keep mastery stable when an editor improves the wording.
  for (const example of kept) {
    let parents = stepOf.has(example.n) ? [stepOf.get(example.n)] : rootOf();
    (example.teacherPrompts || []).forEach((prompt, i) => {
      const question = text(prompt.question || prompt.q);
      const answer = text(prompt.answer || prompt.a);
      if (!question || !answer) return;
      const label = PROMPT_LABELS[prompt.category] || 'Teacher prompt';
      const kind = prompt.kind || 'question';
      const type = kind === 'trap' ? 'trap' : 'cue';
      let back = kind === 'question' ? `Listen for: ${answer}` : answer;
      let front = `Example ${example.n} · ${label}: ${question}`;
      if (charLength(front) > DECK_LIMITS.front - 12) {
        front = `Example ${example.n} · ${label}: what should I ask?`;
        back = `Ask: ${question}\n${back}`;
      }
      const source = prompt.key || `examples[n=${example.n}].teacherPrompts[${i}]`;
      const parts = guidanceParts(back, DECK_LIMITS.back);
      parts.forEach((part, index) => {
        const partSource = index === 0 ? source : `${source}.part[${index}]`;
        const partFront = parts.length === 1 ? front : `${front} (${index + 1}/${parts.length})`;
        const id = add(type, partSource, partFront, part, parents,
          { teaching: { example: example.n, kind, category: prompt.category || '', source: prompt.source || null,
            promptKey: source, part: index + 1, parts: parts.length } });
        if (id) parents = [id];
      });
    });
  }

  // DOK 3: the task and its key, after the routine.
  const dok = prep?.dok3 || {};
  const afterSteps = lastStep ? [lastStep] : quizRoot;
  add('anchor', 'dok3.task', 'DOK 3 task?', dok.task, afterSteps);
  add('anchor', 'dok3.key', 'DOK 3 key?', [text(dok.key), text(dok.why)].filter(Boolean).join(' '), afterSteps);

  // The opener (Model & Discuss): situation, student prompts, TE questions in their order, caution.
  const situation = add('cue', 'modelDiscuss.situation', 'Opener situation?', discuss.situation, rootOf());
  const afterSituation = situation ? [situation] : rootOf();
  (discuss.studentPrompts || []).forEach((prompt, i) => add('cue', `modelDiscuss.studentPrompts[${i}]`, `Opener prompt ${i + 1}?`, prompt, afterSituation));
  let previousQuestion = afterSituation;
  (discuss.teQuestions || []).forEach((question, i) => {
    if (!question || !text(question.q)) return;
    const back = text(question.a) ? `${text(question.q)} → ${text(question.a)}` : text(question.q);
    const id = add('cue', `modelDiscuss.teQuestions[${i}]`, `${text(question.when) || 'Opener'}: ask?`, back, previousQuestion);
    if (id) previousQuestion = [id];
  });
  add('trap', 'modelDiscuss.caution', 'Opener caution?', discuss.caution, afterSituation);

  // Core IXL skills, after the step of their example (the frame when that example is not kept).
  for (const skill of prep?.ixl || []) {
    if (!isCore(skill) || !Number.isInteger(skill.example) || !text(skill.code)) continue;
    const step = stepOf.get(skill.example);
    add('anchor', `ixl.${skill.code}`, `IXL for example ${skill.example}?`, `${skill.code} ${text(skill.name)}`, step ? [step] : rootOf());
  }

  // The cards' own misconceptions, after the vocabulary anchors whose words they use.
  for (const entry of cards) {
    const section = String(entry.section ?? 'all').trim() || 'all';
    cardTraps(entry.observerCard.body).forEach((trap, k) => {
      const words = vocab.filter(v => namesWord(`${trap.front} ${trap.back}`, v.word)).map(v => v.id);
      add('trap', `day-log.${entry.date}.${section}.traps[${k}]`, trap.front, trap.back, words.length ? words : rootOf(),
        { card: { date: entry.date, section } });
    });
  }

  return { lesson, title: text(prep?.title), nodes };
}

// The first problem with a tree, or null: 6 to 256 nodes, ids unique 12 hex, types,
// text present and within the deck limits, `after` in-tree and acyclic.
export function treeProblem(tree) {
  const nodes = tree?.nodes;
  if (!Array.isArray(nodes)) return 'nodes must be an array';
  if (nodes.length < TREE_LIMITS.minNodes || nodes.length > TREE_LIMITS.maxNodes) {
    return `a tree must have ${TREE_LIMITS.minNodes} to ${TREE_LIMITS.maxNodes} nodes (got ${nodes.length})`;
  }
  const byId = new Map();
  for (const node of nodes) {
    if (!node || !NODE_ID.test(node.id ?? '')) return `node id ${node?.id} is not 12 hex`;
    if (byId.has(node.id)) return `duplicate node id ${node.id}`;
    if (!DECK_TYPES.includes(node.type)) return `node ${node.id}: type ${node.type} is not a deck type`;
    if (!text(node.front) || charLength(node.front) > DECK_LIMITS.front) return `node ${node.id}: front is empty or longer than ${DECK_LIMITS.front}`;
    if (!text(node.back) || charLength(node.back) > DECK_LIMITS.back) return `node ${node.id}: back is empty or longer than ${DECK_LIMITS.back}`;
    if (!Array.isArray(node.after)) return `node ${node.id}: after must be an array`;
    byId.set(node.id, node);
  }
  for (const node of nodes) {
    for (const parent of node.after) {
      if (parent === node.id) return `node ${node.id}: after names itself`;
      if (!byId.has(parent)) return `node ${node.id}: after names ${parent}, which is not in the tree`;
    }
  }
  const state = new Map(); // id -> 1 visiting, 2 done
  const cycleFrom = (id, path) => {
    if (state.get(id) === 2) return null;
    if (state.get(id) === 1) return [...path, id].join(' -> ');
    state.set(id, 1);
    for (const parent of byId.get(id).after) {
      const cycle = cycleFrom(parent, [...path, id]);
      if (cycle) return cycle;
    }
    state.set(id, 2);
    return null;
  };
  for (const node of nodes) {
    const cycle = cycleFrom(node.id, []);
    if (cycle) return `after has a cycle: ${cycle}`;
  }
  return null;
}
