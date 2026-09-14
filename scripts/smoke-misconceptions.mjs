import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeMisconceptions } from '../roster-server/misconceptions.js';
import { loadMisconceptionAssets } from '../roster-server/misconception-assets.js';

// Synthetic students, real answer key and draft maps. No production requests.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const answerKey = JSON.parse(readFileSync(resolve(root, 'data/answer-key.json'), 'utf8')).answerKey;
const assets = loadMisconceptionAssets(answerKey);
const examples = new Map();
for (const [itemId, choices] of Object.entries(assets.distractorMap.items)) {
  for (const [chosen, tags] of Object.entries(choices)) for (const tag of tags) {
    if (!examples.has(tag)) examples.set(tag, new Map());
    examples.get(tag).set(answerKey[itemId].topic, { itemId, chosen });
  }
}
const selected = [...examples].filter(([, lessons]) => lessons.size >= 2).slice(0, 5);
if (selected.length !== 5) throw new Error('Need five tags spanning two lessons for the smoke fixture');
const now = Date.parse('2026-09-11T12:00:00Z');
const fan = ['fixture-one', 'fixture-two', 'fixture-three'].map(studentId => ({
  roster: { student_id: studentId, login_username: studentId, section: 'Fixture' },
  ledgerRows: selected.flatMap(([, lessons]) => [...lessons.values()].slice(0, 2).map(({ itemId, chosen }, index) => ({
    student_id: studentId, source: 'quiz', item_id: itemId, response: chosen,
    recorded_at: new Date(now - (index ? 1 : 5) * 86400000).toISOString(),
  }))),
}));
const result = computeMisconceptions(fan, assets, { now, section: 'Fixture' });
const report = { source: 'synthetic fixture using real answer key and drafted maps',
  top5: result.class.slice(0, 5).map(({ key, label, students }) => ({ key, label, students })) };
mkdirSync(resolve(root, 'test-results'), { recursive: true });
writeFileSync(resolve(root, 'test-results/misconceptions-smoke.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
