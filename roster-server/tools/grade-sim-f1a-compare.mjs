#!/usr/bin/env node
// grade-sim-f1a-compare.mjs — show the F1/F3 fixes' effect on a synthetic
// population, and specifically the F1-A modes, so the teacher can choose from
// data (GRADE_FIX_F1_F3_BUILD.md, the "see both in the sweep first" decision).
//
// Runs the SAME deterministic population under four policies and prints, for each:
// whole-population + bottom-quartile distribution, plus the F1 "smoking gun"
// (the ahead-of-schedule archetype's grade vs its on-pace baseline).

import { computeGrade } from '../grade.js';
import {
  CONFIG, QUARTER_KEY, ANSWER_KEY, GRADE_OPTS, ATOMS, ARCHETYPES, materialize,
} from '../tests/fixtures/sim-world.js';

const RANDOM_STUDENT_COUNT = 200;
const RANDOM_SEED = 0x5eed2026;

const POLICIES = [
  { key: 'today', label: 'today (no fixes)', cfg: { ...CONFIG } },
  { key: 'fix_count_all', label: 'fixes + count-all', cfg: { ...CONFIG, v3FixQuizZero: true, v3FixCwsReveal: true, v3AheadOfScheduleLessons: 'count-all' } },
  { key: 'fix_only_helps', label: 'fixes + only-helps', cfg: { ...CONFIG, v3FixQuizZero: true, v3FixCwsReveal: true, v3AheadOfScheduleLessons: 'only-helps' } },
  { key: 'fix_not_until_due', label: 'fixes + not-until-due', cfg: { ...CONFIG, v3FixQuizZero: true, v3FixCwsReveal: true, v3AheadOfScheduleLessons: 'not-until-due' } },
];

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPopulation() {
  const pop = [];
  for (const make of Object.values(ARCHETYPES)) pop.push(make());
  const rand = mulberry32(RANDOM_SEED);
  for (let n = 0; n < RANDOM_STUDENT_COUNT; n += 1) {
    pop.push(new Map(ATOMS.map((a) => [a.id, rand() < 0.3 ? null : Math.round(rand() * 1000) / 1000])));
  }
  return pop;
}

function gradeOf(plan, cfg) {
  return computeGrade(materialize(plan), ANSWER_KEY, cfg, GRADE_OPTS).quarters[QUARTER_KEY].quarterGrade;
}

function pct(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i), w = i - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}
function stats(vals) {
  const s = [...vals].sort((a, b) => a - b);
  const mean = s.reduce((x, y) => x + y, 0) / (s.length || 1);
  return { n: s.length, mean, median: pct(s, 0.5), p10: pct(s, 0.1), p90: pct(s, 0.9) };
}
const f = (x) => (x == null ? '  n/a' : x.toFixed(1).padStart(5));

const population = buildPopulation();

console.log(`F1-A / fixes comparison — population: ${population.length} students ` +
  `(${Object.keys(ARCHETYPES).length} archetypes + ${RANDOM_STUDENT_COUNT} seeded-random)\n`);

console.log('policy                  |  whole: mean  med  p10  p90  |  bottom-25%: mean  med  p10');
console.log('-'.repeat(86));
for (const pol of POLICIES) {
  const grades = population.map((p) => gradeOf(p, pol.cfg)).filter((g) => g != null && Number.isFinite(g));
  const w = stats(grades);
  const bottom = [...grades].sort((a, b) => a - b).slice(0, Math.max(1, Math.ceil(grades.length / 4)));
  const b = stats(bottom);
  console.log(
    `${pol.label.padEnd(23)} | ${f(w.mean)} ${f(w.median)} ${f(w.p10)} ${f(w.p90)}  | ` +
    `       ${f(b.mean)} ${f(b.median)} ${f(b.p10)}`,
  );
}

// ── The F1 smoking gun: the ahead-of-schedule student vs the on-pace baseline ──
console.log('\nF1 smoking gun — "did doing ahead-of-schedule mediocre work change my grade?"');
console.log('  baseline = work_grinder_pc_skipper (all due work, no PC)');
console.log('  ahead    = same student + future lesson 2.1 done at 20%\n');
const base = ARCHETYPES.work_grinder_pc_skipper();
const ahead = ARCHETYPES.ahead_then_mediocre();
console.log('policy                  | baseline | ahead | delta (ahead - baseline)');
console.log('-'.repeat(70));
for (const pol of POLICIES) {
  const b = gradeOf(base, pol.cfg);
  const a = gradeOf(ahead, pol.cfg);
  const d = a - b;
  const flag = d < -0.05 ? '  <-- PERVERSE (more work, lower grade)' : '';
  console.log(`${pol.label.padEnd(23)} | ${f(b)}    | ${f(a)} | ${(d >= 0 ? '+' : '') + d.toFixed(1)}${flag}`);
}
