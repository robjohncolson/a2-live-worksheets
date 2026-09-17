import { it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { buildSkillMap, readSheet } from '../scripts/build-ixl-skill-map.mjs';

const committed = JSON.parse(readFileSync('data/ixl-algebra2-skills.json', 'utf8'));
const sourceFile = readdirSync('data/sources').filter(f => /^IXL_Algebra2_.*\.xlsx$/.test(f)).sort().at(-1);
const fresh = buildSkillMap(readSheet(readFileSync(`data/sources/${sourceFile}`), 'All Skills'), sourceFile);
const byCode = Object.fromEntries(committed.skills.map(s => [s.code, s]));

it('data/ixl-algebra2-skills.json is the generator output for the workbook in data/sources', () => {
  expect(committed).toEqual(fresh);
  expect(committed.source).toBe(`data/sources/${sourceFile}`);
});

it('covers all 395 Algebra 2 skills with unique shortcut codes and directory IDs', () => {
  expect(committed.count).toBe(395);
  expect(committed.skills).toHaveLength(395);
  expect(new Set(committed.skills.map(s => s.code)).size).toBe(395);
  expect(new Set(committed.skills.map(s => s.directoryId)).size).toBe(395);
  for (const s of committed.skills) {
    expect(s.code).toMatch(/^[0-9A-Z]{3}$/);
    expect(s.directoryId).toMatch(/^[A-Z]{1,2}\.\d+$/);
    expect(s.skill.length).toBeGreaterThan(0);
    expect(s.search).toBe(`https://www.ixl.com/search?q=${s.code}`);
  }
});

it('resolves the codes the day log and 1-1 already use', () => {
  expect(byCode.PS2).toMatchObject({ directoryId: 'A.3', skill: 'Evaluate functions', url: 'https://www.ixl.com/math/algebra-2/evaluate-functions' });
  expect(byCode.FS8).toMatchObject({ directoryId: 'A.4', skill: 'Find values using function graphs' });
  expect(byCode.W5Z).toMatchObject({ directoryId: 'A.5', skill: 'Complete a table for a function graph' });
  expect(byCode['78A']).toMatchObject({ directoryId: 'A.1', skill: 'Domain and range', strand: 'Function concepts' });
});

it('every skill page URL in lessons.json and the day log matches the lookup when it names a code', () => {
  const dayLog = JSON.parse(readFileSync('content/a2/day-log.json', 'utf8'));
  for (const links of Object.values(dayLog.resources || {})) {
    for (const link of links) {
      const code = /\(([0-9A-Z]{3})\)\s*$/.exec(link.label)?.[1];
      if (!code || !/ixl\.com/.test(link.url)) continue;
      expect(byCode[code], `${code} in day-log resources`).toBeDefined();
      expect(link.url).toBe(byCode[code].url);
    }
  }
});
