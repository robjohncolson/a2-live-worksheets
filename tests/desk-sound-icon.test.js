// @vitest-environment jsdom
/**
 * tests/desk-sound-icon.test.js — SOUND_ICON
 *
 * The menu-bar sound toggle is a 1-bit black classic-Mac speaker (replaces the
 * 🔊/🔇 emoji): on = cone + sound-wave arcs, muted = cone + ✕. Runs the REAL
 * extracted _soundIconSVG / _renderSoundIcon / _toggleSound in jsdom.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'desk.html'), 'utf-8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = src.indexOf('(', m.index), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

const SRC = [
  fnBody(html, '_soundIconSVG'),
  fnBody(html, '_renderSoundIcon'),
  fnBody(html, '_toggleSound'),
].join('\n');

function load() {
  // eslint-disable-next-line no-eval
  return eval(SRC + '\n;({ svg: _soundIconSVG, render: _renderSoundIcon, toggle: _toggleSound })');
}

beforeEach(() => {
  document.body.innerHTML = '<span id="mac-mute"></span>';
  globalThis.MacSFX = {
    muted: false,
    init() {},
    toggleMute() { this.muted = !this.muted; return this.muted; },
  };
});

describe('sound icon — 1-bit speaker SVG', () => {
  it('on-state: cone polygon + wave arcs, pure black, no emoji', () => {
    const svg = load().svg(false);
    expect(svg).toContain('<svg');
    expect(svg).toContain('<polygon');           // the speaker cone
    expect(svg).toMatch(/<path[^>]*Q/);           // curved sound waves
    expect(svg).toContain('#000');                // 1-bit black
    expect(svg).not.toMatch(/<line/);             // no ✕ in the on-state
    expect(svg).not.toMatch(/🔊|🔇|🔈|🔉/u);       // emoji gone
  });

  it('muted-state: cone polygon + an ✕ (two lines), no wave arcs', () => {
    const svg = load().svg(true);
    expect(svg).toContain('<polygon');
    const lines = svg.match(/<line/g) || [];
    expect(lines.length).toBe(2);                 // the ✕
    expect(svg).not.toMatch(/<path[^>]*Q/);       // no waves when muted
    expect(svg).toContain('#000');
  });

  it('renders into #mac-mute and reflects MacSFX.muted (aria-pressed)', () => {
    const api = load();
    api.render();
    const el = document.getElementById('mac-mute');
    expect(el.querySelector('svg')).toBeTruthy();
    expect(el.getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelector('line')).toBeFalsy(); // on-state, no ✕
  });

  it('toggle flips mute, swaps to the ✕ icon, and updates aria-pressed', () => {
    const api = load();
    api.render();
    api.toggle();
    expect(globalThis.MacSFX.muted).toBe(true);
    const el = document.getElementById('mac-mute');
    expect(el.querySelectorAll('line').length).toBe(2); // now muted ✕
    expect(el.getAttribute('aria-pressed')).toBe('true');
    api.toggle();
    expect(globalThis.MacSFX.muted).toBe(false);
    expect(document.getElementById('mac-mute').querySelector('line')).toBeFalsy();
  });
});

describe('sound icon — menu-bar wiring (structural)', () => {
  it('the #mac-mute element calls _toggleSound() and is keyboard-accessible (no emoji)', () => {
    const m = /<span id="mac-mute"[^>]*>/.exec(html);
    expect(m).toBeTruthy();
    const tag = m[0];
    expect(tag).toContain('onclick="_toggleSound()"');
    expect(tag).toContain('role="button"');
    expect(tag).toContain('tabindex="0"');
    expect(tag).toMatch(/onkeydown=.*_toggleSound/);
    expect(tag).not.toMatch(/🔊|🔇/u);
  });
  it('boot init calls _renderSoundIcon() after MacSFX.init()', () => {
    expect(html).toMatch(/MacSFX\.init\(\);\s*_renderSoundIcon\(\)/);
  });
});
