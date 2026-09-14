// @vitest-environment jsdom
//
// End-to-end smoke test for the study guide integration. Loads the real
// dag-topology.js + question-lo-map.js + bkt.js + probe-selector.js +
// dag-renderer.js wrappers into a shared sandbox, then exercises the
// wiring the way the study guide HTML does: seed mastery from the unit
// topology, pick adaptive probes, update mastery from a check, re-pick,
// and render a DAG panel. Failures here mean the browser integration is
// broken even if the per-module unit tests pass.

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const ROOT = process.cwd();
const SCRIPTS = [
  join(ROOT, 'data', 'dag-topology.js'),
  join(ROOT, 'data', 'question-lo-map.js'),
  join(ROOT, 'lib', 'bkt.js'),
  join(ROOT, 'lib', 'probe-selector.js'),
  join(ROOT, 'lib', 'dag-renderer.js'),
];

// Build a curriculum stub from the real question-lo-map (we only need
// question IDs + type for ProbeSelector, not full MCQ payloads).
const REAL_TAG_MAP = JSON.parse(
  readFileSync(join(ROOT, 'data', 'study-guide-question-lo-map.json'), 'utf8')
);

function buildStubCurriculum() {
  const out = [];
  for (const qid of Object.keys(REAL_TAG_MAP.questions || {})) {
    out.push({
      id: qid,
      type: 'multiple-choice',
      prompt: 'Stub prompt for ' + qid,
      answerKey: 'A',
    });
  }
  return out;
}

let api;

beforeAll(() => {
  // Fresh window/document from jsdom is already on globalThis; reuse it.
  const root = typeof globalThis !== 'undefined' ? globalThis : {};
  const sandbox = createContext({
    window: root,
    document: root.document,
    globalThis: root,
    self: root,
    Math,
    Object,
    Array,
    Number,
    String,
    Boolean,
    JSON,
    Error,
    Set,
    Map,
    Symbol,
    Date,
    Function,
    console,
  });
  for (const scriptPath of SCRIPTS) {
    const src = readFileSync(scriptPath, 'utf8');
    runInContext(src, sandbox, { filename: scriptPath });
  }
  api = {
    topology: sandbox.window.SG_DAG_TOPOLOGY,
    tagMap: sandbox.window.SG_QUESTION_LO_MAP,
    BKT: sandbox.window.BKT,
    ProbeSelector: sandbox.window.ProbeSelector,
    DagRenderer: sandbox.window.DagRenderer,
  };
});

describe('study-guide runtime integration', () => {
  it('loads SG_DAG_TOPOLOGY with the expected per-unit shape', () => {
    expect(api.topology).toBeDefined();
    expect(api.topology.units).toBeDefined();
    for (let unit = 1; unit <= 9; unit += 1) {
      expect(api.topology.units[unit]).toBeDefined();
      expect(Array.isArray(api.topology.units[unit].nodes)).toBe(true);
      expect(api.topology.units[unit].nodes.length).toBeGreaterThan(0);
    }
  });

  it('loads SG_QUESTION_LO_MAP with 417 tagged questions', () => {
    expect(api.tagMap).toBeDefined();
    const count = Object.keys(api.tagMap.questions || {}).length;
    expect(count).toBe(417);
  });

  it('BKT.initMasteryState seeds every LO referenced by a unit 5 node', () => {
    const nodes = api.topology.units[5].nodes;
    const mastery = api.BKT.initMasteryState(nodes);
    const loIdsOnTopology = new Set();
    for (const node of nodes) {
      for (const loId of (node.loIds || [])) loIdsOnTopology.add(loId);
    }
    for (const loId of loIdsOnTopology) {
      expect(mastery[loId]).toBeGreaterThan(0);
      expect(mastery[loId]).toBeLessThan(1);
    }
  });

  it('ProbeSelector returns 6 candidates for unit 5 with the default mastery seed', () => {
    const nodes = api.topology.units[5].nodes;
    const masteryState = api.BKT.initMasteryState(nodes);
    const picks = api.ProbeSelector.selectProbes({
      unit: 5,
      count: 6,
      curriculum: buildStubCurriculum(),
      tagMap: api.tagMap,
      masteryState,
      alreadyAnswered: [],
      BKT: api.BKT,
    });
    expect(picks).toHaveLength(6);
    const ids = picks.map(p => p.question.id);
    expect(new Set(ids).size).toBe(6);
    for (const pick of picks) {
      expect(pick.question.id.startsWith('U5-L')).toBe(true);
      expect(Array.isArray(pick.loIds)).toBe(true);
      expect(pick.loIds.length).toBeGreaterThan(0);
    }
  });

  it('BKT.updateMastery after a wrong answer drops the tagged LOs below the prior', () => {
    const pInit = api.BKT.DEFAULT_PARAMS.pInit;
    const next = api.BKT.updateMastery(pInit, false);
    expect(next).toBeLessThan(pInit);
    const after = api.BKT.updateMastery(pInit, true);
    expect(after).toBeGreaterThan(pInit);
  });

  it('After a correct check on the first pick, the next pick shifts to a different LO', () => {
    const nodes = api.topology.units[5].nodes;
    const curriculum = buildStubCurriculum();
    const masteryState = api.BKT.initMasteryState(nodes);
    const first = api.ProbeSelector.selectProbes({
      unit: 5,
      count: 1,
      curriculum,
      tagMap: api.tagMap,
      masteryState,
      alreadyAnswered: [],
      BKT: api.BKT,
    });
    expect(first).toHaveLength(1);
    const answered = [first[0].question.id];
    // Simulate a correct check
    for (const loId of first[0].loIds) {
      masteryState[loId] = api.BKT.updateMastery(masteryState[loId], true);
      expect(masteryState[loId]).toBeGreaterThan(api.BKT.DEFAULT_PARAMS.pInit);
    }
    const second = api.ProbeSelector.selectProbes({
      unit: 5,
      count: 1,
      curriculum,
      tagMap: api.tagMap,
      masteryState,
      alreadyAnswered: answered,
      BKT: api.BKT,
    });
    expect(second).toHaveLength(1);
    expect(second[0].question.id).not.toBe(first[0].question.id);
  });

  it('DagRenderer.render produces an SVG with one circle per unit 5 node', () => {
    const unitTopology = api.topology.units[5];
    const masteryState = api.BKT.initMasteryState(unitTopology.nodes);
    const svg = api.DagRenderer.render(unitTopology, masteryState, { width: 520, height: 280 });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.querySelectorAll('circle').length).toBe(unitTopology.nodes.length);
    const edgeCount = (unitTopology.edges || []).length;
    expect(svg.querySelectorAll('line').length).toBe(edgeCount);
  });
});
