// feeder-bestwins-invariants.property.test.js — TYPECHECK_HARDENING_SPEC.md P2 (prop 12b).
// fast-check over the feeder BEST-WINS FLOOR — the sole end-to-end downgrade guard.
//
// The server upsert (student,source,item_id,attempt) does NOT max: a weaker re-run that
// reaches it OVERWRITES a better recorded score. The only thing standing between a lower
// re-run and a downgraded grade is the client-side floor in the two Blooket/flashcard
// feeder callers, both extracted from the SHIPPED HTML and executed for real here:
//   - mobile-home.html   _fcCommit (+ _fcBlooketFloor / _fcBumpLocalBlooket / _applyGradeData)
//   - desk.html   _blooketCommit (floor = max(0, /grade, local mark))
//
// tests/mobile-home-flashcards.test.js pins ONE best-wins example behaviorally; this file
// generalizes it against a last-write-wins server model, in two honest halves:
//   A. CROSS-DEVICE: when the pre-commit /grade refresh SUCCEEDS, a foreign best is never
//      overwritten downward. (With a FAILED refresh a foreign best is unknowable client-side
//      — that residual needs the server to max, which it deliberately does not.)
//   B. SAME-DEVICE, HOSTILE NETWORK: refresh attempts may FAIL and stale trailing /grade
//      payloads may wipe the synced map (_applyGradeData rebuilds it wholesale) — the
//      device's own recorded best must still never be overwritten downward. This is the
//      property that exposed the launcher's original wipe hole: the local bump used to
//      live INSIDE _gradeByTopic, so a stale payload erased it; _fcLocalBest now keeps
//      the local-best half of the floor outside the map (and in localStorage).
//
// The persisted local best is scoped PER STUDENT (Codex blocker on the v1 fix): the
// synced half of the floor is the signed-in student's /grade, so a device-global local
// best on a shared classroom device would let student A's 90 suppress student B's
// legitimate 60. A signed-out run must never persist a bump at all — gradebook-client
// drops the write (no-identity), so a persisted floor for it would suppress real
// scores the server never received.
//
// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const repo = resolve(import.meta.dirname, '..');
const HOME = readFileSync(resolve(repo, 'mobile-home.html'), 'utf8');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');
const FLASHCARDS = readFileSync(resolve(repo, 'flashcards.js'), 'utf8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let depth = 0;
  for (let j = src.indexOf('{', m.index); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(m.index, j + 1);
  }
  throw new Error('unbalanced braces for ' + name);
}

const TOPIC = '4.1-2';   // combined topic — exercises the BL-U4-L1-2-DESK_DONE id shape

// ── Launcher harness: the REAL _fcCommit chain in a vm ─────────────────────────
// loadGrade is stubbed to a no-op: in the shipped code the trailing loadGrade inside
// _fcCommit is a fire-and-forget fetch whose (possibly stale) response lands LATER —
// the end-to-end properties model that response as an explicit applyGrade op instead,
// and a FAILED refresh attempt as no applyGrade at all (loadGrade resolves false
// without touching state when offline / not signed in / non-ok).
// Pass `storage` to back _fcLocalBest with a fake localStorage (reload persistence).
// The signed-in student is switchable via setUser (null = signed out) — _fcStudent
// reads the BARE rosterClient global (page scripts see window.* as globals), so the
// stub is installed as both window.rosterClient and a context global.
function loadLauncher({ storage } = {}) {
  const emissions = [];
  let currentUser = { username: 'kid' };
  const rosterClient = { current: () => currentUser, token: () => (currentUser ? 'tok' : null) };
  const win = {
    rosterClient,
    gradebookClient: { record: (row) => { emissions.push(row); return { ok: true, ledgerId: 'L1' }; } },
  };
  const ctx = createContext({
    window: win, rosterClient, document: { getElementById: () => null }, console,
    Math, JSON, String, Number, Array, Object, Promise, RegExp, Date,
    isFinite, parseInt, parseFloat,
    ...(storage ? { localStorage: storage } : {}),   // absent by default, like the vm has no DOM
  });
  const script = [
    FLASHCARDS,                                       // window.Flashcards (pure, no DOM)
    'var _gradeByTopic = {}, _lastLessons = [], _gradeOwner = null;',
    'function loadGrade() { return Promise.resolve(false); }',
    'var FC_BEST_KEY = "a2_mobile_fcbest_v2";',
    fnBody(HOME, '_normTopic'),
    fnBody(HOME, '_applyGradeData'),
    'var FC = window.Flashcards;',
    fnBody(HOME, '_fcStudent'),
    fnBody(HOME, '_fcLoadLocalBest'),
    'var _fcLocalBest = _fcLoadLocalBest();',         // mirrors the shipped hydrate line
    fnBody(HOME, '_fcBlooketFloor'),
    fnBody(HOME, '_fcBumpLocalBlooket'),
    fnBody(HOME, '_fcCommit'),
    // applyGrade mirrors the shipped loadGrade success path: the owner is stamped from
    // the token that made the fetch (= the CURRENT student for a fresh refresh);
    // applyGradeAs models a PREVIOUS student's response landing late (owner ≠ current).
    '({ applyGrade: function (g) { _gradeOwner = _fcStudent(); _applyGradeData(g, false); },',
    '   applyGradeAs: function (o, g) { _gradeOwner = o; _applyGradeData(g, false); },',
    '   floor: function (t) { return _fcBlooketFloor(t); },',
    '   bump: function (t, s) { _fcBumpLocalBlooket(t, s); },',
    '   commit: function (t, s) { return _fcCommit(t, s); },',
    '   setEntry: function (t, v) { _gradeOwner = _fcStudent(); _gradeByTopic = {}; _gradeByTopic[_normTopic(t)] = { blooket: v }; },',
    '   reset: function () { _gradeByTopic = {}; _fcLocalBest = {}; _gradeOwner = null; } })',
  ].join('\n');
  const api = runInContext(script, ctx);
  const setUser = (name) => { currentUser = name ? { username: name } : null; };
  return { api, emissions, setUser };
}

// A /grade payload carrying one blooket value for TOPIC (null = no row recorded yet).
// Field fidelity: the roster server emits `lessonKey` (lesson-grade.js), NOT `topic`.
// The value is a plain number live; the {score} object shape is the floor's legacy
// cache branch — exercised via asObj below.
const payloadFor = (score, asObj) => ({
  ok: true, quarters: [],
  lessons: score == null ? [] : [{ lessonKey: TOPIC, lessonGrade: 55, blooket: asObj ? { score } : score }],
});

// ── Desk harness: the REAL _blooketCommit in a vm ──────────────────────────────
// _studentMarkSave is stubbed to its documented contract (the comment inside
// _blooketCommit): recordProgress writes mark.score synchronously, then the BL- ledger
// row goes to the server (the write the upsert applies last-write-wins). getStudentMarks
// is localStorage-backed in the Desk, so marks PERSIST across grade refreshes.
// withRefresh wires the real internal _refreshGrade → renderDoNowGrades path to a
// host-supplied fresh /grade read; without it (offline Desk) the guard skips, exactly
// as the typeof-gated shipped code does.
function loadDesk({ withRefresh }) {
  const emissions = [];
  let freshLessons = () => null;
  const win = { ROSTER_SERVICE_URL: 'https://api.test', rosterClient: { token: () => 'tok' } };
  const ctx = createContext({
    window: win, console,
    Math, JSON, String, Number, Array, Object, Promise, Date, isFinite,
    __emit: (topic, score) => emissions.push({ topic, score }),
    __fresh: () => freshLessons(),
  });
  const script = [
    'var _gradeLessonsCache = null, _lastResourcePanel = null;',
    'var __marks = {};',
    'function getStudentMarks() { return __marks; }',
    'async function _studentMarkSave(btn, topic, artifact, score) {',
    '  __marks[topic + "|" + artifact] = { score: score };',
    '  __emit(topic, score);',
    '  return true;',
    '}',
    withRefresh
      ? 'function renderDoNowGrades(base, tok) { _gradeLessonsCache = __fresh(); return Promise.resolve(); }'
      : '',
    fnBody(DESK, '_blooketScoreFor'),
    fnBody(DESK, '_blooketCommit'),
    '({ commit: function (t, s) { return _blooketCommit(null, t, s); },',
    '   setLessons: function (x) { _gradeLessonsCache = x; },',
    '   setMark: function (t, s) { __marks[t + "|blooket"] = { score: s }; },',
    '   reset: function () { __marks = {}; _gradeLessonsCache = null; } })',
  ].join('\n');
  const api = runInContext(script, ctx);
  return { api, emissions, setFresh: (fn) => { freshLessons = fn; } };
}

const lessonsFor = (score) => (score == null ? null : [{ lessonKey: TOPIC, blooket: score }]);

// ────────────────────────────────────────────────────────────────────────────────
describe('launcher best-wins floor (mobile-home _fcCommit, prop 12b)', () => {
  let L;
  beforeAll(() => { L = loadLauncher(); });
  const start = () => { L.setUser('kid'); L.api.reset(); L.emissions.length = 0; };

  it('emit gate: a run records iff it strictly beats the synced floor, with the exact Desk-parity row', () => {
    fc.assert(fc.property(
      fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),   // synced blooket (null = no row)
      fc.boolean(),                                                 // legacy {score} object shape
      fc.integer({ min: 0, max: 100 }),                             // run score
      (synced, asObj, s) => {
        start();
        L.api.applyGrade(payloadFor(synced, asObj));
        const res = L.api.commit(TOPIC, s);
        const floor = synced == null ? -1 : synced;
        if (s > floor) {
          expect(L.emissions).toHaveLength(1);
          expect(L.emissions[0]).toMatchObject({
            source: 'worksheet', itemId: 'BL-U4-L1-2-DESK_DONE', unit: 'U4',
            topic: TOPIC, response: { selfAttest: 'blooket' }, score: s, attempt: 1,
          });
        } else {
          expect(res).toMatchObject({ skipped: true, floor });
          expect(L.emissions).toHaveLength(0);
        }
      },
    ), { examples: [[50, false, 50], [50, true, 50], [100, false, 100], [null, false, 0]] });   // force the > vs >= boundary
  });

  it('bump→floor agreement for ANY topic spelling (a _normTopic mismatch would break the floor)', () => {
    // '__proto__' deliberately not generated: bracket-writes on it pollute the shared vm
    // realm's Object.prototype across runs; the launcher's topics come from teacher-authored
    // lesson ids, and the failure direction there is fail-safe (blocks records, never downgrades).
    fc.assert(fc.property(
      fc.oneof(fc.constantFrom('4.1-2', 'U4L1', 'u4-l1', '4.1', '9.10', ''), fc.string()),
      fc.integer({ min: 0, max: 100 }),
      (topic, s) => {
        fc.pre(topic !== '__proto__');
        start();
        L.api.bump(topic, s);
        expect(L.api.floor(topic)).toBeGreaterThanOrEqual(s);
      },
    ));
  });

  it('garbage synced blooket shapes never throw, read as unknown (-1), and never block a legit run', () => {
    const junkBlooket = fc.oneof(
      fc.constant(undefined), fc.constant(null), fc.boolean(), fc.string(),
      fc.constant(NaN), fc.constant(Infinity), fc.constant(-Infinity),
      fc.array(fc.integer(), { maxLength: 3 }),
      fc.record({ score: fc.oneof(fc.string(), fc.constant(NaN), fc.constant(null)) }),
    );
    fc.assert(fc.property(junkBlooket, fc.integer({ min: 0, max: 100 }), (junk, s) => {
      start();
      L.api.setEntry(TOPIC, junk);
      expect(L.api.floor(TOPIC)).toBe(-1);
      L.api.commit(TOPIC, s);
      expect(L.emissions).toHaveLength(1);
      expect(L.emissions[0].score).toBe(s);
    }));
  });

  it('within a session (no syncs) the local bump makes emissions EXACTLY the strictly-rising prefix maxima', () => {
    fc.assert(fc.property(
      fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 20 }),
      (runs) => {
        start();
        for (const s of runs) L.api.commit(TOPIC, s);
        // everything that beat the running best was emitted; nothing else was
        let best = -1;
        const expected = [];
        for (const s of runs) if (s > best) { expected.push(s); best = s; }
        expect(L.emissions.map((r) => r.score)).toEqual(expected);
      },
    ));
  });

  it('E2E-A CROSS-DEVICE: with the pre-commit refresh succeeding, a foreign best on the LWW upsert never downgrades', () => {
    fc.assert(fc.property(
      fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),   // pre-existing row from another device
      fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 15 }),
      (seed, runs) => {
        start();
        const serverStates = [seed];                    // LWW upsert: each write REPLACES
        const current = () => serverStates[serverStates.length - 1];
        for (const s of runs) {
          L.api.applyGrade(payloadFor(current()));      // _fcFinish refreshes BEFORE committing
          const before = L.emissions.length;
          L.api.commit(TOPIC, s);
          if (L.emissions.length > before) {
            serverStates.push(L.emissions[L.emissions.length - 1].score);
          }
        }
        const recorded = serverStates.filter((v) => v != null);
        for (let i = 1; i < recorded.length; i++) {
          expect(recorded[i]).toBeGreaterThan(recorded[i - 1]);   // never overwritten downward
        }
      },
    ));
  });

  it('E2E-B SAME-DEVICE, HOSTILE NETWORK: failed refresh attempts + stale trailing /grade wipes never let a weaker re-run overwrite this device\'s recorded best', () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        score: fc.integer({ min: 0, max: 100 }),
        refreshOk: fc.boolean(),                        // _fcFinish only ATTEMPTS the refresh — offline / hiccup commits anyway
        // a trailing fire-and-forget /grade response computed from an OLDER server state
        // (the GET racing this run's own record POST) — _applyGradeData rebuilds the map
        // from it, wiping any in-map bump
        staleIdx: fc.option(fc.nat(20), { nil: null }),
      }), { minLength: 1, maxLength: 15 }),
      (ops) => {
        start();
        const serverStates = [null];                    // same-device scope: no foreign seed
        const current = () => serverStates[serverStates.length - 1];
        for (const op of ops) {
          if (op.refreshOk) L.api.applyGrade(payloadFor(current()));
          const before = L.emissions.length;
          L.api.commit(TOPIC, op.score);
          if (L.emissions.length > before) {
            serverStates.push(L.emissions[L.emissions.length - 1].score);
          }
          if (op.staleIdx != null) {
            L.api.applyGrade(payloadFor(serverStates[op.staleIdx % serverStates.length]));
          }
        }
        const recorded = serverStates.filter((v) => v != null);
        for (let i = 1; i < recorded.length; i++) {
          expect(recorded[i]).toBeGreaterThan(recorded[i - 1]);
        }
      },
    ));
  });

  it('SHARED DEVICE: one student\'s local best never floors another student (per-student scoping)', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 100 }),                 // student A's recorded best
      fc.integer({ min: 0, max: 100 }),                 // student B's run on the same device
      (a, b) => {
        start();                                        // signed in as 'kid' (A)
        L.api.commit(TOPIC, a);                         // A records a + bumps A's local best
        L.setUser('other_kid');                         // B signs in on the same device
        L.api.applyGrade(payloadFor(null));             // B's sign-in /grade refresh: no row for B
        expect(L.api.floor(TOPIC)).toBe(-1);            // A's best must NOT floor B
        const before = L.emissions.length;
        L.api.commit(TOPIC, b);
        expect(L.emissions.length).toBe(before + 1);    // B's legitimate run records
        expect(L.emissions[L.emissions.length - 1].score).toBe(b);
        L.setUser('kid');                               // back to A: A's own floor is intact
        expect(L.api.floor(TOPIC)).toBeGreaterThanOrEqual(a);
      },
    ));
  });

  it('SHARED DEVICE + FAILED REFRESH: A\'s in-memory synced map never floors B when B\'s /grade refresh fails', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 100 }),               // student A's synced + recorded score
      fc.integer({ min: 0, max: 100 }),               // student B's run on the same device
      (a, b) => {
        start();                                      // signed in as 'kid' (A)
        L.api.applyGrade(payloadFor(a));              // A's own /grade sync fills the map
        L.api.commit(TOPIC, a);                       // and A re-records their best
        L.setUser('other_kid');                       // B signs in on the same device
        // NO applyGrade for B: the sign-in /grade refresh FAILED (offline / hiccup),
        // so A's blooket value is still sitting in the in-memory map.
        const before = L.emissions.length;
        L.api.commit(TOPIC, b);
        expect(L.emissions.length).toBe(before + 1);  // B's legitimate run records anyway
        expect(L.emissions[L.emissions.length - 1].score).toBe(b);
        // …and A's LATE-LANDING /grade response (fetched with A's token before the
        // switch) must not poison B either — clearing-on-sign-in alone misses this.
        L.api.applyGradeAs('kid', payloadFor(a));
        expect(L.api.floor(TOPIC)).toBeLessThanOrEqual(b);   // only B's own local best floors B
      },
    ));
  });

  it('the shipped /grade cache + fetch are owner-stamped (the boot/loadGrade halves the vm harness cannot extract)', () => {
    expect(HOME).toContain('var owner = _fcStudent();');
    expect(HOME).toContain('JSON.stringify({ lessons: g.lessons, quarters: g.quarters, owner: owner })');
    expect(HOME).toContain("_gradeOwner = (_cgp && typeof _cgp.owner === 'string') ? _cgp.owner : null;");
  });

  it('a signed-out run never persists a bump (cannot poison a future signed-in floor)', () => {
    const mem = {};
    const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
    const H = loadLauncher({ storage });
    H.setUser(null);                                    // wall failed open / signed out mid-session
    H.api.commit(TOPIC, 90);                            // gradebook-client drops this write (no-identity)
    expect(mem['a2_mobile_fcbest_v2']).toBeUndefined();   // nothing persisted for it
    H.setUser('kid');
    H.api.applyGrade(payloadFor(null));                 // sign-in /grade refresh clears the session map
    expect(H.api.floor(TOPIC)).toBe(-1);                // the signed-in floor is clean
    H.api.commit(TOPIC, 60);
    expect(H.emissions[H.emissions.length - 1].score).toBe(60);
  });

  it('the local best survives a reload (localStorage-backed), stays per-student, and drops the v1 device-global key', () => {
    const mem = { a2_mobile_fcbest_v1: JSON.stringify({ '4.1': 95 }) };   // leaky v1 leftover
    const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
    const A = loadLauncher({ storage });
    expect(mem['a2_mobile_fcbest_v1']).toBeUndefined();   // v1 purged on load, not honored
    expect(A.api.floor(TOPIC)).toBe(-1);
    A.api.bump(TOPIC, 90);                              // e.g. the 90 POST is still queued offline
    const B = loadLauncher({ storage });                // page reload: fresh state, same device
    expect(B.api.floor(TOPIC)).toBeGreaterThanOrEqual(90);     // same student ('kid'): still floored
    B.api.commit(TOPIC, 60);
    expect(B.emissions).toHaveLength(0);
    B.setUser('other_kid');                             // a different student on the same device
    expect(B.api.floor(TOPIC)).toBe(-1);                // is NOT floored by kid's 90
    B.api.commit(TOPIC, 60);
    expect(B.emissions).toHaveLength(1);
    expect(B.emissions[0].score).toBe(60);
  });

  it('the shipped _fcFinish refreshes /grade BEFORE _fcCommit (the discipline E2E-A models)', () => {
    const body = fnBody(HOME, '_fcFinish');
    expect(body).not.toContain('_fcCommit(');
    expect(body).toContain('recordFlashcardRun');
    const gate = body.indexOf('function finishCommit');
    expect(gate).toBe(-1);
    expect(body.slice(0, gate)).not.toMatch(/_fcCommit\s*\(/);   // no commit path skips the refresh
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe('Desk best-wins floor (_blooketCommit, prop 12b)', () => {
  let OFFLINE, ONLINE;
  beforeAll(() => {
    OFFLINE = loadDesk({ withRefresh: false });
    ONLINE = loadDesk({ withRefresh: true });
  });
  const start = (H) => { H.api.reset(); H.emissions.length = 0; };

  it('emit gate: a run records iff it beats max(0, synced /grade, local mark) — score 0 never records', async () => {
    await fc.assert(fc.asyncProperty(
      fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),   // synced /grade blooket
      fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),   // prior local mark
      fc.integer({ min: 0, max: 100 }),                             // run score
      async (synced, mark, s) => {
        start(OFFLINE);
        OFFLINE.api.setLessons(lessonsFor(synced));
        if (mark != null) OFFLINE.api.setMark(TOPIC, mark);
        await OFFLINE.api.commit(TOPIC, s);
        const floor = Math.max(0, synced == null ? 0 : synced, mark == null ? 0 : mark);
        if (s > floor) {
          expect(OFFLINE.emissions).toHaveLength(1);
          expect(OFFLINE.emissions[0]).toEqual({ topic: TOPIC, score: s });
        } else {
          expect(OFFLINE.emissions).toHaveLength(0);
        }
      },
    ), { examples: [[50, null, 50], [null, 50, 50], [null, null, 0], [0, null, 0]] });   // force the > vs >= boundary
  });

  it('END-TO-END: the REAL internal refresh + LWW upsert never downgrades, even when the local cache went stale', async () => {
    await fc.assert(fc.asyncProperty(
      fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),   // cross-device pre-existing best
      fc.array(fc.record({
        score: fc.integer({ min: 0, max: 100 }),
        staleIdx: fc.option(fc.nat(20), { nil: null }),             // scribble an OLD state into the cache
      }), { minLength: 1, maxLength: 12 }),
      async (seed, ops) => {
        start(ONLINE);
        const serverStates = [seed];
        const current = () => serverStates[serverStates.length - 1];
        ONLINE.setFresh(() => lessonsFor(current()));
        for (const op of ops) {
          if (op.staleIdx != null) {
            ONLINE.api.setLessons(lessonsFor(serverStates[op.staleIdx % serverStates.length]));
          }
          const before = ONLINE.emissions.length;
          await ONLINE.api.commit(TOPIC, op.score);   // real code: refresh → floor → maybe save
          if (ONLINE.emissions.length > before) {
            serverStates.push(ONLINE.emissions[ONLINE.emissions.length - 1].score);
          }
        }
        const recorded = serverStates.filter((v) => v != null);
        for (let i = 1; i < recorded.length; i++) {
          expect(recorded[i]).toBeGreaterThan(recorded[i - 1]);
        }
      },
    ));
  });

  it('OFFLINE Desk (no /grade refresh): the persistent local mark alone prevents a same-device downgrade', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.record({
        score: fc.integer({ min: 0, max: 100 }),
        staleIdx: fc.option(fc.nat(20), { nil: null }),
      }), { minLength: 1, maxLength: 12 }),
      async (ops) => {
        start(OFFLINE);
        const serverStates = [null];                  // same-device scope: no foreign seed
        for (const op of ops) {
          if (op.staleIdx != null) {
            OFFLINE.api.setLessons(lessonsFor(serverStates[op.staleIdx % serverStates.length]));
          }
          const before = OFFLINE.emissions.length;
          await OFFLINE.api.commit(TOPIC, op.score);
          if (OFFLINE.emissions.length > before) {
            serverStates.push(OFFLINE.emissions[OFFLINE.emissions.length - 1].score);
          }
        }
        const recorded = serverStates.filter((v) => v != null);
        for (let i = 1; i < recorded.length; i++) {
          expect(recorded[i]).toBeGreaterThan(recorded[i - 1]);
        }
      },
    ));
  });
});
