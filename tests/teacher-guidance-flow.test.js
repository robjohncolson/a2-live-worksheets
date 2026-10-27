// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildTree, treeProblem } from '../scripts/lib/lesson-tree.mjs';
import { selectDeck, namedExamples } from '../scripts/lib/tree-deck.mjs';
import { validateItems } from '../roster-server/deck-rules.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/lesson-tree/prep-1-3.json', import.meta.url), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const isGuidance = node => node.source?.includes('.teacherPrompts');

function prepWithPrompts() {
  const prep = clone(fixture.prep);
  for (const example of prep.examples) {
    example.teacherPrompts = Array.from({ length: 5 }, (_, index) => ({
      key: `examples[n=${example.n}].teacherPrompts.GeneralizeETP[0].questions[${index}]`,
      kind: 'question', category: 'GeneralizeETP',
      question: `Question ${index + 1} for example ${example.n}?`,
      answer: `Student reasoning ${index + 1} for example ${example.n}.`,
      source: { file: 'a2_1-3_TE.tex', anchor: example.n, line: 40 + index },
    }));
  }
  return prep;
}

const select = (tree, card, extra = {}) => selectDeck({
  trees: { '1-3': tree }, lessons: ['1-3'], card,
  date: '2026-10-26', sections: ['C'], ...extra,
});

describe('teacher guidance reaches Android practice', () => {
  it('keeps original mastery IDs, adds sourced questions only to kept examples, and survives wording changes', () => {
    const prep = prepWithPrompts();
    const original = buildTree('1-3', fixture.prep, fixture.dayLog);
    const tree = buildTree('1-3', prep, fixture.dayLog);
    expect(treeProblem(tree)).toBeNull();
    expect(tree.nodes.filter(node => !isGuidance(node)).map(node => node.id)).toEqual(original.nodes.map(node => node.id));
    const questions = tree.nodes.filter(isGuidance);
    expect(questions).toHaveLength(10);
    expect(questions[0]).toMatchObject({ type: 'cue', front: 'Example 3 · Connect representations: Question 1 for example 3?',
      back: 'Listen for: Student reasoning 1 for example 3.', teaching: { example: 3, source: { file: 'a2_1-3_TE.tex', line: 40 } } });
    prep.examples.find(example => example.n === 3).teacherPrompts[0].question = 'Improved wording?';
    expect(buildTree('1-3', prep, fixture.dayLog).nodes.map(node => node.id)).toEqual(tree.nodes.map(node => node.id));
  });

  it('reserves daily practice space even when quiz anchors could fill all 14 cards', () => {
    const prep = prepWithPrompts();
    prep.quizFocus.needs = Array.from({ length: 18 }, (_, index) => `Quiz need ${index}`);
    const tree = buildTree('1-3', prep, fixture.dayLog);
    const deck = select(tree, { title: 'Example 5', body: 'Shipping table', minutes: 11 });
    const selected = deck.items.map(item => tree.nodes.find(node => node.id === item.node));
    expect(deck.items).toHaveLength(14);
    expect(selected.filter(isGuidance)).toHaveLength(5);
    expect(selected.filter(isGuidance).every(node => node.teaching.example === 5)).toBe(true);
    expect(selected.some(node => node.source === 'examples[n=5]')).toBe(true);
    expect(() => validateItems(deck.items)).not.toThrow();
  });

  it('covers each named example and rotates new prompts ahead of already-known prompts', () => {
    const tree = buildTree('1-3', prepWithPrompts(), fixture.dayLog);
    const guidance = tree.nodes.filter(isGuidance);
    const known = new Set(guidance.filter(node => /questions\[[01]\]$/.test(node.source)).map(node => node.id));
    const deck = select(tree, { title: 'Examples 3 and 5', body: '', minutes: 12 }, { known });
    const selected = deck.items.map(item => tree.nodes.find(node => node.id === item.node)).filter(isGuidance);
    expect(selected.slice(0, 6).every(node => !known.has(node.id))).toBe(true);
    expect(selected.slice(0, 2).map(node => node.teaching.example)).toEqual([3, 5]);
    expect([...namedExamples('Examples 1, 3, and 5; Example 2')]).toEqual([1, 3, 5, 2]);
    expect(() => validateItems(deck.items)).not.toThrow();
  });

  it('keeps long questions and corrections complete, with all parts together in practice', () => {
    const prep = prepWithPrompts();
    const prompt = prep.examples.find(example => example.n === 5).teacherPrompts[0];
    prompt.question = 'An extended textbook situation. '.repeat(9) + 'What should students notice?';
    prompt.answer = 'A possible student misconception. '.repeat(10) + 'The essential correction belongs at the end.';
    const tree = buildTree('1-3', prep, fixture.dayLog);
    const parts = tree.nodes.filter(node => node.teaching?.promptKey === prompt.key);
    expect(parts.length).toBeGreaterThan(1);
    const complete = parts.map(node => node.back).join(' ').replace(/\s+/g, ' ');
    expect(complete).toContain(prompt.question);
    expect(complete).toContain(prompt.answer);
    const deck = select(tree, { title: 'Example 5', body: '', minutes: 11 });
    expect(parts.every(part => deck.items.some(item => item.node === part.id))).toBe(true);
    expect(() => validateItems(deck.items)).not.toThrow();
  });

  it('rebuilds from portable cached textbook guidance and rejects a future example without guidance', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'teacher-guidance-flow-'));
    try {
      const prep = clone(fixture.prep);
      const prepPath = resolve(dir, 'prep.json');
      const dayPath = resolve(dir, 'day-log.json');
      const te = resolve(dir, 'a2_1-3_TE.tex');
      writeFileSync(prepPath, JSON.stringify({ lessons: { '1-3': prep } }));
      writeFileSync(dayPath, JSON.stringify(fixture.dayLog));
      writeFileSync(te, String.raw`\begin{te-addendum}{3}{GeneralizeETP}
Q: What does a horizontal piece mean?
\answer{Zero slope; the output stays constant.}
\end{te-addendum}
\begin{te-addendum}{5}{GeneralizeETP}
Q: Why does the graph look like stairs?
\answer{Each interval has a constant cost.}
\end{te-addendum}`);
      const script = fileURLToPath(new URL('../scripts/build-lesson-tree.mjs', import.meta.url));
      const args = [script, '--all', '--check', '--prep', prepPath, '--day-log', dayPath,
        '--te-dir', dir, '--prompts-dir', resolve(dir, 'teacher-prompts'), '--out-dir', resolve(dir, 'trees')];
      const first = spawnSync(process.execPath, args, { encoding: 'utf8' });
      expect(first.status, first.stderr).toBe(0);
      expect(existsSync(resolve(dir, 'teacher-prompts', '1-3.json'))).toBe(true);
      const treePath = resolve(dir, 'trees', '1-3.json');
      const content = readFileSync(treePath, 'utf8');
      expect(JSON.parse(content).nodes.filter(isGuidance)).toHaveLength(2);
      rmSync(te);
      const cached = spawnSync(process.execPath, args, { encoding: 'utf8' });
      expect(cached.status, cached.stderr).toBe(0);
      expect(readFileSync(treePath, 'utf8')).toBe(content);
      prep.examples.push({ n: 6, title: 'New example', keep: true });
      writeFileSync(prepPath, JSON.stringify({ lessons: { '1-3': prep } }));
      const missing = spawnSync(process.execPath, args, { encoding: 'utf8' });
      expect(missing.status).toBe(1);
      expect(missing.stderr).toMatch(/1-3.*6/);
      expect(readFileSync(treePath, 'utf8')).toBe(content);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
