// grade-engine-bundle-parity.test.js — the no-divergence guarantee for
// ANDROID Phase 2 (item-level re-derivation). The student device re-derives its
// own grade OFFLINE from grade-engine.bundle.js; this proves that bundle is
// EXACTLY the server engine:
//
//   1. Drift check  — regenerating the bundle in-memory equals the committed file
//                     (so an engine edit without a rebuild fails loudly here).
//   2. Parity check — bundle.computeGrade / buildGradebook deep-equal the canonical
//                     server functions over the full sim-world archetype set.
//
// If this test fails after you touch the engine, run:
//   node scripts/build-grade-engine.mjs

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { generateBundle } from '../scripts/build-grade-engine.mjs';
import { computeGrade as serverComputeGrade } from '../roster-server/grade.js';
import { buildGradebook as serverBuildGradebook } from '../roster-server/gradebook-grid.js';
import {
  CONFIG,
  ANSWER_KEY,
  GRADE_OPTS,
  GRADE_OPTS_EARLY,
  SECTION,
  AS_OF,
  ARCHETYPES,
  materialize,
} from '../roster-server/tests/fixtures/sim-world.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = resolve(__dirname, '..', 'grade-engine.bundle.js');

// Load the committed bundle into an isolated sandbox (no global pollution).
function loadBundle(src) {
  const sandbox = {};
  // The bundle resolves `root` from its `window` arg; `module` undefined skips
  // the CommonJS export branch. It returns window.GradeEngine.
  const fn = new Function('window', 'module', src + '\nreturn window.GradeEngine;');
  return fn(sandbox, undefined);
}

const TODAY_STR = AS_OF.slice(0, 10); // '2026-09-20'

describe('grade-engine bundle — drift', () => {
  it('committed grade-engine.bundle.js matches a fresh generation', () => {
    const committed = readFileSync(BUNDLE_PATH, 'utf8');
    const fresh = generateBundle();
    // Tip on failure: run `node scripts/build-grade-engine.mjs`.
    expect(committed).toBe(fresh);
  });
});

describe('grade-engine bundle — client≡server parity', () => {
  let Engine;

  beforeAll(() => {
    Engine = loadBundle(readFileSync(BUNDLE_PATH, 'utf8'));
  });

  it('exposes the public API', () => {
    expect(typeof Engine.computeGrade).toBe('function');
    expect(typeof Engine.buildGradebook).toBe('function');
    expect(typeof Engine._engineVersion).toBe('string');
  });

  // Every archetype, at the normal clock and (where it matters) the EARLY clock,
  // exercises the full v3 engine: quiz-less openers, combined worksheets, future
  // and null-date lessons, PC bucketing, Blooket track, null-track renormalization.
  const cases = [];
  for (const name of Object.keys(ARCHETYPES)) {
    cases.push({ label: `${name} @ AS_OF`, plan: ARCHETYPES[name](), opts: GRADE_OPTS });
    cases.push({ label: `${name} @ EARLY`, plan: ARCHETYPES[name](), opts: GRADE_OPTS_EARLY });
  }

  for (const { label, plan, opts } of cases) {
    it(`computeGrade parity — ${label}`, () => {
      const rows = materialize(plan);
      const server = serverComputeGrade(rows, ANSWER_KEY, CONFIG, opts);
      const client = Engine.computeGrade(rows, ANSWER_KEY, CONFIG, opts);
      expect(client).toEqual(server);
    });

    it(`buildGradebook parity — ${label}`, () => {
      const rows = materialize(plan);
      const grade = serverComputeGrade(rows, ANSWER_KEY, CONFIG, opts);
      const gbArgs = { lessonSchedule: opts.lessonSchedule, section: SECTION, todayStr: TODAY_STR };
      const server = serverBuildGradebook(grade, gbArgs);
      const client = Engine.buildGradebook(grade, gbArgs);
      expect(client).toEqual(server);
    });
  }

  it('empty ledger yields the same empty shape', () => {
    const server = serverComputeGrade([], ANSWER_KEY, CONFIG, GRADE_OPTS);
    const client = Engine.computeGrade([], ANSWER_KEY, CONFIG, GRADE_OPTS);
    expect(client).toEqual(server);
  });

  it.each([0, 0.5, 1])('exit ticket %s: online, offline, and gradebook preserve extra credit', score => {
    const rows = [...materialize(ARCHETYPES.diligent_on_pace()),
      { item_id: 'WS-U1L1-exitTicket', source: 'frq', score, attempt: 1, recorded_at: AS_OF }];
    const server = serverComputeGrade(rows, ANSWER_KEY, CONFIG, GRADE_OPTS);
    const client = Engine.computeGrade(rows, ANSWER_KEY, CONFIG, GRADE_OPTS);
    expect(client).toEqual(server);
    const expected = 100 + (score >= 0.75 ? 5 : score >= 0.25 ? 3 : 1);
    expect(client.lessons.find(L => L.lessonKey === '1.1').lessonGradeNoQuiz).toBe(expected);
    const args = { lessonSchedule: GRADE_OPTS.lessonSchedule, section: SECTION, todayStr: TODAY_STR };
    const grid = Engine.buildGradebook(client, args);
    expect(grid).toEqual(serverBuildGradebook(server, args));
    expect(grid.quarters.Q1.cells['FA:1.1']).toBe(expected);
  });

  it('M2d: bundle empties BLOOKET_BONUS_TOPICS; opts.blooketBonusTopics stamps 2.9 online≡offline', () => {
    // Empty module default is intentional — clients MUST pass bonus via opts
    // (offline pack / Desk re-derive). Parity fixture includes real bonus 2.9.
    const src = readFileSync(BUNDLE_PATH, 'utf8');
    expect(src).toMatch(/const BLOOKET_BONUS_TOPICS = \[\]/);
    expect(GRADE_OPTS.blooketBonusTopics).toEqual(['2.9']);
    expect(GRADE_OPTS.blooketPresence).toContain('2.9');
    expect(GRADE_OPTS.blooketRequired).not.toContain('2.9');

    const server = serverComputeGrade([], ANSWER_KEY, CONFIG, GRADE_OPTS);
    const client = Engine.computeGrade([], ANSWER_KEY, CONFIG, GRADE_OPTS);
    expect(client).toEqual(server);
    const s29 = server.lessons.find((L) => L.lessonKey === '2.9');
    const c29 = client.lessons.find((L) => L.lessonKey === '2.9');
    expect(s29).toBeTruthy();
    expect(s29.hasBlooket).toBe(true);
    expect(s29.blooketBonus).toBe(true);
    expect(c29.blooketBonus).toBe(true);
    const s12 = server.lessons.find((L) => L.lessonKey === '1.2');
    expect(s12.blooketBonus).toBe(false);
    expect(s12.hasBlooket).toBe(true);

    // Shared gradebook title is the student-facing contract
    const gb = serverBuildGradebook(server, {
      lessonSchedule: GRADE_OPTS.lessonSchedule,
      section: SECTION,
      todayStr: TODAY_STR,
    });
    const cols = Object.values(gb.quarters || {}).flatMap((q) => q.columns || []);
    const bl29 = cols.find((c) => c.key === 'BL:2.9');
    expect(bl29).toBeTruthy();
    expect(bl29.title).toBe('2.9 Blooket (bonus)');
  });
});
