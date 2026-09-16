// @vitest-environment node
// Retained presentation contracts; the removed audit CLI/reports are not dependencies.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(ROOT, 'study_guide_diagnostic.html'), 'utf8');
const chartPath = resolve(ROOT, 'lib/curriculum-charts.js');
let sandbox;
let findCanvas;
let warning;
beforeEach(() => {
  findCanvas = vi.fn(() => null);
  warning = vi.fn();
  sandbox = createContext({
    window: {}, console: { warn: warning },
    document: { getElementById: findCanvas },
  });
  runInContext(readFileSync(chartPath, 'utf8'), sandbox, { filename: pathToFileURL(chartPath).href });
});

describe('retained chart renderer safety', () => {
  it('generates an inline function chart without drawing before the canvas is mounted', () => {
    const question = { id: 'a2-inline-linear', attachments: { chartType: 'scatter', title: 'A linear function', chartConfig: { description: 'Coordinates on y = 2x' } } };
    const rendered = sandbox.window.getChartHtml(question.attachments, 'sg-chart-a2');
    expect(rendered).toContain('<canvas id="sg-chart-a2"></canvas>');
    expect(rendered).toContain('A linear function');
    expect(rendered).toContain('Coordinates on y = 2x');
    expect(findCanvas).not.toHaveBeenCalled();
    expect(sandbox.window.chartInstances).toBeUndefined();
    expect(sandbox.window.charts.getChartHtml).toBe(sandbox.window.getChartHtml);
    expect(sandbox.window.charts.renderChartNow).toBe(sandbox.window.renderChartNow);
  });

  it('returns safely when a deferred chart canvas was removed', () => {
    expect(() => sandbox.window.renderChartNow({ chartType: 'scatter' }, 'sg-chart-removed')).not.toThrow();
    expect(findCanvas).toHaveBeenCalledWith('sg-chart-removed');
    expect(warning).toHaveBeenCalledWith('Canvas not found: sg-chart-removed');
    expect(Object.keys(sandbox.window.chartInstances)).toEqual([]);
  });

  it('destroys the previous instance before requesting a replacement context', () => {
    const events = [];
    const destroy = vi.fn(() => events.push('destroy'));
    const getContext = vi.fn(() => { events.push('context'); return {}; });
    sandbox.window.chartInstances = { 'sg-chart-a2': { destroy } };
    findCanvas.mockReturnValue({ getContext });
    // An unsupported chart type exercises cleanup without requiring Chart.js canvas support.
    sandbox.window.renderChartNow({ chartType: 'unsupported-inline-fixture' }, 'sg-chart-a2');
    expect(destroy).toHaveBeenCalledOnce();
    expect(getContext).toHaveBeenCalledWith('2d');
    expect(events).toEqual(['destroy', 'context']);
  });
});

describe('study-guide chart wiring', () => {
  it('loads chart dependencies in order', () => {
    const scripts = ['lib/chart.min.js', 'lib/chartjs-plugin-datalabels.min.js', 'lib/curriculum-charts.js'];
    const positions = scripts.map(script => html.indexOf(`<script src="${script}">`));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('cleans up mounted charts before clearing the active probe', () => {
    const cleanup = html.indexOf('window.chartInstances && ui.active');
    const clear = html.indexOf("ui.active.innerHTML = ''");
    expect(cleanup).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(cleanup);
    expect(html.slice(cleanup, clear)).toContain('inst.destroy()');
    expect(html.slice(cleanup, clear)).toContain('delete window.chartInstances[c.id]');
  });

  it('defers attachment and solution chart drawing', () => {
    expect(html).toContain('window.getChartHtml(attachments, canvasId)');
    expect(html).toContain('window.renderChartNow(attachments, canvasId)');
    expect(html).toContain("solutionDetails.addEventListener('toggle'");
    expect(html).toContain('pendingSolutionCharts');
    expect(html).toContain('requestAnimationFrame');
  });
});
