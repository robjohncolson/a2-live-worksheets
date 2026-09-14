/**
 * tests/desk-donow-summer-guard.test.js
 * Seamlessness gate: during summer, Do-Now card must agree with calendar
 * summer next-up (old 1.1–1.10), not CED-ordered /donow nextTask (3.1 after 1.9).
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { loadCedLabels } from './fixtures/ced2026-labels.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(repo, 'desk.html'), 'utf8');

function fnBody(src, name) {
  const re = new RegExp(
    '(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{',
  );
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const c = src[i++];
    if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return src.slice(m.index, i);
}

/** calNextUpTopic: first topic in order that is not "done" in marks. */
function makeCalNextUpTopic() {
  return function calNextUpTopic(ordered, marks) {
    const list = Array.isArray(ordered) ? ordered : [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (!t) continue;
      const st = marks && marks[t + '|worksheet'];
      // localLessonState-ish: done if any DESK_DONE style mark for worksheet
      if (st && st.ts) continue;
      return t;
    }
    return null;
  };
}

function makeDesk({
  token = 'tok',
  nextTask,
  summerTopics = ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9', '1.10'],
  summerActive = true,
  doneTopics = [],
  viewAs = false,
} = {}) {
  const els = new Map();
  function el(id) {
    if (!els.has(id)) els.set(id, { id, textContent: '', className: '', style: {} });
    return els.get(id);
  }
  el('donow-card');
  el('donow-msg');

  const marks = {};
  for (const t of doneTopics) {
    marks[t + '|worksheet'] = { ts: Date.now(), visitedAt: Date.now() };
  }

  // minimal DOM for summer cells
  const summerCells = summerActive
    ? summerTopics.map((t) => ({ dataset: { summer: '1', topic: t } }))
    : [];

  const fetchImpl = async () => ({
    json: async () => ({
      ok: true,
      nextTask:
        nextTask === undefined
          ? { unit: 'U1', lesson: '3.1', activity: 'worksheet', progress: { done: 0, total: 10 } }
          : nextTask,
      lessons: [],
    }),
  });

  const sandbox = {
    cedLabel: loadCedLabels().cedLabel,
    document: {
      getElementById: el,
      querySelector: (sel) => {
        if (sel === '#cg .dc[data-summer="1"]') return summerCells[0] || null;
        return null;
      },
      querySelectorAll: () => [],
      hidden: false,
      addEventListener: () => {},
    },
    window: {
      ROSTER_SERVICE_URL: 'https://roster.example',
      rosterClient: { token: () => token, current: () => ({ username: 'kid' }) },
      WalletLogic: null,
      _summerSchedule: { lessons: summerTopics.map((topic) => ({ topic })) },
    },
    fetch: fetchImpl,
    console,
    getStudentMarks: () => marks,
    calNextUpTopic: makeCalNextUpTopic(),
    _orderedSummerTopics: () => summerTopics.slice(),
    localLessonState: (lesson, m) => {
      if (m && m[lesson + '|worksheet'] && m[lesson + '|worksheet'].ts) return 'done';
      return '';
    },
    _calNextUp: null,
    _renderTi84SkillBtn: () => {},
    _hydrateMarksFromDonow: () => false,
    // Teacher view-as: when set, the summer override must NOT apply (marks are the
    // teacher's local storage, not the viewed student's — Codex catch on af1a2cd).
    _viewAsContext: viewAs ? () => ({ studentId: 's1', name: 'Kid' }) : undefined,
    paintDonowCells: () => {},
    renderDoNowGrades: undefined,
    _maybeViewAsFetch: undefined,
    _roadmapFetch: undefined,
    ROADMAP_FETCH_TIMEOUT_MS: 5000,
  };
  // expose marks for calNextUpTopic: done = has worksheet mark
  // calNextUpTopic above skips if marks[t+'|worksheet'].ts

  createContext(sandbox);
  runInContext(fnBody(html, 'renderDoNow') + '\nthis.__rd = renderDoNow;', sandbox);
  return {
    run: sandbox.__rd,
    msg: () => els.get('donow-msg').textContent,
    className: () => els.get('donow-card').className,
  };
}

describe('Do-Now summer guard (seamlessness)', () => {
  it('(1) done old 1.1–1.9 → card shows the summer Normal Distribution lesson', async () => {
    const d = makeDesk({
      doneTopics: ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9'],
      nextTask: { unit: 'U1', lesson: '3.1', activity: 'worksheet', progress: { done: 0, total: 10 } },
    });
    await d.run();
    expect(d.msg()).toBe('Do Now: 2.11 · The Normal Distribution · Day 1 — keep going.');
    expect(d.className()).toBe('donow-todo');
  });

  it('(1b) teacher view-as → summer override SKIPPED, server task retains its identity', async () => {
    // Teacher's LOCAL marks say done 1.1–1.9 (their own browsing), but /donow is the
    // viewed student's. The override must not clobber it with teacher-local 1.10.
    const d = makeDesk({
      viewAs: true,
      doneTopics: ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9'],
      nextTask: { unit: 'U1', lesson: '3.1', activity: 'worksheet', progress: { done: 0, total: 10 } },
    });
    await d.run();
    expect(d.msg()).toContain('1.10 · Investigative Question & Data Collection · Day 1');
    expect(d.msg()).not.toContain('2.11 · The Normal Distribution');
  });

  it('(2) done 1.1–1.10 (summer complete) → fall through to server U1 3.1', async () => {
    const d = makeDesk({
      doneTopics: ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9', '1.10'],
      nextTask: { unit: 'U1', lesson: '3.1', activity: 'worksheet', progress: { done: 0, total: 10 } },
    });
    await d.run();
    expect(d.msg()).toBe('Do Now: 1.10 · Investigative Question & Data Collection · Day 1 — worksheet (0/10 done).');
  });

  it('(3) done 1.1–1.5 → Topic 1.6', async () => {
    const d = makeDesk({
      doneTopics: ['1.1', '1.2', '1.3', '1.4', '1.5'],
      nextTask: { unit: 'U1', lesson: '1.6', activity: 'worksheet', progress: { done: 0, total: 10 } },
    });
    await d.run();
    expect(d.msg()).toBe('Do Now: 1.6 · Descriptions for 1-Quantitative Distributions — keep going.');
  });

  it('(4) fresh student → Topic 1.1', async () => {
    const d = makeDesk({
      doneTopics: [],
      nextTask: { unit: 'U1', lesson: '1.1', activity: 'worksheet', progress: { done: 0, total: 40 } },
    });
    await d.run();
    expect(d.msg()).toBe('Do Now: 1.1 · What Can We Learn from Data? — keep going.');
  });

  it('(5) school-year mode (no summer cells) → server task unchanged', async () => {
    const d = makeDesk({
      summerActive: false,
      doneTopics: ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9'],
      nextTask: { unit: 'U1', lesson: '3.1', activity: 'worksheet', progress: { done: 0, total: 10 } },
    });
    await d.run();
    expect(d.msg()).toBe('Do Now: 1.10 · Investigative Question & Data Collection · Day 1 — worksheet (0/10 done).');
  });

  it('DN3a vm path: missing summer helpers → still shows server nextTask (no throw)', async () => {
    // bare desk without summer helpers — original DN3a contract
    const els = new Map();
    function el(id) {
      if (!els.has(id)) els.set(id, { id, textContent: '', className: '', style: {} });
      return els.get(id);
    }
    el('donow-card');
    el('donow-msg');
    const sandbox = {
      cedLabel: loadCedLabels().cedLabel,
      document: {
        getElementById: el,
        querySelector: undefined, // no querySelector — guard must not throw
        hidden: false,
        addEventListener: () => {},
      },
      window: {
        ROSTER_SERVICE_URL: 'https://roster.example',
        rosterClient: { token: () => 'tok', current: () => null },
      },
      fetch: async () => ({
        json: async () => ({
          ok: true,
          nextTask: { unit: 'U1', lesson: '1.2', activity: 'worksheet', progress: { done: 4, total: 12 } },
        }),
      }),
      console,
    };
    createContext(sandbox);
    runInContext(fnBody(html, 'renderDoNow') + '\nthis.__rd = renderDoNow;', sandbox);
    await sandbox.__rd();
    expect(els.get('donow-msg').textContent).toBe('Do Now: 1.2 · Variables — worksheet (4/12 done).');
  });
});
