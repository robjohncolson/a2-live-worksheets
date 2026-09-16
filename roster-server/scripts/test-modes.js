import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
const cwd = fileURLToPath(new URL('../', import.meta.url));
let failed = false;

// Always run both modes, even when an inherited legacy failure remains.
for (const [mode, config] of [
  ['legacy (district disabled)', 'vitest.config.js'],
  ['district (production formula)', 'vitest.district.config.js'],
]) {
  console.log(`\nRunning ${mode}`);
  const result = spawnSync(process.execPath, [vitest, 'run', '--config', config, ...process.argv.slice(2)], {
    cwd, stdio: 'inherit', env: process.env,
  });
  if (result.error) console.error(result.error.message);
  console.log(`${mode}: exit ${result.status ?? result.signal ?? 'spawn error'}`);
  if (result.status !== 0) failed = true;
}

process.exitCode = failed ? 1 : 0;
