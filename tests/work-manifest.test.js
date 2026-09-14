/**
 * tests/work-manifest.test.js
 *
 * Verifies FROZEN CONTRACT 2 for data/work-manifest.json.
 *
 * Assertions:
 *   1. Deterministic: two builds are byte-identical (excluding the timestamp line)
 *   2. Every classified skill-map key appears exactly once in the nested tree
 *   3. Every classified skill-map key appears exactly once in the index
 *   4. Excluded key shapes appear in neither tree nor index
 *   5. Counts reconcile: (manifested in tree) + (excluded) == skill-map total
 *   6. Natural ordering: U1<U2<…<U9; lessons numeric (1.10 after 1.9); worksheet before quiz; pc last
 *   7. Schema shape matches CONTRACT 2
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildWorkManifest } from '../scripts/build-work-manifest.mjs';

const ROOT = resolve(__dirname, 'fixtures/a2');
const SKILL_MAP_PATH = resolve(ROOT, 'data/skill-map.json');

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — run the builder twice before any tests
// ─────────────────────────────────────────────────────────────────────────────

let manifest1;
let manifest2;
let skillMapKeys;

beforeAll(() => {
  skillMapKeys = Object.keys(JSON.parse(readFileSync(SKILL_MAP_PATH, 'utf8')));
  manifest1 = buildWorkManifest(ROOT);
  manifest2 = buildWorkManifest(ROOT);
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Collect all itemIds from the nested tree (lessons + pc). */
function collectTreeIds(manifest) {
  const ids = [];
  for (const unit of manifest.units) {
    for (const lesson of unit.lessons) {
      for (const activity of lesson.activities) {
        for (const id of activity.itemIds) {
          ids.push(id);
        }
      }
    }
    if (unit.pc) {
      for (const id of unit.pc.itemIds) {
        ids.push(id);
      }
    }
  }
  return ids;
}

/** Returns true if the key matches any EXCLUDED pattern from CONTRACT 1. */
function isExcluded(key) {
  if (/^WS-U\d+L[\d-]+-appeal/.test(key)) return true;
  if (/^U\d+-L\d+-QS\d+/.test(key)) return true;
  if (/^u\d+-frq-/.test(key)) return true;
  return false;
}

/** Returns true if the key is classified (worksheet, quiz, or pc). */
function isClassified(key) {
  if (/^WS-U\d+L[\d-]+-/.test(key) && !isExcluded(key)) return true;
  if (/^U\d+-L\d+-(Q\d+|MCQ-Q\d+|FRQ-Q\d+)$/.test(key)) return true;
  if (/^U\d+-PC-/.test(key)) return true;
  return false;
}

/** Numeric sort key for a lesson string like "2" or "1-2". */
function lessonSortKey(lessonStr) {
  return lessonStr.split('-').map(Number);
}

/** Compare two lesson strings numerically. */
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
// 1. Determinism
// ─────────────────────────────────────────────────────────────────────────────

describe('Determinism', () => {
  it('two builds produce the same generatedFrom', () => {
    expect(manifest1.generatedFrom).toBe(manifest2.generatedFrom);
  });

  it('two builds produce byte-identical JSON (excluding timestamp)', () => {
    const strip = (m) => {
      const copy = { ...m };
      delete copy.generated;
      return JSON.stringify(copy);
    };
    expect(strip(manifest1)).toBe(strip(manifest2));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 & 3. Completeness — every classified key appears exactly once
// ─────────────────────────────────────────────────────────────────────────────

describe('Completeness', () => {
  it('every classified skill-map key appears exactly once in the tree', () => {
    const treeIds = collectTreeIds(manifest1);
    const treeSet = new Set(treeIds);

    // No duplicates in tree
    expect(treeIds.length).toBe(treeSet.size);

    // Every classified key is in tree
    for (const key of skillMapKeys) {
      if (isClassified(key)) {
        expect(treeSet.has(key), `classified key missing from tree: ${key}`).toBe(true);
      }
    }
  });

  it('every classified skill-map key appears exactly once in index', () => {
    const indexKeys = Object.keys(manifest1.index);
    const indexSet = new Set(indexKeys);

    // No duplicates in index
    expect(indexKeys.length).toBe(indexSet.size);

    // Every classified key is in index
    for (const key of skillMapKeys) {
      if (isClassified(key)) {
        expect(indexSet.has(key), `classified key missing from index: ${key}`).toBe(true);
      }
    }
  });

  it('tree itemId set equals index key set', () => {
    const treeIds = new Set(collectTreeIds(manifest1));
    const indexIds = new Set(Object.keys(manifest1.index));

    for (const id of treeIds) {
      expect(indexIds.has(id), `tree id missing from index: ${id}`).toBe(true);
    }
    for (const id of indexIds) {
      expect(treeIds.has(id), `index id missing from tree: ${id}`).toBe(true);
    }
    expect(treeIds.size).toBe(indexIds.size);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Excluded keys absent from tree and index
// ─────────────────────────────────────────────────────────────────────────────

describe('Excluded keys', () => {
  it('no phantom template-literal keys in skill-map; any appeal key stays out of tree/index', () => {
    const treeIds = new Set(collectTreeIds(manifest1));
    const indexIds = new Set(Object.keys(manifest1.index));

    // Regression guard: the appeal-text-${questionId} phantoms (JS template
    // literals build-skill-map.mjs used to over-capture) are fixed/removed —
    // there must be NO ${ / backtick keys in skill-map at all.
    const phantoms = skillMapKeys.filter(k => k.includes('${') || k.includes('`'));
    expect(phantoms).toHaveLength(0);

    // Whatever appeal-shaped keys remain (if any) must still be excluded from
    // the manifest tree + index.
    const appeals = skillMapKeys.filter(k => /^WS-U\d+L[\d-]+-appeal/.test(k));
    for (const key of appeals) {
      expect(treeIds.has(key), `appeal in tree: ${key}`).toBe(false);
      expect(indexIds.has(key), `appeal in index: ${key}`).toBe(false);
    }
  });

  it('QS keys appear in neither tree nor index', () => {
    const treeIds = new Set(collectTreeIds(manifest1));
    const indexIds = new Set(Object.keys(manifest1.index));
    const qs = skillMapKeys.filter(k => /^U\d+-L\d+-QS\d+/.test(k));

    expect(qs.length).toBeGreaterThan(0); // sanity

    for (const key of qs) {
      expect(treeIds.has(key), `QS in tree: ${key}`).toBe(false);
      expect(indexIds.has(key), `QS in index: ${key}`).toBe(false);
    }
  });

  it('u#-frq-* keys appear in neither tree nor index', () => {
    const treeIds = new Set(collectTreeIds(manifest1));
    const indexIds = new Set(Object.keys(manifest1.index));
    const frq = skillMapKeys.filter(k => /^u\d+-frq-/.test(k));

    expect(frq.length).toBeGreaterThan(0); // sanity

    for (const key of frq) {
      expect(treeIds.has(key), `frq in tree: ${key}`).toBe(false);
      expect(indexIds.has(key), `frq in index: ${key}`).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Count reconciliation
// ─────────────────────────────────────────────────────────────────────────────

describe('Count reconciliation', () => {
  it('manifested + excluded == skill-map total', () => {
    const total = skillMapKeys.length;
    const excludedCount = skillMapKeys.filter(isExcluded).length;
    const manifestedCount = Object.keys(manifest1.index).length;

    expect(manifestedCount + excludedCount).toBe(total);
  });

  it('tree itemId sum matches index size', () => {
    const treeCount = collectTreeIds(manifest1).length;
    const indexCount = Object.keys(manifest1.index).length;
    expect(treeCount).toBe(indexCount);
  });

  it('each activity count field matches itemIds.length', () => {
    for (const unit of manifest1.units) {
      for (const lesson of unit.lessons) {
        for (const activity of lesson.activities) {
          expect(activity.count).toBe(activity.itemIds.length);
        }
      }
      if (unit.pc) {
        expect(unit.pc.count).toBe(unit.pc.itemIds.length);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Natural ordering
// ─────────────────────────────────────────────────────────────────────────────

describe('Natural ordering', () => {
  it('units are in ascending numeric order (U1 < U2 < … < U9)', () => {
    const unitNums = manifest1.units.map(u => parseInt(u.unit.slice(1), 10));
    for (let i = 1; i < unitNums.length; i++) {
      expect(unitNums[i]).toBeGreaterThan(unitNums[i - 1]);
    }
  });

  it('lessons within each unit are in ascending numeric order', () => {
    for (const unit of manifest1.units) {
      const lessons = unit.lessons;
      for (let i = 1; i < lessons.length; i++) {
        const prevLesson = lessons[i - 1].lesson.split('.').slice(1).join('');
        const currLesson = lessons[i].lesson.split('.').slice(1).join('');
        // Extract the actual lesson string part (after the dot)
        const prev = lessons[i - 1].lesson.replace(/^\d+\./, '');
        const curr = lessons[i].lesson.replace(/^\d+\./, '');
        expect(compareLessons(prev, curr)).toBeLessThan(0);
      }
    }
  });

  it('lesson 1.10 comes after 1.9 in U1 (numeric, not lexical)', () => {
    const u1 = manifest1.units.find(u => u.unit === 'U1');
    expect(u1).toBeDefined();
    const lessonIds = u1.lessons.map(l => l.lesson);
    const idx9 = lessonIds.indexOf('1.9');
    const idx10 = lessonIds.indexOf('1.10');
    expect(idx9).toBeGreaterThanOrEqual(0);
    expect(idx10).toBeGreaterThan(idx9);
  });

  it('worksheet activity comes before quiz within each lesson', () => {
    for (const unit of manifest1.units) {
      for (const lesson of unit.lessons) {
        const activities = lesson.activities.map(a => a.activity);
        const wsIdx = activities.indexOf('worksheet');
        const quizIdx = activities.indexOf('quiz');
        if (wsIdx !== -1 && quizIdx !== -1) {
          expect(wsIdx).toBeLessThan(quizIdx);
        }
      }
    }
  });

  it('pc is last within a unit (after all lessons)', () => {
    for (const unit of manifest1.units) {
      if (unit.pc) {
        // pc is a top-level property on the unit, not inside lessons — it's last by schema design
        expect(unit.pc.activity).toBe('progress-check');
        // Verify lessons array comes before pc in the unit keys order
        const unitKeys = Object.keys(unit);
        const lessonsIdx = unitKeys.indexOf('lessons');
        const pcIdx = unitKeys.indexOf('pc');
        expect(pcIdx).toBeGreaterThan(lessonsIdx);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Schema shape (CONTRACT 2)
// ─────────────────────────────────────────────────────────────────────────────

describe('Schema shape (CONTRACT 2)', () => {
  it('top-level fields: generatedFrom, units, index (plus optional generated)', () => {
    expect(typeof manifest1.generatedFrom).toBe('string');
    expect(Array.isArray(manifest1.units)).toBe(true);
    expect(typeof manifest1.index).toBe('object');
  });

  it('each unit has: unit (string), lessons (array), optional pc (object)', () => {
    for (const unit of manifest1.units) {
      expect(typeof unit.unit).toBe('string');
      expect(unit.unit).toMatch(/^U\d+$/);
      expect(Array.isArray(unit.lessons)).toBe(true);
      if ('pc' in unit) {
        expect(typeof unit.pc).toBe('object');
        expect(unit.pc.activity).toBe('progress-check');
        expect(unit.pc.source).toBe('pc');
        expect(Array.isArray(unit.pc.itemIds)).toBe(true);
        expect(typeof unit.pc.count).toBe('number');
      }
    }
  });

  it('each lesson has: lesson (string), activities (array)', () => {
    for (const unit of manifest1.units) {
      for (const lesson of unit.lessons) {
        expect(typeof lesson.lesson).toBe('string');
        // lesson format: "{unitNum}.{lessonStr}"
        expect(lesson.lesson).toMatch(/^\d+\.[\d-]+$/);
        expect(Array.isArray(lesson.activities)).toBe(true);
      }
    }
  });

  it('each activity has: activity, source, itemIds (array), count (number)', () => {
    const VALID_ACTIVITIES = new Set(['worksheet', 'quiz']);
    const VALID_SOURCES = new Set(['worksheet', 'curriculum_quiz']);

    for (const unit of manifest1.units) {
      for (const lesson of unit.lessons) {
        for (const act of lesson.activities) {
          expect(VALID_ACTIVITIES.has(act.activity)).toBe(true);
          expect(VALID_SOURCES.has(act.source)).toBe(true);
          expect(Array.isArray(act.itemIds)).toBe(true);
          expect(typeof act.count).toBe('number');
          expect(act.count).toBe(act.itemIds.length);
        }
      }
    }
  });

  it('index entries have: unit, lesson (string or null), activity (string)', () => {
    const VALID_ACTIVITIES = new Set(['worksheet', 'quiz', 'progress-check']);
    const VALID_UNITS = new Set(manifest1.units.map(u => u.unit));

    for (const [id, entry] of Object.entries(manifest1.index)) {
      expect(VALID_UNITS.has(entry.unit), `bad unit for ${id}: ${entry.unit}`).toBe(true);
      expect(
        entry.lesson === null || typeof entry.lesson === 'string',
        `bad lesson type for ${id}`
      ).toBe(true);
      expect(VALID_ACTIVITIES.has(entry.activity), `bad activity for ${id}: ${entry.activity}`).toBe(true);
    }
  });

  it('pc index entries have lesson: null', () => {
    for (const [id, entry] of Object.entries(manifest1.index)) {
      if (entry.activity === 'progress-check') {
        expect(entry.lesson).toBeNull();
      }
    }
  });

  it('worksheet and quiz index entries have lesson: string (not null)', () => {
    for (const [id, entry] of Object.entries(manifest1.index)) {
      if (entry.activity === 'worksheet' || entry.activity === 'quiz') {
        expect(typeof entry.lesson).toBe('string');
        expect(entry.lesson).not.toBeNull();
      }
    }
  });

  it('worksheet source is "worksheet", quiz source is "curriculum_quiz"', () => {
    for (const unit of manifest1.units) {
      for (const lesson of unit.lessons) {
        for (const act of lesson.activities) {
          if (act.activity === 'worksheet') expect(act.source).toBe('worksheet');
          if (act.activity === 'quiz') expect(act.source).toBe('curriculum_quiz');
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bonus: activity-level index cross-checks
// ─────────────────────────────────────────────────────────────────────────────

describe('Index cross-checks', () => {
  it('index unit label matches unit in tree', () => {
    for (const unit of manifest1.units) {
      for (const lesson of unit.lessons) {
        for (const act of lesson.activities) {
          for (const id of act.itemIds) {
            expect(manifest1.index[id].unit).toBe(unit.unit);
          }
        }
      }
      if (unit.pc) {
        for (const id of unit.pc.itemIds) {
          expect(manifest1.index[id].unit).toBe(unit.unit);
        }
      }
    }
  });

  it('index lesson matches lesson in tree', () => {
    for (const unit of manifest1.units) {
      for (const lesson of unit.lessons) {
        for (const act of lesson.activities) {
          for (const id of act.itemIds) {
            expect(manifest1.index[id].lesson).toBe(lesson.lesson);
          }
        }
      }
    }
  });

  it('index activity matches activity in tree', () => {
    for (const unit of manifest1.units) {
      for (const lesson of unit.lessons) {
        for (const act of lesson.activities) {
          for (const id of act.itemIds) {
            expect(manifest1.index[id].activity).toBe(act.activity);
          }
        }
      }
      if (unit.pc) {
        for (const id of unit.pc.itemIds) {
          expect(manifest1.index[id].activity).toBe('progress-check');
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Deploy drift guard — the bundled roster-server copy must stay in sync
// ─────────────────────────────────────────────────────────────────────────────
//
// Railway deploys roster-server with Root Directory = roster-server, so the
// repo-root data/ dir is NOT in the deployed container. scripts/build-work-
// manifest.mjs writes a byte-identical copy to roster-server/data/work-
// manifest.json that ships in the deploy artifact and is what /donow reads in
// production. If a future skill-map regen rebuilds one file but not the other,
// production would silently serve a stale manifest — this guard fails first.

describe('Deploy drift guard (roster-server bundled manifest)', () => {
  const CANONICAL_PATH = resolve(ROOT, 'data/work-manifest.json');
  const BUNDLED_PATH = resolve(ROOT, 'roster-server/data/work-manifest.json');

  // Compare structure only — the "generated" timestamp line legitimately differs
  // by write order within a single CLI run; everything else must match exactly.
  function stripGenerated(jsonText) {
    const obj = JSON.parse(jsonText);
    delete obj.generated;
    return JSON.stringify(obj);
  }

  it('the bundled copy exists (regen ran)', () => {
    expect(existsSync(BUNDLED_PATH), `missing ${BUNDLED_PATH} — run: node scripts/build-work-manifest.mjs`).toBe(true);
  });

  it('bundled copy is byte-identical to data/work-manifest.json (modulo timestamp)', () => {
    const canonical = readFileSync(CANONICAL_PATH, 'utf8');
    const bundled = readFileSync(BUNDLED_PATH, 'utf8');
    expect(stripGenerated(bundled)).toBe(stripGenerated(canonical));
  });
});
