/**
 * scripts/build-work-manifest.mjs
 * Node 18+ ESM, zero external dependencies.
 *
 * CLI: node scripts/build-work-manifest.mjs
 * Legacy CLI is disabled; use node scripts/build-a2-work-manifest.mjs.
 * The exported legacy builder remains available for fixture-based tests.
 *
 * Deterministic: two runs are byte-identical except the single line
 * marked "// GENERATED:" which contains the timestamp.
 *
 * Classification (FROZEN CONTRACT 1):
 *
 *   WS-U{u}L{l}-Q{n}          → worksheet  (unit U{u}, lesson "{u}.{l}")
 *   WS-U{u}L{l}-{n}           → worksheet  (unit U{u}, lesson "{u}.{l}")
 *   WS-U{u}L{l}-reflect{n}    → worksheet  (unit U{u}, lesson "{u}.{l}")
 *   WS-U{u}L{l}-exitTicket{n} → worksheet  (unit U{u}, lesson "{u}.{l}")
 *   U{u}-L{l}-Q{n}            → quiz       (unit U{u}, lesson "{u}.{l}")
 *   U{u}-L{l}-MCQ-Q{n}        → quiz       (unit U{u}, lesson "{u}.{l}")
 *   U{u}-L{l}-FRQ-Q{n}        → quiz       (unit U{u}, lesson "{u}.{l}")
 *   U{u}-PC-MCQ-{A..D}-Q{n}   → pc         (unit U{u}, no lesson)
 *   U{u}-PC-FRQ-Q{n}          → pc         (unit U{u}, no lesson)
 *
 * EXCLUDED (appear in neither tree nor index):
 *   WS-U{u}L{l}-appeal*       → appeal action, not student work
 *   U{u}-L{l}-QS{n}           → diagnostic pool, not feeder work
 *   u{u}-frq-*                → diagnostic pool, not feeder work
 *
 * Natural ordering:
 *   Units: U1 < U2 < … < U9
 *   Lessons: 1.1 < 1.2 < … < 1.10  (numeric, not lexical)
 *   Activities within a lesson: worksheet before quiz
 *   PC: last within a unit (after all lessons)
 *
 * Lesson id = "{unit}.{lesson}" derived from the literal U{u}L{l} in the key.
 * Multi-lesson combined keys (e.g. U4L1-2) keep their literal lesson string.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SKILL_MAP_PATH = resolve(ROOT, 'data/skill-map.json');
// Historical paths retained for import-based compatibility tests.
// The disabled CLI writes neither the former fixture nor either live manifest.
const MANIFEST_PATH = resolve(ROOT, 'scripts/fixtures/work-manifest-9unit-source.json');

// Railway's deployment root requires a bundled manifest; this legacy builder
// cannot regenerate it. An Algebra 2 generator is still pending.
const BUNDLED_MANIFEST_PATH = resolve(ROOT, 'roster-server/data/work-manifest.json');

/** Historical output path for compatibility tests; the CLI writes nothing. */
export const WORK_MANIFEST_WRITE_TARGET = MANIFEST_PATH;
/** Testability export: live Do-Now paths this builder must NEVER write. */
export const WORK_MANIFEST_LIVE_PATHS = [
  resolve(ROOT, 'data/work-manifest.json'),
  resolve(ROOT, 'roster-server/data/work-manifest.json'),
];
export const WORK_MANIFEST_FROZEN_9UNIT_SOURCE = MANIFEST_PATH;

// ─────────────────────────────────────────────────────────────────────────────
// Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Regex patterns for EXCLUDED keys.
 * Check these first so they never reach the classify step.
 */
const EXCLUDED_PATTERNS = [
  /^WS-U\d+L[\d-]+-appeal/,   // appeal action
  /^U\d+-L\d+-QS\d+/,         // diagnostic QS pool
  /^u\d+-frq-/,               // diagnostic frq pool
];

/**
 * Returns true if the key is excluded.
 */
function isExcluded(key) {
  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.test(key)) return true;
  }
  return false;
}

/**
 * Classifies a non-excluded key.
 * Returns { type: 'worksheet'|'quiz'|'pc', unitNum, lessonStr|null } or null if unrecognized.
 *
 * unitNum  — integer (1–9)
 * lessonStr — the raw lesson string from the key, e.g. "1-2" for L1-2, "1" for L1
 *             (used to build the lesson id "{unitNum}.{lessonStr}")
 */
function classify(key) {
  // Worksheet: WS-U{u}L{l}-{suffix}
  // The suffix can be: Q{n}, {n}, reflect{n}, exitTicket{n}
  // Lesson part {l} can include dashes, e.g. "1-2", "6-7", "10-12"
  const wsMatch = key.match(/^WS-U(\d+)L([\d]+(?:-\d+)*)-(.+)$/);
  if (wsMatch) {
    return {
      type: 'worksheet',
      unitNum: parseInt(wsMatch[1], 10),
      lessonStr: wsMatch[2],
    };
  }

  // PC: U{u}-PC-{anything}
  const pcMatch = key.match(/^U(\d+)-PC-/);
  if (pcMatch) {
    return {
      type: 'pc',
      unitNum: parseInt(pcMatch[1], 10),
      lessonStr: null,
    };
  }

  // Quiz: U{u}-L{l}-Q{n}, U{u}-L{l}-MCQ-Q{n}, U{u}-L{l}-FRQ-Q{n}
  // Lesson part {l} is a single number (no dashes in quiz keys)
  const quizMatch = key.match(/^U(\d+)-L(\d+)-(Q\d+|MCQ-Q\d+|FRQ-Q\d+)$/);
  if (quizMatch) {
    return {
      type: 'quiz',
      unitNum: parseInt(quizMatch[1], 10),
      lessonStr: quizMatch[2],
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lesson id helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the canonical lesson id string: "{unitNum}.{lessonStr}"
 * e.g. unitNum=1, lessonStr="2"    → "1.2"
 *      unitNum=4, lessonStr="1-2"  → "4.1-2"
 */
function lessonId(unitNum, lessonStr) {
  return `${unitNum}.${lessonStr}`;
}

/**
 * Numeric sort key for a lesson string.
 * Single lesson "2" → [2]
 * Combined lesson "1-2" → [1, 2]  (sort by first number)
 * So 1.9 < 1.10 (numeric, not lexical).
 */
function lessonSortKey(lessonStr) {
  const parts = lessonStr.split('-').map(Number);
  return parts;
}

/**
 * Compare two lesson strings numerically (first number, then second if tied).
 */
function compareLessons(a, b) {
  const ka = lessonSortKey(a);
  const kb = lessonSortKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const va = ka[i] ?? 0;
    const vb = kb[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildWorkManifest(root)
 * Exported for testing. Reads skill-map.json from root, returns the manifest object.
 * Does NOT write to disk.
 */
export function buildWorkManifest(root) {
  const skillMapPath = resolve(root, 'data/skill-map.json');
  const rawMap = JSON.parse(readFileSync(skillMapPath, 'utf8'));
  const keys = Object.keys(rawMap);

  // ── Collect classified items ──────────────────────────────────────────────
  // unitData: Map<unitNum, { worksheets: Map<lessonStr, string[]>, quizzes: Map<lessonStr, string[]>, pc: string[] }>
  const unitData = new Map();

  function ensureUnit(unitNum) {
    if (!unitData.has(unitNum)) {
      unitData.set(unitNum, {
        worksheets: new Map(), // lessonStr → itemId[]
        quizzes: new Map(),    // lessonStr → itemId[]
        pc: [],                // itemId[]
      });
    }
    return unitData.get(unitNum);
  }

  // index: itemId → { unit, lesson|null, activity }
  const index = {};

  for (const key of keys) {
    // Skip excluded keys
    if (isExcluded(key)) continue;

    const result = classify(key);

    if (result === null) {
      // Should never happen if all patterns are covered
      throw new Error(`Unclassified key in skill-map.json: ${key}`);
    }

    const { type, unitNum, lessonStr } = result;
    const unit = ensureUnit(unitNum);
    const unitLabel = `U${unitNum}`;

    if (type === 'worksheet') {
      if (!unit.worksheets.has(lessonStr)) {
        unit.worksheets.set(lessonStr, []);
      }
      unit.worksheets.get(lessonStr).push(key);

      const lesson = lessonId(unitNum, lessonStr);
      index[key] = { unit: unitLabel, lesson, activity: 'worksheet' };
    } else if (type === 'quiz') {
      if (!unit.quizzes.has(lessonStr)) {
        unit.quizzes.set(lessonStr, []);
      }
      unit.quizzes.get(lessonStr).push(key);

      const lesson = lessonId(unitNum, lessonStr);
      index[key] = { unit: unitLabel, lesson, activity: 'quiz' };
    } else if (type === 'pc') {
      unit.pc.push(key);
      index[key] = { unit: unitLabel, lesson: null, activity: 'progress-check' };
    }
  }

  // ── Build sorted nested structure ─────────────────────────────────────────

  // Sort units numerically
  const sortedUnitNums = [...unitData.keys()].sort((a, b) => a - b);

  const units = sortedUnitNums.map(unitNum => {
    const unit = unitData.get(unitNum);
    const unitLabel = `U${unitNum}`;

    // Collect all lesson strings that have worksheet OR quiz items
    const allLessonStrs = new Set([
      ...unit.worksheets.keys(),
      ...unit.quizzes.keys(),
    ]);

    // Sort lessons numerically
    const sortedLessonStrs = [...allLessonStrs].sort(compareLessons);

    const lessons = sortedLessonStrs.map(lStr => {
      const lesson = lessonId(unitNum, lStr);
      const activities = [];

      // Worksheet comes before quiz
      if (unit.worksheets.has(lStr)) {
        const itemIds = unit.worksheets.get(lStr);
        // Sort itemIds for determinism (natural string sort is fine within one lesson)
        itemIds.sort();
        activities.push({
          activity: 'worksheet',
          source: 'worksheet',
          itemIds,
          count: itemIds.length,
        });
      }

      if (unit.quizzes.has(lStr)) {
        const itemIds = unit.quizzes.get(lStr);
        itemIds.sort();
        activities.push({
          activity: 'quiz',
          source: 'curriculum_quiz',
          itemIds,
          count: itemIds.length,
        });
      }

      return { lesson, activities };
    });

    // Build the unit object
    const unitObj = { unit: unitLabel, lessons };

    // PC comes last within the unit (after all lessons)
    if (unit.pc.length > 0) {
      const pcItemIds = [...unit.pc].sort();
      unitObj.pc = {
        activity: 'progress-check',
        source: 'pc',
        itemIds: pcItemIds,
        count: pcItemIds.length,
      };
    }

    return unitObj;
  });

  // ── Build sorted index ────────────────────────────────────────────────────
  // Sort index keys for determinism
  const sortedIndexKeys = Object.keys(index).sort();
  const sortedIndex = {};
  for (const k of sortedIndexKeys) {
    sortedIndex[k] = index[k];
  }

  return {
    generatedFrom: 'data/skill-map.json',
    units,
    index: sortedIndex,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

// Only run as CLI (not when imported by tests)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  console.error('A2 manifest generator not yet available through this legacy CLI; use node scripts/build-a2-work-manifest.mjs');
  process.exitCode = 1;
}
