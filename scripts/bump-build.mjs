#!/usr/bin/env node
// bump-build.mjs — bump the Desk build stamp so a stale, long-open Desk tab gets
// a "a new version is available — reload" nudge.
//
// Writes the SAME new stamp to BOTH:
//   - APP_BUILD in desk.html  (the running build)
//   - version.json                                     (the latest deployed build)
// They MUST stay in sync (a vitest pins build === APP_BUILD) — if version.json
// were ever AHEAD of the HTML, every freshly-loaded Desk would nudge in a loop.
//
// Run before deploying a Desk change you want open tabs to pick up:
//   node scripts/bump-build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deskPath = resolve(root, 'desk.html');
const versionPath = resolve(root, 'version.json');
const swPath = resolve(root, 'sw.js');

const stamp = new Date().toISOString().slice(0, 10) + '-' + Date.now().toString(36).slice(-4);

let desk = readFileSync(deskPath, 'utf8');
const re = /(var APP_BUILD = ')[^']*(';)/;
if (!re.test(desk)) {
  console.error('ERROR: APP_BUILD marker not found in ' + deskPath);
  process.exit(1);
}
desk = desk.replace(re, `$1${stamp}$2`);
writeFileSync(deskPath, desk);
writeFileSync(versionPath, JSON.stringify({ build: stamp, ts: Date.now() }) + '\n');

// Keep the PWA cache version in lockstep so a deploy purges the old SW cache.
let sw = readFileSync(swPath, 'utf8');
const swRe = /(const BUILD = ')[^']*(';)/;
if (!swRe.test(sw)) {
  console.error('ERROR: BUILD marker not found in ' + swPath);
  process.exit(1);
}
writeFileSync(swPath, sw.replace(swRe, `$1${stamp}$2`));

console.log('bumped build -> ' + stamp);
console.log('  ' + deskPath);
console.log('  ' + versionPath);
console.log('  ' + swPath);

// The reported version must identify the client actually running, not a network version check.
const diagnosticsPath = resolve(root, 'worksheet-diagnostics.js');
const diagnostics = readFileSync(diagnosticsPath, 'utf8');
const diagnosticsRe = /(var BUILD = ')[^']*(';)/;
if (!diagnosticsRe.test(diagnostics)) throw new Error('Missing diagnostics build marker');
writeFileSync(diagnosticsPath, diagnostics.replace(diagnosticsRe, `$1${stamp}$2`));
