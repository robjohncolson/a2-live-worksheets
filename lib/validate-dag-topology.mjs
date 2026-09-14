import { readFileSync } from 'node:fs';

const topo = JSON.parse(readFileSync('data/study-guide-dag-topology.json', 'utf8'));

// Load UNIT_FRAMEWORKS by wrapping source in a function that returns it (same trick as tagger)
const fwSrc = readFileSync('../curriculum_render/data/frameworks.js', 'utf8');
const FW = new Function(`${fwSrc}\nreturn UNIT_FRAMEWORKS;`)();
if (!FW) throw new Error('UNIT_FRAMEWORKS not loaded');

// Build the set of valid LO ids per unit
const validLoIds = {};
for (const [u, unitData] of Object.entries(FW)) {
  validLoIds[u] = new Set();
  const lessons = unitData.lessons || {};
  for (const lesson of Object.values(lessons)) {
    for (const lo of (lesson.learningObjectives || [])) {
      if (lo.id) validLoIds[u].add(lo.id);
    }
  }
}

const errors = [];
const warnings = [];

// Check per-unit
for (const [uKey, unit] of Object.entries(topo.units)) {
  const nodeIds = new Set(unit.nodes.map(n => n.id));
  const nodeCount = unit.nodes.length;
  if (nodeCount < 6 || nodeCount > 14) {
    warnings.push(`Unit ${uKey}: ${nodeCount} nodes (spec target 6-14)`);
  }

  // Validate every loId in every node exists in the framework
  for (const node of unit.nodes) {
    for (const loId of (node.loIds || [])) {
      if (!validLoIds[uKey]?.has(loId)) {
        errors.push(`Unit ${uKey} node ${node.id}: loId "${loId}" not found in framework`);
      }
    }
    if (node.x < 0.05 || node.x > 0.95 || node.y < 0.05 || node.y > 0.95) {
      warnings.push(`Unit ${uKey} node ${node.id}: coords (${node.x}, ${node.y}) outside [0.05, 0.95]`);
    }
  }

  // Validate intra-unit edges reference nodes that exist
  for (const edge of (unit.edges || [])) {
    if (!nodeIds.has(edge.from)) errors.push(`Unit ${uKey}: edge from "${edge.from}" → "${edge.to}" has unknown from`);
    if (!nodeIds.has(edge.to)) errors.push(`Unit ${uKey}: edge from "${edge.from}" → "${edge.to}" has unknown to`);
  }
}

// Check cross-unit edges
const allNodeIds = new Set();
for (const unit of Object.values(topo.units)) {
  for (const n of unit.nodes) allNodeIds.add(n.id);
}
for (const edge of (topo.crossUnitEdges || [])) {
  if (!allNodeIds.has(edge.from)) errors.push(`Cross-unit edge ${edge.from} → ${edge.to}: unknown from`);
  if (!allNodeIds.has(edge.to)) errors.push(`Cross-unit edge ${edge.from} → ${edge.to}: unknown to`);
}

// Check the 8 required handoffs exist in spirit (we can't check the exact IDs,
// but we can check that the endpoints bridge the expected unit pairs)
const expectedHandoffPairs = [
  [1, 2], [2, 9], [3, 4], [4, 5], [5, 6], [5, 7], [6, 8], [7, 9]
];
const actualPairs = new Set();
for (const edge of (topo.crossUnitEdges || [])) {
  const fromUnit = Number(edge.from.match(/^U(\d+)/)?.[1]);
  const toUnit = Number(edge.to.match(/^U(\d+)/)?.[1]);
  if (fromUnit && toUnit) actualPairs.add(`${fromUnit}-${toUnit}`);
}
for (const [a, b] of expectedHandoffPairs) {
  if (!actualPairs.has(`${a}-${b}`)) warnings.push(`Missing expected handoff: U${a} → U${b}`);
}

console.log('--- VALIDATION REPORT ---');
console.log(`Total nodes: ${topo.stats?.totalNodes}`);
console.log(`Total edges: ${topo.stats?.totalEdges}`);
console.log(`Cross-unit edges: ${(topo.crossUnitEdges || []).length}`);
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);
console.log();
if (errors.length) {
  console.log('ERRORS:');
  errors.forEach(e => console.log('  ✗', e));
}
if (warnings.length) {
  console.log('WARNINGS:');
  warnings.forEach(w => console.log('  !', w));
}
console.log();
console.log('Per-unit breakdown:');
for (const [u, data] of Object.entries(topo.units)) {
  console.log(`  U${u}: ${data.nodes.length} nodes, ${(data.edges || []).length} edges`);
}

process.exit(errors.length ? 1 : 0);
