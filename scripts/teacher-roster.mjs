/**
 * scripts/teacher-roster.mjs
 * Node 18+ ESM, zero external dependencies.
 *
 * Teacher tool — bulk-enroll a class into the live Algebra 2 roster service.
 * Sprint TR0 of ROSTER_TEACHER_TOOLS_SPEC.md. Works against the EXISTING
 * `POST /roster/enroll`; no server change, no migration, no redeploy.
 *
 * What it does:
 *   - Reads a class list (CSV file, --stdin, or a single --name).
 *   - Enrolls each student (server auto-generates the fruit_animal username).
 *   - Writes a properly-quoted credentials sheet (realName,section,username,
 *     password,studentId) AND prints an aligned table to the console.
 *
 * The teacher secret is read from roster-server/.env (gitignored) or env/flag —
 * it is never printed and never written to the credentials sheet.
 *
 * Usage:
 *   node scripts/teacher-roster.mjs --help
 *   node scripts/teacher-roster.mjs --csv class.csv --section PERIOD3 --password apstats2026
 *   node scripts/teacher-roster.mjs --csv class.csv --section PERIOD3 --random
 *   node scripts/teacher-roster.mjs --name "Jane Doe" --section PERIOD3 --password apstats2026
 *   node scripts/teacher-roster.mjs --csv class.csv --section PERIOD3 --password x --dry-run
 *   node scripts/teacher-roster.mjs --view --section PERIOD3 --out roster.csv
 *
 * CSV rows: realName[,section[,email]]   (a header line is auto-detected/skipped)
 * --section <S>   default section for rows that omit one
 * --password <P>  one default password for everyone this run (they change it later)
 * --random        instead, generate a unique random default per student
 * --url <U>       service URL (default: roster_config.js / known prod URL)
 * --secret <S>    teacher secret (default: roster-server/.env or env var)
 * --out <path>    credentials CSV path (default: roster-credentials-<sec>-<ts>.csv)
 * --dry-run       parse + validate + print the plan; no network, no file
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const DEFAULT_URL = 'https://a2-live-worksheets-production.up.railway.app';

// ── Help ─────────────────────────────────────────────────────────────────────

const HELP = `
teacher-roster.mjs — bulk-enroll a class into the Algebra 2 roster service.

USAGE
  node scripts/teacher-roster.mjs --csv class.csv --section PERIOD3 --password apstats2026
  node scripts/teacher-roster.mjs --name "Jane Doe" --section PERIOD3 --random
  node scripts/teacher-roster.mjs --csv class.csv --section PERIOD3 --password x --dry-run

MODE
  (default)        enroll students (see INPUT below)
  --view           instead, list the existing roster (current passwords incl.)
                   from GET /roster/list; optional --section filter; --out CSV.
                   Needs roster-server Sprint TR1 deployed.
  --set-schoology-uids <csv>
                   instead, backfill each student's Schoology user id from a CSV
                   (rows: username,schoologyUid; header auto-detected/skipped).
                   Looks up student ids via GET /roster/list (case-insensitive on
                   username, real name as fallback) then PATCHes
                   /roster/:studentId/schoology-uid. An empty schoologyUid cell
                   clears the mapping. Optional --section scopes the lookup.
                   --dry-run prints the plan with no network call.
                   Needs roster-server P4b (migration 0012) deployed.

INPUT (choose one, enroll mode)
  --csv <path>     CSV file; each row: realName[,section[,email]] (header auto-skipped)
  --stdin          read one realName per line from standard input
  --name "<Full>"  enroll a single student

OPTIONS
  --section <S>    section for rows that don't specify one (e.g. PERIOD3, SY26-27-B)
  --password <P>   ONE default password for everyone this run (students change it later)
  --random         instead, generate a unique random default password per student
  --url <U>        roster service URL (default: roster_config.js, else known prod URL)
  --secret <S>     teacher secret (default: roster-server/.env, else ROSTER_TEACHER_SECRET)
  --out <path>     credentials CSV output path
  --dry-run        parse + validate + print plan only; no network calls, no file written
  --help           show this

NOTES
  - The server auto-generates each username (e.g. coconut_shark). You do not pick it.
  - Enroll is create-only: running twice makes duplicate students. Run once per class.
  - The credentials CSV contains plaintext default passwords — keep it local/private.
  - Until server Sprint TR1 ships, "must change password" is not yet enforced; this
    sheet is the authoritative record of the default passwords for this run.
  - --set-schoology-uids is the grade-pipeline P4b backfill: it populates
    roster.schoology_uid so the daily Schoology grade sync needs no hand --uid-map.
`;

// ── Tiny arg parser ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { flags._.push(a); continue; }
    const key = a.slice(2);
    if (key === 'help' || key === 'dry-run' || key === 'random' || key === 'stdin' || key === 'view') {
      flags[key] = true;
      continue;
    }
    flags[key] = argv[++i];
  }
  return flags;
}

// ── Config resolution (URL + secret) ─────────────────────────────────────────

function readFileSafe(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

// Pull the production URL out of roster_config.js text — exported for tests.
// The file quotes several URLs this CLI must NOT pick up: comment examples like
// 'http://...' and the localhost dev fallback 'http://localhost:8091'. The
// committed production URL is the file's final || fallback, so it is the LAST
// quoted https:// string (both decoys are plain http).
export function pickConfigUrl(cfgText) {
  if (!cfgText) return null;
  const matches = [...cfgText.matchAll(/['"](https:\/\/[a-z0-9][^'"]*)['"]/gi)];
  if (!matches.length) return null;
  return matches[matches.length - 1][1].replace(/\/+$/, '');
}

function resolveUrl(flag) {
  if (flag) return flag.replace(/\/+$/, '');
  if (process.env.ROSTER_SERVICE_URL) return process.env.ROSTER_SERVICE_URL.replace(/\/+$/, '');
  const fromConfig = pickConfigUrl(readFileSafe(resolve(REPO_ROOT, 'roster_config.js')));
  if (fromConfig) return fromConfig;
  return DEFAULT_URL;
}

function resolveSecret(flag) {
  if (flag) return flag;
  if (process.env.ROSTER_TEACHER_SECRET) return process.env.ROSTER_TEACHER_SECRET;
  const env = readFileSafe(resolve(REPO_ROOT, 'roster-server', '.env'));
  const m = env && env.match(/^ROSTER_TEACHER_SECRET\s*=\s*(.+)\s*$/m);
  return m ? m[1].trim() : null;
}

// ── CSV input parsing ────────────────────────────────────────────────────────

// Split one CSV line into fields (handles "quoted, fields" and "" escapes).
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

// Returns [{ realName, section, email }] from raw CSV text.
function parseRoster(text, defaultSection) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Auto-detect a header row: first cell looks like a column name, not a person.
  const firstCell = (splitCsvLine(lines[0])[0] || '').toLowerCase();
  const startIdx = ['name', 'realname', 'real_name', 'student', 'fullname'].includes(firstCell) ? 1 : 0;

  const rows = [];
  for (let i = startIdx; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]);
    const realName = parts[0] || '';
    const section = parts[1] || defaultSection || '';
    const email = parts[2] || '';
    rows.push({ realName, section, email });
  }
  return rows;
}

// Returns [{ username, schoologyUid }] from raw CSV text (P4b uid backfill).
// CSV rows: username,schoologyUid   (a header line is auto-detected/skipped).
// An empty schoologyUid cell means "clear the mapping".
// Exported for the parse-only unit test (no network).
export function parseUidRoster(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Auto-detect a header row: first cell looks like a column name, not a username.
  const firstCell = (splitCsvLine(lines[0])[0] || '').toLowerCase();
  const startIdx = ['username', 'user', 'login', 'login_username'].includes(firstCell) ? 1 : 0;

  const rows = [];
  for (let i = startIdx; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]);
    const username = parts[0] || '';
    const schoologyUid = parts[1] || '';
    rows.push({ username, schoologyUid });
  }
  return rows;
}

// ── CSV output (RFC-4180 quoting per CLAUDE.md) ──────────────────────────────

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvRow(cells) {
  return cells.map(csvCell).join(',');
}

// ── Random default password (when --random) ──────────────────────────────────

// Readable: lowercase letters + digits, no ambiguous chars, length 8.
function randomPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

// ── Console table (ASCII only) ───────────────────────────────────────────────

function printTable(rows) {
  const headers = ['realName', 'section', 'username', 'password', 'status'];
  const widths = headers.map(h => h.length);
  for (const r of rows) {
    headers.forEach((h, i) => { widths[i] = Math.max(widths[i], String(r[h] || '').length); });
  }
  const fmt = cells => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  console.log(fmt(headers));
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(fmt(headers.map(h => r[h] || '')));
}

// Aligned table for the uid backfill (columns: username, schoologyUid, status).
function printUidTable(rows) {
  const headers = ['username', 'schoologyUid', 'status'];
  const widths = headers.map(h => h.length);
  for (const r of rows) {
    headers.forEach((h, i) => { widths[i] = Math.max(widths[i], String(r[h] || '').length); });
  }
  const fmt = cells => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  console.log(fmt(headers));
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(fmt(headers.map(h => r[h] || '')));
}

// ── Enroll one student ───────────────────────────────────────────────────────

async function enrollOne(url, secret, { realName, section, password, email }) {
  const body = { realName, section, password };
  if (email) body.email = email;

  const res = await fetch(url + '/roster/enroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-teacher-secret': secret },
    body: JSON.stringify(body)
  });

  let data;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok || !data || !data.ok) {
    const reason = (data && data.error) || ('HTTP ' + res.status);
    return { ok: false, error: reason };
  }
  return { ok: true, username: data.username, studentId: data.studentId };
}

// ── View mode (GET /roster/list) ─────────────────────────────────────────────

async function runView(args) {
  const url = resolveUrl(args.url);
  const secret = resolveSecret(args.secret);
  if (!secret) {
    console.error('ERROR: teacher secret not found. Pass --secret, set ROSTER_TEACHER_SECRET,');
    console.error('       or ensure roster-server/.env has ROSTER_TEACHER_SECRET=...');
    process.exit(1);
  }

  const path = '/roster/list' + (args.section ? '?section=' + encodeURIComponent(args.section) : '');

  let res;
  try {
    res = await fetch(url + path, { headers: { 'x-teacher-secret': secret } });
  } catch (err) {
    console.error('ERROR: cannot reach ' + url + ' (' + (err.message || 'network error') + ')');
    process.exit(1);
  }

  if (res.status === 401) {
    console.error('ERROR: forbidden — check the teacher secret.');
    process.exit(1);
  }
  if (res.status === 404) {
    console.error('ERROR: /roster/list returned 404 — roster-server Sprint TR1 is not');
    console.error('       deployed yet. Apply 0003 + set ROSTER_PW_ENC_KEY + redeploy');
    console.error('       (roster-server/README.md, "TR1"). Until then use enroll mode.');
    process.exit(1);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    console.error('ERROR: roster service returned a non-JSON response (HTTP ' + res.status + ').');
    console.error('       If this persists, confirm Sprint TR1 is deployed.');
    process.exit(1);
  }

  if (!res.ok || !data || !data.ok) {
    console.error('ERROR: roster list failed (HTTP ' + res.status + '): ' +
      ((data && data.error) || 'unknown'));
    process.exit(1);
  }

  const students = (data.students || []).map(s => ({
    realName: s.realName,
    section: s.section,
    username: s.username,
    password: s.currentPassword == null ? '(unavailable)' : s.currentPassword,
    status: s.mustChangePassword ? 'must-change' : 'set'
  }));

  console.log((args.section ? 'Section ' + args.section + ': ' : 'All sections: ') + students.length + ' student(s)\n');
  printTable(students);

  if (args.out) {
    const header = ['realName', 'section', 'username', 'currentPassword', 'mustChangePassword', 'createdAt'];
    const lines = [csvRow(header)];
    for (const s of data.students || []) {
      lines.push(csvRow([s.realName, s.section, s.username,
        s.currentPassword == null ? '' : s.currentPassword,
        s.mustChangePassword ? 'yes' : 'no', s.createdAt || '']));
    }
    const outPath = resolve(process.cwd(), args.out);
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
    console.log('\nRoster CSV written: ' + outPath + '  (contains plaintext passwords — keep private)');
  }

  process.exit(0);
}

// ── Schoology-uid backfill (P4b) ─────────────────────────────────────────────

// Backfill roster.schoology_uid from a CSV (username,schoologyUid). Looks up
// student ids via GET /roster/list, then PATCHes /roster/:studentId/schoology-uid.
// --dry-run prints the plan only (no network). Exits non-zero if any row failed.
async function runSetSchoologyUids(args) {
  // 1. Read + parse the CSV (no network needed yet).
  const csvPath = args['set-schoology-uids'];
  const text = readFileSafe(resolve(process.cwd(), csvPath));
  if (text == null) { console.error('ERROR: cannot read --set-schoology-uids file: ' + csvPath); process.exit(1); }

  const rows = parseUidRoster(text);
  const url = resolveUrl(args.url);
  const secret = resolveSecret(args.secret);

  // 2. Dry run — show the plan, no network.
  if (args['dry-run']) {
    console.log('DRY RUN — no Schoology uids will be written.\n');
    console.log('Service URL : ' + url);
    console.log('Secret      : ' + (secret ? '(resolved, hidden)' : 'NOT FOUND'));
    console.log('Section     : ' + (args.section || '(all)'));
    console.log('Rows        : ' + rows.length + '\n');
    printUidTable(rows.map(r => ({
      username: r.username,
      schoologyUid: r.schoologyUid || '(clear)',
      status: r.username ? 'would set' : 'SKIP: missing username'
    })));
    process.exit(0);
  }

  // 3. Live — need a secret to reach the teacher-gated endpoints.
  if (!secret) {
    console.error('ERROR: teacher secret not found. Pass --secret, set ROSTER_TEACHER_SECRET,');
    console.error('       or ensure roster-server/.env has ROSTER_TEACHER_SECRET=...');
    process.exit(1);
  }
  if (rows.length === 0) {
    console.error('ERROR: no rows to set (CSV is empty).');
    process.exit(1);
  }

  // 4. Pull the roster once and build username/realName -> studentId maps.
  const byUsername = new Map();   // lowercased login_username -> studentId
  const byRealName = new Map();   // lowercased real name      -> studentId (fallback)
  const listPath = '/roster/list' + (args.section ? '?section=' + encodeURIComponent(args.section) : '');
  let listRes;
  try {
    listRes = await fetch(url + listPath, { headers: { 'x-teacher-secret': secret } });
  } catch (err) {
    console.error('ERROR: cannot reach ' + url + ' (' + (err.message || 'network error') + ')');
    process.exit(1);
  }
  if (listRes.status === 401) {
    console.error('ERROR: forbidden — check the teacher secret.');
    process.exit(1);
  }
  let listData;
  try { listData = await listRes.json(); } catch { listData = null; }
  if (!listRes.ok || !listData || !listData.ok) {
    console.error('ERROR: /roster/list failed (HTTP ' + listRes.status + '): ' +
      ((listData && listData.error) || 'unknown'));
    process.exit(1);
  }
  for (const s of listData.students || []) {
    if (s.username) byUsername.set(String(s.username).toLowerCase(), s.studentId);
    if (s.realName) byRealName.set(String(s.realName).toLowerCase(), s.studentId);
  }

  // 5. Resolve + PATCH each row.
  console.log('Setting Schoology uids for ' + rows.length + ' row(s) at ' + url + ' ...\n');
  const results = [];
  for (const r of rows) {
    if (!r.username) {
      results.push({ username: '', schoologyUid: r.schoologyUid, status: 'FAILED: missing username' });
      continue;
    }
    const key = r.username.toLowerCase();
    const studentId = byUsername.get(key) || byRealName.get(key);
    if (!studentId) {
      results.push({ username: r.username, schoologyUid: r.schoologyUid, status: 'FAILED: not in roster' });
      continue;
    }
    // Empty cell clears the mapping (null); otherwise send the trimmed string.
    const schoologyUid = r.schoologyUid ? r.schoologyUid : null;
    try {
      const out = await patchSchoologyUid(url, secret, studentId, schoologyUid);
      results.push({
        username: r.username,
        schoologyUid: schoologyUid == null ? '(cleared)' : schoologyUid,
        status: out.ok ? 'set' : 'FAILED: ' + out.error
      });
    } catch (err) {
      results.push({ username: r.username, schoologyUid: r.schoologyUid, status: 'FAILED: ' + (err.message || 'network error') });
    }
  }

  // 6. Summary.
  const okCount = results.filter(r => r.status === 'set').length;
  const failCount = results.length - okCount;
  console.log('--- Summary ---');
  printUidTable(results);
  console.log('\nSet: ' + okCount + '   Failed: ' + failCount);

  process.exit(failCount > 0 ? 1 : 0);
}

// PATCH /roster/:studentId/schoology-uid with { schoologyUid }. Returns
// { ok:true } or { ok:false, error }. A 503 means migration 0012 has not run.
async function patchSchoologyUid(url, secret, studentId, schoologyUid) {
  const res = await fetch(url + '/roster/' + encodeURIComponent(studentId) + '/schoology-uid', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-teacher-secret': secret },
    body: JSON.stringify({ schoologyUid })
  });

  let data;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok || !data || !data.ok) {
    const reason = (data && data.error) || ('HTTP ' + res.status);
    return { ok: false, error: reason };
  }
  return { ok: true };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || process.argv.length <= 2) {
    console.log(HELP);
    process.exit(args.help ? 0 : 1);
  }

  // View mode — list the existing roster instead of enrolling.
  if (args.view) {
    await runView(args);
    return;
  }

  // Schoology-uid backfill mode (P4b) — populate roster.schoology_uid from a CSV.
  if (args['set-schoology-uids']) {
    await runSetSchoologyUids(args);
    return;
  }

  // 1. Gather the class list.
  let rawRows;
  if (args.csv) {
    const text = readFileSafe(resolve(process.cwd(), args.csv));
    if (text == null) { console.error('ERROR: cannot read --csv file: ' + args.csv); process.exit(1); }
    rawRows = parseRoster(text, args.section);
  } else if (args.stdin) {
    const text = readFileSync(0, 'utf8');
    rawRows = parseRoster(text, args.section);
  } else if (args.name) {
    rawRows = [{ realName: args.name, section: args.section || '', email: args.email || '' }];
  } else {
    console.error('ERROR: provide --csv <file>, --stdin, or --name "<Full Name>". Use --help.');
    process.exit(1);
  }

  // 2. Validate rows.
  const valid = [];
  const invalid = [];
  for (const r of rawRows) {
    if (!r.realName) { invalid.push({ ...r, error: 'missing realName' }); continue; }
    if (!r.section) { invalid.push({ ...r, error: 'missing section (set a cell or --section)' }); continue; }
    valid.push(r);
  }

  // 3. Password policy.
  if (!args['dry-run'] && !args.password && !args.random) {
    console.error('ERROR: choose a default password with --password <P> or --random.');
    process.exit(1);
  }
  const assignPassword = () => (args.random ? randomPassword() : args.password);

  // 4. Dry run — show the plan, no network.
  if (args['dry-run']) {
    console.log('DRY RUN — no students will be enrolled.\n');
    console.log('Service URL : ' + resolveUrl(args.url));
    console.log('Secret      : ' + (resolveSecret(args.secret) ? '(resolved, hidden)' : 'NOT FOUND'));
    console.log('Password    : ' + (args.random ? '(random per student)' : (args.password ? '(fixed, hidden)' : '(none)')));
    console.log('Valid rows  : ' + valid.length + '   Invalid: ' + invalid.length + '\n');
    printTable(valid.map(r => ({
      realName: r.realName, section: r.section, username: '(server-assigned)',
      password: args.random ? '(random)' : '(fixed)', status: 'would enroll'
    })));
    if (invalid.length) {
      console.log('\nINVALID (skipped):');
      for (const r of invalid) console.log('  - "' + r.realName + '": ' + r.error);
    }
    process.exit(0);
  }

  // 5. Resolve service config.
  const url = resolveUrl(args.url);
  const secret = resolveSecret(args.secret);
  if (!secret) {
    console.error('ERROR: teacher secret not found. Pass --secret, set ROSTER_TEACHER_SECRET,');
    console.error('       or ensure roster-server/.env has ROSTER_TEACHER_SECRET=...');
    process.exit(1);
  }
  if (valid.length === 0) {
    console.error('ERROR: no valid rows to enroll.');
    process.exit(1);
  }

  console.log('Enrolling ' + valid.length + ' student(s) at ' + url + ' ...\n');

  // 6. Enroll sequentially (class sizes are small; keeps server load gentle).
  const results = [];
  for (const r of valid) {
    const password = assignPassword();
    process.stdout.write('  ' + r.realName.padEnd(28) + ' ... ');
    try {
      const out = await enrollOne(url, secret, {
        realName: r.realName, section: r.section, password, email: r.email
      });
      if (out.ok) {
        console.log('OK  ' + out.username);
        results.push({ realName: r.realName, section: r.section, username: out.username,
                       password, studentId: out.studentId, status: 'enrolled' });
      } else {
        console.log('FAIL  ' + out.error);
        results.push({ realName: r.realName, section: r.section, username: '',
                       password: '', studentId: '', status: 'FAILED: ' + out.error });
      }
    } catch (err) {
      console.log('FAIL  ' + (err.message || 'network error'));
      results.push({ realName: r.realName, section: r.section, username: '',
                     password: '', studentId: '', status: 'FAILED: ' + (err.message || 'network error') });
    }
  }

  // 7. Write the credentials sheet.
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '');
  const sections = [...new Set(valid.map(r => r.section))];
  const secTag = sections.length === 1 ? sections[0] : 'mixed';
  const outPath = args.out
    ? resolve(process.cwd(), args.out)
    : resolve(process.cwd(), 'roster-credentials-' + secTag + '-' + stamp + '.csv');

  const header = ['realName', 'section', 'username', 'password', 'studentId', 'status'];
  const lines = [csvRow(header)];
  for (const r of results) {
    lines.push(csvRow([r.realName, r.section, r.username, r.password, r.studentId, r.status]));
  }
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');

  // 8. Summary.
  const okCount = results.filter(r => r.status === 'enrolled').length;
  const failCount = results.length - okCount;
  console.log('\n--- Summary ---');
  printTable(results);
  console.log('\nEnrolled: ' + okCount + '   Failed: ' + failCount + '   Skipped(invalid): ' + invalid.length);
  if (invalid.length) {
    for (const r of invalid) console.log('  skipped "' + r.realName + '": ' + r.error);
  }
  console.log('\nCredentials sheet written: ' + outPath);
  console.log('Hand each student their username + password. Keep this file private.');

  process.exit(failCount > 0 ? 1 : 0);
}

// Run main() only when invoked as a CLI, not when imported by a test.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => { console.error('FATAL: ' + (err && err.stack || err)); process.exit(1); });
}
