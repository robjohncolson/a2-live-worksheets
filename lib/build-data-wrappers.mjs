import { readFileSync, writeFileSync } from 'node:fs';

const topology = JSON.parse(readFileSync('data/study-guide-dag-topology.json', 'utf8'));
const tagMap = JSON.parse(readFileSync('data/study-guide-question-lo-map.json', 'utf8'));

const topologyJs = `// Auto-generated from data/study-guide-dag-topology.json. Do not edit by hand.
// Regenerate via: node lib/build-data-wrappers.mjs
(function (root) {
  root.SG_DAG_TOPOLOGY = ${JSON.stringify(topology)};
})(typeof window !== 'undefined' ? window : this);
`;

const tagMapJs = `// Auto-generated from data/study-guide-question-lo-map.json. Do not edit by hand.
// Regenerate via: node lib/build-data-wrappers.mjs
(function (root) {
  root.SG_QUESTION_LO_MAP = ${JSON.stringify(tagMap)};
})(typeof window !== 'undefined' ? window : this);
`;

writeFileSync('data/dag-topology.js', topologyJs);
writeFileSync('data/question-lo-map.js', tagMapJs);

console.log('Wrote data/dag-topology.js:', topologyJs.length, 'bytes');
console.log('Wrote data/question-lo-map.js:', tagMapJs.length, 'bytes');
console.log('Topology: ', topology.stats?.totalNodes, 'nodes,', topology.stats?.totalEdges, 'intra-unit edges');
console.log('Tag map: ', Object.keys(tagMap.questions || {}).length, 'questions');
