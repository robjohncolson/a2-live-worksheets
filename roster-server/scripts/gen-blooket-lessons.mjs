/**
 * scripts/gen-blooket-lessons.mjs
 *
 * Generates roster-server/data/blooket-lessons.json.
 *
 * Shape (M2a / G4 — presence vs required split):
 *   topics         = ALL topicKeys with a non-null blooket URL (presence/UI, 77)
 *   requiredTopics = core subset (crosswalk status "core", 66) — grade Due denominator
 *   bonusTopics    = bonus subset (crosswalk status "bonus", 11) — enrichment, never required
 *   allTopics      = alias of topics (77) for explicit audit tooling
 *
 * Presence/UI consumers MUST use topics (or allTopics).
 * Required-denominator consumers MUST use requiredTopics only.
 *
 * Sources:
 *   - roadmap-data.json (.lessons[id].urls.blooket) — presence
 *   - 2026-crosswalk.json (.map[id].status) — core vs bonus
 *
 * Re-run:
 *   node roster-server/scripts/gen-blooket-lessons.mjs
 * Idempotent: second run is byte-identical. Refuses to write if accounting fails.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '..', '..');
const SRC = resolve(REPO, 'roadmap-data.json');
const CW = resolve(REPO, '2026-crosswalk.json');
const OUT = resolve(here, '..', 'data', 'blooket-lessons.json');

function findRegistry(o) {
  if (o && typeof o === 'object') {
    for (const k in o) {
      const v = o[k];
      if (v && v.urls && ('blooket' in v.urls)) return o;
    }
    for (const k in o) {
      const r = findRegistry(o[k]);
      if (r) return r;
    }
  }
  return null;
}

function topicSort(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  return (pa[0] - pb[0]) || (pa[1] - pb[1]) || a.localeCompare(b);
}

const data = JSON.parse(readFileSync(SRC, 'utf8'));
const crosswalk = JSON.parse(readFileSync(CW, 'utf8')).map || {};

const reg = findRegistry(data);
if (!reg) {
  console.error('Could not find the registry (no object with .urls.blooket) in roadmap-data.json');
  process.exit(1);
}

const topics = Object.keys(reg)
  .filter((k) => reg[k] && reg[k].urls && reg[k].urls.blooket)
  .sort(topicSort);

const requiredTopics = topics.filter((t) => crosswalk[t] && crosswalk[t].status === 'core').sort(topicSort);
const bonusTopics = topics.filter((t) => crosswalk[t] && crosswalk[t].status === 'bonus').sort(topicSort);
const unknown = topics.filter((t) => !crosswalk[t] || !['core', 'bonus'].includes(crosswalk[t].status));

// Accounting invariants (frozen-source pattern). 66/11 since the Part-C
// retag moved old-3.7 (sim-significance) from core-under-1.13 to bonus —
// College Board relocated that content to later formal inference.
const ok =
  topics.length === 77 &&
  requiredTopics.length === 66 &&
  bonusTopics.length === 11 &&
  requiredTopics.length + bonusTopics.length === topics.length &&
  unknown.length === 0;

if (!ok) {
  console.error('gen-blooket-lessons accounting failed:', {
    topics: topics.length,
    requiredTopics: requiredTopics.length,
    bonusTopics: bonusTopics.length,
    unknown,
  });
  process.exit(1);
}

const payload = {
  generatedFrom: 'roadmap-data.json + 2026-crosswalk.json (M2a presence/required split)',
  note:
    'topics/allTopics = PRESENCE (has a Blooket URL). requiredTopics = grade Due denominator (core only). bonusTopics = enrichment (G4: visible, never required).',
  ced: 'fall-2026-5unit',
  topics,
  requiredTopics,
  bonusTopics,
  allTopics: topics.slice(),
};

const text = JSON.stringify(payload, null, 2) + '\n';
writeFileSync(OUT, text, 'utf8');
console.log(`Wrote ${OUT}`);
console.log(`  presence(topics)=${topics.length} required=${requiredTopics.length} bonus=${bonusTopics.length}`);
console.log(`  accountingOk=${ok}`);
