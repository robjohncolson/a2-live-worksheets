import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

export const CED_SOURCE = ['../../js/ced2026-crosswalk.js', '../../js/ced2026-labels.js']
  .map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

// Isolated Desk-function tests still execute the real shared display helpers.
// Each fixture owns its cache and optional registry, matching a fresh page.
export function loadCedLabels(registry) {
  const sandbox = createContext({});
  sandbox.window = sandbox;
  runInContext(CED_SOURCE, sandbox);
  if (registry !== undefined) sandbox.configureCedLabels(() => registry);
  return sandbox;
}
