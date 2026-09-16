// @vitest-environment node
// B15: retained display contracts with inline Algebra 2 records.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { loadCedLabels } from './fixtures/ced2026-labels.js';

const deskUrl = pathToFileURL(resolve(__dirname, '../desk.html')).href;
const source = readFileSync(new URL(deskUrl), 'utf8');
const opened = [];
afterEach(() => opened.splice(0).forEach(dom => dom.window.close()));

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

function makeCalendar() {
  const dom = new JSDOM('<div id="cell"></div>', { runScripts: 'outside-only', url: 'https://school.test/' });
  opened.push(dom);
  const registry = { lessons: {
    '1.1': { published: true, status: 'published', urls: { check: 'check.html?lesson=1-1' },
      ced2026: { status: 'core', newTopic: '1.1', newUnit: 1, newLabel: 'Key Features of Functions' } },
    '1.2': { published: false, status: 'unpublished', urls: {},
      ced2026: { status: 'core', newTopic: '1.2', newUnit: 1, newLabel: 'Transformations of Functions' } },
  } };
  const labels = loadCedLabels(registry);
  Object.assign(dom.window, { cYear: 'SY26-27', R: 'review', OFF: 'off', EX: 'exam',
    PO: 'post', NC: 'noclass', cedLabel: labels.cedLabel, cedDisplayText: labels.cedDisplayText,
    getRegistryEntry: key => registry.lessons[key] });
  dom.window.eval(['_resourcePanelEsc', 'htm', 'cellAria'].map(functionSource).join('\n')
    + '\n//# sourceURL=' + deskUrl);
  return { win: dom.window, registry };
}

describe('A2 calendar presentation preserves lesson and resource identity', () => {
  it.each(['1.1', '1.2'])('renders %s with its A2 title and publication status', key => {
    const { win, registry } = makeCalendar();
    const cell = { t: key, n: 'stale label', u: 1 };
    const urls = JSON.stringify(registry.lessons[key].urls);
    win.document.getElementById('cell').innerHTML = win.htm(cell, 'Sep 16');
    expect(win.document.getElementById('cell').textContent).toContain(registry.lessons[key].ced2026.newLabel);
    expect(win.cellAria(cell, 'Sep 16')).toContain('status ' + registry.lessons[key].status);
    expect(cell).toMatchObject({ t: key, n: 'stale label', u: 1 });
    expect(JSON.stringify(registry.lessons[key].urls)).toBe(urls);
  });

  it('updates an already-created cell when the registry title changes', () => {
    const { win, registry } = makeCalendar();
    const cell = { t: '1.1', n: 'original', u: 1 };
    expect(win.htm(cell, 'Sep 16')).toContain('Key Features');
    registry.lessons['1.1'].ced2026.newLabel = 'Updated function lesson';
    expect(win.htm(cell, 'Sep 16')).toContain('Updated function lesson');
    expect(win.cellAria(cell, 'Sep 16')).toContain('Updated function lesson');
    expect(cell.t).toBe('1.1');
    expect(registry.lessons['1.1'].urls.check).toBe('check.html?lesson=1-1');
  });

  it('escapes hydrated titles at the calendar HTML sink', () => {
    const { win, registry } = makeCalendar();
    registry.lessons['1.1'].ced2026.newLabel = '<img src=x onerror=alert(1)>';
    const cell = win.document.getElementById('cell');
    cell.innerHTML = win.htm({ t: '1.1', n: 'stale', u: 1 }, 'Sep 16');
    expect(cell.querySelector('img')).toBeNull();
    expect(cell.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
