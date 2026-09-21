// Run with node tests/a2-objectives-browser.mjs. Uses installed Edge; no dependencies.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const edge = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
assert.ok(existsSync(edge), 'Set EDGE_PATH to an installed Chromium browser');
const source = readFileSync('desk.html', 'utf8');
const fn = name => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
};
const dragStart = source.indexOf('// Draggable app windows (by title bar)');
const drag = source.slice(dragStart, source.indexOf('})();', dragStart) + 5);
const script = [fn('clampA2AppWindow'), fn('sizeA2Objectives'), fn('toggleMaximize'),
  'var _deskToastEl = null, _deskToastTimer = null;', fn('_showDeskToast'), fn('_showViewAsToast'), drag].join('\n');
// Keep the real DOM and inline styles, isolating layout from network/authentication.
const page = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<link\b[^>]*>/gi, '').replace(/\ssrc="[^"]*"/gi, '');
const check = function () {
  const checks = [];
  const ok = (condition, label) => { if (!condition) throw Error(label); checks.push(label); };
  const near = (a, b) => Math.abs(a - b) < 2;
  const strip = document.getElementById('a2-objectives');
  strip.hidden = false;
  strip.style.height = '112px';
  sizeA2Objectives();
  const limit = () => strip.getBoundingClientRect().top;
  for (const id of ['teachertools', 'nightlyreview', 'gradecheckin']) {
    const overlay = document.getElementById('app-' + id + '-overlay');
    overlay.style.display = 'block';
    const win = overlay.querySelector('.app-window');
    win.style.height = '400px';
    ok(near(win.getBoundingClientRect().top + win.getBoundingClientRect().height / 2, limit() / 2), id + ' centered');
    const title = win.querySelector('.game-title-bar');
    title.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 500, clientY: 200 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 510, clientY: 220 }));
    const position = win.style.top;
    sizeA2Objectives();
    ok(win.style.top === position, id + ' preserves drag');
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 510, clientY: 2000 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    ok(near(win.getBoundingClientRect().bottom, limit()), id + ' clamps drag');
    strip.style.height = '200px';
    sizeA2Objectives();
    ok(win.getBoundingClientRect().bottom <= limit() + 1, id + ' expanded clamp');
    toggleMaximize(id);
    ok(near(win.getBoundingClientRect().top, 20), id + ' maximized top');
    ok(near(win.getBoundingClientRect().bottom, limit()), id + ' maximized bottom');
    toggleMaximize(id);
    ok(near(win.getBoundingClientRect().top + win.getBoundingClientRect().height / 2, limit() / 2), id + ' restored center');
    overlay.style.display = 'none';
    strip.style.height = '112px';
    sizeA2Objectives();
  }
  for (const id of ['bf-overlay', 'signin-overlay']) {
    const overlay = document.getElementById(id);
    overlay.style.display = 'block';
    const box = overlay.querySelector('.dialog-box');
    ok(getComputedStyle(overlay).paddingBottom === '112px', id + ' padding');
    ok(box.getBoundingClientRect().bottom <= limit(), id + ' above strip');
    overlay.style.display = 'none';
  }
  for (const cls of ['ogm-panel', 'sdm-panel', 'tnm-panel']) {
    const panel = document.querySelector('.' + cls);
    panel.parentElement.style.display = 'block';
    ok(panel.getBoundingClientRect().bottom <= limit(), cls + ' above strip');
    panel.parentElement.style.display = 'none';
  }
  const nudge = document.createElement('div');
  nudge.id = 'update-nudge';
  nudge.innerHTML = '<button>Reload</button>';
  document.body.append(nudge);
  const preview = document.getElementById('preview-as-student-badge');
  preview.style.display = 'flex';
  const icon = document.querySelector('.desktop-icon');
  icon.style.display = 'flex';
  _showDeskToast('Desk notice');
  _showViewAsToast('View-as notice');
  const viewToast = document.body.lastElementChild;
  const elements = [[nudge, 14], [preview, 8], [icon, 40], [_deskToastEl, 18], [viewToast, 24]];
  for (const reserved of [112, 200, 0]) {
    strip.style.height = reserved + 'px';
    strip.hidden = reserved === 0;
    sizeA2Objectives();
    for (const [el, gap] of elements) {
      ok(near(el.getBoundingClientRect().bottom, innerHeight - reserved - gap), (el.id || el.textContent) + ' offset ' + reserved);
    }
  }
  strip.hidden = false;
  strip.style.height = '112px';
  sizeA2Objectives();
  const button = nudge.querySelector('button');
  const rect = button.getBoundingClientRect();
  ok(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === button, 'Reload hit target');
  return { width: innerWidth, height: innerHeight, checks: checks.length };
};
const temp = mkdtempSync(resolve('tests/.objectives-browser-'));
try {
  // Installed Edge reserves 24px horizontally and 139px vertically for its frame.
  for (const [width, height] of [[1366, 768], [1920, 1080]]) {
    const file = join(temp, 'fixture.html');
    writeFileSync(file, page.replace('</body>', `<script>${script}\ntry { document.body.dataset.result = JSON.stringify((${check})()); } catch (e) { document.body.dataset.result = JSON.stringify({error: e.message}); }</script></body>`));
    const output = execFileSync(edge, ['--headless', '--no-sandbox', '--disable-gpu', '--no-first-run',
      '--disable-extensions', '--allow-file-access-from-files', `--user-data-dir=${join(temp, 'profile-' + width)}`,
      `--window-size=${width + 24},${height + 139}`, '--dump-dom', pathToFileURL(file).href], { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    const encoded = output.match(/data-result="([^"]*)"/)?.[1];
    assert.ok(encoded, 'Browser did not return evidence');
    const result = JSON.parse(encoded.replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
    assert.ok(!result.error, JSON.stringify(result));
    assert.equal(result.width, width, 'Viewport width');
    assert.equal(result.height, height, 'Viewport height');
    console.log(JSON.stringify(result));
  }
} finally {
  rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
