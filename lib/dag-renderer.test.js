// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

// Under jsdom, import.meta.url is an http-scheme URL, so we can't pass it to
// readFileSync directly. Work around by resolving relative to process.cwd()
// (vitest runs from the repo root).
const MODULE_PATH = join(process.cwd(), 'lib', 'dag-renderer.js');
const SOURCE = readFileSync(MODULE_PATH, 'utf8');
const TOPOLOGY = {
  title: 'Unit Test',
  nodes: [
    { id: 'A', label: 'Ask statistical questions', loIds: ['LO-1'], x: 0.1, y: 0.2 },
    { id: 'B', label: 'Analyze variables closely', loIds: ['LO-2', 'LO-3'], x: 0.5, y: 0.5 },
    { id: 'C', label: 'Draw useful conclusions', loIds: ['LO-4', 'LO-5', 'LO-6'], x: 0.9, y: 0.8 }
  ],
  edges: [
    { from: 'A', to: 'B', kind: 'sequence' },
    { from: 'B', to: 'C', kind: 'sequence' }
  ]
};

function loadBrowserApi() {
  const window = {};
  const context = createContext({
    window,
    self: window,
    globalThis: window
  });

  runInContext(SOURCE, context);

  return window.DagRenderer;
}

function hexToHue(hex) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) {
    return 0;
  }

  if (max === r) {
    return (((g - b) / delta) % 6) * 60;
  }

  if (max === g) {
    return (((b - r) / delta) + 2) * 60;
  }

  return (((r - g) / delta) + 4) * 60;
}

let DagRenderer;

beforeAll(async () => {
  delete globalThis.DagRenderer;
  await import('./dag-renderer.js');
  DagRenderer = globalThis.DagRenderer;
});

describe('dag-renderer', () => {
  it('attaches window.DagRenderer in a browser-like script context', () => {
    const api = loadBrowserApi();

    expect(api).toBeDefined();
    expect(typeof api.render).toBe('function');
    expect(typeof api.masteryColor).toBe('function');
  });

  it('render() returns an svg with one circle per node and one line per edge', () => {
    const svg = DagRenderer.render(TOPOLOGY, { 'LO-1': 0.2, 'LO-2': 0.5, 'LO-3': 0.6 });

    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.querySelectorAll('circle')).toHaveLength(TOPOLOGY.nodes.length);
    expect(svg.querySelectorAll('line')).toHaveLength(TOPOLOGY.edges.length);
  });

  it('render() respects width and height options', () => {
    const svg = DagRenderer.render(TOPOLOGY, {}, { width: 480, height: 260 });

    expect(svg.getAttribute('width')).toBe('480');
    expect(svg.getAttribute('height')).toBe('260');
    expect(svg.getAttribute('viewBox')).toBe('0 0 480 260');
  });

  it('uses distinct valid hex colors for higher and lower mastery', () => {
    const low = DagRenderer.masteryColor(0.2);
    const high = DagRenderer.masteryColor(0.9);

    expect(low).toMatch(/^#[0-9a-f]{6}$/i);
    expect(high).toMatch(/^#[0-9a-f]{6}$/i);
    expect(high).not.toBe(low);
  });

  it('clicking a node fires onNodeClick with the node data', () => {
    let clickedNode = null;
    const svg = DagRenderer.render(TOPOLOGY, {}, {
      onNodeClick(node) {
        clickedNode = node;
      }
    });

    svg.querySelector('circle').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(clickedNode).toMatchObject({ id: 'A', label: 'Ask statistical questions' });
  });

  it('masteryColor spans red-ish to green-ish hues', () => {
    const redHue = (hexToHue(DagRenderer.masteryColor(0)) + 360) % 360;
    const greenHue = (hexToHue(DagRenderer.masteryColor(1)) + 360) % 360;

    expect(redHue).toBeLessThan(12);
    expect(greenHue).toBeGreaterThan(100);
    expect(greenHue).toBeLessThan(140);
  });

  it('defaults missing LO mastery to 0.3 without crashing', () => {
    const svg = DagRenderer.render(
      {
        title: 'Defaults',
        nodes: [{ id: 'M', label: 'Missing mastery node', loIds: ['LO-X'], x: 0.5, y: 0.5 }],
        edges: []
      },
      {}
    );

    expect(svg.querySelectorAll('circle')).toHaveLength(1);
    expect(svg.querySelector('circle').getAttribute('fill')).toBe(DagRenderer.masteryColor(0.3));
  });
});
