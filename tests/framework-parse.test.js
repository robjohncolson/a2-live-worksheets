// @vitest-environment node
// Legacy parser grammar is exercised with synthetic Algebra 2 prose, not a curriculum taxonomy.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFrameworks, parseSingleFramework } from '../scripts/lib/framework-parse.mjs';

let root;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'a2-framework-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('retained framework parser', () => {
  it('extracts, deduplicates and sorts direct skills and topic numbers', () => {
    const path = join(root, 'synthetic.md');
    writeFileSync(path, '## TOPIC 1.10 Function notation\n| LO | [Skill 2.B] [Skill 1.A] [Skill 2.B] |\n## **TOPIC 1.2** Domain\n* **3.C** Explain the domain\n[Skill 9.Z]\n');
    const parsed = parseSingleFramework(path, 1);
    expect(parsed.missing).toBe(false);
    expect(parsed.malformed).toBe(false);
    expect(parsed.topics).toEqual([
      { topicNum: '1.2', skills: ['3.C'], los: [], eks: [] },
      { topicNum: '1.10', skills: ['1.A', '2.B'], los: [], eks: [] },
    ]);
    expect([...parsed.skillsMentioned].sort()).toEqual(['1.A', '2.B', '3.C']);
  });

  it('fills empty and missing topic blocks from the glance table without overriding direct skills', () => {
    const path = join(root, 'synthetic.md');
    writeFileSync(path, '## UNIT AT A GLANCE\n| EU | 1.1 Domain | **2.B** Explain |\n| EU | 1.2 Range | 3.C Interpret |\n| EU | 1.3 Synthesis | N/A |\n## TOPIC 1.1 Domain\n[Skill 1.A]\n## TOPIC 1.2 Range\nNo skill annotation here.\n');
    expect(parseSingleFramework(path, 1).topics.map(({ topicNum, skills }) => [topicNum, skills])).toEqual([
      ['1.1', ['1.A']], ['1.2', ['3.C']], ['1.3', []],
    ]);
  });

  it('reports malformed input while recovering the glance table', () => {
    // This filename is the retained reader contract, not authored AP content.
    writeFileSync(join(root, 'apstat_1_framework.md'), '## UNIT AT A GLANCE\n| EU | 1.1 Domain | 1.A Describe |\n');
    expect(parseFrameworks(root)).toEqual({ topicSkills: { '1.1': ['1.A'] }, malformed: ['apstat_1_framework.md'] });
  });

  it('distinguishes missing input from an existing malformed file', () => {
    const path = join(root, 'missing.md');
    expect(parseSingleFramework(path, 1)).toMatchObject({ topics: [], missing: true, malformed: false });
    expect(parseFrameworks(root)).toEqual({ topicSkills: {}, malformed: [] });
    writeFileSync(path, 'This file contains no parser headings.');
    expect(parseSingleFramework(path, 1)).toMatchObject({ topics: [], missing: false, malformed: true });
  });
});
