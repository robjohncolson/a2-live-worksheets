import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './misconception-map-sources.mjs';

export function syncMisconceptionServerAssets() {
  for (const name of ['misconceptions.json', 'misconception-rubric-map.json', 'misconception-distractor-map.json']) {
    const source = readFileSync(resolve(ROOT, 'data', name));
    const destination = resolve(ROOT, 'roster-server', 'data', name);
    if (process.argv.includes('--check')) {
      if (!source.equals(readFileSync(destination))) throw new Error(`Stale server copy: ${name}`);
    } else {
      writeFileSync(destination, source);
    }
  }
}
