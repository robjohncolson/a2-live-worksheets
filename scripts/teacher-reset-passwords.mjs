import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickConfigUrl } from './teacher-roster.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readSafe(path) {
  try { return readFileSync(path, 'utf8'); } catch (_) { return ''; }
}

export async function resetPasswords(argv, { fetch = globalThis.fetch, log = console.log } = {}) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (['--all', '--dry-run', '--help'].includes(key)) { args[key] = true; continue; }
    if (!['--section', '--student-id', '--url', '--secret'].includes(key) ||
        !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Invalid reset options');
    args[key] = argv[++i];
  }
  if (args['--help']) {
    log('node scripts/teacher-reset-passwords.mjs --section <section> | --all | --student-id <id> [--dry-run] [--url <url>] [--secret <secret>]');
    return;
  }
  const selectors = ['--all', '--section', '--student-id'].filter(key => args[key]);
  if (selectors.length !== 1) throw new Error('Choose one reset selector');
  if (args['--dry-run']) {
    log(args['--all'] ? 'Sections selected: 3; updated: 0' : args['--section'] ? 'Sections selected: 1; updated: 0' : 'Students selected: 1; updated: 0');
    return;
  }
  const url = (args['--url'] || process.env.ROSTER_SERVICE_URL ||
    pickConfigUrl(readSafe(resolve(ROOT, 'roster_config.js'))) ||
    'https://a2-live-worksheets-production.up.railway.app').replace(/\/+$/, '');
  const secret = args['--secret'] || process.env.ROSTER_TEACHER_SECRET ||
    readSafe(resolve(ROOT, 'roster-server', '.env')).match(/^ROSTER_TEACHER_SECRET\s*=\s*(.+)\s*$/m)?.[1].trim();
  if (!secret) throw new Error('Teacher secret required');

  let bodies = args['--section'] ? [{ section: args['--section'] }] : [{ studentIds: [args['--student-id']] }];
  if (args['--all']) {
    const response = await fetch(url + '/roster/open-sections');
    if (!response.ok) throw new Error('Unable to load open sections');
    const data = await response.json();
    if (!data.ok || !Array.isArray(data.sections) || data.sections.length !== 3 ||
        data.sections.some(section => typeof section.value !== 'string' || !section.value)) {
      throw new Error('Expected three open sections');
    }
    bodies = data.sections.map(section => ({ section: section.value }));
  }
  let updated = 0;
  for (const body of bodies) {
    const response = await fetch(url + '/roster/reset-passwords', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-teacher-secret': secret },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('Password reset request failed');
    const data = await response.json();
    if (!data.ok || !Number.isInteger(data.updated) || data.updated < 0) throw new Error('Invalid reset response');
    updated += data.updated;
    log('Updated: ' + data.updated);
  }
  log('Total updated: ' + updated);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  resetPasswords(process.argv.slice(2)).catch(() => {
    // Do not echo server errors or arguments: they may contain credentials.
    console.error('Password reset failed. Check options, configuration, and service availability.');
    process.exitCode = 1;
  });
}
