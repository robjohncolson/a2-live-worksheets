// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const deskUrl = pathToFileURL(resolve(__dirname, '../desk.html')).href;
const source = readFileSync(new URL(deskUrl), 'utf8');

function functionSource(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(source);
  if (!match) throw new Error('Missing Desk function: ' + name);
  let depth = 0;
  for (let i = source.indexOf('{', match.index); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(match.index, i + 1);
  }
  throw new Error('Unbalanced Desk function: ' + name);
}

function pacingCalendar() {
  const loadYear = vi.fn();
  const def = {
    range: { start: [2026, 8, 14], end: [2026, 8, 25] },
    daysOff: [[[2026, 8, 21]]],
    periods: { C: { meetsDays: [1, 2, 4] }, D: { meetsDays: [1, 3, 5] },
      G: { meetsDays: [2, 3, 4, 5] } }, pacing: {},
  };
  const registry = { lessons: { '1.1': { published: true,
    urls: { check: 'check.html?lesson=1-1', deck: 'content/a2/1-1/flashcards.csv' } } } };
  const sandbox = createContext({ SCHEDULE_DEFS: { 'SY26-27': def }, REGISTRY: registry,
    _a2PacingSignature: null, cYear: 'SY26-27', loadYear });
  runInContext(['dateFromArr', 'buildOffSet', 'd', 'applyA2Pacing'].map(functionSource).join('\n'),
    sandbox, { filename: deskUrl });
  return { sandbox, def, registry, loadYear };
}

const lessons = [
  { key: '1-1', title: 'Key Features of Functions',
    sections: { C: '2026-09-17', D: '2026-09-18', G: '2026-09-18' } },
  { key: '1-2', title: 'Transformations of Functions',
    sections: { C: '2026-09-24', D: '2026-09-25', G: '2026-09-25' } },
];

describe('applyA2Pacing C/D/G lesson windows', () => {
  it.each([['C', 3, 2], ['D', 3, 2], ['G', 4, 4]])(
    '%s keeps early-release Wednesday meetings and excludes closures', (section, first, second) => {
      const { sandbox, def } = pacingCalendar();
      expect(sandbox.applyA2Pacing(lessons)).toBe(true);
      // Sep 16 and Sep 23 are Wednesdays: D and G meet; C does not.
      // Sep 21 is an inline closure, so C/D each lose one second-window session.
      expect(def.pacing[section].map(cell => cell.t)).toEqual([
        ...Array(first).fill('1.1'), ...Array(second).fill('1.2'),
      ]);
      expect(def.pacing[section].every(cell => cell.u === 1)).toBe(true);
    });

  it('preserves source dates, check/deck links and publication flags while hydrating labels', () => {
    const { sandbox, registry, loadYear } = pacingCalendar();
    const snapshot = JSON.stringify(lessons);
    const entry = registry.lessons['1.1'];
    sandbox.applyA2Pacing(lessons);
    expect(registry.lessons['1.1']).toBe(entry);
    expect(entry).toMatchObject({ published: true, title: 'Key Features of Functions',
      urls: { check: 'check.html?lesson=1-1', deck: 'content/a2/1-1/flashcards.csv' },
      ced2026: { newTopic: '1.1', newUnit: 1, newLabel: 'Key Features of Functions' } });
    expect(JSON.stringify(lessons)).toBe(snapshot);
    expect(loadYear).toHaveBeenCalledWith('SY26-27');
  });

  it('ignores duplicate/invalid refreshes and rebuilds when section dates change', () => {
    const { sandbox, def, loadYear } = pacingCalendar();
    expect(sandbox.applyA2Pacing(null)).toBe(false);
    expect(sandbox.applyA2Pacing(lessons)).toBe(true);
    expect(sandbox.applyA2Pacing(JSON.parse(JSON.stringify(lessons)))).toBe(false);
    expect(loadYear).toHaveBeenCalledTimes(1);
    const updated = JSON.parse(JSON.stringify(lessons));
    updated[0].sections.C = '2026-09-15';
    expect(sandbox.applyA2Pacing(updated)).toBe(true);
    expect(def.pacing.C.filter(cell => cell.t === '1.1')).toHaveLength(2);
    expect(loadYear).toHaveBeenCalledTimes(2);
  });

  it('does not borrow a due date from a different section', () => {
    const { sandbox, def } = pacingCalendar();
    sandbox.applyA2Pacing([{ ...lessons[0], sections: { C: null, D: '2026-09-18', G: null } }]);
    expect(def.pacing.C).toEqual([]);
    expect(def.pacing.G).toEqual([]);
    expect(def.pacing.D).toHaveLength(3);
  });
});
