#!/usr/bin/env node
// build-offline-pack.mjs — assemble the disconnected Algebra 2 pack.
// OFFLINE_MODE_SPEC §4.E (Phase 1). TEACHER-RUN. Produces offline-pack/: a
// self-contained tree served from a local web server (single origin → shared
// localStorage/IndexedDB, the file:// trap avoided) so a student with NO internet
// work locally (offline-queue.js + gradebook-client.js, already wired), and
// export it (offline.html) to email in.
//
// Identity (OFFLINE_MODE_SPEC §4.D D2):
//   --identity '{'studentId':'…','username':'…','realName':'…','section':'PeriodX'}'
//     → bakes a ready a2_roster.v1 session (synthesized offline token), so the
//       pack opens already signed in. Generate one per zero-internet student.
//   (no --identity) → generic pack: OFFLINE_MODE only; uses whatever session is cached.
//
// copied in and the offline playback resolver (later) serves local files.
//
// Usage:
//   node scripts/build-offline-pack.mjs --dry-run
//   node scripts/build-offline-pack.mjs --identity '{'studentId':'abc','username':'mango_tiger','realName':'Mango T.','section':'PeriodX'}'
//   node scripts/build-offline-pack.mjs --out offline-pack

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, statSync, rmSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';


const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── What goes in the pack ─────────────────────────────────────────────────────
// Single files + whole dirs copied verbatim; worksheets matched by pattern.
const ROOT_FILES = [
  'index.html',
  'TOC.html',
  'calendar.html',
  'start-here.html',
  'desk.html',
  'check.html',
  'check.js',
  'a2-client.js',
  'a2-announcement.js',
  'a2-announcement.css',
  'a2-desk.js',
  'teacher-tryits.html',
  'study_guide_diagnostic.html',
  'offline.html',
  'roster_config.js',
  'roster-client.js',
  'offline-queue.js',
  'gradebook-client.js',
  'receipt-verify.js',
  'grade-engine.bundle.js',
  'ledger-store.js',
  'teacher-app.html',
  'receipt-sign.js',
  'ledger-seal.js',
  'secure-key.js',
  'student-key.js',
  'submission-store.js',
  'submission-capture.js',
  'submission-grader.js',
  'railway_client.js',
  'railway_config.js',
  'flashcards.js',
  'mobile-home.html',
  'verify.html',
  'verify-page.js',
  'roadmap-data.json',
  'sw.js',
  'pwa-register.js',
  'manifest.webmanifest',
  'icon.svg',
  'version.json'
];
const DIRS = [
  'content',
  'lib',
  'data',
  'js',
  'vendor'
];
const WORKSHEET_RE = /^u\d+_lesson.+_live\.html$/;
const GRADING_RE = /^ai-grading-prompts.*\.js$/;
const BLOOKET_RE = /_blooket\.csv$/;
const TRANSCRIPT_RE = /(transcription|transcript|slides)\.txt$/i;
const UNIT_DIRS = [];

// ── Pure helpers (unit-tested) ────────────────────────────────────────────────

// Inject offline-config.js as the FIRST <script> in <head> so window.OFFLINE_MODE
// is set before any app code runs. relPrefix accounts for nesting depth.
export function injectOfflineConfig(html, relPrefix) {
  if (html.includes('src="' + relPrefix + 'offline-config.js"')) return html; // idempotent
  const tag = '<script src="' + relPrefix + 'offline-config.js"></script>';
  if (/<head[^>]*>/i.test(html)) return html.replace(/(<head[^>]*>)/i, '$1\n  ' + tag);
  // no <head> (e.g. a fragment) → prepend
  return tag + '\n' + html;
}

// App-only: a floating '‹ Lessons' pill that returns to the mobile launcher (index.html),
// injected into worksheets + the quiz so the WebView (no browser chrome) always has a way back.
// relPrefix makes the link depth-correct (root worksheet → index.html; quiz/ → ../index.html).
// Enabled by build-offline-pack --app-nav (so the live web worksheets are unaffected).
export function injectAppNav(html, relPrefix) {
  if (html.includes('id="__app-lessons"')) return html; // idempotent
  // App-only chrome: hide the bundled apps' own 'Install app' PWA prompts (redundant inside the
  // native app — it IS the app). cr's #pwa-install-fab + the worksheets'/Desk's install buttons.
  const style = '<style id="__app-style">#pwa-install-fab,.pwa-install-btn,#install-app-btn{display:none!important}</style>';
  const bar = '<a id="__app-lessons" href="' + relPrefix + 'index.html" aria-label="Back to lessons" '
    + 'style="position:fixed;top:0;left:0;z-index:2147483646;'
    + 'margin:max(6px,env(safe-area-inset-top,0)) 0 0 6px;padding:7px 13px;'
    + 'background:rgba(11,92,173,.93);color:#fff;font:600 13px -apple-system,Roboto,sans-serif;'
    + 'text-decoration:none;border-radius:18px;box-shadow:0 1px 5px rgba(0,0,0,.35)">‹ Lessons</a>';
  if (/<body[^>]*>/i.test(html)) return html.replace(/(<body[^>]*>)/i, '$1\n' + style + '\n' + bar);
  return style + '\n' + bar + '\n' + html;
}

export function genOfflineConfig(identity, opts = {}) {
  const now = opts.now || 0;
  const session = identity ? {
    studentId: identity.studentId,
    username: identity.username,
    realName: identity.realName,
    section: identity.section,
    role: 'student',
    token: 'offline-' + identity.studentId, // never reaches the server; offline only
    signedInAt: new Date(now).toISOString(),
    offline: true} : null;
  return `// offline-config.js — GENERATED by build-offline-pack.mjs. Do not hand-edit.
// Marks this copy as the disconnected pack and (optionally) pre-signs-in a student.
window.OFFLINE_MODE = true;
${''}${session ? `(function () {
  try {
    if (!localStorage.getItem('a2_roster.v1')) {
      localStorage.setItem('a2_roster.v1', ${JSON.stringify(JSON.stringify(session))});
    }
  } catch (_) { /* best-effort */ }
})();` : '// generic pack: no baked identity (uses any cached session).'}
`;
}

const CMD_LAUNCHER = `@echo off
REM Start-Offline.cmd — serve the Algebra 2 offline pack from a local web server
REM (single origin so your saved work is shared across all the apps), then open it.
setlocal
set PORT=8765
where py >nul 2>nul && (start "" http://localhost:%PORT%/index.html & py -m http.server %PORT% & goto :eof)
where python >nul 2>nul && (start "" http://localhost:%PORT%/index.html & python -m http.server %PORT% & goto :eof)
where node >nul 2>nul && (start "" http://localhost:%PORT%/index.html & node serve.mjs %PORT% & goto :eof)
echo Could not find Python or Node to run the local server.
echo Install Python from https://www.python.org/downloads/ (check "Add to PATH"), then re-run this file.
pause
`;

const SH_LAUNCHER = `#!/bin/sh
# start-offline.sh — serve the Algebra 2 offline pack from a local web server.
PORT=8765
( command -v python3 >/dev/null 2>&1 && { (sleep 1; open "http://localhost:$PORT/index.html" 2>/dev/null || xdg-open "http://localhost:$PORT/index.html" 2>/dev/null) & python3 -m http.server $PORT; } ) ||
( command -v node >/dev/null 2>&1 && node serve.mjs $PORT ) ||
echo "Install Python 3 (python.org) then re-run this script."
`;

const NODE_SERVER = `// serve.mjs — tiny static server fallback (used only if Python is absent).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const PORT = parseInt(process.argv[2], 10) || 8765;
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.png':'image/png', '.mp4':'video/mp4', '.webp':'image/webp', '.txt':'text/plain', '.svg':'image/svg+xml' };
createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/' ) p = '/index.html';
    const file = join(process.cwd(), normalize(p).replace(/^(\\.\\.[/\\\\])+/, ''));
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(PORT, () => console.log('Offline pack at http://localhost:' + PORT + '/index.html'));
`;

function readme(identity) {
  return `# Algebra 2 — Offline Pack

Everything here works with NO internet.

## Start
- **Windows:** double-click **Start-Offline.cmd**
- **Mac/Linux:** run **./start-offline.sh**

It opens the pack in your browser. ${identity ? `You're signed in as **${identity.realName || identity.username}**.` : 'Sign in if prompted.'}

## When you're done
Open **My Offline Work** (offline.html) → **Export my work** → email the downloaded
\`a2_…json\` file to your teacher. Your work then counts.

> Don't just double-click the .html files — they won't share your saved work. Always
> start with the launcher above (it serves everything from one local address).
`;
}

// ── Build ─────────────────────────────────────────────────────────────────────

function relPrefixFor(relPath) {
  const depth = relPath.split(/[\\/]/).length - 1;
  return depth > 0 ? '../'.repeat(depth) : '';
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const appNav = argv.includes('--app-nav');       // inject the '‹ Lessons' back pill (app build)
    // skip re-copying media/ if already present (fast UI rebuilds)
  
  
  // Prepare a bundled HTML file: offline-config (+ the app back-pill when --app-nav).
  const prepHtml = (html, rel) => {
    const pfx = relPrefixFor(rel);
    let h = injectOfflineConfig(html, pfx);
    if (appNav) h = injectAppNav(h, pfx);
    return h;
  };
  const outArg = argv.indexOf('--out');
  const out = resolve(REPO, outArg >= 0 ? argv[outArg + 1] : 'offline-pack');
  const idArg = argv.indexOf('--identity');
  let identity = null;
  if (idArg >= 0) { try { identity = JSON.parse(argv[idArg + 1]); } catch (e) { console.error('Bad --identity JSON:', e.message); process.exit(2); } }

  // Resolve the file list.
  const sourceArg = argv.indexOf('--source');
  const sourceRoot = sourceArg >= 0 ? resolve(argv[sourceArg + 1]) : REPO;
  const all = readdirSync(sourceRoot);
  const worksheets = all.filter((f) => WORKSHEET_RE.test(f));
  const grading = all.filter((f) => GRADING_RE.test(f));
  const blooket = all.filter((f) => BLOOKET_RE.test(f));
  const files = [...ROOT_FILES, ...worksheets, ...grading, ...blooket].filter((f) => existsSync(resolve(sourceRoot, f)) || existsSync(resolve(REPO, f)));
  const dirs = DIRS.filter((d) => existsSync(resolve(REPO, d)));
  // Prefer the re-encoded media-compressed/ (H.264 CRF23, ~1.3 GB vs ~25 GB; same filenames so
  

  // transcripts/slides from unit dirs
  const transcripts = [];
  for (const u of UNIT_DIRS) {
    const dir = resolve(REPO, u);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (TRANSCRIPT_RE.test(f)) transcripts.push(join(u, f));
  }

  console.log(`build-offline-pack — ${dryRun ? 'DRY RUN' : 'BUILD'} → ${relative(REPO, out)}/`);
  console.log(`  ${files.length} files, ${dirs.length} dirs, ${transcripts.length} transcripts/slides, ${worksheets.length} worksheets`);
  console.log('Assembling offline worksheet shell');
  if (dryRun) { console.log('\nDry run — nothing written.'); return; }

  mkdirSync(out, { recursive: true });

  // The FULL answer key is a cheating surface — it must NEVER ship to a student
  // device. The offline grade re-derivation uses the REDACTED key from
  // /grade/offline-inputs (cached), never these files, and no client page reads them,
  // so excluding them from data/ closes the leak with no functional loss. The TEACHER
  // device fetches the full key from the teacher-gated GET /grade/answer-key instead.
  const KEY_LEAK_FILES = new Set(['answer-key.json', 'worksheet-key.json']);
  const copyInto = (rel) => {
    const src = existsSync(resolve(sourceRoot, rel)) ? resolve(sourceRoot, rel) : resolve(REPO, rel);
    const dst = resolve(out, rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst, { recursive: true, filter: (s) => !KEY_LEAK_FILES.has(s.split(/[\\/]/).pop()) });
    return dst;
  };

  // 1. config + launcher first (so injection can reference it)
  writeFileSync(resolve(out, 'offline-config.js'), genOfflineConfig(identity, { now: Date.parse('2026-06-22')}));
  ;
  writeFileSync(resolve(out, 'Start-Offline.cmd'), CMD_LAUNCHER);
  writeFileSync(resolve(out, 'start-offline.sh'), SH_LAUNCHER);
  writeFileSync(resolve(out, 'serve.mjs'), NODE_SERVER);
  writeFileSync(resolve(out, 'README.md'), readme(identity));

  // 2. files (inject offline-config.js into every HTML)
  for (const rel of files) {
    const dst = copyInto(rel);
    if (/\.html$/i.test(rel)) writeFileSync(dst, prepHtml(readFileSync(dst, 'utf8'), rel), 'utf8');
  }
  // 3. dirs (inject into any HTML inside, e.g. ti84-trainer-v2/standalone.html)
  for (const d of dirs) {
    copyInto(d);
    const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.html$/i.test(e.name)) { const rel = relative(out, p); writeFileSync(p, prepHtml(readFileSync(p, 'utf8'), rel), 'utf8'); }
    } };
    walk(resolve(out, d));
  }
  // The cpSync filter above SKIPS copying the full keys, but the out dir persists
  // across builds (android-app/www is reused), so a key a PRE-fix build already left
  // there would survive. Explicitly PURGE them so the leak can't ride a stale file.
  for (const f of KEY_LEAK_FILES) {
    const stale = resolve(out, 'data', f);
    if (existsSync(stale)) rmSync(stale, { force: true });
  }
  for (const rel of transcripts) copyInto(rel);
  // Copy the chosen media source (media-compressed/ or media/) INTO the pack as media/ so the
  ;
  ;

  // size
  let bytes = 0; const sz = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) sz(p); else try { bytes += statSync(p).size; } catch {} } };
  sz(out);
  console.log(`\nBuilt ${relative(REPO, out)}/ (~${(bytes / 1e6).toFixed(1)} MB). Launch: Start-Offline.cmd`);
  ;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
