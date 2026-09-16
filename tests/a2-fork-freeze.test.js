// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT_PATH = 'data/a2-fork-audit.json';
const AUDIT = JSON.parse(readFileSync(resolve(ROOT, AUDIT_PATH), 'utf8'));
const PLAN = readFileSync(resolve(ROOT, 'A2_FORK_PLAN.md'), 'utf8');
const SKIP = new Set(['node_modules', '.git', '.gitnexus', 'state', 'coverage', '__pycache__', '.pytest_cache']);
const RUNTIME = new Set(['.html', '.js', '.mjs', '.css', '.json', '.py', '.ps1']);

function repositoryFiles(directory = ROOT, prefix = '') {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (SKIP.has(entry.name) || path === 'docs/apstats-history') continue;
    // Do not follow junctions or symlinks outside this checkout.
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) files.push(...repositoryFiles(resolve(directory, entry.name), path + '/'));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

// Keep offsets while masking comments and strings. Search the mask for loads,
// then inspect their literal arguments; prose mentioning fetch() is not a load.
function lexSource(source, path) {
  const literals = [];
  const python = extname(path) === '.py';
  const hashComments = python || extname(path) === '.ps1';
  const tokens = /\x22{3}[\s\S]*?\x22{3}|\x27{3}[\s\S]*?\x27{3}|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|<#[\s\S]*?#>|\/\/[^\r\n]*|#[^\r\n]*/g;
  const mask = source.replace(tokens, (token, offset) => {
    if (token.startsWith('#') && !hashComments) return token;
    const triple = /^(?:\x22{3}|\x27{3})/.test(token);
    if (/^["'`]/.test(token) && !(python && triple)) {
      literals.push({ value: token.slice(1, -1), start: offset, end: offset + token.length });
    }
    return token.replace(/[^\r\n]/g, ' ');
  });
  return { mask, literals };
}

function loadReferences(source, path) {
  const { mask, literals } = lexSource(source, path);
  const spans = [];
  for (const match of mask.matchAll(/\b(?:require|fetch|readFileSync|open|import|URL)\s*\(/g)) {
    let depth = 1;
    let end = match.index + match[0].length;
    for (; end < mask.length && depth > 0; end++) {
      if (mask[end] === '(') depth++;
      if (mask[end] === ')') depth--;
    }
    spans.push([match.index, end]);
  }
  for (const match of mask.matchAll(/<(?:script\b[^>]*\bsrc|link\b[^>]*\bhref)\s*=[^>]*>/gi)) {
    spans.push([match.index, match.index + match[0].length]);
  }
  for (const match of mask.matchAll(/(?:^|[;\n])\s*import\b(?!\s*\()|\bexport\s+(?:\*|\{)[^;]*?\bfrom\b/g)) {
    const start = match.index;
    const semicolon = mask.indexOf(';', start + match[0].length);
    const newline = mask.indexOf('\n', start + match[0].length);
    const end = semicolon >= 0 ? semicolon : newline >= 0 ? newline : mask.length;
    spans.push([start, end]);
  }
  if (extname(path) === '.css') {
    for (const match of mask.matchAll(/\burl\s*\([^)]*\)|@import[^;]*;/g)) {
      spans.push([match.index, match.index + match[0].length]);
    }
  }
  return literals.filter(literal => spans.some(([start, end]) => literal.start >= start && literal.end <= end));
}

function removedReferences(source, keptPath, removedPaths) {
  const hits = [];
  for (const literal of loadReferences(source, keptPath)) {
    const value = literal.value.replace(/\\\\/g, '/').replace(/\\\//g, '/').split(/[?#]/)[0];
    const local = value.replace(/^(?:\.\/|\/)+/, '');
    for (const removedPath of removedPaths) {
      if (local !== removedPath && local !== basename(removedPath)) continue;
      // A surviving namesake in this consumer's directory is a different file.
      const relative = resolve(ROOT, dirname(keptPath), value);
      const rootRelative = resolve(ROOT, local);
      if (relative !== resolve(ROOT, removedPath) && existsSync(relative)) continue;
      if (rootRelative !== resolve(ROOT, removedPath) && existsSync(rootRelative)) continue;
      const line = source.slice(0, literal.start).split('\n').length;
      hits.push(`${keptPath}:${line} loads removed ${removedPath} (${literal.value})`);
    }
  }
  return hits;
}

function globRegex(pattern) {
  const escaped = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*');
  return new RegExp('^' + escaped + (pattern.endsWith('/') ? '.*' : '') + '$');
}

function planDeletionPatterns(plan) {
  const phase1 = plan.split('## Phase 1 ')[1]?.split('## Phase 2 ')[0];
  const phase2 = plan.split('## Phase 2 ')[1]?.split('## Phase 3 ')[0];
  expect(phase1, 'A2_FORK_PLAN.md: missing Phase 1 strip list').toBeTruthy();
  expect(phase2, 'A2_FORK_PLAN.md: missing Phase 2 strip list').toBeTruthy();
  const quoted = text => [...text.matchAll(/`([^`]+)`/g)].map(match => match[1]);
  const dokKeep = new Set(['dok/', 'dok/build_ladder.py', 'compile.ps1', 'README.md']);
  const dokChildren = new Set(['lessons/', 'registry/', 'tex/', 'pdf/', 'archive/']);
  const patterns = quoted(phase1.split('- Move ')[0]).filter(path => !dokKeep.has(path)).map(path => {
    if (dokChildren.has(path)) return 'dok/' + path;
    if (path === 'postbreak_calendar') return path + '*';
    return path;
  });
  for (let unit = 1; unit <= 9; unit++) patterns.push(`u${unit}/`);
  patterns.push('*_SPEC.md', '*_BUILD.md');
  const server = phase2.split('- roster-server:')[1]?.split('- Desk ')[0];
  const desk = phase2.split('- Desk ')[1]?.split('- Delete ')[0];
  expect(server, 'A2_FORK_PLAN.md: missing server strip list').toBeTruthy();
  expect(desk, 'A2_FORK_PLAN.md: missing Desk strip list').toBeTruthy();
  patterns.push(...quoted(server).filter(path => path !== 'server.js').map(path => 'roster-server/' + path));
  patterns.push(...quoted(desk).filter(path => path !== 'icons/'));
  // The plan names pico/doge sprites, not every retained icon.
  patterns.push('icons/*pico*', 'icons/*doge*');
  return [...new Set(patterns)].map(pattern => ({ pattern, regex: globRegex(pattern) }));
}

const FILES = repositoryFiles();

describe('frozen Algebra 2 fork classification', () => {
  it('validates provenance, classes, sorted unique paths and disjoint sets', () => {
    expect(AUDIT.version).toBe(1);
    expect(AUDIT.baseline).toEqual({ repo: 'robjohncolson/' + 'apstats-live-worksheet', commit: '68d3e61' });
    const groups = [AUDIT.removed.map(row => row.path), AUDIT.restoredFromBaseline, AUDIT.a2Additions];
    const seen = new Set();
    for (const paths of groups) {
      expect(Array.isArray(paths)).toBe(true);
      expect(paths).toEqual([...paths].sort());
      for (const path of paths) {
        expect(path, `${AUDIT_PATH}: invalid path ${path}`).toMatch(/^(?!\/|[A-Za-z]:|.*\\|.*(?:^|\/)\.\.(?:\/|$)).+/);
        expect(seen.has(path), `${AUDIT_PATH}: duplicate or overlapping path ${path}`).toBe(false);
        seen.add(path);
      }
    }
    for (const row of AUDIT.removed) {
      expect(Object.keys(row).sort(), row.path).toEqual(['class', 'path']);
      expect(['STRIP-CONTENT', 'STRIP-FEATURE', 'HISTORY'], row.path).toContain(row.class);
    }
    expect(Object.keys(AUDIT.decisions).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `D${i + 1}`).sort());
    for (const [decision, status] of Object.entries(AUDIT.decisions)) expect(status, decision).toBe('pending');
    expect(AUDIT.a2Additions.some(path => path.startsWith('docs/apstats-history/'))).toBe(false);
  });

  it('keeps approved removals absent and baseline restorations present', () => {
    for (const { path } of AUDIT.removed) {
      expect(existsSync(resolve(ROOT, path)), `${AUDIT_PATH}: removed path reappeared: ${path}`).toBe(false);
    }
    for (const path of AUDIT.restoredFromBaseline) {
      expect(existsSync(resolve(ROOT, path)), `${AUDIT_PATH}: restored path disappeared: ${path}`).toBe(true);
    }
  });

  it('has no kept runtime loader referencing an approved removed path', () => {
    const failures = [];
    const removedPaths = AUDIT.removed.map(row => row.path);
    for (const path of FILES) {
      if (path.split('/').includes('tests') || /\.(?:test|spec)\./.test(path)) continue;
      if (!RUNTIME.has(extname(path))) continue;
      failures.push(...removedReferences(readFileSync(resolve(ROOT, path), 'utf8'), path, removedPaths));
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('requires explicit audit entries for surviving plan-listed deletions', () => {
    const patterns = planDeletionPatterns(PLAN);
    // Phase 4 reversed individual deletions, including the five Desk sounds.
    // Only enumerated restorations are exempt. roadmap-data.json is explicitly
    // A2-ADD despite being a replacement at an inherited filename.
    const allowed = new Set([...AUDIT.a2Additions, ...AUDIT.restoredFromBaseline]);
    const renameSection = PLAN.split('## Phase 3 ')[1]?.split('## Phase 4 ')[0] || '';
    for (const match of renameSection.matchAll(/`([^`]+)`\s*\u2192\s*`([^`]+)`/g)) allowed.add(match[2]);
    const failures = [];
    for (const path of FILES) {
      if (allowed.has(path)) continue;
      const rule = patterns.find(({ regex }) => regex.test(path));
      if (rule) failures.push(`A2_FORK_PLAN.md: kept ${path} matches deletion ${rule.pattern}; classify it in ${AUDIT_PATH}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('pins the hand-maintained audit in the lineage manifest', () => {
    const lineage = JSON.parse(readFileSync(resolve(ROOT, 'data/lineage.json'), 'utf8'));
    const entries = lineage.artifacts.filter(row => row.path === AUDIT_PATH);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 'a2-fork-audit', kind: 'source', inputs: [], regenerate: null });
    expect(entries[0].pinnedBy).toEqual(['tests/a2-fork-freeze.test.js']);
  });
});

// Pin scanner boundaries without untracked reports or the AP checkout in CI.
describe('fork reference heuristic', () => {
  it.each([
    ['script', '<script src="retired.js"></script>'],
    ['stylesheet', '<link href="retired.js" rel="stylesheet">'],
    ['static import', 'import value from "retired.js";'],
    ['side-effect import', 'import "retired.js";'],
    ['dynamic import', 'import("retired.js")'],
    ['require', 'require("retired.js")'],
    ['fetch', 'fetch(\n "retired.js"\n)'],
    ['read', 'readFileSync(resolve(ROOT, "retired.js"), "utf8")'],
    ['Python open', 'open("retired.js")'],
    ['URL', 'new URL("retired.js", import.meta.url)'],
  ])('detects %s by basename', (_, source) => {
    expect(removedReferences(source, 'example.js', ['gone/retired.js'])).toHaveLength(1);
  });

  it('matches full paths and ignores comments, prose and longer filenames', () => {
    expect(removedReferences('fetch("gone/retired.js")', 'example.js', ['gone/retired.js'])).toHaveLength(1);
    const source = [
      '// fetch("retired.js")',
      '/* require("retired.js") */',
      '<!-- <script src="retired.js"></script> -->',
      'const prose = "fetch(\'retired.js\') is historical";',
      'fetch("not-retired.js");',
    ].join('\n');
    expect(removedReferences(source, 'example.js', ['gone/retired.js'])).toEqual([]);
    expect(removedReferences('# open("retired.js")', 'example.py', ['gone/retired.js'])).toEqual([]);
  });
});
