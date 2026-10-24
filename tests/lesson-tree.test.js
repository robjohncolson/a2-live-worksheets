// @vitest-environment node
// Lesson trees (KNOWLEDGE_TREE_SPEC.md WP-1 1.1): golden tree from a fixture prep
// entry, id stability under a wording edit, cycle rejection, clipping, and the CLI.
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildTree, cardTraps, clip, languageWords, nodeId, treeProblem } from '../scripts/lib/lesson-tree.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/lesson-tree/prep-1-3.json', import.meta.url), 'utf8'));
const golden = JSON.parse(readFileSync(new URL('./fixtures/lesson-tree/golden-1-3.json', import.meta.url), 'utf8'));
const script = fileURLToPath(new URL('../scripts/build-lesson-tree.mjs', import.meta.url));
const clone = value => JSON.parse(JSON.stringify(value));
const bySource = (tree, source) => tree.nodes.find(node => node.source === source);

describe('buildTree', () => {
  it('a fixture prep entry gives the golden tree', () => {
    expect(buildTree(fixture.lesson, fixture.prep, fixture.dayLog)).toEqual(golden);
    expect(treeProblem(golden)).toBeNull();
  });
  it('maps the fields in the spec order with the spec edges', () => {
    const tree = golden;
    const order = tree.nodes.map(node => node.source.replace(/\[.*$|\.words\..*$|\.items\..*$|\.\d{4}-.*$/, ''));
    expect([...new Set(order)]).toEqual(['objectives.essentialQuestion', 'objectives.language', 'quizFocus.what', 'quizFocus.answer', 'quizFocus.needs',
      'quizFocus', 'examples', 'dok3.task', 'dok3.key', 'modelDiscuss.situation', 'modelDiscuss.studentPrompts', 'modelDiscuss.teQuestions',
      'modelDiscuss.caution', 'ixl.RVD', 'ixl.W67', 'day-log']);
    const frame = bySource(tree, 'objectives.essentialQuestion');
    const vocab = tree.nodes.filter(node => node.source.startsWith('objectives.language.words.'));
    expect(vocab.map(node => node.front)).toEqual(['Define: piece', 'Define: interval', 'Define: open circle', 'Define: closed circle']);
    expect(vocab.every(node => node.after.join() === frame.id)).toBe(true);
    // A word named by a quiz need takes that need; otherwise the language objective.
    expect(bySource(tree, 'objectives.language.words.open circle').back).toMatch(/^open circle = strict inequality/);
    expect(bySource(tree, 'objectives.language.words.closed circle').back).toBe(fixture.prep.objectives.language);
    const asks = bySource(tree, 'quizFocus.what');
    expect(asks.after).toEqual(vocab.map(node => node.id));
    expect(bySource(tree, 'quizFocus.needs[0]').after).toEqual([asks.id]);
    const [ex3, ex5] = tree.nodes.filter(node => node.type === 'step');
    expect([ex3.front, ex3.minute, ex5.front, ex5.minute]).toEqual(['Example 3: ?', 6, 'Example 5: ?', 12]);
    expect(ex3.after).toEqual([asks.id, bySource(tree, 'quizFocus.answer').id]);
    expect(ex5.after).toEqual([ex3.id]);
    expect(bySource(tree, 'dok3.key').after).toEqual([ex5.id]);
    const situation = bySource(tree, 'modelDiscuss.situation');
    const te = tree.nodes.filter(node => node.source.startsWith('modelDiscuss.teQuestions'));
    expect(te.map(node => node.front)).toEqual(['Before, whole class: ask?', 'During, small group: ask?', 'Before, whole class: ask? (2)']);
    expect(te.map(node => node.after[0])).toEqual([situation.id, te[0].id, te[1].id]);
    expect(te[0].back).toBe('How do stores A and B compare? → Store A sells strings individually; Store B sells them in packages of 4.');
    expect(bySource(tree, 'modelDiscuss.caution')).toMatchObject({ type: 'trap', after: [situation.id] });
    // Only core IXL with an example; after that example's step.
    expect(tree.nodes.filter(node => node.source.startsWith('ixl.')).map(node => [node.back, node.after[0]])).toEqual([
      ['RVD Graph piecewise-defined functions', ex3.id], ['W67 Find the slope of a linear function', ex3.id]]);
    // Card traps: after the vocabulary words they use; only this lesson's cards.
    const traps = tree.nodes.filter(node => node.source.startsWith('day-log.'));
    expect(traps.map(node => [node.front, node.card])).toEqual([
      ['x <= 2 costs 8', { date: '2026-10-26', section: 'C' }], ['the open circle is included', { date: '2026-10-26', section: 'C' }]]);
    expect(traps[1].after).toEqual([bySource(tree, 'objectives.language.words.piece').id, bySource(tree, 'objectives.language.words.open circle').id]);
  });
  it('a node id is sha256(lesson|sourcePath) and survives a wording edit; moving the entry changes it', () => {
    expect(golden.nodes[0].id).toBe(nodeId('1-3', 'objectives.essentialQuestion'));
    const edited = clone(fixture.prep);
    edited.objectives.essentialQuestion = 'A reworded essential question?';
    edited.modelDiscuss.teQuestions[1].q = 'Reworded?';
    edited.examples[2].title = 'Retitled';
    const tree = buildTree('1-3', edited, fixture.dayLog);
    expect(tree.nodes.map(node => node.id)).toEqual(golden.nodes.map(node => node.id));
    expect(tree.nodes[0].back).toBe('A reworded essential question?');
    const moved = buildTree('1-4', fixture.prep, null);
    expect(moved.nodes[0].id).not.toBe(golden.nodes[0].id);
  });
  it('an empty field makes no node; without a card the steps have no minute and no traps', () => {
    const prep = clone(fixture.prep);
    delete prep.dok3; prep.modelDiscuss.caution = '  ';
    const tree = buildTree('1-3', prep, null);
    expect(tree.nodes.some(node => node.source.startsWith('dok3') || node.source === 'modelDiscuss.caution' || node.type === 'trap')).toBe(false);
    expect(tree.nodes.filter(node => node.type === 'step').map(node => node.minute)).toEqual([null, null]);
  });
});

describe('treeProblem', () => {
  it('rejects a cycle, an unknown parent, duplicate ids and a bad size', () => {
    const cyclic = clone(golden);
    cyclic.nodes[0].after = [cyclic.nodes[1].id];
    expect(treeProblem(cyclic)).toMatch(/^after has a cycle: /);
    const unknown = clone(golden);
    unknown.nodes[2].after = ['abcdefabcdef'];
    expect(treeProblem(unknown)).toMatch(/after names abcdefabcdef, which is not in the tree/);
    const dup = clone(golden);
    dup.nodes[3].id = dup.nodes[2].id;
    expect(treeProblem(dup)).toMatch(/duplicate node id/);
    expect(treeProblem({ nodes: golden.nodes.slice(0, 5) })).toMatch(/6 to 60 nodes \(got 5\)/);
    expect(treeProblem({ nodes: Array.from({ length: 61 }, (_, i) => ({ ...golden.nodes[0], id: i.toString(16).padStart(12, '0'), after: [] })) })).toMatch(/got 61/);
    const self = clone(golden);
    self.nodes[4].after = [self.nodes[4].id];
    expect(treeProblem(self)).toMatch(/after names itself/);
  });
});

describe('clip and parsing', () => {
  it('clips at a sentence boundary with an ellipsis, else at a word, within the limit', () => {
    const text = 'First sentence is here. ' + 'Second sentence is a bit longer than the first. '.repeat(10);
    const out = clip(text, 100);
    expect([...out].length).toBeLessThanOrEqual(100);
    expect(out).toMatch(/\. …$/);
    expect(out.startsWith('First sentence is here. Second')).toBe(true);
    const words = clip('word '.repeat(80), 50);
    expect([...words].length).toBeLessThanOrEqual(50);
    expect(words).toMatch(/word …$/);
    expect(clip('short', 240)).toBe('short');
    const long = clip('x'.repeat(400), 320);
    expect([...long].length).toBeLessThanOrEqual(320);
  });
  it('every node in the golden tree is within the deck limits', () => {
    for (const node of golden.nodes) { expect([...node.front].length).toBeLessThanOrEqual(240); expect([...node.back].length).toBeLessThanOrEqual(320); }
    expect(bySource(golden, 'quizFocus.what').back.length).toBeLessThanOrEqual(320);
  });
  it('reads the language words and the card traps', () => {
    expect(languageWords('I can explain using the words piece, interval, open circle and closed circle.')).toEqual(['piece', 'interval', 'open circle', 'closed circle']);
    expect(languageWords('using the words left, right, and up.')).toEqual(['left', 'right', 'up']);
    expect(languageWords('No word list here.')).toEqual([]);
    expect(cardTraps('Trap: "2f(x) is horizontal" → It is vertical.\n## Traps\n- a -> b\nno arrow\n## Next\n- c -> d')).toEqual([
      { front: '2f(x) is horizontal', back: 'It is vertical.' }, { front: 'a', back: 'b' }]);
  });
});

describe('build-lesson-tree CLI', () => {
  const run = args => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  it('writes every tree, leaves unchanged files alone, and --check catches a broken tree file', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'trees-'));
    try {
      writeFileSync(resolve(dir, 'prep.json'), JSON.stringify({ lessons: { '1-3': fixture.prep } }));
      writeFileSync(resolve(dir, 'day-log.json'), JSON.stringify(fixture.dayLog));
      const common = ['--prep', resolve(dir, 'prep.json'), '--day-log', resolve(dir, 'day-log.json'), '--out-dir', resolve(dir, 'trees')];
      const first = run(['--all', '--check', ...common]);
      expect(first.status).toBe(0);
      expect(first.stdout).toContain('1-3: 24 nodes');
      expect(first.stdout).toContain('written');
      expect(first.stdout).toContain('check: 1 tree(s) valid.');
      const path = resolve(dir, 'trees', '1-3.json');
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(golden);
      const mtime = statSync(path).mtimeMs;
      expect(run(['--lesson', '1-3', ...common]).stdout).toContain('unchanged');
      expect(statSync(path).mtimeMs).toBe(mtime);
      const broken = clone(golden); broken.nodes[0].after = [broken.nodes[1].id];
      writeFileSync(resolve(dir, 'trees', '9-9.json'), JSON.stringify(broken));
      const check = run(['--all', '--check', ...common]);
      expect(check.status).toBe(1);
      expect(check.stderr).toMatch(/check 9-9\.json: after has a cycle/);
      expect(run(['--lesson', '7-7', ...common]).stderr).toContain('no lesson-prep entry for 7-7');
      expect(run(common).status).toBe(1);
      expect(existsSync(resolve(dir, 'trees', '7-7.json'))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('the tracked trees are valid; 1-3 holds what the spec acceptance lists', () => {
    for (const lesson of ['1-2', '1-3', '1-5']) {
      expect(treeProblem(JSON.parse(readFileSync(new URL(`../content/a2/lesson-trees/${lesson}.json`, import.meta.url), 'utf8')))).toBeNull();
    }
    const tree = JSON.parse(readFileSync(new URL('../content/a2/lesson-trees/1-3.json', import.meta.url), 'utf8'));
    expect(tree.nodes.filter(node => node.type === 'frame').map(node => node.front)).toEqual(['Essential question?']);
    expect(tree.nodes.filter(node => node.source.startsWith('objectives.language.words.'))).toHaveLength(4);
    expect(tree.nodes.some(node => node.source === 'quizFocus.what') && tree.nodes.some(node => node.source === 'quizFocus.answer')).toBe(true);
    expect(tree.nodes.filter(node => node.type === 'step').map(node => node.front)).toEqual(['Example 3: ?', 'Example 5: ?']);
    expect(tree.nodes.filter(node => node.source.startsWith('modelDiscuss.teQuestions')).map(node => node.front.split(':')[0]))
      .toEqual(['Before, whole class', 'During, small group', 'Early finishers', 'After, whole class', 'Habits of Mind, Communicate Precisely']);
    expect(tree.nodes.find(node => node.source === 'modelDiscuss.caution').type).toBe('trap');
  });
});
