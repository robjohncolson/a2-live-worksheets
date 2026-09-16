// @vitest-environment node
// Retained study-guide palette and contrast coverage. The removed theme codemod,
// AP worksheet rollout, and TI-84 trainer are intentionally outside this suite.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  expect(match, `missing CSS block: ${selector}`).not.toBeNull();
  return match[1];
}

function cssToken(block, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`${escaped}\\s*:\\s*([^;]+);`));
  expect(match, `missing CSS token: ${name}`).not.toBeNull();
  return match[1].trim();
}

function parseHexColor(value) {
  const match = value.match(/^#([\da-f]{6})$/i);
  expect(match, `expected six-digit hex color, received: ${value}`).not.toBeNull();
  return [0, 2, 4].map(offset => parseInt(match[1].slice(offset, offset + 2), 16));
}

function relativeLuminance(value) {
  const channels = parseHexColor(value).map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function expectContrast(block, foregroundToken, backgroundToken, minimum, label) {
  const ratio = contrastRatio(cssToken(block, foregroundToken), cssToken(block, backgroundToken));
  expect(ratio, label).toBeGreaterThanOrEqual(minimum);
}

describe('Tango theme on the Algebra 2 diagnostic study guide', () => {
  it('pins the diagnostic study guide tokens and retires the old palette', () => {
    const source = fs.readFileSync(path.join(ROOT, 'study_guide_diagnostic.html'), 'utf8');
    const expected = {
      '--sg-bg': '#E5E3D2',
      '--sg-bg-hi': '#F3F1E8',
      '--sg-border': '#A9A79A',
      '--sg-text': '#161616',
      '--sg-bg-card': '#F7F5EE',
      '--sg-accent-fill': '#FF5B19',
      '--sg-accent': '#A8330A',
      '--sg-secondary': '#AECACD',
      '--sg-secondary-ink': '#2F5A5E',
      '--sg-mastery-high': '#25663F',
      '--sg-ok-bg': '#DEF0D3',
      '--sg-mastery-low': '#B03A2E',
      '--sg-bad-bg': '#F1DDD3',
      '--sg-mastery-mid': '#8A6D12',
      '--sg-warn-bg': '#F1EBC4',
      '--sg-text-dim': '#6E6C62'
    };

    for (const selector of [':root', ':root[data-theme="paper"]']) {
      const block = cssBlock(source, selector);
      for (const [token, value] of Object.entries(expected)) {
        expect(cssToken(block, token), `${selector} ${token}`).toBe(value);
      }
    }

    expect(source).toMatch(/\.header\{[^}]*border-bottom:3px solid var\(--sg-accent-fill\)/);
    expect(source).not.toMatch(/#(?:7a4a1f|f7f2e8|d8ccb0|2a2520|6ca6ff|36A2EB|1d4ed8)/i);
    expect(source).not.toMatch(/\bhsl[a]?\(/i);
    expect(source).not.toMatch(/\brgb\(/i);
  });

  it('study-guide foreground, border, focus, and semantic roles clear their local surfaces', () => {
    const source = fs.readFileSync(path.join(ROOT, 'study_guide_diagnostic.html'), 'utf8');

    for (const selector of [':root', ':root[data-theme="paper"]', ':root[data-theme="night"]']) {
      const block = cssBlock(source, selector);
      expectContrast(block, '--sg-text', '--sg-bg', 4.5, `${selector} body text`);
      expectContrast(block, '--sg-text-dim', '--sg-bg-card', 4.5, `${selector} card muted text`);
      expectContrast(block, '--sg-text-context', '--sg-bg', 4.5, `${selector} contextual text on page`);
      expectContrast(block, '--sg-text-context', '--sg-bar-track', 4.5, `${selector} contextual text on track`);
      expectContrast(block, '--sg-control-border', '--sg-bg', 3, `${selector} control border on page`);
      expectContrast(block, '--sg-control-border', '--sg-bg-card', 3, `${selector} control border on card`);
      expectContrast(block, '--sg-control-border', '--sg-bar-track', 3, `${selector} control border on track`);
      expectContrast(block, '--sg-focus-ring', '--sg-bg', 3, `${selector} focus on page`);
      expectContrast(block, '--sg-focus-ring', '--sg-bg-card', 3, `${selector} focus on card`);

      for (const role of ['low', 'mid', 'high']) {
        expectContrast(block, `--sg-mastery-${role}-ink`, '--sg-bg-card', 4.5, `${selector} ${role} ink on card`);
        expectContrast(block, `--sg-mastery-${role}-ink`, '--sg-bg-hi', 4.5, `${selector} ${role} ink on raised surface`);
        expectContrast(block, '--sg-on-strong', `--sg-mastery-${role}`, 4.5, `${selector} text on ${role} fill`);
      }

      expectContrast(block, '--sg-on-accent', '--sg-accent-fill', 4.5, `${selector} text on accent fill`);
    }
  });

});
