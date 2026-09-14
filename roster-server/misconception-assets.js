import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
let cached;
export function loadMisconceptionAssets(answerKey) {
  if (!cached) {
    const read = name => JSON.parse(readFileSync(resolve(root, 'data', name), 'utf8'));
    cached = { vocabulary: read('misconceptions.json'), rubricMap: read('misconception-rubric-map.json'),
      distractorMap: read('misconception-distractor-map.json') };
  }
  return { ...cached, answerKey };
}
