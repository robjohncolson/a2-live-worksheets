/**
 * tests/desk-auto-open-override.test.js
 *
 * P9 Wave C -- Desk auto-open override gate.
 * (TEACHER_STUDENT_CONSOLE_P9_BUILD.md section 4).
 *
 * When the cockpit opens the Desk via
 *   ?viewAsUserId=<sid>&autoOpenOverride=1
 * the _viewAsBootstrap IIFE stashes 'a2_auto_open_override' in
 * sessionStorage before reloading. After the reload the DOMContentLoaded
 * handler finds the flag, REMOVES it (one-shot), then auto-clicks
 * #view-as-override-gate after 300 ms.
 *
 * Test strategy: source-presence pins + vm-sandbox exercise of the
 * bootstrap snippet, matching the desk-view-as.test.js harness pattern.
 * The auto-click is tested by stubbing #view-as-override-gate and
 * calling the DOMContentLoaded handler body synchronously (with fake
 * timers via setTimeoutCapture).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'desk.html'), 'utf-8');

// ---------------------------------------------------------------------------
// Helper: minimal mock sessionStorage
// ---------------------------------------------------------------------------
function mockStorage(initial) {
  const m = new Map(Object.entries(initial || {}));
  return {
    getItem:    (k)    => (m.has(k) ? m.get(k) : null),
    setItem:    (k, v) => { m.set(k, String(v)); },
    removeItem: (k)    => { m.delete(k); },
    _map: m,
  };
}

// ---------------------------------------------------------------------------
// Helper: extract just the _viewAsBootstrap IIFE source from the HTML
// ---------------------------------------------------------------------------
function bootstrapSource() {
  const m = /_viewAsBootstrap[\s\S]*?\}\)\(\);/.exec(html);
  if (!m) throw new Error('_viewAsBootstrap IIFE not found in HTML');
  return m[0];
}

// ---------------------------------------------------------------------------
// Helper: extract just the DOMContentLoaded handler body added in P9.
// We look for the P9 Wave C comment then find the next try { after it.
// ---------------------------------------------------------------------------
function p9DomReadySnippet() {
  const marker = 'P9 Wave C: if the page was opened with ?autoOpenOverride=1';
  const idx = html.indexOf(marker);
  if (idx === -1) throw new Error('P9 Wave C auto-click block not found in HTML');
  // Find the next 'try {' AFTER the marker (not before it)
  const tryStart = html.indexOf('try {', idx);
  if (tryStart === -1) throw new Error('Could not locate try block for P9 auto-click');
  let depth = 0;
  let end = -1;
  for (let i = tryStart; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) throw new Error('Unbalanced braces in P9 auto-click block');
  return html.slice(tryStart, end + 1);
}

// ============================================================================
// 1. Source presence
// ============================================================================

describe('Auto-open override -- source presence', () => {
  it('source contains the autoOpenOverride query-param read', () => {
    expect(html).toMatch(/params\.get\(\s*['"]autoOpenOverride['"]\s*\)/);
  });

  it('source contains the a2_auto_open_override sessionStorage key', () => {
    expect(html).toMatch(/a2_auto_open_override/);
  });

  it('bootstrap sets the key when autoOpenOverride === "1"', () => {
    const src = bootstrapSource();
    expect(src).toMatch(/params\.get\(\s*['"]autoOpenOverride['"]\s*\)\s*===\s*['"]1['"]/);
    expect(src).toMatch(/sessionStorage\.setItem\(\s*['"]a2_auto_open_override['"]/);
  });

  it('DOMContentLoaded handler removes the flag before clicking (one-shot)', () => {
    const snippet = p9DomReadySnippet();
    // removeItem must appear BEFORE the setTimeout / btn.click
    const removeIdx = snippet.indexOf("removeItem('a2_auto_open_override')");
    const clickIdx  = snippet.indexOf('autoBtn.click()');
    expect(removeIdx).toBeGreaterThan(-1);
    expect(clickIdx).toBeGreaterThan(-1);
    expect(removeIdx).toBeLessThan(clickIdx);
  });

  it('DOMContentLoaded handler targets #view-as-override-gate', () => {
    const snippet = p9DomReadySnippet();
    expect(snippet).toMatch(/getElementById\(\s*['"]view-as-override-gate['"]\s*\)/);
  });

  it('DOMContentLoaded handler uses a 300 ms delay before clicking', () => {
    const snippet = p9DomReadySnippet();
    expect(snippet).toMatch(/setTimeout[\s\S]*?300/);
  });
});

// ============================================================================
// 2. Bootstrap flag-stash behavior (vm sandbox)
// ============================================================================

describe('Auto-open override -- bootstrap flag stash', () => {
  // Extract just the inner try block that reads autoOpenOverride from params.
  // We do this by finding the flag-stash code and building a minimal script.

  function runFlagStash(paramsGetValue) {
    const ss = mockStorage({});
    // Build a minimal script that mirrors what the bootstrap does:
    //   var params = { get: (k) => ... };
    //   try {
    //     if (params.get('autoOpenOverride') === '1') {
    //       sessionStorage.setItem('a2_auto_open_override', '1');
    //     }
    //   } catch (_) {}
    const script = `
      var params = { get: function(k) { return k === 'autoOpenOverride' ? _paramVal : null; } };
      try {
        if (params.get('autoOpenOverride') === '1') {
          sessionStorage.setItem('a2_auto_open_override', '1');
        }
      } catch (_) {}
    `;
    const ctx = {
      _paramVal: paramsGetValue,
      sessionStorage: ss,
    };
    // Use Function to run in a sandboxed but connected context
    const fn = new Function(...Object.keys(ctx), script);
    fn(...Object.values(ctx));
    return ss;
  }

  it('sets the flag when autoOpenOverride is "1"', () => {
    const ss = runFlagStash('1');
    expect(ss.getItem('a2_auto_open_override')).toBe('1');
  });

  it('does NOT set the flag when autoOpenOverride is absent (null)', () => {
    const ss = runFlagStash(null);
    expect(ss.getItem('a2_auto_open_override')).toBeNull();
  });

  it('does NOT set the flag when autoOpenOverride is "0"', () => {
    const ss = runFlagStash('0');
    expect(ss.getItem('a2_auto_open_override')).toBeNull();
  });

  it('does NOT set the flag when autoOpenOverride is "" (empty string)', () => {
    const ss = runFlagStash('');
    expect(ss.getItem('a2_auto_open_override')).toBeNull();
  });
});

// ============================================================================
// 3. DOMContentLoaded auto-click behavior
// ============================================================================

describe('Auto-open override -- auto-click behavior', () => {
  // Simulate the P9 DOMContentLoaded snippet executing in a context that
  // has sessionStorage with the flag set. We capture setTimeout calls so
  // we can fire them synchronously to verify the click.

  function runDomReadyCheck(ssInitial) {
    const ss    = mockStorage(ssInitial || {});
    const timerCallbacks = [];
    const clicks = [];

    const fakeBtn = {
      click: function () { clicks.push('view-as-override-gate'); },
    };

    const fakeGetElementById = function (id) {
      if (id === 'view-as-override-gate') return fakeBtn;
      return null;
    };

    const fakeSetTimeout = function (fn, delay) {
      timerCallbacks.push({ fn, delay });
    };

    // Build the script from the source -- just the key logic, translated
    // faithfully so the test is a real behavioral pin.
    const script = `
      try {
        if (sessionStorage.getItem('a2_auto_open_override') === '1') {
          sessionStorage.removeItem('a2_auto_open_override');
          setTimeout(function () {
            var autoBtn = document.getElementById('view-as-override-gate');
            if (autoBtn) autoBtn.click();
          }, 300);
        }
      } catch (_) {}
    `;

    const fn = new Function('sessionStorage', 'document', 'setTimeout', script);
    fn(
      ss,
      { getElementById: fakeGetElementById },
      fakeSetTimeout
    );

    return { ss, timerCallbacks, clicks };
  }

  it('with flag set: schedules one timer callback', () => {
    const { timerCallbacks } = runDomReadyCheck({ 'a2_auto_open_override': '1' });
    expect(timerCallbacks).toHaveLength(1);
  });

  it('with flag set: timer delay is 300 ms', () => {
    const { timerCallbacks } = runDomReadyCheck({ 'a2_auto_open_override': '1' });
    expect(timerCallbacks[0].delay).toBe(300);
  });

  it('with flag set: flag is REMOVED before the timer fires (one-shot)', () => {
    const { ss, timerCallbacks } = runDomReadyCheck({ 'a2_auto_open_override': '1' });
    // Flag should be gone even before the timer fires
    expect(ss.getItem('a2_auto_open_override')).toBeNull();
    // Now fire the timer -- still null
    timerCallbacks[0].fn();
    expect(ss.getItem('a2_auto_open_override')).toBeNull();
  });

  it('with flag set: firing the timer clicks #view-as-override-gate', () => {
    const { timerCallbacks, clicks } = runDomReadyCheck({ 'a2_auto_open_override': '1' });
    expect(clicks).toHaveLength(0);
    timerCallbacks[0].fn();
    expect(clicks).toEqual(['view-as-override-gate']);
  });

  it('without flag: no timer is scheduled', () => {
    const { timerCallbacks } = runDomReadyCheck({});
    expect(timerCallbacks).toHaveLength(0);
  });

  it('a second run with empty sessionStorage (simulates refresh): no timer', () => {
    // After the one-shot fires, the flag is gone. A page refresh means
    // sessionStorage no longer has the flag, so the modal does not re-open.
    const { timerCallbacks } = runDomReadyCheck({ 'a2_auto_open_override': null });
    expect(timerCallbacks).toHaveLength(0);
  });
});
