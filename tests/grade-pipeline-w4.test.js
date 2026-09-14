/**
 * tests/grade-pipeline-w4.test.js
 *
 * W4: the Do Now grade pills refresh after a worksheet/quiz is marked Done.
 * _studentMarkSave's success path must (re)invoke renderDoNowGrades,
 * typeof-guarded so the Desk's vm-style unit tests (which extract a function
 * into a partial sandbox) are unaffected.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desk = readFileSync(resolve(ROOT, 'desk.html'), 'utf8');

// _studentMarkSave body -- generous slice; the next function carries no
// renderDoNowGrades reference, so a small overshoot is harmless. (Bumped to
// 4400 as the DESK_DONE block grew: combined-topic regex + the blooket
// cross-device self-attest comments.)
const saveIdx = desk.indexOf('function _studentMarkSave');
const saveBody = saveIdx === -1 ? '' : desk.slice(saveIdx, saveIdx + 4400);

describe('W4 -- Do Now grade pills refresh after Done', () => {
    it('_studentMarkSave exists', () => {
        expect(saveBody.length).toBeGreaterThan(0);
    });

    it('the W4 refresh block is present in _studentMarkSave', () => {
        expect(saveBody).toContain('W4: refresh the Do Now grade pills');
        expect(saveBody).toContain('renderDoNowGrades(');
    });

    it('the renderDoNowGrades call is typeof-guarded', () => {
        expect(saveBody).toContain("typeof renderDoNowGrades === 'function'");
    });

    it('the refresh fires after the rCal calendar re-render', () => {
        const rCalIdx = saveBody.indexOf('rCal()');
        const refreshIdx = saveBody.indexOf('renderDoNowGrades(');
        expect(rCalIdx).toBeGreaterThan(-1);
        expect(refreshIdx).toBeGreaterThan(rCalIdx);
    });

    it('the refresh is wrapped so it never breaks the Done flow', () => {
        const w4Idx = saveBody.indexOf('W4: refresh the Do Now grade pills');
        const w4Block = saveBody.slice(w4Idx, w4Idx + 600);
        // try/catch around the block + .catch on the promise.
        expect(w4Block).toContain('catch');
    });
});

describe('W1 fold -- day-grade modal shows the worksheet score, not a raw count', () => {
    // Codex W1 MAJOR fold: items.worksheet became blank-level score rows, so the
    // day-grade modal must show the worksheet score (lesson.Cws), not the
    // misleading "Worksheet completed: N" count of recorded rows.
    const modalIdx = desk.indexOf('Array.isArray(items.worksheet)');
    const modalBody = modalIdx === -1 ? '' : desk.slice(modalIdx, modalIdx + 1600);

    it('the day-grade modal worksheet branch exists', () => {
        expect(modalBody.length).toBeGreaterThan(0);
    });

    it('the worksheet line uses lesson.Cws', () => {
        expect(modalBody).toContain('lesson.Cws');
    });

    it('the misleading "Worksheet completed: N" label is gone', () => {
        expect(modalBody).not.toContain('Worksheet completed:');
    });
});
