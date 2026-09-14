/**
 * scripts/import-blooket.mjs
 * Node 18+ ESM, zero external dependencies.
 *
 * Teacher tool — import one graded Blooket scoreboard into the live Algebra 2
 * grade engine. Unit B of BLOOKET_IMPORT_P2_BUILD.md. Mirrors teacher-roster.mjs
 * for arg parsing, URL/secret resolution, and CSV handling.
 *
 * What it does:
 *   - Reads a Blooket scoreboard CSV (rows: student,correct,attempted).
 *   - Computes each student's 0..1 Blooket score (same formula the server uses).
 *   - --dry-run: prints the computed plan only; NO network.
 *   - live: resolves each "student" (roster username OR real name) to a studentId
 *     via GET /roster/list, then POSTs the batch to /class/blooket. Reports any
 *     UNMATCHED rows and exits non-zero if anything failed.
 *
 * The teacher secret is read from roster-server/.env (gitignored) or env/flag —
 * it is never printed.
 *
 * Usage:
 *   node scripts/import-blooket.mjs --help
 *   node scripts/import-blooket.mjs --csv b.csv --lesson 1.2 --total 30 --dry-run
 *   node scripts/import-blooket.mjs --csv b.csv --lesson 1.2 --total 30 --section PERIOD3
 *
 * CSV rows: student,correct,attempted   (a header line is auto-detected/skipped)
 * --lesson <key>   lesson key, e.g. "1.2" or "U1.2" or "4.1-2"
 * --total <int>    number of questions in the Blooket (the coverage denominator)
 * --section <S>    scopes the roster lookup (passed through to the endpoint)
 * --url <U>        service URL (default: roster_config.js / known prod URL)
 * --secret <S>     teacher secret (default: roster-server/.env or env var)
 * --dry-run        parse + compute + print the plan; no network
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickConfigUrl } from './teacher-roster.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const DEFAULT_URL = 'https://a2-live-worksheets-production.up.railway.app';

// ── Help ─────────────────────────────────────────────────────────────────────

const HELP = `
import-blooket.mjs — import one graded Blooket scoreboard into the Algebra 2 grade engine.

USAGE
  node scripts/import-blooket.mjs --csv b.csv --lesson 1.2 --total 30 --dry-run
  node scripts/import-blooket.mjs --csv b.csv --lesson 1.2 --total 30 --section PERIOD3

INPUT
  --csv <path>     scoreboard CSV; each row: student,correct,attempted (header auto-skipped)
                   "student" = roster username (e.g. coconut_shark) OR the real name.
                   "correct"/"attempted" come straight from the Blooket scoreboard.
                   A blank/zero attempted scores 0 (a recorded skip).

OPTIONS
  --lesson <key>   lesson key, e.g. "1.2", "U1.2", or "4.1-2" (combined worksheet)
  --total <int>    number of questions in the Blooket (the coverage denominator)
  --section <S>    section to scope the roster lookup (e.g. PERIOD3, SY26-27-B)
  --url <U>        roster service URL (default: roster_config.js, else known prod URL)
  --secret <S>     teacher secret (default: roster-server/.env, else ROSTER_TEACHER_SECRET)
  --dry-run        parse + compute + print plan only; no network calls
  --help           show this

SCORE
  Per student, given correct, attempted, and the Blooket's --total:
    if attempted <= 0: 0
    acc = correct / attempted
    cov = min(1, attempted / total)        (walkaway penalty)
    score = clamp(acc * cov, 0, 1)         (== correct/total when attempted <= total)

NOTES
  - One Blooket per run. The lesson + question total are passed as --lesson / --total.
  - Scoreboards show nicknames; matching is best-effort against roster usernames and
    real names. UNMATCHED rows are REPORTED (never silently dropped) — fix the CSV and
    re-run. A re-import overwrites (upserts) the prior scores for the same lesson.
  - The Blooket track is 10% of the v3 Work score. A student with no recorded Blooket
    is excluded (renormalized), never counted as 0.
`;

// ── Tiny arg parser (mirrors teacher-roster.mjs) ─────────────────────────────

function parseArgs(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { flags._.push(a); continue; }
    const key = a.slice(2);
    if (key === 'help' || key === 'dry-run') {
      flags[key] = true;
      continue;
    }
    flags[key] = argv[++i];
  }
  return flags;
}

// ── Config resolution (URL + secret) — mirrors teacher-roster.mjs ─────────────

function readFileSafe(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
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

// ── The score (copied VERBATIM from BLOOKET_IMPORT_P2_BUILD.md section 1) ─────

// blooketScore(correct, attempted, total):
//   if attempted <= 0: return 0
//   acc = correct / attempted
//   cov = min(1, attempted / total)        # walkaway penalty
//   return clamp(acc * cov, 0, 1)          # == correct/total when attempted <= total
// Verbatim parity with roster-server/scoring.js::blooketScore (the engine + endpoint
// authority). Same defensive Number() coercion + finiteness/positive guards so the
// dry-run preview never diverges from what the server will store.
export function blooketScore(correct, attempted, total) {
  const c = Number(correct);
  const a = Number(attempted);
  const t = Number(total);
  if (!Number.isFinite(a) || a <= 0) return 0;
  if (!Number.isFinite(c) || c < 0) return 0;
  if (!Number.isFinite(t) || t <= 0) return 0;
  const acc = c / a;
  const cov = Math.min(1, a / t);
  const score = acc * cov;
  return Math.min(1, Math.max(0, score));
}

// ── CSV input parsing (mirrors teacher-roster.mjs splitCsvLine) ───────────────

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

// Returns [{ student, correct, attempted }] from raw scoreboard CSV text.
// Header auto-detected when the first cell is a known student-column name.
// correct/attempted are parsed to numbers (NaN when blank/non-numeric).
// Exported for the parse-only unit test (no network).
export function parseBlooket(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Auto-detect a header row: first cell looks like a column name, not a person.
  const firstCell = (splitCsvLine(lines[0])[0] || '').toLowerCase();
  const startIdx = ['student', 'name', 'nickname', 'username'].includes(firstCell) ? 1 : 0;

  const rows = [];
  for (let i = startIdx; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]);
    const student = parts[0] || '';
    const correct = parts[1] === '' || parts[1] == null ? NaN : Number(parts[1]);
    const attempted = parts[2] === '' || parts[2] == null ? NaN : Number(parts[2]);
    rows.push({ student, correct, attempted });
  }
  return rows;
}

// ── Lesson key -> item id (e.g. "1.2" -> BLOOKET-U1L2; "4.1-2" -> BLOOKET-U4L1-2)

// Parse "U?<unit>.<lessonKey>" into { unit, lessonKey, itemId }. Returns null on
// a malformed key. lessonKey may contain a hyphen (combined worksheet groups).
export function parseLessonKey(raw) {
  if (raw == null) return null;
  const m = String(raw).trim().match(/^U?(\d+)\.([\d-]+)$/);
  if (!m) return null;
  const unit = Number(m[1]);
  const lessonKey = m[2];
  return { unit, lessonKey, itemId: 'BLOOKET-U' + unit + 'L' + lessonKey };
}

// ── Plan building (parse + compute; shared by dry-run and live) ───────────────

// Build the per-row plan: parse each CSV row, compute its 0..1 score, flag
// validity. Pure (no network); the dry-run printer and live path both use it.
// Exported for the unit test.
export function buildPlan(rows, total) {
  return rows.map(r => {
    const validNums =
      Number.isFinite(r.correct) && Number.isFinite(r.attempted) &&
      r.correct >= 0 && r.attempted >= 0;
    const valid = !!r.student && validNums;
    const score = valid ? blooketScore(r.correct, r.attempted, total) : null;
    return {
      student: r.student,
      correct: r.correct,
      attempted: r.attempted,
      valid,
      score
    };
  });
}

// ── Console table (ASCII only, mirrors teacher-roster.mjs printTable) ─────────

function printTable(headers, rows) {
  const widths = headers.map(h => h.length);
  for (const r of rows) {
    headers.forEach((h, i) => { widths[i] = Math.max(widths[i], String(r[h] == null ? '' : r[h]).length); });
  }
  const fmt = cells => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  console.log(fmt(headers));
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(fmt(headers.map(h => (r[h] == null ? '' : r[h]))));
}

function fmtScore(s) {
  return s == null ? '-' : s.toFixed(4);
}

// ── Live: resolve student ids + POST the batch ───────────────────────────────

async function postBlooket(url, secret, body) {
  const res = await fetch(url + '/class/blooket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-teacher-secret': secret },
    body: JSON.stringify(body)
  });

  let data;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok || !data || !data.ok) {
    const reason = (data && data.error) || ('HTTP ' + res.status);
    return { ok: false, error: reason, status: res.status, data };
  }
  return { ok: true, data };
}

async function runImport(args) {
  // 1. Read + parse the CSV (no network yet).
  if (!args.csv) {
    console.error('ERROR: --csv <file> is required. Use --help.');
    process.exit(1);
  }
  const text = readFileSafe(resolve(process.cwd(), args.csv));
  if (text == null) { console.error('ERROR: cannot read --csv file: ' + args.csv); process.exit(1); }

  // 2. Validate --lesson and --total (needed for the score, even in dry-run).
  const lesson = parseLessonKey(args.lesson);
  if (!lesson) {
    console.error('ERROR: --lesson must look like "1.2", "U1.2", or "4.1-2". Got: ' + (args.lesson == null ? '(none)' : args.lesson));
    process.exit(1);
  }
  const total = Number(args.total);
  if (!Number.isInteger(total) || total <= 0) {
    console.error('ERROR: --total must be a positive integer (the Blooket question count). Got: ' + (args.total == null ? '(none)' : args.total));
    process.exit(1);
  }

  const rows = parseBlooket(text);
  const plan = buildPlan(rows, total);
  const url = resolveUrl(args.url);
  const secret = resolveSecret(args.secret);

  // 3. Dry run — print the computed plan, no network.
  if (args['dry-run']) {
    console.log('DRY RUN — no scores will be recorded.\n');
    console.log('Service URL : ' + url);
    console.log('Secret      : ' + (secret ? '(resolved, hidden)' : 'NOT FOUND'));
    console.log('Section     : ' + (args.section || '(all)'));
    console.log('Lesson      : ' + lesson.itemId + '  (topic ' + lesson.unit + '.' + lesson.lessonKey + ')');
    console.log('Total Qs    : ' + total);
    console.log('Rows        : ' + plan.length + '\n');
    printTable(['student', 'correct', 'attempted', 'score', 'status'], plan.map(p => ({
      student: p.student,
      correct: Number.isFinite(p.correct) ? p.correct : '',
      attempted: Number.isFinite(p.attempted) ? p.attempted : '',
      score: fmtScore(p.score),
      status: p.valid ? 'would record' : 'SKIP: bad row'
    })));
    const bad = plan.filter(p => !p.valid).length;
    if (bad) console.log('\n' + bad + ' invalid row(s) would be skipped (missing student or non-numeric/negative counts).');
    process.exit(0);
  }

  // 4. Live — need a secret to reach the teacher-gated endpoints.
  if (!secret) {
    console.error('ERROR: teacher secret not found. Pass --secret, set ROSTER_TEACHER_SECRET,');
    console.error('       or ensure roster-server/.env has ROSTER_TEACHER_SECRET=...');
    process.exit(1);
  }
  if (plan.length === 0) {
    console.error('ERROR: no rows to import (CSV is empty).');
    process.exit(1);
  }

  // 5. Pull the roster once and build username/realName -> studentId maps.
  const byUsername = new Map();   // lowercased login_username -> studentId
  const byRealName = new Map();   // lowercased real name      -> studentId
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

  // 6. Resolve each row to a studentId; collect entries + report unmatched.
  const entries = [];
  const resolved = [];   // for the result table
  const unmatched = [];
  for (const p of plan) {
    if (!p.valid) {
      unmatched.push({ student: p.student, score: p.score, status: 'SKIP: bad row' });
      continue;
    }
    const key = String(p.student).toLowerCase();
    const studentId = byUsername.get(key) || byRealName.get(key);
    if (!studentId) {
      unmatched.push({ student: p.student, score: fmtScore(p.score), status: 'UNMATCHED: not in roster' });
      continue;
    }
    entries.push({ studentId, correct: p.correct, attempted: p.attempted });
    resolved.push({ student: p.student, studentId, score: fmtScore(p.score), status: 'queued' });
  }

  if (entries.length === 0) {
    console.error('ERROR: no rows matched the roster. Nothing to import.');
    console.error('       (Check --section and that the CSV "student" cells are roster usernames or real names.)');
    if (unmatched.length) {
      console.error('\nUNMATCHED rows:');
      for (const u of unmatched) console.error('  - "' + u.student + '": ' + u.status);
    }
    process.exit(1);
  }

  // 7. POST the batch.
  console.log('Importing ' + entries.length + ' Blooket score(s) for ' + lesson.itemId +
    ' at ' + url + ' ...\n');
  let out;
  try {
    out = await postBlooket(url, secret, {
      lessonKey: 'U' + lesson.unit + '.' + lesson.lessonKey,
      total,
      section: args.section || undefined,
      entries
    });
  } catch (err) {
    console.error('ERROR: import failed (' + (err.message || 'network error') + ')');
    process.exit(1);
  }

  if (!out.ok) {
    console.error('ERROR: /class/blooket failed (HTTP ' + out.status + '): ' + out.error);
    if (out.status === 503) {
      console.error('       The blooket source is not provisioned. Run migration 0013 on Supabase.');
    }
    process.exit(1);
  }

  // 8. Summary.
  const recorded = (out.data && out.data.recorded) != null ? out.data.recorded : entries.length;
  const serverErrors = (out.data && out.data.errors) || [];

  console.log('--- Summary ---');
  printTable(['student', 'studentId', 'score', 'status'], resolved.map(r => ({
    student: r.student, studentId: r.studentId, score: r.score, status: 'recorded'
  })));
  if (unmatched.length) {
    console.log('\nUNMATCHED / SKIPPED (fix the CSV and re-run for these):');
    for (const u of unmatched) console.log('  - "' + u.student + '": ' + u.status);
  }
  if (serverErrors.length) {
    console.log('\nServer-side row errors:');
    for (const e of serverErrors) console.log('  - ' + JSON.stringify(e));
  }
  console.log('\nRecorded: ' + recorded + '   Unmatched/Skipped: ' + unmatched.length +
    '   Server errors: ' + serverErrors.length);

  // Exit non-zero if any row failed/unmatched, so a CI/teacher script notices.
  process.exit(unmatched.length > 0 || serverErrors.length > 0 ? 1 : 0);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || process.argv.length <= 2) {
    console.log(HELP);
    process.exit(args.help ? 0 : 1);
  }

  await runImport(args);
}

// Run main() only when invoked as a CLI, not when imported by a test.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => { console.error('FATAL: ' + (err && err.stack || err)); process.exit(1); });
}
