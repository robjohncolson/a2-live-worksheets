// Choose an observer card's rehearsal deck from its lesson tree(s), no model
// (school/class-log/KNOWLEDGE_TREE_SPEC.md, WP-1 1.2). Pure: the same trees, card
// and mastery always give the same items, so the same deck hashes the same and an
// unchanged PUT writes nothing.
//
// Tiers, in this order (a node is taken once, by the first tier that names it):
//   1 frame (the newest lesson's essential question)
//   2 the card's own traps (today's misconceptions)
//   3 quiz-focus anchors (what, answer, needs), newest lesson first
//   4 TE questions whose `when` matches the card's phase
//   5 steps for the kept examples named in the card body, else all kept
//   6 vocabulary anchors not yet known on the device (all of them without mastery)
//   7 DOK 3, IXL, then everything else, in tree order
// Tiers 1-6 fill the deck up to the cap of 14; tier 7 only pads a deck that would
// otherwise have fewer than 8 items.
import { DECK_LIMITS } from '../../roster-server/deck-rules.js';

export const TIER_NAMES = ['frame', 'traps', 'quiz', 'te', 'steps', 'vocab', 'pad'];

// The card's phase for TE questions: "Before" for openers, "After" for exit cards,
// "During" for the whiteboard rounds that make up every other card.
export function cardPhase(card) {
  const title = String(card?.title ?? '');
  if (/^\s*exit\b/i.test(title)) return 'After';
  if (/\bopener\b/i.test(`${title}\n${card?.body ?? ''}`)) return 'Before';
  return 'During';
}

const lessonKey = lesson => String(lesson).split('-').map(part => Number(part) || 0);
const newestFirst = (a, b) => {
  const [x, y] = [lessonKey(a), lessonKey(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((y[i] ?? 0) !== (x[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
  return 0;
};

// The lessons a card covers that have a tree: its own lesson plus any "Lesson 1-3"
// the card names (a card logged under 1-2 can teach the 1-3 objectives), newest first.
export function cardLessons(lesson, card, trees) {
  const named = [...`${card?.title ?? ''}\n${card?.body ?? ''}`.matchAll(/\blesson\s+(\d+-\d+)\b/gi)].map(m => m[1]);
  const all = [...new Set([lesson, ...named].filter(key => key && trees[key]))];
  return all.sort(newestFirst);
}

export const namedExamples = body => new Set([...String(body ?? '').matchAll(/\bexample\s+(\d+)\b/gi)].map(m => Number(m[1])));

const isSource = (node, prefix) => typeof node.source === 'string' && node.source.startsWith(prefix);
const exampleOf = node => Number(/^examples\[n=(\d+)\]$/.exec(node.source ?? '')?.[1]);

function trapsForCard(node, date, sections) {
  if (!isSource(node, 'day-log.') || !node.card || node.card.date !== date) return false;
  return node.card.section === 'all' || sections.includes('all') || sections.includes(node.card.section);
}

// Each tier's nodes for the card, in rehearsal order. `known` is a Set of node ids
// known on the device, or null when mastery is not available.
export function tiersFor({ trees, lessons, card, date, sections, known = null }) {
  const nodesOf = lesson => trees[lesson].nodes.map(node => ({ ...node, lesson }));
  const every = lessons.flatMap(nodesOf);
  const phase = cardPhase(card);
  const named = namedExamples(card?.body);
  const stepsOf = lesson => {
    const steps = nodesOf(lesson).filter(node => node.type === 'step' && isSource(node, 'examples['));
    const chosen = steps.filter(node => named.has(exampleOf(node)));
    return chosen.length ? chosen : steps;
  };
  const rest = [
    ...every.filter(node => isSource(node, 'dok3.')),
    ...every.filter(node => isSource(node, 'ixl.')),
    ...every,
  ];
  return [
    lessons.length ? nodesOf(lessons[0]).filter(node => node.type === 'frame') : [],
    every.filter(node => trapsForCard(node, date, sections)),
    every.filter(node => ['quizFocus.what', 'quizFocus.answer'].includes(node.source) || isSource(node, 'quizFocus.needs[')),
    every.filter(node => isSource(node, 'modelDiscuss.teQuestions[') && node.front.startsWith(phase)),
    lessons.flatMap(stepsOf),
    every.filter(node => isSource(node, 'objectives.language.words.') && !(known && known.has(node.id))),
    rest,
  ];
}

// The chosen nodes' `after`, kept when the parent is chosen, else lifted to the
// nearest chosen ancestors (walking up the tree through unchosen nodes).
export function liftEdges(chosen, trees) {
  const chosenIds = new Set(chosen.map(node => node.id));
  const byId = new Map();
  for (const tree of Object.values(trees)) for (const node of tree.nodes) byId.set(node.id, node);
  const memo = new Map();
  const nearest = id => {
    if (chosenIds.has(id)) return [id];
    if (memo.has(id)) return memo.get(id);
    memo.set(id, []); // guards a cycle in a hand-edited tree
    const found = [...new Set((byId.get(id)?.after || []).flatMap(nearest))];
    memo.set(id, found);
    return found;
  };
  return chosen.map(node => [...new Set(node.after.flatMap(nearest))].filter(id => id !== node.id));
}

// A step's minute in this card's routine: the card's minutes split evenly over the
// lesson's steps, cumulative; the tree's minute (or 0) when the card has none.
function stepMinute(node, trees, minutes) {
  if (node.type !== 'step') return null;
  const steps = trees[node.lesson].nodes.filter(n => n.type === 'step');
  const index = steps.findIndex(n => n.id === node.id) + 1;
  if (Number.isInteger(minutes) && minutes > 0 && index > 0) return Math.min(DECK_LIMITS.maxMinute, Math.round((minutes * index) / steps.length));
  return Number.isInteger(node.minute) ? node.minute : 0;
}

// The deck for one card. Returns {items, tiers: {name: count}, padded} where padded is
// how many items tier 7 added to reach the minimum.
export function selectDeck({ trees, lessons, card, date, sections, known = null }) {
  const tiers = tiersFor({ trees, lessons, card, date, sections, known });
  const chosen = [];
  const taken = new Set();
  const counts = Object.fromEntries(TIER_NAMES.map(name => [name, 0]));
  const take = (node, tier) => {
    if (taken.has(node.id)) return;
    taken.add(node.id);
    chosen.push(node);
    counts[TIER_NAMES[tier]]++;
  };
  tiers.slice(0, 6).forEach((nodes, tier) => {
    for (const node of nodes) if (chosen.length < DECK_LIMITS.maxItems) take(node, tier);
  });
  for (const node of tiers[6]) if (chosen.length < DECK_LIMITS.minItems) take(node, 6);

  const after = liftEdges(chosen, trees);
  const items = chosen.map((node, i) => ({
    id: node.id, type: node.type, front: node.front, back: node.back, order: i + 1, after: after[i],
    minute: stepMinute(node, trees, card?.minutes), node: node.id, lesson: node.lesson,
  }));
  return { items, tiers: counts, padded: counts.pad };
}
