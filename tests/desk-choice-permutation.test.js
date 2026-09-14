// desk-choice-permutation.test.js — deterministic answer-position permutation.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const match = re.exec(src);
  if (!match) throw new Error('function not found: ' + name);
  let depth = 0;
  for (let i = src.indexOf('{', match.index); i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(match.index, i + 1);
    }
  }
  throw new Error('unbalanced braces for ' + name);
}

function deskFn(name, deps = '') {
  return new Function(deps + '\nreturn (' + fnBody(DESK, name) + ');')();
}

function loadEngine() {
  const win = {};
  runInContext(
    readFileSync(resolve(repo, 'flashcards.js'), 'utf8'),
    createContext({ window: win, Math, String, Array }),
  );
  return win.Flashcards;
}

function renderQuick({ enabled, choices, fakePerm }) {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="bf-feedback"></div>
    <button id="bf-next"></button>
    <div id="bf-question"></div>
    <div id="bf-choices"></div>
    <div id="bf-progress"></div>
  </body>`);
  const state = {
    deck: [{ qnum: 7, q: 'Question?', choices, correctIdx: 0 }],
    idx: 0,
    score: 0,
    answered: false,
    roundId: 'desk-100-abcd',
    perm: [],
  };
  let permutationCalls = 0;
  const render = new Function(
    'document', 'Date', '_bfState', '_bfFinish', '_fcFlag',
    '_bfIsPermutationUnsafe', '_bfPermutationFor', '_bfPermSeed',
    'getStudentEmail', '_bfAnswer',
    'return (' + fnBody(DESK, '_bfRenderCard') + ');',
  )(
    dom.window.document,
    Date,
    state,
    function () {},
    function () { return enabled; },
    deskFn('_bfIsPermutationUnsafe'),
    function () { permutationCalls += 1; return fakePerm.slice(); },
    function () { return 123; },
    function () { return 'kid@roster.local'; },
    function () {},
  );
  render();
  return {
    dataIndices: Array.from(dom.window.document.querySelectorAll('.bf-choice'), function (button) {
      return Number(button.getAttribute('data-i'));
    }),
    permutationCalls,
    state,
  };
}

describe('Desk choice-position permutation', () => {
  it('uses identity order when a choice makes permutation unsafe', () => {
    const rendered = renderQuick({
      enabled: true,
      choices: ['Alpha', 'All of the above', 'Gamma'],
      fakePerm: [2, 0, 1],
    });
    expect(rendered.dataIndices).toEqual([0, 1, 2]);
    expect(rendered.state.perm).toEqual([0, 1, 2]);
    expect(rendered.permutationCalls).toBe(0);
  });

  it('is deterministic for the same seed and produces a bijection', () => {
    const permutationFor = deskFn(
      '_bfPermutationFor',
      'var _bfMulberry32=' + fnBody(DESK, '_bfMulberry32') + ';',
    );
    const first = permutationFor(8675309, 8);
    const second = permutationFor(8675309, 8);
    expect(first).toEqual(second);
    expect(first.slice().sort(function (a, b) { return a - b; })).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('the engine permutation is also a deterministic bijection', () => {
    const FC = loadEngine();
    const first = FC.permutationFor(42, 6);
    expect(FC.permutationFor(42, 6)).toEqual(first);
    expect(Array.from(first).sort(function (a, b) { return a - b; })).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('an extracted _bfRenderCard renders data-i values in permutation order', () => {
    const rendered = renderQuick({
      enabled: true,
      choices: ['Alpha', 'Beta', 'Gamma'],
      fakePerm: [2, 0, 1],
    });
    expect(rendered.dataIndices).toEqual([2, 0, 1]);
    expect(rendered.state.perm).toEqual([2, 0, 1]);
  });

  it("keydown 'a' selects the real index at perm[0]", () => {
    const calls = [];
    const document = {
      activeElement: null,
      getElementById(id) {
        if (id === 'bf-overlay') return { style: { display: 'block' } };
        return null;
      },
    };
    const state = {
      answered: false,
      idx: 0,
      perm: [2, 0, 1],
      deck: [{ choices: ['Alpha', 'Beta', 'Gamma'], correctIdx: 0 }],
    };
    const handler = new Function(
      'document', '_bfState', '_bfAnswer',
      'return (' + fnBody(DESK, '_bfKeydownHandler') + ');',
    )(document, state, function (idx) { calls.push(idx); });
    handler({ key: 'a', preventDefault: function () {} });
    expect(calls).toEqual([2]);
  });

  it('_bfAnswer and _ftAnswer highlight by real data-i', () => {
    for (const name of ['_bfAnswer', '_ftAnswer']) {
      const body = fnBody(DESK, name);
      expect(body).toMatch(/getAttribute\(\s*['"]data-i['"]\s*\)/);
    }
  });

  it('respects the kill-switch result supplied by _fcFlag', () => {
    const rendered = renderQuick({
      enabled: false,
      choices: ['Alpha', 'Beta', 'Gamma'],
      fakePerm: [2, 0, 1],
    });
    expect(rendered.dataIndices).toEqual([0, 1, 2]);
    expect(rendered.permutationCalls).toBe(0);
  });
});
