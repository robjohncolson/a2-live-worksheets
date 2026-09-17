#!/usr/bin/env node
// Builds data/ixl-algebra2-skills.json, the IXL Algebra 2 code -> skill lookup, from the
// teacher's workbook data/sources/IXL_Algebra2_All_395_Skills_with_Shortcuts_<date>.xlsx
// ("All Skills" sheet). The shortcut code (PS2, W5Z, ...) is IXL's permanent skill ID and
// the identifier the teacher uses when naming Group Jam skills; the directory ID (A.3) is
// the skill's current position in IXL's Algebra 2 list and can move between years.
//
//   node scripts/build-ixl-skill-map.mjs            # rewrites data/ixl-algebra2-skills.json
//   node scripts/build-ixl-skill-map.mjs --check    # exits 1 when the committed JSON is stale
//   node scripts/build-ixl-skill-map.mjs --print    # prints the JSON without writing
//
// The workbook's Source URL column is the directory page, not the skill page, so `url`
// is only filled from KNOWN_URLS (skill pages already linked from lessons.json or the
// day log); every skill carries `search`, IXL's search URL for its code, which opens the
// skill page when pasted into the site's search box. No npm xlsx dependency: the sheet
// is read with a minimal zip + SpreadsheetML parser below.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = resolve(ROOT, 'data/sources');
const OUT = resolve(ROOT, 'data/ixl-algebra2-skills.json');
const SHEET = 'All Skills';

// Skill pages already in use on the Desk. Add here when a new one is verified.
const KNOWN_URLS = {
  '78A': 'https://www.ixl.com/math/algebra-2/domain-and-range',
  PS2: 'https://www.ixl.com/math/algebra-2/evaluate-functions',
  FS8: 'https://www.ixl.com/math/algebra-2/find-values-using-function-graphs',
  W5Z: 'https://www.ixl.com/math/algebra-2/complete-a-table-for-a-function-graph',
};

// --- minimal zip reader (stored + deflate entries) ---------------------------------
export function unzip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + csize);
    files.set(name, () => (method === 8 ? inflateRawSync(raw) : Buffer.from(raw)).toString('utf8'));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// Tag regexes tolerate a namespace prefix (some writers emit <x:sheet>, <x:row>, <x:c>).
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const textOf = (xml) => decode([...xml.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => m[1]).join(''));
const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

// Returns the rows of one worksheet as arrays of strings (null for empty cells).
export function readSheet(buf, sheetName) {
  const files = unzip(buf);
  const wb = files.get('xl/workbook.xml')();
  const sheet = [...wb.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)].map((m) => m[0])
    .find((tag) => decode(/name="([^"]*)"/.exec(tag)[1]) === sheetName);
  if (!sheet) throw new Error(`sheet "${sheetName}" not in workbook`);
  const rid = /r:id="([^"]*)"/.exec(sheet)[1];
  const rels = files.get('xl/_rels/workbook.xml.rels')();
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`Id="${rid}"`));
  const target = /Target="([^"]*)"/.exec(rel)[1].replace(/^\/?(xl\/)?/, '');
  const shared = files.has('xl/sharedStrings.xml')
    ? [...files.get('xl/sharedStrings.xml')().matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => textOf(m[1])) : [];
  const xml = files.get(`xl/${target}`)();
  const rows = [];
  for (const [, rowXml] of xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const row = [];
    for (const [, attrs, inner] of rowXml.matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)[1];
      const type = /t="([^"]*)"/.exec(attrs)?.[1];
      let value = null;
      if (inner) {
        if (type === 's') value = shared[+/<(?:\w+:)?v>([^<]*)<\/(?:\w+:)?v>/.exec(inner)[1]];
        else if (type === 'inlineStr') value = textOf(inner);
        else value = decode(/<(?:\w+:)?v>([^<]*)<\/(?:\w+:)?v>/.exec(inner)?.[1] ?? '');
      }
      row[colIndex(ref)] = value === '' ? null : value;
    }
    rows.push(row);
  }
  return rows;
}

// --- skill map -------------------------------------------------------------------
export function buildSkillMap(rows, sourceFile) {
  const header = rows[0].map((h) => (h || '').trim());
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`column "${name}" missing; have ${header.join(', ')}`);
    return i;
  };
  const c = { dir: col('Directory ID'), code: col('Shortcut'), section: col('IXL Section'), strand: col('IXL Strand'),
    skill: col('Skill'), domain: col('Instructional Domain'), role: col('Course Role') };
  const skills = [];
  const seen = new Set();
  for (const row of rows.slice(1)) {
    const code = (row[c.code] || '').trim();
    if (!code) continue;
    if (seen.has(code)) throw new Error(`duplicate shortcut ${code}`);
    seen.add(code);
    skills.push({
      code,
      directoryId: row[c.dir].trim(),
      section: row[c.section].trim(),
      strand: row[c.strand].trim(),
      skill: row[c.skill].trim(),
      domain: row[c.domain].trim(),
      role: row[c.role].trim(),
      url: KNOWN_URLS[code] || null,
      search: `https://www.ixl.com/search?q=${encodeURIComponent(code)}`,
    });
  }
  const snapshot = /(\d{4}-\d{2}-\d{2})/.exec(sourceFile)?.[1] || null;
  return {
    about: "IXL Algebra 2 skills keyed by shortcut code (IXL's permanent skill ID, e.g. PS2). directoryId is the "
      + "position in the Algebra 2 list on the snapshot date and can move; domain and role are the teacher's planning "
      + 'labels, not IXL\'s. url is a verified skill page (null until verified); search opens IXL search for the code. '
      + 'Generated by scripts/build-ixl-skill-map.mjs from the workbook in data/sources; do not edit by hand.',
    source: `data/sources/${sourceFile}`,
    snapshot,
    count: skills.length,
    skills,
  };
}

function main() {
  const args = process.argv.slice(2);
  const sourceFile = readdirSync(SOURCES).filter((f) => /^IXL_Algebra2_.*\.xlsx$/.test(f)).sort().at(-1);
  if (!sourceFile) throw new Error(`no IXL_Algebra2_*.xlsx in ${SOURCES}`);
  const rows = readSheet(readFileSync(resolve(SOURCES, sourceFile)), SHEET);
  const json = JSON.stringify(buildSkillMap(rows, sourceFile), null, 2) + '\n';
  if (args.includes('--print')) {
    process.stdout.write(json);
  } else if (args.includes('--check')) {
    let current = '';
    try { current = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
    if (current !== json) { console.error(`${OUT} is stale; run node scripts/build-ixl-skill-map.mjs`); process.exit(1); }
    console.log('data/ixl-algebra2-skills.json is current');
  } else {
    writeFileSync(OUT, json);
    console.log(`wrote data/ixl-algebra2-skills.json (${JSON.parse(json).count} skills from ${sourceFile})`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
