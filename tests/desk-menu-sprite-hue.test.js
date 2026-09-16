// desk-menu-sprite-hue.test.js — the menu-bar "Pico Park" walker doubles as a
// "this is YOU" indicator: it is tinted to the signed-in student's shared
// roster sprite_hue, so a colored walker confirms username/hue storage is loading.
// These source checks require no classroom board or production sprite asset.
// Structural pins on the menu-sprite animator IIFE.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');

// Slice the menu-sprite animator IIFE: from its banner comment to the next
// top-level function (closeMenus), so assertions are scoped to the walker.
function menuSpriteBlock(src) {
  const start = src.indexOf('Pico Park menu sprite animator');
  const end = src.indexOf('function closeMenus', start);
  if (start < 0 || end < 0) throw new Error('menu sprite block not found');
  return src.slice(start, end);
}

describe('Desk menu-bar walker — tinted to the roster sprite_hue (storage indicator)', () => {
  const block = menuSpriteBlock(DESK);

  it('reads the shared roster session hue via rosterClient.current().spriteHue', () => {
    expect(block).toMatch(/rosterClient\.current\(\)/);
    expect(block).toMatch(/\.spriteHue/);
  });

  it('only honors a numeric hue (else falls back to 0 = base sprite)', () => {
    expect(block).toMatch(/typeof\s+\w+\.spriteHue\s*===\s*'number'/);
  });

  it('tints the draw with hue-rotate from the resolved hue', () => {
    expect(block).toMatch(/ctx\.filter\s*=\s*hue\s*\?/);
    expect(block).toMatch(/hue-rotate\(/);
  });

  it('clears the filter after the draw so clearRect / the jump transform are unaffected', () => {
    expect(block).toMatch(/ctx\.filter\s*=\s*'none'/);
  });

  it('refreshes the hue periodically so a post-load sign-in recolors the walker', () => {
    expect(block).toMatch(/_readSpriteHue\(\)/);
    expect(block).toMatch(/hueTimer/);
  });
});
