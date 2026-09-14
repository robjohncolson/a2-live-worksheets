/**
 * tests/desk-menus.test.js — menu polish (2026-08-20): every menu item does
 * something; the only greyed item left is the "Full Year" placeholder.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(resolve(__dirname, '..', 'desk.html'), 'utf-8');
const menuBar = html.slice(html.indexOf('<span class="menu-item" data-menu="file">'), html.indexOf('<span class="menu-spacer">'));

describe('Desk menus', () => {
  it('menu bar order: File Edit View Go Apps User Teacher Special Help', () => {
    const names = [...menuBar.matchAll(/data-menu="([a-z]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(['file', 'edit', 'view', 'go', 'apps', 'student', 'teacher', 'special', 'help']);
  });
  it('every menu item is actionable except the Full Year placeholder', () => {
    const items = [...menuBar.matchAll(/<div class="menu-dd-item([^"]*)"([^>]*)>/g)];
    expect(items.length).toBeGreaterThan(20);
    for (const [, classes, attrs] of items) {
      if (classes.includes('disabled')) {
        expect(attrs, 'only the Full Year placeholder may be greyed').toMatch(/One school-year calendar|id="menu-student-status"|Teacher tools|font-style:italic/);
        continue;
      }
      expect(attrs, `item without onclick: ${attrs}`).toMatch(/onclick=/);
    }
    // the old System-7 filler is gone
    expect(menuBar).not.toMatch(/>Undo </);
    expect(menuBar).not.toMatch(/>Paste </);
    expect(menuBar).not.toMatch(/Remove Label/);
    expect(menuBar).not.toMatch(/>by Name</);
  });
  it('Go menu reaches the other surfaces; View menu drives the calendar; Help has About', () => {
    expect(menuBar).toMatch(/start-here\.html/);
    expect(menuBar).toMatch(/TOC\.html/);
    expect(menuBar).toMatch(/study_guide_diagnostic\.html/);
    expect(menuBar).toMatch(/mobile-home\.html/);
    expect(menuBar).toMatch(/calToday\(\)/);
    expect(menuBar).toMatch(/calStep\(-1\)/);
    expect(menuBar).toMatch(/calStep\(1\)/);
    expect(menuBar).toMatch(/_menuAbout\(\)/);
    expect(menuBar).toMatch(/_menuShowDoNow\(\)/);
  });
  it('Sound item carries a live check-mark and Escape closes menus', () => {
    expect(html).toMatch(/function _renderMenuChecks\(\)/);
    expect(html).toMatch(/id="menu-sound-toggle"/);
    expect(html).toMatch(/e\.key === 'Escape' && openMenuId\) closeMenus\(\)/);
    expect(html).toMatch(/_renderSoundIcon\(\);\s*try \{ _renderMenuChecks\(\); \} catch/);
  });
});
