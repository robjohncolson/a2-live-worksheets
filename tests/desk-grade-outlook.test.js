// desk-grade-outlook.test.js — current-quarter grade prediction + the two v3
// tracks (PC mastery vs Work engagement) in the Do Now card. (2026-06: was a
// Q1-Q4 strip; now shows only the current quarter + which track drives it.)
// Static parse of the Desk HTML source; no DOM execution.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deskPath = resolve(repo, 'desk.html');
const DESK = existsSync(deskPath) ? readFileSync(deskPath, 'utf8') : null;

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, j + 1);
    }
  }
  throw new Error('unbalanced braces for ' + name);
}

describe('Desk grade outlook (Q1-Q4 strip in Do Now card)', () => {
  it('00: Desk file loads', () => {
    expect(DESK).toBeTypeOf('string');
  });

  it('01: #donow-grades container is rendered inside #donow-card markup', () => {
    // The grades container must live inside the same donow-card body the
    // Do Now message sits in — that's how it stays visually attached.
    expect(DESK).toMatch(/<div\s+id="donow-grades"/);
    // And it must be DEFAULT-HIDDEN (no stale pills before fetch).
    const gradesIdx = DESK.indexOf('id="donow-grades"');
    expect(gradesIdx).toBeGreaterThan(-1);
    // The matching CSS must set display:none.
    expect(DESK).toMatch(/#donow-grades\s*\{[^}]*display\s*:\s*none/);
  });

  it('02: QUARTER_BAND_LABEL is declared with Q1-Q4 DATE labels (SY2627 real marking periods)', () => {
    // Must declare a top-level mapping object so the tooltip text stays in
    // sync with the server-side PHASE3_CONFIG.quarters and the existing
    // start-here.html render. SY2627: units straddle quarters (CED order), so
    // the labels are the quarter DATE windows, not unit lists.
    expect(DESK).toMatch(/const\s+QUARTER_BAND_LABEL\s*=\s*\{/);
    expect(DESK).toMatch(/Q1\s*:\s*['"]Sep 2 – Nov 6['"]/);
    expect(DESK).toMatch(/Q2\s*:\s*['"]Nov 9 – Jan 22['"]/);
    expect(DESK).toMatch(/Q3\s*:\s*['"]Jan 25 – Apr 14['"]/);
    expect(DESK).toMatch(/Q4\s*:\s*['"]Apr 15 – Jun 17['"]/);
    expect(DESK).not.toMatch(/Q1\s*:\s*['"]U1, U2, U3['"]/);
  });

  it('02b: renderDoNowGrades renders the "Schoology today" chip from data.gradebook and the early-bonus chip from the quarter fields', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).toMatch(/data\.gradebook/);
    expect(body).toMatch(/schoologyTotal/);
    expect(body).toMatch(/'Schoology today'/);
    expect(body).toMatch(/q\.earlyLessons/);
    expect(body).toMatch(/q\.aheadLessons/);
    expect(body).toMatch(/q\.earlyBonus/);
    expect(body).not.toMatch(/innerHTML\s*=\s*['"][^'"]*early/); // chips are textContent-only
  });

  it('03: renderDoNowGrades function exists and accepts baseUrl + token', () => {
    expect(DESK).toMatch(/async\s+function\s+renderDoNowGrades\s*\(\s*baseUrl\s*,\s*token\s*\)/);
  });

  it('04: renderDoNowGrades calls /grade with the token query param', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    // P2 (TEACHER_STUDENT_CONSOLE_P2_BUILD.md §3.6): the fetch is now wrapped
    // by _maybeViewAsFetch (typeof-guarded), so the literal pattern is split
    // across endpoint construction + fetch invocation. The endpoint string
    // `/grade?token=` + encodeURIComponent(token) remains present in the source.
    expect(body).toMatch(/['"]\/grade\?token=['"]\s*\+\s*encodeURIComponent\s*\(\s*token\s*\)/);
    expect(body).toMatch(/_maybeViewAsFetch/);
    expect(body).toMatch(/await\s+fetch\s*\(\s*baseUrl\s*\+\s*__va\.endpoint/);
  });

  it('05: renderDoNowGrades iterates Q1, Q2, Q3, Q4 in order', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    // The order array literal is pinned so future refactors don't accidentally
    // drop a quarter or reorder them.
    expect(body).toMatch(/\[\s*['"]Q1['"]\s*,\s*['"]Q2['"]\s*,\s*['"]Q3['"]\s*,\s*['"]Q4['"]\s*\]/);
  });

  it('06: renderDoNowGrades reads quarterGrade, ceiling, pcAvg, workAvg (v3 tracks) from the response', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).toMatch(/\.quarterGrade\b/);
    expect(body).toMatch(/\.ceiling\b/);
    // 2026-06: now shows the current quarter + the two v3 tracks (PC vs Work),
    // not a per-quarter unit count.
    expect(body).toMatch(/\.pcAvg\b/);
    expect(body).toMatch(/\.workAvg\b/);
  });

  it('07: renderDoNowGrades creates pills via createElement (no innerHTML XSS surface)', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    // Per the structure-test policy (no innerHTML on response data), pills
    // must be assembled via createElement + textContent.
    expect(body).toMatch(/createElement\s*\(\s*['"]span['"]/);
    expect(body).toMatch(/\.textContent\s*=/);
    // The host's initial clear is innerHTML="" which is fine (empties only).
    // But NO innerHTML assignment that interpolates response data.
    expect(body, 'must not write response data via innerHTML').not.toMatch(
      /\.innerHTML\s*=\s*[^'"]*(?:gradeRaw|qKey|ceiling|graded|total)/
    );
  });

  it('08: renderDoNowGrades wraps the fetch + render in try/catch (never throws)', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).toMatch(/try\s*\{/);
    expect(body).toMatch(/catch\s*\(/);
    // On any failure path, the host must hide.
    expect(body).toMatch(/host\.style\.display\s*=\s*['"]none['"]/);
  });

  it('09: renderDoNow calls renderDoNowGrades on the success path, typeof-guarded + fire-and-forget', () => {
    const body = fnBody(DESK, 'renderDoNow');
    // The call site itself.
    expect(body).toMatch(/renderDoNowGrades\s*\(\s*baseUrl\s*,\s*token\s*\)/);
    // The call must be fire-and-forget (not awaited) so it never blocks the
    // Do Now message render on /grade latency.
    expect(body, 'renderDoNowGrades call must NOT be awaited').not.toMatch(
      /await\s+renderDoNowGrades/
    );
    // And it must have a .catch so a rejected promise never escapes.
    expect(body).toMatch(/renderDoNowGrades\s*\([^)]*\)\s*\.catch/);
    // Cross-sprint typeof-guard: the call must be wrapped so the DN3a vm
    // test (which loads ONLY renderDoNow into its sandbox) doesn't throw a
    // ReferenceError. Mirrors the paintDonowCells DN3b guard.
    expect(body).toMatch(/typeof\s+renderDoNowGrades\s*===\s*['"]function['"]/);
  });

  it('10: renderDoNow hides the strip at the top of every entry (no stale state)', () => {
    const body = fnBody(DESK, 'renderDoNow');
    // The top-of-function reset clears innerHTML and sets display:none so
    // the strip never shows stale pills when the student signs out / loses
    // their token / etc.
    expect(body).toMatch(/getElementById\s*\(\s*['"]donow-grades['"]/);
    // Find the reset block: it should set display='none' and clear innerHTML.
    const resetIdx = body.indexOf("getElementById('donow-grades'");
    expect(resetIdx).toBeGreaterThan(-1);
    const slice = body.slice(resetIdx, resetIdx + 400);
    expect(slice).toMatch(/display\s*=\s*['"]none['"]/);
    expect(slice).toMatch(/innerHTML\s*=\s*['"]['"]/);
  });

  it('11: CSS for .qpill pills is defined (compact pill aesthetic)', () => {
    // Pins the styling hook the implementation creates pills for.
    expect(DESK).toMatch(/#donow-grades\s+\.qpill/);
    // Empty-state class so empty pills are visually distinct.
    expect(DESK).toMatch(/\.qpill\.empty/);
  });

  it('12: ceiling pill text uses the upward arrow indicator', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    // Must include the upward-arrow Unicode character (or a HTML-safe
    // equivalent textContent like '↑'). Pin the literal so future refactors
    // don't accidentally drop the "if you ace remaining" hint.
    expect(body).toMatch(/['"]↑['"]/);
  });

  it('13: grade strip uses the ROSTER_SERVICE_URL (not Supabase) — server-mediated rule (Phase 0 §6.5)', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    // Phase 0 §6.5: the Desk NEVER hits Supabase directly. The fetch path
    // must use the baseUrl param (which renderDoNow sources from
    // window.ROSTER_SERVICE_URL).
    expect(body, 'must use the baseUrl argument').toMatch(/baseUrl\s*\+/);
    expect(body, 'must NOT reference SUPABASE_URL').not.toMatch(/SUPABASE_URL/);
    expect(body, 'must NOT reference supabase').not.toMatch(/supabase\.co/i);
  });

  // ── Phase 6 pins (+5) ───────────────────────────────────────────────────────

  it('14: renderDoNowGrades reads lessonsDue, lessonsGraded, lessonsTotal from response (Phase 6)', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).toMatch(/\.lessonsDue\b/);
    expect(body).toMatch(/\.lessonsGraded\b/);
    expect(body).toMatch(/\.lessonsTotal\b/);
  });

  it('15: pill tooltip text includes lessons-graded and due-so-far (Phase 6 tooltip upgrade)', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    // The tooltip must reference "lesson" (singular or plural) for the lesson count.
    expect(body).toMatch(/lesson/);
    // Must include "due so far" phrasing.
    expect(body).toMatch(/due so far/);
  });

  it('16: _gradeLessonsCache is populated with data.lessons when present (Phase 6 cache)', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    // Must cache the lessons array for the modal.
    expect(body).toMatch(/_gradeLessonsCache\s*=/);
    expect(body).toMatch(/data\.lessons/);
  });

  it('17: empty-state pill renders when lessonsDue is 0 (no quarters counted yet)', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    // The pill class includes "empty" when gradeRaw is null.
    expect(body).toMatch(/qpill.*empty/);
    // The empty pill text must be the dash character.
    expect(body).toMatch(/['"]—['"]/);
  });

  it('18: renderDoNowGrades caches lessons array as _gradeLessonsCache (null for non-array)', () => {
    // Must handle missing/non-array data.lessons gracefully.
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).toMatch(/Array\.isArray\s*\(\s*data\.lessons\s*\)/);
  });

  // ── 2026-06: show only the CURRENT quarter + the two v3 tracks ───────────────

  it('19: shows only the CURRENT quarter (quarterOfDate(today)), with a fallback', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body, 'picks the current quarter via quarterOfDate').toMatch(/quarterOfDate\s*\(/);
    expect(body, 'renders a single current-quarter pill keyed by curQ').toMatch(/curQ/);
    // No per-quarter render loop anymore (the order array remains only as the
    // fallback scan for the first graded quarter).
    expect(body, 'no per-quarter render loop').not.toMatch(/for\s*\(\s*var\s+i\s*=\s*0;[^)]*order\.length/);
  });

  it('20: renders the two v3 tracks (PC mastery + Work engagement) for the current quarter', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).toMatch(/_trackChip\s*\(/);
    expect(body).toMatch(/['"]Assessment['"]/);
    expect(body).toMatch(/['"]Work['"]/);
  });
});
