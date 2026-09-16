#!/usr/bin/env node
/**
 * smoke-student-host-matrix.mjs — W0 reusable host matrix smoke
 *
 * Measures what production hosts actually serve for student resource paths
 * (Desk / mobile / authored lesson data / flashcards / roster health).
 *
 * Usage:
 *   node scripts/smoke-student-host-matrix.mjs
 *   node scripts/smoke-student-host-matrix.mjs --http-only
 *   node scripts/smoke-student-host-matrix.mjs --out state/w0-results.json
 *
 * Optional browser render checks (desktop + phone viewports) when
 * playwright-core is installed:
 *   npm install --no-save playwright-core && npx playwright-core install chromium
 *
 * Recon only — does not modify app code. Exit 0 always when probes complete;
 * exit 2 if chromium was requested and failed to launch.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const HTTP_ONLY = process.argv.includes('--http-only');
const OUT = resolve(REPO, arg('--out', 'state/w0-host-matrix-results.json'));

// ── Origins: hardcoded from verified code constants (not parsed at runtime).
// Sources: roster_config.js and the Algebra 2 deployment origins.
export const ORIGINS = {
  WS_BASE: 'https://robjohncolson.github.io/a2-live-worksheets/',
  WS_MIRROR: 'https://a2-live-worksheets.vercel.app/',
  ROSTER: 'https://a2-live-worksheets-production.up.railway.app',
  RAILWAY_CR_AI: 'https://a2-live-worksheets-production.up.railway.app',
};

const WS = ORIGINS.WS_BASE.replace(/\/$/, '');
const WS_MIRROR = ORIGINS.WS_MIRROR.replace(/\/$/, '');

// Published Algebra 2 lesson and shared flashcard asset.
export const LESSON = {
  id: '1-1',
  topic: 1,
  lesson: 1,
  lessons: `${WS}/content/a2/lessons.json`,
  deck: `${WS}/content/a2/1-1/deck.csv`,
  flashcardsJs: `${WS}/flashcards.js`,
};

export const HTTP_CHECKS = [
  // GH Pages — Desk worksheet host
  { host: 'GH_Pages_Desk', resource: 'desk_html', url: `${WS}/desk.html` },
  { host: 'GH_Pages_Desk', resource: 'start_here_html', url: `${WS}/start-here.html` },
  { host: 'GH_Pages_Desk', resource: 'check_html', url: `${WS}/check.html?lesson=1-1` },
  { host: 'GH_Pages_Desk', resource: 'mobile_html', url: `${WS}/mobile-home.html` },
  { host: 'GH_Pages_Desk', resource: 'flashcards_js', url: LESSON.flashcardsJs },
  { host: 'GH_Pages_Desk', resource: 'work_manifest', url: `${WS}/data/work-manifest.json` },
  { host: 'GH_Pages_Desk', resource: 'a2_lessons', url: LESSON.lessons },
  { host: 'GH_Pages_Desk', resource: 'a2_deck', url: LESSON.deck },

  // Vercel — mirror of the worksheet tree (fallback rail for GH Pages)
  { host: 'Vercel_Mirror', resource: 'desk_html', url: `${WS_MIRROR}/desk.html` },
  { host: 'Vercel_Mirror', resource: 'start_here_html', url: `${WS_MIRROR}/start-here.html` },
  { host: 'Vercel_Mirror', resource: 'check_html', url: `${WS_MIRROR}/check.html?lesson=1-1` },
  { host: 'Vercel_Mirror', resource: 'a2_lessons', url: `${WS_MIRROR}/content/a2/lessons.json` },
  { host: 'Vercel_Mirror', resource: 'flashcards_js', url: `${WS_MIRROR}/flashcards.js` },

  // Railway — roster / donow + AI grading backend
  { host: 'Railway_Roster', resource: 'health', url: `${ORIGINS.ROSTER}/health` },
  { host: 'Railway_Roster', resource: 'donow_unauth', url: `${ORIGINS.ROSTER}/donow`, expectStatus: 401 },
  { host: 'Railway_CR_AI', resource: 'health', url: `${ORIGINS.RAILWAY_CR_AI}/health` },

];

export const BROWSER_PAGES = [
  { id: 'desk', url: `${WS}/desk.html` },
  { id: 'start_here', url: `${WS}/start-here.html` },
  { id: 'check', url: `${WS}/check.html?lesson=1-1` },
  { id: 'mobile', url: `${WS}/mobile-home.html` },
  { id: 'mirror_desk', url: `${WS_MIRROR}/desk.html` },
  { id: 'mirror_start_here', url: `${WS_MIRROR}/start-here.html` },
  { id: 'mirror_check', url: `${WS_MIRROR}/check.html?lesson=1-1` },
];

async function httpProbe({ url, method = 'GET' }) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method,
      redirect: 'follow',
      headers: { 'User-Agent': 'W0-host-matrix-smoke/1.0' },
      signal: AbortSignal.timeout(25000),
    });
    // Avoid downloading large media bodies when GET was used
    let bytes = Number(r.headers.get('content-length') || 0);
    let bodyStart = '';
    if (method === 'GET' && !/\.mp4(\?|$)/i.test(url)) {
      const buf = await r.arrayBuffer();
      bytes = buf.byteLength;
      bodyStart = new TextDecoder().decode(buf.slice(0, 160)).replace(/\s+/g, ' ').slice(0, 120);
    }
    return {
      status: r.status,
      ok: r.ok,
      ct: r.headers.get('content-type') || '',
      bytes,
      finalUrl: r.url,
      ms: Date.now() - t0,
      bodyStart,
      method,
    };
  } catch (e) {
    return { status: null, ok: false, error: e.message, ms: Date.now() - t0, method };
  }
}

export async function runHttpChecks(checks = HTTP_CHECKS) {
  const results = [];
  for (const c of checks) {
    if (c.skip || !c.url) {
      results.push({ ...c, status: null, ok: null, skipped: true });
      continue;
    }
    const method = c.method || 'GET';
    const r = await httpProbe({ url: c.url, method });
    const expect = c.expectStatus;
    const okForExpect = expect != null ? r.status === expect : r.ok;
    results.push({
      host: c.host,
      resource: c.resource,
      url: c.url,
      note: c.note || null,
      expectStatus: expect ?? null,
      ...r,
      ok: okForExpect,
    });
    const st = r.status ?? 'ERR';
    console.log(
      `${c.host.padEnd(16)} ${c.resource.padEnd(22)} ${String(st).padStart(4)} ${okForExpect ? 'OK' : '--'} ${c.note || ''}`,
    );
  }
  return results;
}

export async function runBrowserSmoke() {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    console.warn('playwright-core not installed — skipping browser smoke (HTTP results still valid).');
    return { skipped: true, reason: 'playwright-core not installed', results: [] };
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    try {
      browser = await chromium.launch({ headless: true, channel: 'chrome' });
    } catch (e2) {
      console.error('chromium launch failed:', e2.message);
      return { skipped: true, reason: e2.message, results: [], launchFailed: true };
    }
  }

  const viewports = [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'phone', width: 390, height: 844 },
  ];
  const results = [];

  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    for (const p of BROWSER_PAGES) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (err) => errors.push(String(err.message || err).slice(0, 200)));
      const t0 = Date.now();
      let status = null;
      let title = '';
      let bodySnippet = '';
      let renderOk = false;
      try {
        const resp = await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        status = resp ? resp.status() : null;
        await page.waitForTimeout(1200);
        title = await page.title();
        bodySnippet = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
        const isGh404 =
          /File not found|Page not found/i.test(title) ||
          /There isn't a GitHub Pages site here|File not found/i.test(bodySnippet);
        const hasUi = (await page.locator('body *').count()) > 3;
        renderOk = !!status && status < 400 && !isGh404 && hasUi;
      } catch (e) {
        errors.push('goto: ' + String(e.message || e).slice(0, 150));
      }
      const row = {
        viewport: vp.name,
        id: p.id,
        url: p.url,
        status,
        title: title.slice(0, 100),
        renderOk,
        ms: Date.now() - t0,
        errors: errors.slice(0, 5),
        bodySnippet,
      };
      results.push(row);
      console.log(
        `${vp.name.padEnd(8)} ${p.id.padEnd(20)} status=${status} render=${renderOk} title=${title.slice(0, 48)}`,
      );
      await page.close();
    }
    await context.close();
  }
  await browser.close();
  return { skipped: false, results };
}

async function main() {
  console.log('Algebra 2 student host matrix smoke');
  console.log('WS_BASE=', ORIGINS.WS_BASE);
  console.log('WS_MIRROR=', ORIGINS.WS_MIRROR);
  console.log('ROSTER=', ORIGINS.ROSTER);
  console.log('lesson=', LESSON.id);

  const http = await runHttpChecks();
  let browser = { skipped: true, reason: '--http-only', results: [] };
  if (!HTTP_ONLY) {
    console.log('Browser smoke (playwright-core)');
    browser = await runBrowserSmoke();
  }

  const payload = {
    probedAt: new Date().toISOString(),
    originsNote: 'hardcoded from Algebra 2 deployment configuration',
    origins: ORIGINS,
    lesson: LESSON,
    http,
    browser,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log('Wrote', OUT);
  if (browser.launchFailed) process.exit(2);
}

// Only run when executed directly
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
