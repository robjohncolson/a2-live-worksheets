// Rebakes data/study-guide-dag-topology.json and the data/dag-topology.js
// UMD wrapper from the canonical source JSON.
//
// Pipeline:
//   1. Read data/study-guide-dag-topology.json (canonical authored source)
//   2. Load UNIT_FRAMEWORKS from ../curriculum_render/data/frameworks.js
//   3. Validate every loId in every node against the framework
//   4. Validate every intra-unit and cross-unit edge references real nodes
//   5. Recompute stats (totalNodes, totalEdges, perUnit) from nodes/edges
//   6. Sort unit keys numerically, round coordinates to 4 decimals
//   7. Write topology JSON back (preserving existing `generated` timestamp
//      unless --bump is passed)
//   8. Regenerate data/dag-topology.js UMD wrapper from the normalized JSON
//
// Flags:
//   --bump   Update `generated` to the current ISO timestamp
//   --check  Validate only; don't write anything
//
// Run: node lib/dag-topology-builder.mjs [--bump] [--check]

import { readFileSync, writeFileSync } from 'node:fs';

const TOPOLOGY_PATH = 'data/study-guide-dag-topology.json';
const WRAPPER_PATH = 'data/dag-topology.js';
const FRAMEWORKS_PATH = '../curriculum_render/data/frameworks.js';

const args = new Set(process.argv.slice(2));
const BUMP = args.has('--bump');
const CHECK_ONLY = args.has('--check');

function round4(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

function loadFrameworks() {
  const src = readFileSync(FRAMEWORKS_PATH, 'utf8');
  const fn = new Function(`${src}\nreturn UNIT_FRAMEWORKS;`);
  const fw = fn();
  if (!fw) throw new Error('UNIT_FRAMEWORKS not found in frameworks.js');
  return fw;
}

function collectValidLoIds(frameworks) {
  const out = {};
  for (const [unitKey, unitData] of Object.entries(frameworks)) {
    const set = new Set();
    const lessons = unitData.lessons || {};
    for (const lesson of Object.values(lessons)) {
      for (const lo of (lesson.learningObjectives || [])) {
        if (lo && lo.id) set.add(lo.id);
      }
    }
    out[unitKey] = set;
  }
  return out;
}

function validate(topology, validLoIds) {
  const errors = [];
  const allNodeIds = new Set();

  for (const [unitKey, unit] of Object.entries(topology.units || {})) {
    const nodeIds = new Set();
    for (const node of (unit.nodes || [])) {
      if (!node || !node.id) {
        errors.push(`Unit ${unitKey}: node missing id`);
        continue;
      }
      if (nodeIds.has(node.id)) errors.push(`Unit ${unitKey}: duplicate node id ${node.id}`);
      nodeIds.add(node.id);
      allNodeIds.add(node.id);
      for (const loId of (node.loIds || [])) {
        if (!validLoIds[unitKey]?.has(loId)) {
          errors.push(`Unit ${unitKey} node ${node.id}: unknown loId ${loId}`);
        }
      }
      if (typeof node.x !== 'number' || typeof node.y !== 'number') {
        errors.push(`Unit ${unitKey} node ${node.id}: missing numeric x/y`);
      }
    }
    for (const edge of (unit.edges || [])) {
      if (!edge || !nodeIds.has(edge.from)) errors.push(`Unit ${unitKey} edge from=${edge && edge.from} unknown`);
      if (!edge || !nodeIds.has(edge.to)) errors.push(`Unit ${unitKey} edge to=${edge && edge.to} unknown`);
    }
  }

  for (const edge of (topology.crossUnitEdges || [])) {
    if (!edge || !allNodeIds.has(edge.from)) errors.push(`crossUnitEdges: unknown from ${edge && edge.from}`);
    if (!edge || !allNodeIds.has(edge.to)) errors.push(`crossUnitEdges: unknown to ${edge && edge.to}`);
  }

  return errors;
}

function normalize(topology, { bump }) {
  const out = {
    generated: bump || !topology.generated ? new Date().toISOString() : topology.generated,
    units: {},
    crossUnitEdges: [],
    stats: { totalNodes: 0, totalEdges: 0, perUnit: {} },
  };

  const unitKeys = Object.keys(topology.units || {}).sort((a, b) => Number(a) - Number(b));
  for (const key of unitKeys) {
    const unit = topology.units[key] || {};
    const nodes = (unit.nodes || []).map(node => ({
      ...node,
      x: round4(node.x),
      y: round4(node.y),
    }));
    const edges = (unit.edges || []).map(edge => ({ ...edge }));
    out.units[key] = {
      title: unit.title || '',
      examWeight: unit.examWeight || '',
      nodes,
      edges,
    };
    out.stats.totalNodes += nodes.length;
    out.stats.totalEdges += edges.length;
    out.stats.perUnit[key] = { nodes: nodes.length, edges: edges.length };
  }

  out.crossUnitEdges = (topology.crossUnitEdges || []).map(edge => ({ ...edge }));
  // Match the shipped topology's semantic: totalEdges = intra + cross.
  out.stats.totalEdges += out.crossUnitEdges.length;

  return out;
}

function buildWrapper(topology) {
  return `// Auto-generated from ${TOPOLOGY_PATH}. Do not edit by hand.
// Regenerate via: node lib/dag-topology-builder.mjs
(function (root) {
  root.SG_DAG_TOPOLOGY = ${JSON.stringify(topology)};
})(typeof window !== 'undefined' ? window : this);
`;
}

function main() {
  const raw = readFileSync(TOPOLOGY_PATH, 'utf8');
  const topology = JSON.parse(raw);
  const frameworks = loadFrameworks();
  const validLoIds = collectValidLoIds(frameworks);
  const errors = validate(topology, validLoIds);
  if (errors.length) {
    console.log(`Validation failed with ${errors.length} errors:`);
    for (const err of errors) console.log('  ✗', err);
    process.exit(1);
  }

  const normalized = normalize(topology, { bump: BUMP });

  const intraEdges = normalized.stats.totalEdges - normalized.crossUnitEdges.length;
  if (CHECK_ONLY) {
    console.log(`✓ Topology is valid (${normalized.stats.totalNodes} nodes, ${intraEdges} intra-unit edges, ${normalized.crossUnitEdges.length} cross-unit edges, totalEdges=${normalized.stats.totalEdges})`);
    return;
  }

  writeFileSync(TOPOLOGY_PATH, JSON.stringify(normalized, null, 2) + '\n');
  writeFileSync(WRAPPER_PATH, buildWrapper(normalized));

  console.log(`Wrote ${TOPOLOGY_PATH} (${normalized.stats.totalNodes} nodes, ${intraEdges} intra + ${normalized.crossUnitEdges.length} cross = ${normalized.stats.totalEdges} totalEdges)`);
  console.log(`Wrote ${WRAPPER_PATH} (${buildWrapper(normalized).length} bytes)`);
  if (BUMP) console.log(`Timestamp bumped to ${normalized.generated}`);
  console.log('Per-unit:');
  for (const [u, s] of Object.entries(normalized.stats.perUnit)) {
    console.log(`  U${u}: ${s.nodes} nodes, ${s.edges} edges`);
  }
}

main();
