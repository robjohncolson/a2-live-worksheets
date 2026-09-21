import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import { describe, it, expect, vi } from 'vitest';

const engine = readFileSync('flashcards.js', 'utf8');
const scope = { window: {} };
runInContext(engine, createContext(scope));
const FC = scope.window.Flashcards;
const csv = readFileSync('content/a2/1-1/deck.csv', 'utf8');
const cards = FC.rowsToDeck(FC.parseCsv(csv));
const source = JSON.parse(readFileSync('data/sources/blooket/a2-number-line-interval/set.json', 'utf8'));

function fn(file, name) {
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf('function ' + name + '(');
  let depth = 0;
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error('Missing function ' + name);
}

it('reproduces the 36 supported source cards, answer order, lineage, UTF-8 and image bytes', () => {
  expect(execFileSync(process.execPath, ['scripts/build-a2-blooket-deck.mjs', '--check'], { encoding: 'utf8' })).toContain('36 cards and 23 images');
  expect(csv.charCodeAt(0)).not.toBe(0xfeff);
  expect(csv).not.toContain('\ufffd');
  expect(csv).not.toContain('`*');
  expect(csv).not.toContain('`~`');
  expect(csv).not.toContain('media.blooket.com');
  expect(FC.parseCsv(csv)[0]).toEqual(['Question #', 'Question Text', 'Answer 1', 'Answer 2', 'Answer 3', 'Answer 4', 'Time Limit (sec)', 'Correct Answer(s)', 'source', 'image']);
  expect(cards).toHaveLength(36);
  const originals = source.questions.filter(q => q.number >= 1 && q.number <= 40 && ![9, 10, 16, 22].includes(q.number)).sort((a, b) => a.number - b.number);
  expect(cards.map(card => card.qnum)).toEqual(originals.map(q => q.number));
  const lineage = JSON.parse(readFileSync('content/a2/1-1/deck.sources.json', 'utf8'));
  expect(Object.keys(lineage)).toEqual(originals.map(q => String(q.number)));
  cards.forEach((card, i) => {
    const original = originals[i];
    expect(card).toEqual({ qnum: original.number, q: original.question, choices: original.answers, correctIdx: original.answers.indexOf(original.correctAnswers[0]), image: original.image || '' });
    expect(lineage[card.qnum]).toBe(`blooket:${source.setId}:q${original.number}`);
    if (card.image) expect(readFileSync(`content/a2/1-1/images/blooket/${card.image}`)).toEqual(readFileSync(`data/sources/blooket/a2-number-line-interval/${card.image}`));
  });
  expect(cards.filter(card => card.image)).toHaveLength(23);
});

it.each(['`~`', 'media.blooket.com'])('drops image answers and rejects retained prompt markup: %s', marker => {
  const builder = readFileSync('scripts/build-a2-blooket-deck.mjs', 'utf8');
  const question = { number: 1, question: 'Choose an interval', answers: ['[0, 1]', '(0, 1)'], correctAnswers: ['[0, 1]'], timeLimit: 20 };
  const write = vi.fn();
  const run = questions => runInContext(builder.slice(builder.indexOf('const sourcePath =')), createContext({
    root: '.', resolve, dirname, Buffer, process: { argv: [] }, console: { log() {} },
    readFileSync: () => JSON.stringify({ setId: 'fixture', questions }),
    mkdirSync() {}, writeFileSync: write
  }));
  run([{ ...question, number: 2, answers: [question.answers[0], marker] }, question]);
  expect(FC.rowsToDeck(FC.parseCsv(write.mock.calls[0][1].toString())).map(card => card.qnum)).toEqual([1]);
  write.mockClear();
  expect(() => run([{ ...question, question: marker }])).toThrow('Unsupported image answer in question 1');
  expect(write).not.toHaveBeenCalled();
});

it('parses optional image columns in both parsers without confusing the source column', () => {
  const deskParser = new Function('return ' + fn('desk.html', '_bfRowsToDeck'))();
  for (const rows of [FC.parseCsv(csv), FC.parseCsv('1,Q,A,B,,,20,1,source-id'), FC.parseCsv('n,q,a,b,c,d,t,correct,image\n1,Q,A,B,,,20,1,q01.png')]) {
    expect(deskParser(rows)).toEqual(FC.rowsToDeck(rows));
  }
});

describe('daily draw', () => {
  it('is pure, shared across students and changes with the local date and lesson', () => {
    const before = JSON.stringify(cards);
    const draw = FC.dailyDraw(cards, '2026-09-20|1.1', 10);
    expect(draw).toHaveLength(10);
    expect(FC.dailyDraw(cards, '2026-09-20|1.1', 10)).toEqual(draw);
    expect(FC.dailyDraw(cards, '2026-09-21|1.1', 10)).not.toEqual(draw);
    expect(FC.dailyDraw(cards, '2026-09-20|1.2', 10)).not.toEqual(draw);
    expect(JSON.stringify(cards)).toBe(before);
    expect(FC.localDateKey(new Date(2026, 8, 20, 23, 59))).toBe('2026-09-20');
  });
  it('cycles through every card before repeating, including across month boundaries', () => {
    const stream = [];
    for (let day = 0; day < 16; day++) {
      const key = new Date(Date.UTC(2026, 8, 26 + day)).toISOString().slice(0, 10);
      const draw = FC.dailyDraw(cards, key + '|1.1', 10).map(card => card.qnum);
      expect(new Set(draw).size).toBe(10);
      stream.push(...draw);
    }
    expect(new Set(stream.slice(0, 36)).size).toBe(36);
    expect(stream.slice(0, 36)).toEqual(stream.slice(36, 72));
    expect(FC.dailyDraw([], '2026-09-20|1.1', 10)).toEqual([]);
    expect(FC.dailyDraw(cards.slice(0, 4), '2026-09-20|1.1', 10)).toHaveLength(4);
  });
});

function renderer(surface, timed = false) {
  const dom = new JSDOM('<div id="body"></div>' + ['bf-question', 'bf-choices', 'bf-progress', 'bf-feedback', 'bf-next'].map(id => `<div id="${id}"></div>`).join(''));
  const document = dom.window.document;
  const images = [];
  const create = document.createElement.bind(document);
  document.createElement = tag => { const el = create(tag); if (tag === 'img') images.push(el); return el; };
  const deck = [{ qnum: 1, q: 'Image question', choices: ['A', 'B'], correctIdx: 0, image: 'q01.png' }, { qnum: 2, q: 'Next question', choices: ['C', 'D'], correctIdx: 0 }];
  const finish = vi.fn();
  const timer = vi.fn();
  const state = { topic: '1.1', lesson: { id: '1.1' }, mode: timed ? 'full' : 'quick', deck, idx: 0, score: 0, correct: 0, round: FC.createRound(deck) };
  const ctx = createContext({ document, Flashcards: FC, FC, _bfState: state, _ftState: state, _fc: state,
    _bfCsvPath: () => 'content/a2/1-1/deck.csv', _fcCsvPath: () => 'content/a2/1-1/deck.csv',
    _bfFinish: finish, _ftFinish: finish, _fcFinish: finish, _ftClearTimer() {}, _fcTimerStop() {}, _ftStartTimer: timer, _fcStartTimer: timer,
    _ftDone: round => !round.order.length, _ftCurrentIdx: FC.currentIdx, _fcChoicePermutationEnabled: () => false,
    _fcSetProg() {}, esc: value => value, fcBody: () => document.getElementById('body'),
    _fcBodyHtml: html => { document.getElementById('body').innerHTML = html; }, _bfAnswer() {}, _ftAnswer() {}, _fcAnswer() {}, _fcNext() {}
  });
  const names = surface === 'desk' ? ['_bfShowCardImage', timed ? '_ftRenderCard' : '_bfRenderCard'] : ['_fcCurrentCard', '_fcRenderCard'];
  runInContext(names.map(name => fn(surface === 'desk' ? 'desk.html' : 'mobile-home.html', name)).join('\n'), ctx);
  const render = () => runInContext(names.at(-1) + '()', ctx);
  return { dom, document, images, state, finish, timer, render, ctx };
}

describe.each(['desk', 'mobile'])('%s image rendering', surface => {
  it('ignores an image callback after the run has been replaced', () => {
    const h = renderer(surface);
    try {
      h.render();
      if (surface === 'desk') h.state.deck = [];
      else h.ctx._fc = null;
      h.images[0].onload();
      h.images[0].onerror();
      expect(h.document.querySelectorAll('button')).toHaveLength(0);
      expect(h.finish).not.toHaveBeenCalled();
    } finally { h.dom.window.close(); }
  });
  it('resumes only today’s draw and saves image loading as unanswered', () => {
    const h = renderer(surface);
    const saved = {};
    const storage = { getItem: key => saved[key] || null, setItem: (key, value) => { saved[key] = value; } };
    const saveName = surface === 'desk' ? '_bfSaveProgress' : '_fcSaveQuickProgress';
    const loadName = surface === 'desk' ? '_bfLoadProgress' : '_fcLoadQuickProgress';
    try {
      h.ctx.localStorage = storage;
      h.ctx._bfStorageKey = h.ctx._fcQuickProgressKey = () => 'a2_desk_bf_progress_fixture';
      h.ctx._fcEmail = () => 'fixture';
      h.state.deck = FC.dailyDraw(cards, FC.localDateKey() + '|1.1', 10);
      h.state.answered = true;
      h.state.imageLoading = true;
      runInContext(fn(surface === 'desk' ? 'desk.html' : 'mobile-home.html', saveName) + '\n' + fn(surface === 'desk' ? 'desk.html' : 'mobile-home.html', loadName), h.ctx);
      runInContext(saveName + '()', h.ctx);
      const restored = runInContext(loadName + "('1.1')", h.ctx);
      expect(restored.answered).toBe(false);
      expect(restored.deck).toHaveLength(10);
      h.state.deck[0].dailyKey = '2000-01-01|1.1';
      runInContext(saveName + '()', h.ctx);
      expect(runInContext(loadName + "('1.1')", h.ctx)).toBeNull();
    } finally { h.dom.window.close(); }
  });
  it.each([false, true])('waits for the image before answers and timer (timed=%s)', timed => {
    const h = renderer(surface, timed);
    try {
      h.render();
      expect(h.state.answered).toBe(true);
      expect(h.timer).not.toHaveBeenCalled();
      expect(h.document.querySelectorAll('button')).toHaveLength(0);
      h.images[0].onload();
      const img = h.document.querySelector('img');
      expect(img.alt).toBe('number line');
      expect(img.style.maxWidth).toBe('100%');
      expect(img.src).toContain('content/a2/1-1/images/blooket/q01.png');
      expect(img.nextSibling.textContent).toBe('Image question');
      expect(h.state.answered).toBe(false);
      expect(h.timer).toHaveBeenCalledTimes(timed ? 1 : 0);
    } finally { h.dom.window.close(); }
  });
  it.each([false, true])('skips a failed image without credit or a miss (timed=%s)', timed => {
    const h = renderer(surface, timed);
    try {
      h.render(); h.images[0].onerror();
      expect(h.document.body.textContent).toContain('Next question');
      expect(h.document.body.textContent).not.toContain('Image question');
      expect(h.state.score).toBe(0);
      if (timed) {
        expect(h.state.round.total).toBe(1);
        expect(h.state.round.order).toEqual([1]);
        expect(h.state.round.log).toEqual([]);
      } else expect(h.state.deck.map(card => card.qnum)).toEqual([2]);
    } finally { h.dom.window.close(); }
  });
});


it('Review due waits for number-line images and skips failures without rating them', () => {
  const h = renderer('desk');
  try {
    h.ctx._rvState = { queue: h.state.deck.slice(), ratings: 0, topic: '1.1' };
    h.ctx._rvFinish = vi.fn();
    h.ctx._rvAnswer = vi.fn();
    runInContext(fn('desk.html', '_rvRenderCard'), h.ctx);
    runInContext('_rvRenderCard()', h.ctx);
    expect(h.ctx._rvState.stage).toBe('loading');
    expect(h.document.querySelectorAll('button')).toHaveLength(0);
    h.images[0].onload();
    expect(h.document.querySelector('img').alt).toBe('number line');
    expect(h.ctx._rvState.stage).toBe('answer');
    expect(h.document.querySelectorAll('button')).toHaveLength(3);
    h.ctx._rvState.queue = h.state.deck.slice();
    runInContext('_rvRenderCard()', h.ctx);
    h.images[1].onerror();
    expect(h.document.getElementById('bf-question').textContent).toBe('Next question');
    expect(h.ctx._rvState.ratings).toBe(0);
    expect(h.ctx._rvAnswer).not.toHaveBeenCalled();
  } finally { h.dom.window.close(); }
});
