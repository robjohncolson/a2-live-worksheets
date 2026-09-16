// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import { bootDesk } from './journeys/harness.js';

const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'desk.html'), 'utf8');
function fn(name) {
  const start = html.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Missing ' + name);
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error('Unclosed ' + name);
}

describe('A2 Desk chrome restorations', () => {
  it('loads only the four shared UI sounds and walker laugh, honoring mute', () => {
    const play = vi.fn(() => Promise.resolve());
    const context = createContext({
      localStorage: { getItem: () => null, setItem: vi.fn() },
      Audio: class { constructor(src) { this.src = src; this.play = play; } },
    });
    const source = html.match(/const MacSFX = \{[\s\S]*?\n\};/)[0];
    runInContext(source + '\nglobalThis.sound = MacSFX;', context);
    expect(typeof context.sound.play).toBe('function');
    context.sound.init();
    const files = Object.values(context.sound.sounds).map(sound => sound.src);
    expect(files).toEqual([
      'Mac-OS-Sounds/PowerMacBeep.wav', 'Mac-OS-Sounds/Quack.wav',
      'Mac-OS-Sounds/Wild-Eep.wav', 'Mac-OS-Sounds/Single-Click.wav',
      'Mac-OS-Sounds/Laugh.wav',
    ]);
    for (const file of files) expect(existsSync(resolve(root, file))).toBe(true);
    context.sound.play('click', 0.3);
    expect(play).toHaveBeenCalledTimes(1);
    expect(context.sound.sounds.click.volume).toBe(0.3);
    context.sound.toggleMute();
    context.sound.play('click');
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('provides the identity sprite and a gradebook shortcut with emoji fallback', () => {
    expect(existsSync(resolve(root, 'sprite.png'))).toBe(true);
    expect(existsSync(resolve(root, 'icons/icon-progress.png'))).toBe(true);
    const dom = new JSDOM(html);
    const shortcut = dom.window.document.querySelector('[data-app="progress"]');
    expect(shortcut.getAttribute('ondblclick')).toBe('openMyGradebook()');
    expect(shortcut.querySelector('.icon-img').getAttribute('data-emoji')).toBeTruthy();
    expect(shortcut.querySelector('img').getAttribute('onerror')).toContain("this.style.display='none'");
    dom.window.close();
  });

  it('routes context-menu Open for receipts and progress to their controllers', () => {
    const context = createContext({
      openMyReceipts: vi.fn(), openMyGradebook: vi.fn(), bumpUsage: vi.fn(),
    });
    const registry = html.match(/const APP_REGISTRY = \{[\s\S]*?\n\};/)[0];
    runInContext(registry + '\n' + fn('openApp') + '\n' + fn('_deskLaunch'), context);
    context._deskLaunch('receipts');
    context._deskLaunch('progress');
    expect(context.openMyReceipts).toHaveBeenCalledOnce();
    expect(context.openMyGradebook).toHaveBeenCalledOnce();
    expect(context.bumpUsage.mock.calls).toEqual([['receipts'], ['progress']]);
  });

  it('checks exactly the selected section in the three-item View menu', () => {
    const dom = new JSDOM(html, { url: 'https://desk.test/desk.html' });
    const document = dom.window.document;
    expect(document.querySelectorAll('#menu-view [id^="menu-period-"]')).toHaveLength(3);
    const context = createContext({ document, window: dom.window, history: dom.window.history,
      URL, cP: 'C', cYear: 'SY26-27', SCHEDULE_DEFS: { 'SY26-27': { label: '2026-27' } },
      MacSFX: { play: vi.fn() }, rCal: vi.fn(), rProg: vi.fn(),
    });
    runInContext(fn('updateViewMenu') + '\n' + fn('setP'), context);
    for (const [section, id] of [['C', 'b'], ['D', 'e'], ['G', 'g']]) {
      context.setP(section);
      for (const item of document.querySelectorAll('#menu-view [id^="menu-period-"]')) {
        expect(item.textContent.includes('\u2713')).toBe(item.id === 'menu-period-' + id);
      }
      for (const buttonId of ['b', 'e', 'g']) {
        const button = document.getElementById('btn-' + buttonId);
        expect(button.classList.contains('s7btn-inv')).toBe(buttonId === id);
        expect(button.classList.contains('s7btn-default')).toBe(buttonId === id);
      }
      expect(new URL(dom.window.location.href).searchParams.get('period')).toBe(section);
    }
    dom.window.close();
  });

  it('draws the signed-out walker and completes a click-triggered jump with its laugh', async () => {
    const dom = new JSDOM('<canvas id="menu-sprite"></canvas>', {
      url: 'https://desk.test/desk.html', runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    try {
      const { window } = dom;
      const canvas = window.document.getElementById('menu-sprite');
      const context = { scale: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn() };
      canvas.getContext = vi.fn(() => context);
      const frames = [];
      window.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
      window.Image = class {
        set src(value) {
          this._src = value;
          queueMicrotask(() => { this.complete = true; this.onload(); });
        }
        get src() { return this._src; }
      };
      const played = [];
      window.Audio = class {
        constructor(src) { this.src = src; }
        play() { played.push({ src: this.src, volume: this.volume }); return Promise.resolve(); }
      };
      window.closeMenus = vi.fn();
      const errors = [];
      window.addEventListener('error', event => errors.push(event.error || event.message));
      const sounds = html.match(/const MacSFX = \{[\s\S]*?\n\};/)[0];
      const start = html.indexOf('/* Pico Park menu sprite animator */');
      const end = html.indexOf('\nfunction closeMenus()', start);
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      window.eval(sounds + '\n' + html.slice(start, end));
      await Promise.resolve();
      expect(frames).toHaveLength(1);
      expect(() => frames.shift()(100)).not.toThrow();
      expect(context.drawImage).toHaveBeenCalledOnce();
      expect(context.drawImage.mock.calls[0][0].src).toBe('sprite.png');
      canvas.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      expect(window.closeMenus).toHaveBeenCalledOnce();
      expect(played).toEqual([{ src: 'Mac-OS-Sounds/Laugh.wav', volume: 0.5 }]);
      expect(() => frames.shift()(200)).not.toThrow();
      expect(canvas.style.transform).toMatch(/^translateY\(-[\d.]+px\)$/);
      expect(context.drawImage.mock.calls.at(-1)[1]).toBe(5 * (80 + 4));
      for (const now of [300, 400, 500, 600]) {
        expect(() => frames.shift()(now)).not.toThrow();
      }
      expect(canvas.style.transform).toBe('');
      expect(errors).toEqual([]);
    } finally {
      dom.window.close();
    }
  });

  it.each([
    ['receipts', 'dblclick', 'my-receipts-overlay'],
    ['receipts', 'contextmenu', 'my-receipts-overlay'],
    ['progress', 'dblclick', 'my-gradebook-overlay'],
    ['progress', 'contextmenu', 'my-gradebook-overlay'],
  ])('opens signed-out %s through a real %s event', async (app, eventType, overlayId) => {
    const desk = await bootDesk();
    try {
      expect(desk.window.rosterClient.current()).toBeFalsy();
      const errorCounts = [desk.windowErrors.length, desk.jsdomErrors.length,
        desk.unhandledRejections.length];
      const overlay = desk.document.getElementById(overlayId);
      expect(overlay.style.display).toBe('none');
      const icon = desk.document.querySelector('div[data-app="' + app + '"]');
      expect(icon).not.toBeNull();
      icon.dispatchEvent(new desk.window.MouseEvent(eventType, {
        bubbles: true, cancelable: true, clientX: 40, clientY: 40,
      }));
      if (eventType === 'contextmenu') {
        const menu = Array.from(desk.document.body.children)
          .find(element => element.style.zIndex === '20000');
        expect(menu).toBeTruthy();
        expect(menu.firstElementChild.textContent).toContain('Open');
        menu.firstElementChild.dispatchEvent(new desk.window.MouseEvent('click', { bubbles: true }));
      }
      await desk.flush();
      expect(overlay.style.display).toBe('block');
      expect(desk.windowErrors.slice(errorCounts[0])).toEqual([]);
      expect(desk.jsdomErrors.slice(errorCounts[1])).toEqual([]);
      expect(desk.unhandledRejections.slice(errorCounts[2])).toEqual([]);
    } finally {
      desk.teardown();
    }
  }, 15_000);

  it('uses one passive text-only toast for transcript notices with a legacy alias', () => {
    const dom = new JSDOM('<body></body>');
    const alert = vi.fn();
    const context = createContext({ document: dom.window.document, alert,
      setTimeout: vi.fn(() => 1), clearTimeout: vi.fn(),
      _deskToastEl: null, _deskToastTimer: null,
    });
    runInContext(fn('_showDeskToast') + '\n' + fn('_sealedTranscriptNotice'), context);
    context._sealedTranscriptNotice('First');
    context._sealedTranscriptNotice('<img src=x>Saved');
    expect(dom.window.document.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(dom.window.document.querySelector('[role="status"]').textContent).toBe('<img src=x>Saved');
    expect(dom.window.document.querySelector('img')).toBeNull();
    expect(alert).not.toHaveBeenCalled();
    expect(fn('_sealedTranscriptNotice')).not.toMatch(/\balert\s*\(/);
    expect(html).toContain('var _showTrainerToast = _showDeskToast;');
    dom.window.close();
  });

  it('contains none of the retired U10 identifiers', () => {
    for (const identifier of ['_fetchPollArchive', '_renderTodayTopics', 'openGame',
      'game-overlay', 'game-split', 'guest-pass-overlay', 'reconcile-qr-overlay',
      'verify-qr-overlay', 'openVerifyQR', '_phase3SyncNearbyClick', '.doge-dropdown']) {
      expect(html, identifier).not.toContain(identifier);
    }
  });
});
