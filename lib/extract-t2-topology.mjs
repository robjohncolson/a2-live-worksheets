import { readFileSync, writeFileSync } from 'node:fs';

const LOG = 'C:/Users/rober/AppData/Local/Temp/claude/C--Users-rober-Downloads-Projects-school-follow-alongs/1b5437da-e06e-42c4-9de1-dfc23d308ea2/tasks/b9qrmea9z.output';
const OUT = 'data/study-guide-dag-topology.json';

const log = readFileSync(LOG, 'utf8');

// The topology is embedded in the log as a literal inside apply_patch.
// Layers of containment have escaped `"` → `\"` (one level, not two).
// Anchor: `\"generated\":\"2026-04-13T22:15:00.000Z\"` is inside the escaped blob.
const anchor = '\\"generated\\":\\"2026-04-13T22:15:00.000Z\\"';
const anchorIdx = log.indexOf(anchor);
if (anchorIdx < 0) throw new Error('anchor not found');

// Find the opening `{\"generated\"` just before the anchor
const openIdx = log.lastIndexOf('{\\"generated\\"', anchorIdx + anchor.length);
if (openIdx < 0) throw new Error('open brace not found');

// The JSON closes with `{"9":{"nodes":6,"edges":4}}}}` (stats -> perUnit -> stats -> root)
const closeMarker = '\\"9\\":{\\"nodes\\":6,\\"edges\\":4}}}}';
const closeIdx = log.indexOf(closeMarker, anchorIdx);
if (closeIdx < 0) throw new Error('close marker not found');

const endIdx = closeIdx + closeMarker.length;
const escaped = log.substring(openIdx, endIdx);
console.log('Extracted length:', escaped.length);
console.log('First 120 chars:', escaped.substring(0, 120));

// Unescape: \" -> "  and  \\ -> \
const unescaped = escaped
  .replace(/\\"/g, '"')
  .replace(/\\\\/g, '\\');

console.log('Unescaped first 120:', unescaped.substring(0, 120));
console.log('Unescaped last 120:', unescaped.substring(unescaped.length - 120));

try {
  const parsed = JSON.parse(unescaped);
  console.log('PARSE OK.');
  console.log('  totalNodes:', parsed.stats?.totalNodes);
  console.log('  totalEdges:', parsed.stats?.totalEdges);
  console.log('  units:', Object.keys(parsed.units || {}).length);
  console.log('  crossUnitEdges:', (parsed.crossUnitEdges || []).length);
  writeFileSync(OUT, JSON.stringify(parsed, null, 2));
  console.log(`Written: ${OUT}`);
} catch (e) {
  console.log('PARSE FAIL:', e.message);
  console.log('At pos ~', e.message.match(/position (\d+)/)?.[1]);
}
