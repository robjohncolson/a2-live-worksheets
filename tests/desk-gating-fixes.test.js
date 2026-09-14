/**
 * tests/desk-gating-fixes.test.js
 *
 * Regression pins for the 2026-06-03 Desk bug cluster:
 *  1. localLessonState requires the lesson's GATE artifacts (worksheet+Blooket),
 *     not any single artifact — behavioral coverage is in calendar-polish A8/A8c.
 *  2. The alt-tab modal: renderDoNowGrades only refreshes a resource panel that
 *     is CURRENTLY OPEN (no resurrecting a closed panel on visibilitychange).
 *  3. The criteria-not-met "Done (N%)" button is reddish-grey + not pressable.
 *  4. App desktop icons render the PNG XOR the emoji (no double icon).
 *
 * Source (static) assertions over desk.html, matching
 * the style of calendar-polish.test.js.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(resolve(__dirname, '..', 'desk.html'), 'utf-8');

describe('localLessonState consolidates with the gate oracle', () => {
  it('reuses _isLessonComplete + the registry gate artifacts, not "any artifact"', () => {
    const m = html.match(/function localLessonState\([\s\S]*?\n\}/);
    const body = m ? m[0] : '';
    expect(body).toMatch(/getRegistryEntry\(topic\)/);
    expect(body).toMatch(/_isLessonComplete\(topic, marks\)/);
    expect(body).toMatch(/hasGate/);
    // the old unconditional "any done -> done" is now gated behind !hasGate
    expect(body).toMatch(/if \(anyDone\) return 'done'/);
    expect(body).toMatch(/if \(hasGate\)/);
  });
});

describe('alt-tab modal: resource panel only refreshes when OPEN', () => {
  it('the grade-fetch re-open is guarded by the overlay being visible', () => {
    // The visibilitychange → renderDoNow → grade fetch must NOT resurrect a
    // closed panel. Find the showResourcePanel re-open in the grade fetch block.
    const idx = html.indexOf('_gradeLessonsCache = Array.isArray(data.lessons)');
    expect(idx).toBeGreaterThan(-1);
    const block = html.slice(idx, idx + 900);
    expect(block).toMatch(/resource-overlay/);
    expect(block).toMatch(/_panelOpen/);
    expect(block).toMatch(/style\.display !== 'none'/);
    expect(block).toMatch(/_panelOpen && _lastResourcePanel/);
  });
});

describe('criteria-not-met Done button is reddish-grey + disabled', () => {
  it('.s7btn-locked is a reddish, not-pressable style', () => {
    const m = html.match(/\.s7btn\.s7btn-locked\s*\{[^}]*\}/);
    const css = m ? m[0] : '';
    expect(css).toMatch(/cursor:\s*not-allowed/);
    expect(css).toMatch(/#f0d6d6|#8a3a3a|#c98a8a/); // reddish palette
  });
  it('the below-threshold quiz + worksheet Done buttons use s7btn-locked + disabled', () => {
    // Both criteria-not-met branches render a disabled s7btn-locked "Done (N%)".
    const locked = html.match(/class="s7btn chicago s7btn-locked" disabled[^>]*>Done \(/g) || [];
    expect(locked.length).toBeGreaterThanOrEqual(2);
    // and they no longer use the neutral opacity:0.5 grey
    expect(html).not.toMatch(/s7btn chicago" disabled[^>]*opacity:0\.5[^>]*>Done \(/);
  });
});

describe('app desktop icons: PNG xor emoji (no duplicate)', () => {
  it('emoji is a ::after fallback toggled off by .has-png (mirrors the calendar icon)', () => {
    expect(html).toMatch(/\.app-icon \.icon-img::after\s*\{\s*content:\s*attr\(data-emoji\)/);
    expect(html).toMatch(/\.app-icon \.icon-img\.has-png::after\s*\{\s*content:\s*none/);
  });
  it('every current app-icon template carries data-emoji + an onload→has-png img (no inline emoji text)', () => {
    const dataEmoji = html.match(/class="icon-img" data-emoji="&#\d+;"/g) || [];
    // The current Desk intentionally keeps the visible desktop lean: wallet is
    // active, progress remains as a re-enable template. New app icons should keep
    // this same PNG-or-emoji fallback contract.
    expect(dataEmoji.length).toBeGreaterThanOrEqual(2);
    const onload = html.match(/onload="this\.parentElement\.classList\.add\('has-png'\)"/g) || [];
    expect(onload.length).toBeGreaterThanOrEqual(dataEmoji.length);
    // the old inline "emoji-after-img" pattern is gone from the app icons
    expect(html).not.toMatch(/icon-XXX/); // sanity: no template leftover
    expect(html).not.toMatch(/dataset\.fallback='1'">&#\d+;<\/div>/);
  });
});
