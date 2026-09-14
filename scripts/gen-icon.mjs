#!/usr/bin/env node
// gen-icon.mjs — generate raster PWA icons (icon-192.png, icon-512.png) so the
// app meets Chrome's installability criteria (it wants a >=192px raster icon).
// Full-bleed navy + the AP-stats bar chart (maskable-safe; OS masks the corners).
// No external rasterizer needed — drawn directly with pngjs. Re-run after editing.
import { PNG } from 'pngjs';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BG = [0x1d, 0x2b, 0x53];
const BARS = [
  { x: 116, w: 58, top: 300, color: [0x29, 0xad, 0xff] },
  { x: 198, w: 58, top: 252, color: [0x00, 0xe4, 0x36] },
  { x: 280, w: 58, top: 208, color: [0xff, 0xec, 0x27] },
  { x: 362, w: 58, top: 168, color: [0xff, 0x77, 0xa8] },
];
const BASE = 396; // bar bottom, in the 512 design space

function draw(size) {
  const s = size / 512;
  const png = new PNG({ width: size, height: size });
  const put = (x, y, c) => { const i = (size * y + x) << 2; png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255; };
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) put(x, y, BG);
  for (const b of BARS) {
    const x0 = Math.round(b.x * s), x1 = Math.round((b.x + b.w) * s);
    const y0 = Math.round(b.top * s), y1 = Math.round(BASE * s);
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) put(x, y, b.color);
  }
  return PNG.sync.write(png);
}

for (const size of [192, 512]) {
  const out = resolve(root, `icon-${size}.png`);
  writeFileSync(out, draw(size));
  console.log('wrote ' + out + ' (' + size + 'x' + size + ')');
}
