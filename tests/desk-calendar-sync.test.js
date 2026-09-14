// desk-calendar-sync.test.js — cross-device calendar grey-out
// (CALENDAR_SYNC_BUILD.md). The Desk hydrates local marks from the server's
// per-resource self-done flag (/donow lessons[].selfDone) so a lesson marked
// Done on ANY device greys on every device for the signed-in student.
// Behavioral test of _hydrateMarksFromDonow in jsdom + static wiring pins.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createContext, runInContext } from 'vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');

function extractFn(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('fn not found: ' + name);
  const open = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced braces: ' + name);
}

const KEY = (e) => 'a2_desk_marks_' + e;

function makeCtx(email) {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://desk.test' });
  const win = dom.window;
  win.getStudentEmail = () => email;
  const ctx = createContext(win);
  runInContext(extractFn(DESK, '_hydrateMarksFromDonow') + '\nwindow.__h = _hydrateMarksFromDonow;', ctx);
  return { win, hydrate: win.__h };
}

describe('_hydrateMarksFromDonow — cross-device grey-out sync', () => {
  // moved to journeys/j2-shared-device.journey.test.js — J2 reloads a shared device across A → B → A without leaking marks, due chip, or SRS state, then hydrates a fresh marks bucket from /donow (supersedes desk-calendar-sync per-student visibility and selfDone hydration behavior)

  it('falls back to <topic>|server when selfDoneArtifacts is absent (older payload)', () => {
    const { win, hydrate } = makeCtx('s@roster.local');
    const changed = hydrate({ lessons: [{ lesson: '1.1', selfDone: true }] }); // no selfDoneArtifacts
    expect(changed).toBe(true);
    const marks = JSON.parse(win.localStorage.getItem(KEY('s@roster.local')));
    expect(marks['1.1|server'].ts).toBeTruthy();
  });

  it('is idempotent — a 2nd pass adds nothing + returns false', () => {
    const { hydrate } = makeCtx('s@roster.local');
    expect(hydrate({ lessons: [{ lesson: '1.1', selfDone: true }] })).toBe(true);
    expect(hydrate({ lessons: [{ lesson: '1.1', selfDone: true }] })).toBe(false);
  });

  it('is additive — never clobbers an existing real mark', () => {
    const { win, hydrate } = makeCtx('s@roster.local');
    win.localStorage.setItem(KEY('s@roster.local'), JSON.stringify({ '1.1|worksheet': { ts: 'real-ts' } }));
    hydrate({ lessons: [{ lesson: '1.1', selfDone: true }] });
    const marks = JSON.parse(win.localStorage.getItem(KEY('s@roster.local')));
    expect(marks['1.1|worksheet'].ts).toBe('real-ts'); // preserved
    expect(marks['1.1|server'].ts).toBeTruthy();         // added alongside
  });

  it('no-ops + returns false when signed out (no email)', () => {
    const { win, hydrate } = makeCtx(null);
    expect(hydrate({ lessons: [{ lesson: '1.1', selfDone: true }] })).toBe(false);
    expect(win.localStorage.getItem(KEY('null'))).toBeNull();
  });

  it('no-ops on a malformed / empty payload', () => {
    const { hydrate } = makeCtx('s@roster.local');
    expect(hydrate(null)).toBe(false);
    expect(hydrate({})).toBe(false);
    expect(hydrate({ lessons: [] })).toBe(false);
  });
});

describe('_hydrateMarksFromDonow — wiring + key format', () => {
  it('renderDoNow hydrates from /donow then re-renders rCal only when marks changed', () => {
    expect(DESK).toMatch(/_syncedMarks = _hydrateMarksFromDonow\(data\)/);
    expect(DESK).toMatch(/_syncedMarks && typeof rCal === 'function'/);
  });

  it('seeds per-artifact marks (+ <topic>|server fallback), additive only', () => {
    const body = extractFn(DESK, '_hydrateMarksFromDonow');
    expect(body).toMatch(/selfDoneArtifacts/);   // per-resource path (e.g. "1.1|worksheet")
    expect(body).toMatch(/\|server/);            // fallback for an older payload
    expect(body).toMatch(/selfDone === true/);   // fallback gate
    expect(body).not.toMatch(/delete\s+marks/);  // never removes a mark
  });

  it('short-circuits in view-as (never seeds the teacher\'s marks from a viewed student)', () => {
    const body = extractFn(DESK, '_hydrateMarksFromDonow');
    expect(body).toMatch(/_viewAsContext/);
  });

  it('_studentMarkSave builds a UNIQUE DESK_DONE itemId for combined topics (no WS-U?- collision)', () => {
    // The unit/lesson parse must accept combined topics like "4.1-2" ([\d-], not \d)
    // so each combined lesson gets its own DESK_DONE itemId.
    expect(DESK).toContain('var um = /^(\\d+)\\.([\\d-]+)$/.exec(topicId');
  });

  it('loads gradebook-client.js, AFTER roster-client.js (the DESK_DONE write needs it)', () => {
    // Regression: this tag was MISSING from the Desk, so _studentMarkSave's
    // `window.gradebookClient` guard failed silently and NO DESK_DONE row was
    // ever written. gradebook-client.js reads window.rosterClient at call time,
    // so it must load after roster-client.js (same order as the worksheets).
    const idxRoster = DESK.indexOf('<script src="roster-client.js">');
    const idxGradebook = DESK.indexOf('<script src="gradebook-client.js">');
    expect(idxRoster).toBeGreaterThan(-1);
    expect(idxGradebook).toBeGreaterThan(idxRoster);
  });
});

describe('worksheet Done gate — 60% threshold + cross-device', () => {
  // moved to journeys/j3-worksheet-done.journey.test.js — J3 worksheet Done is disabled at 59% but at 60% posts one exact WS-…-DESK_DONE payload and updates the tile (supersedes desk-calendar-sync 60% gate pin)

  it('_doneBtn gates the worksheet on the Desk threshold, not the worksheet 80% eligible flag', () => {
    const body = extractFn(DESK, '_doneBtn');
    expect(body).toMatch(/_effPct >= DESK_WORKSHEET_DONE_THRESHOLD/);
    expect(body).toMatch(/reflectionsAllE === true/);
    // cross-device: the gate falls back to the synced ledger Cws when the local
    // fill tracker is absent (worksheet never opened on this device).
    expect(body).toMatch(/_getCwsForTopic/);
    // the old 80% `comp.eligible` gate must be gone from the worksheet branch
    expect(body).not.toMatch(/comp\.eligible !== true/);
  });

  it('instrumented worksheets are exempt from the per-device "open the link first" gate', () => {
    const body = extractFn(DESK, '_doneBtn');
    expect(body).toMatch(/_isInstrumentedWs/);
    expect(body).toMatch(/!entry\.visitedAt && !_isInstrumentedWs/);
  });
});
