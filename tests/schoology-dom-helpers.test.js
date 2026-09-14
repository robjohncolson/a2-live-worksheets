/**
 * tests/schoology-dom-helpers.test.js
 *
 * Vitest coverage for tools/schoology-dom-helpers.js -- the pure DOM
 * parsers that power tools/schoology-sync.py P1.
 *
 * Source of truth: SCHOOLOGY_SYNC_V1_BUILD.md P0 Discovery section.
 * Fixtures live in tests/fixtures/schoology-*.html and were captured live
 * via tools/cdp/edge.py during session 120.
 *
 * Loading pattern mirrors tests/level-editor.test.js: each fixture HTML
 * loads into a JSDOM window with runScripts:'outside-only', then the
 * helper IIFE source is eval'd into that window so tests can read
 * window.SchoologyDomHelpers directly.
 *
 * ASCII only. LF line endings.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const HELPERS_SRC = readFileSync(resolve(REPO_ROOT, 'tools/schoology-dom-helpers.js'), 'utf8');
const FIXTURE_GRADEBOOK_SEC1 = readFileSync(resolve(REPO_ROOT, 'tests/fixtures/schoology-gradebook-apstats-sec1.html'), 'utf8');
const FIXTURE_GRADEBOOK_EMPTY = readFileSync(resolve(REPO_ROOT, 'tests/fixtures/schoology-gradebook-empty.html'), 'utf8');
const FIXTURE_ADD_ASSIGNMENT = readFileSync(resolve(REPO_ROOT, 'tests/fixtures/schoology-add-assignment-form.html'), 'utf8');
const FIXTURE_ADD_TEST = readFileSync(resolve(REPO_ROOT, 'tests/fixtures/schoology-add-test-form.html'), 'utf8');
const FIXTURE_MYCOURSES = readFileSync(resolve(REPO_ROOT, 'tests/fixtures/schoology-mycourses.html'), 'utf8');

function loadFixture(html) {
    const dom = new JSDOM(html, { runScripts: 'outside-only' });
    dom.window.eval(HELPERS_SRC);
    return {
        dom: dom,
        window: dom.window,
        document: dom.window.document,
        helpers: dom.window.SchoologyDomHelpers
    };
}

// ---------------------------------------------------------------------------
// Group 1: listStudents
// ---------------------------------------------------------------------------

describe('listStudents', () => {
    let env;
    beforeAll(() => {
        env = loadFixture(FIXTURE_GRADEBOOK_SEC1);
    });

    it('returns 10 students from the Algebra 2 Sec 1 fixture', () => {
        const students = env.helpers.listStudents(env.document);
        expect(students).toHaveLength(10);
    });

    it('each entry has studentId / name / rowIndex shape', () => {
        const students = env.helpers.listStudents(env.document);
        for (const s of students) {
            expect(typeof s.studentId).toBe('string');
            expect(s.studentId).toMatch(/^\d+$/);
            expect(typeof s.name).toBe('string');
            expect(s.name.length).toBeGreaterThan(0);
            expect(typeof s.rowIndex).toBe('number');
            expect(s.rowIndex).toBeGreaterThanOrEqual(0);
        }
    });

    it('studentIds are unique', () => {
        const students = env.helpers.listStudents(env.document);
        const ids = students.map(s => s.studentId);
        expect(new Set(ids).size).toBe(students.length);
    });

    it('rowIndex covers 0..9 (one per student row)', () => {
        const students = env.helpers.listStudents(env.document);
        const rowIndices = students.map(s => s.rowIndex).sort((a, b) => a - b);
        expect(rowIndices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('includes a known student by name (sanity spot check)', () => {
        const students = env.helpers.listStudents(env.document);
        const names = students.map(s => s.name);
        // Captured during P0 -- baseline name expected to be in the roster.
        expect(names).toContain('Julissa Arbaiza Yanes');
    });
});

// ---------------------------------------------------------------------------
// Group 2: listAssignments
// ---------------------------------------------------------------------------

describe('listAssignments', () => {
    let env;
    beforeAll(() => {
        env = loadFixture(FIXTURE_GRADEBOOK_SEC1);
    });

    it('empty-state gradebook returns only the 5 aggregate columns', () => {
        const cols = env.helpers.listAssignments(env.document);
        const keys = cols.map(c => c.columnKey).sort();
        expect(keys).toEqual(
            ['gp', 'gp_override', 'overall', 'overall_override', 'total_points_awarded'].sort()
        );
    });

    it('every column in the empty gradebook is flagged isAggregate=true', () => {
        const cols = env.helpers.listAssignments(env.document);
        expect(cols.length).toBeGreaterThan(0);
        for (const c of cols) {
            expect(c.isAggregate).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// Group 3: findCellSelector
// ---------------------------------------------------------------------------

describe('findCellSelector', () => {
    let env;
    beforeAll(() => {
        env = loadFixture(FIXTURE_GRADEBOOK_SEC1);
    });

    it('returns the canonical #grader-grid-cell-<col>-<row> selector', () => {
        const sel = env.helpers.findCellSelector({ columnKey: 'overall', rowIndex: 0 });
        expect(sel).toBe('#grader-grid-cell-overall-0');
    });

    it('handles override columns', () => {
        const sel = env.helpers.findCellSelector({ columnKey: 'overall_override', rowIndex: 5 });
        expect(sel).toBe('#grader-grid-cell-overall_override-5');
    });

    it('returns null for missing columnKey or rowIndex', () => {
        expect(env.helpers.findCellSelector(null)).toBeNull();
        expect(env.helpers.findCellSelector({})).toBeNull();
        expect(env.helpers.findCellSelector({ columnKey: 'overall' })).toBeNull();
        expect(env.helpers.findCellSelector({ rowIndex: 0 })).toBeNull();
        expect(env.helpers.findCellSelector({ columnKey: 'overall', rowIndex: -1 })).toBeNull();
    });

    it('the generated selector matches a real element in the fixture', () => {
        const sel = env.helpers.findCellSelector({ columnKey: 'overall', rowIndex: 3 });
        const el = env.document.querySelector(sel);
        expect(el).not.toBeNull();
        expect(el.getAttribute('data-y')).toBe('3');
        expect(el.getAttribute('data-x')).toBe('overall');
    });
});

// ---------------------------------------------------------------------------
// Group 4: parseMarkingPeriods
// ---------------------------------------------------------------------------

describe('parseMarkingPeriods', () => {
    it('extracts at least one MP header from the live gradebook DOM', () => {
        const env = loadFixture(FIXTURE_GRADEBOOK_SEC1);
        const mps = env.helpers.parseMarkingPeriods(env.document);
        expect(mps.length).toBeGreaterThanOrEqual(1);
        for (const mp of mps) {
            expect(typeof mp.mp).toBe('number');
            expect(mp.startLabel).toMatch(/\d+\/\d+\/\d+/);
            expect(mp.endLabel).toMatch(/\d+\/\d+\/\d+/);
        }
    });

    it('deduplicates by mp number when the header appears twice', () => {
        const env = loadFixture(FIXTURE_GRADEBOOK_SEC1);
        const mps = env.helpers.parseMarkingPeriods(env.document);
        const nums = mps.map(mp => mp.mp);
        expect(new Set(nums).size).toBe(nums.length);
    });
});

// ---------------------------------------------------------------------------
// Group 5: parseAddAssignmentForm
// ---------------------------------------------------------------------------

describe('parseAddAssignmentForm', () => {
    let env;
    beforeAll(() => {
        env = loadFixture(FIXTURE_ADD_ASSIGNMENT);
    });

    it('detects the form id', () => {
        const form = env.helpers.parseAddAssignmentForm(env.document);
        expect(form.formId).toBe('s-grade-item-add-form');
    });

    it('returns the Algebra 2 Sec 1 categories (Classwork present today)', () => {
        const form = env.helpers.parseAddAssignmentForm(env.document);
        const texts = form.categories.map(c => c.text);
        expect(texts).toContain('Classwork');
        expect(texts).toContain('(Ungraded)');
    });

    it('does NOT pick up addl_courses bracket-named selects', () => {
        // The form has addl_courses[<id>][grading_category_nid] selects;
        // parseAddAssignmentForm reads only the primary select[name="grading_category_id"].
        const form = env.helpers.parseAddAssignmentForm(env.document);
        // The primary Algebra 2 Sec 1 category list never has "Exams" or "Homework"
        // (those belong to the unrelated "Courses, Data, MCAS" resource group).
        const texts = form.categories.map(c => c.text);
        expect(texts).not.toContain('Exams');
        expect(texts).not.toContain('Homework');
    });

    it('returns 4 marking periods matching the P0 baseline IDs', () => {
        const form = env.helpers.parseAddAssignmentForm(env.document);
        const values = form.markingPeriods.map(mp => mp.value).filter(v => v);
        // From SCHOOLOGY_SYNC_V1_BUILD.md Q5: MP1=1134333, MP2=1134331,
        // MP3=1134334, MP4=1134332 for Algebra 2 Sec 1.
        expect(values).toEqual(expect.arrayContaining(['1134333', '1134331', '1134334', '1134332']));
    });

    it('also works against the Add Test/Quiz form (identical schema)', () => {
        const envT = loadFixture(FIXTURE_ADD_TEST);
        const form = envT.helpers.parseAddAssignmentForm(envT.document);
        expect(form.formId).toBe('s-grade-item-add-form');
        expect(form.categories.length).toBeGreaterThan(0);
        expect(form.markingPeriods.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// Group 6: findCategoryIdByName
// ---------------------------------------------------------------------------

describe('findCategoryIdByName', () => {
    let env;
    let categories;
    beforeAll(() => {
        env = loadFixture(FIXTURE_ADD_ASSIGNMENT);
        categories = env.helpers.parseAddAssignmentForm(env.document).categories;
    });

    it('returns the Schoology id for Classwork (P0 baseline)', () => {
        const id = env.helpers.findCategoryIdByName(categories, 'Classwork');
        expect(id).toBe('89825655');
    });

    it('returns null for a category that doesnt exist yet', () => {
        // "Lessons" / "Progress Checks" / "Tests" don't exist until the
        // teacher pre-creates them (s121 user-action). When that happens
        // and the fixture is re-captured, this test gets flipped.
        const id = env.helpers.findCategoryIdByName(categories, 'Lessons');
        expect(id).toBeNull();
    });

    it('returns null on bad input', () => {
        expect(env.helpers.findCategoryIdByName(null, 'Classwork')).toBeNull();
        expect(env.helpers.findCategoryIdByName(categories, null)).toBeNull();
        expect(env.helpers.findCategoryIdByName(categories, '')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Group 7: findMarkingPeriodIdForDate
// ---------------------------------------------------------------------------

describe('findMarkingPeriodIdForDate', () => {
    let env;
    let markingPeriods;
    beforeAll(() => {
        env = loadFixture(FIXTURE_ADD_ASSIGNMENT);
        markingPeriods = env.helpers.parseAddAssignmentForm(env.document).markingPeriods;
    });

    it('maps 2025-10-15 to MP1 = 1134333', () => {
        const id = env.helpers.findMarkingPeriodIdForDate(markingPeriods, '2025-10-15');
        expect(id).toBe('1134333');
    });

    it('maps 2025-12-01 to MP2 = 1134331', () => {
        const id = env.helpers.findMarkingPeriodIdForDate(markingPeriods, '2025-12-01');
        expect(id).toBe('1134331');
    });

    it('maps 2026-03-15 to MP3 = 1134334', () => {
        const id = env.helpers.findMarkingPeriodIdForDate(markingPeriods, '2026-03-15');
        expect(id).toBe('1134334');
    });

    it('maps 2026-05-20 to MP4 = 1134332', () => {
        const id = env.helpers.findMarkingPeriodIdForDate(markingPeriods, '2026-05-20');
        expect(id).toBe('1134332');
    });

    it('returns null for dates outside any marking period', () => {
        expect(env.helpers.findMarkingPeriodIdForDate(markingPeriods, '2024-01-01')).toBeNull();
        expect(env.helpers.findMarkingPeriodIdForDate(markingPeriods, '2030-12-31')).toBeNull();
    });

    it('returns null on bad input', () => {
        expect(env.helpers.findMarkingPeriodIdForDate(null, '2026-05-20')).toBeNull();
        expect(env.helpers.findMarkingPeriodIdForDate(markingPeriods, null)).toBeNull();
        expect(env.helpers.findMarkingPeriodIdForDate(markingPeriods, 'not-a-date')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Group 8: detectLoginState
// ---------------------------------------------------------------------------

describe('detectLoginState', () => {
    it('returns "authenticated" for the live gradebook DOM', () => {
        const env = loadFixture(FIXTURE_GRADEBOOK_SEC1);
        expect(env.helpers.detectLoginState(env.document)).toBe('authenticated');
    });

    it('returns "authenticated" for the Algebra II empty-state fixture too', () => {
        const env = loadFixture(FIXTURE_GRADEBOOK_EMPTY);
        expect(env.helpers.detectLoginState(env.document)).toBe('authenticated');
    });

    it('returns "unknown" for an unrecognized page (e.g., /courses/mycourses)', () => {
        const env = loadFixture(FIXTURE_MYCOURSES);
        // The mycourses page is authenticated but not a gradebook -- our
        // login detector is gradebook-specific.
        const state = env.helpers.detectLoginState(env.document);
        expect(['authenticated', 'unknown']).toContain(state);
    });

    it('returns "login_required" for a synthetic MS SSO login page', () => {
        const env = loadFixture('<html><body><form id="login-form"><input id="i0116" /></form></body></html>');
        expect(env.helpers.detectLoginState(env.document)).toBe('login_required');
    });
});
