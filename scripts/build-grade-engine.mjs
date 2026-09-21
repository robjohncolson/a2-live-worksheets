// build-grade-engine.mjs — generate grade-engine.bundle.js (window.GradeEngine).
//
// ANDROID_PHASE2_LEDGER_MERGE_SPEC §0/§1.A. The student device re-derives its own
// grade OFFLINE from local signed ledger rows. To guarantee the client math never
// drifts from the server, we SHARE the server's pure grade engine rather than
// re-implementing it: this script bundles the canonical roster-server modules into
// a single classic-<script> browser global.
//
// The server files are UNTOUCHED. We transform copies in-memory:
//   - each module → its own closure with an explicit export registry (__reg), so
//     same-named helpers across modules can never collide;
//   - intra-bundle `import { a } from './x.js'` → `const { a } = __reg['x'];`;
//   - Node-builtin imports (fs/path/url) dropped;
//   - grade.js only: the fs-based BLOOKET_* reads → `[]` (the client always
//     passes blooketPresence/blooketRequired via opts after M2a; legacy
//     blooketLessons = presence), and the express `mountGrade` route dropped.
//
// The committed bundle's output is pinned EQUAL to the server's by
// tests/grade-engine-bundle-parity.test.js (drift check + client≡server on real
// fixtures). If you edit the engine, re-run `node scripts/build-grade-engine.mjs`
// or the parity test fails loudly.
//
// Usage:
//   node scripts/build-grade-engine.mjs           # write grade-engine.bundle.js
//   import { generateBundle } from './build-grade-engine.mjs'  # pure (returns string)

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRV = resolve(ROOT, 'roster-server');
const OUT = resolve(ROOT, 'grade-engine.bundle.js');

// Dependency order: a module's deps must be registered before it.
const MODULES = [
  { key: 'district-grade', file: 'district-grade.js', exports: ['A2_CATEGORIES', 'A2_FEEDERS', 'selectOnlyRaiseBonus', 'quarterGradeDistrict', 'yearGradeDistrict'] },
  { key: 'district-ledger', file: 'district-ledger.js', exports: ['districtItemsFromLedger', 'computeDistrictGrade', 'districtGradebook'] },
  { key: 'grade-config',   file: 'grade-config.js',   exports: ['PHASE3_CONFIG', 'unitNumber', 'quarterOfUnit', 'quarterOfDate'] },
  { key: 'scoring',        file: 'scoring.js',        exports: ['blooketScore', 'normalizeResponse', 'isCorrect', 'stableLedgerSort', 'latestPerItem', 'unitOf', 'answerKeyMapOrNull', 'skillMapValidOrNull', 'scoreAgainstKey'] },
  { key: 'lesson-grade',   file: 'lesson-grade.js',   exports: ['combineV3', 'parseItemLesson', 'expandLessonKey', 'buildWorksheetBlankCounts', 'computeLessonGrades', 'todayInTz', 'sectionToPeriod', 'quarterOfLesson', 'computeQuarterFromLessons', 'V3_WORK_WEIGHTS', 'V3_GATES', 'quarterGradeV3', 'workAvgV3', 'computeQuarterV3', 'computeQuizTotals', 'buildLessonsArray', 'deriveQuarterBands'] },
  { key: 'a2-v3-grade', file: 'a2-v3-grade.js', exports: ['computeA2V3'] },
  { key: 'gradebook-grid', file: 'gradebook-grid.js', exports: ['SCHOOLOGY_CATEGORY_WEIGHTS', 'buildGradebookColumns', 'reconcileQuarter', 'buildGradebookRow', 'schoologyWeightedTotal', 'buildGradebook'] },
  { key: 'grade',          file: 'grade.js',          exports: ['computeGrade', 'mountGrade', 'resolveBlooketLists', 'BLOOKET_PRESENCE', 'BLOOKET_REQUIRED'], omit: ['mountGrade'] },
];

// The curated public API surface exposed as window.GradeEngine.
const PUBLIC_API = {
  computeGrade:              'grade',
  resolveBlooketLists:       'grade',
  buildGradebook:            'gradebook-grid',
  PHASE3_CONFIG:             'grade-config',
  computeQuarterV3:          'lesson-grade',
  computeLessonGrades:       'lesson-grade',
  buildLessonsArray:         'lesson-grade',
  buildWorksheetBlankCounts: 'lesson-grade',
  computeQuizTotals:         'lesson-grade',
  parseItemLesson:           'lesson-grade',
  todayInTz:                 'lesson-grade',
  sectionToPeriod:           'lesson-grade',
  latestPerItem:             'scoring',
  answerKeyMapOrNull:        'scoring',
  // offline-grading mesh Phase 3: the teacher device auto-grades a single submission
  // against the real key with the SAME normalization the server uses (§0.10 one module).
  isCorrect:                 'scoring',
  normalizeResponse:         'scoring',
  scoreAgainstKey:           'scoring',
};

function pathToRegKey(p) {
  // './grade-config.js' → 'grade-config'; node builtins ('fs','path','url') → null.
  if (!p.startsWith('.')) return null;
  return p.replace(/^\.\//, '').replace(/\.js$/, '');
}

// Rewrite imports: intra-bundle → registry destructure; node-builtin → dropped.
function rewriteImports(src) {
  return src.replace(
    /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g,
    (_m, names, path) => {
      const key = pathToRegKey(path);
      if (!key) return ''; // node builtin (fs/path/url) — dropped
      const clean = names.split(',').map((s) => s.trim()).filter(Boolean).join(', ');
      return `const { ${clean} } = __reg[${JSON.stringify(key)}];`;
    }
  );
}

// Strip the leading `export ` from declarations (the registry handles visibility).
function stripExportKeyword(src) {
  return src.replace(/^export\s+(function|const|let|var|class)\s+/gm, '$1 ');
}

function transformModule(mod) {
  let src = readFileSync(resolve(SRV, mod.file), 'utf8');

  if (mod.key === 'grade') {
    // Neutralize the fs-backed Blooket load (M2a presence/required split).
    // Client always supplies blooketPresence + blooketRequired via opts (offline
    // pack / Desk re-derive). Empty module defaults keep a mis-wired client from
    // silently inventing a 77-required denominator from a stale single list.
    src = src.replace(
      /function _loadBlooketDoc\(\) \{[\s\S]*?export const BLOOKET_BONUS_TOPICS = Array\.isArray\(_blooketDoc\?\.bonusTopics\)\s*\n\s*\? _blooketDoc\.bonusTopics\s*\n\s*: \[\];/,
      [
        'function _loadBlooketDoc() { return null; }',
        'const _blooketDoc = null;',
        'const BLOOKET_LESSONS = [];',
        'const BLOOKET_PRESENCE = [];',
        'const BLOOKET_REQUIRED = [];',
        'const BLOOKET_BONUS_TOPICS = [];',
      ].join('\n'),
    );
    // Legacy pre-M2a shape (IIFE BLOOKET_LESSONS only) — keep as safety net.
    src = src.replace(
      /const BLOOKET_LESSONS = \(\(\) => \{[\s\S]*?\}\)\(\);/,
      'const BLOOKET_LESSONS = [];'
    );
    // Same for the fs-backed TI-84 lesson map: the client passes trainerMap via
    // opts (or omits it → the strand is simply invisible; grade numbers are
    // unaffected at weight 0 — TI84_GRADE_INTEGRATION_SPEC.md §C).
    src = src.replace(
      /const TRAINER_LESSON_MAP = \(\(\) => \{[\s\S]*?\}\)\(\);/,
      'const TRAINER_LESSON_MAP = null;'
    );
    // Drop the express route mounter (and its preceding banner) → EOF.
    const cutAt = src.search(/\n\/\/ ── Route mounter|^export function mountGrade/m);
    if (cutAt !== -1) src = src.slice(0, cutAt);
  }

  src = rewriteImports(src);
  src = stripExportKeyword(src);

  const returned = mod.exports.filter((n) => !(mod.omit || []).includes(n));
  const returnObj = returned.map((n) => `${n}: ${n}`).join(', ');

  return [
    `  // ── ${mod.file} ──────────────────────────────────────────────────────`,
    `  __reg[${JSON.stringify(mod.key)}] = (function () {`,
    src.replace(/^/gm, '    ').replace(/\s+$/, ''),
    `    return { ${returnObj} };`,
    `  })();`,
    ``,
  ].join('\n');
}

export function generateBundle() {
  const bodies = MODULES.map(transformModule).join('\n');

  const apiLines = Object.entries(PUBLIC_API)
    .map(([name, key]) => `    ${name}: __reg[${JSON.stringify(key)}].${name},`)
    .join('\n');

  // Hash the raw sources so the bundle carries a traceable engine version.
  const rawConcat = MODULES.map((m) => readFileSync(resolve(SRV, m.file), 'utf8')).join('\n');
  const version = createHash('sha256').update(rawConcat).digest('hex').slice(0, 12);

  return `/* grade-engine.bundle.js — GENERATED by scripts/build-grade-engine.mjs. DO NOT EDIT.
 *
 * window.GradeEngine — the roster-server grade engine (grade-config + scoring +
 * lesson-grade + gradebook-grid + grade), bundled for the browser so a student
 * device can re-derive its OWN grade offline from local signed ledger rows,
 * byte-identically to the server. See ANDROID_PHASE2_LEDGER_MERGE_SPEC.md.
 *
 * Regenerate after any engine edit:  node scripts/build-grade-engine.mjs
 * Parity is pinned by tests/grade-engine-bundle-parity.test.js.
 * engine-version: ${version}
 */
;(function (root) {
  'use strict';
  var __reg = {};
  // Browser shim: the engine modules read process.env.USE_V3_GRADING /
  // PC_TRACK_ENABLED at module-eval time. In a browser 'process' is undefined and
  // the whole bundle would throw at load (window.GradeEngine never defined —
  // found by tests/journeys/harness.smoke.test.js). Node (tests, server) keeps
  // its real process; the browser gets an empty env → the same defaults the
  // server has when those vars are unset (v3 off, PC track off).
  var process = (typeof root !== 'undefined' && root && root.process && root.process.env)
    ? root.process
    : (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.env)
      ? globalThis.process
      : { env: {} };

${bodies}
  var __api = {
${apiLines}
    _engineVersion: ${JSON.stringify(version)},
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = __api;
  root.GradeEngine = __api;
})(typeof window !== 'undefined' ? window
  : (typeof globalThis !== 'undefined' ? globalThis : this));
`;
}

// CLI: write the bundle.
if (resolve(process.argv[1] || '') === resolve(fileURLToPath(import.meta.url))) {
  const out = generateBundle();
  writeFileSync(OUT, out, 'utf8');
  const lines = out.split('\n').length;
  console.log(`Wrote ${OUT} (${lines} lines, ${out.length} bytes)`);
}
