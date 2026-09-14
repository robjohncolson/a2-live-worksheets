#!/usr/bin/env node

import { computeGrade } from '../grade.js';
import {
  CONFIG,
  QUARTER_KEY,
  ANSWER_KEY,
  GRADE_OPTS,
  ATOMS,
  ARCHETYPES,
  materialize,
} from '../tests/fixtures/sim-world.js';

const RANDOM_STUDENT_COUNT = 40;
const RANDOM_SEED = 0x5eed2026;

const KNOBS = {
  'v3WorkWeights.lessons': [0.10, 0.20, 0.30, 0.40, 0.50],
  'v3WorkWeights.quizzes': [0.10, 0.20, 0.30, 0.40, 0.50],
  'v3WorkWeights.blooket': [0.00, 0.05, 0.10, 0.20, 0.30],
  'v3Gates.floor': [0.30, 0.35, 0.40, 0.45, 0.50],
  'v3Gates.ceiling': [0.50, 0.60, 0.70, 0.80, 0.90],
  C: [75, 80, 85, 90, 95],
  'lessonFeederWeights.Q': [1, 2, 3, 4, 5],
};

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomPlan(rand) {
  const plan = new Map();
  for (const atom of ATOMS) {
    const present = rand() >= 0.25;
    plan.set(atom.id, present ? round(rand(), 3) : null);
  }
  return plan;
}

function buildPopulation() {
  const population = [];

  for (const [name, makePlan] of Object.entries(ARCHETYPES)) {
    population.push({ name, plan: makePlan() });
  }

  const rand = mulberry32(RANDOM_SEED);
  for (let n = 1; n <= RANDOM_STUDENT_COUNT; n += 1) {
    population.push({ name: `seeded_random_${String(n).padStart(2, '0')}`, plan: randomPlan(rand) });
  }

  return population;
}

function grade(plan, config) {
  const result = computeGrade(materialize(plan), ANSWER_KEY, config, GRADE_OPTS);
  return result.quarters?.[QUARTER_KEY]?.quarterGrade ?? null;
}

function setKnob(config, knob, value) {
  const parts = knob.split('.');
  let target = config;

  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    target = target[part];
    if (target == null || typeof target !== 'object') {
      throw new Error(`Cannot set ${knob}; missing ${parts.slice(0, i + 1).join('.')}`);
    }
  }

  target[parts[parts.length - 1]] = value;
}

function getKnob(config, knob) {
  let value = config;
  for (const part of knob.split('.')) {
    value = value?.[part];
  }
  return value;
}

function evaluate(population, knob, setting) {
  const config = structuredClone(CONFIG);
  setKnob(config, knob, setting);

  const grades = [];
  for (const student of population) {
    const value = grade(student.plan, config);
    if (value != null && Number.isFinite(value)) grades.push(value);
  }

  return summarize(grades);
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const bottomCount = Math.max(1, Math.ceil(sorted.length / 4));
  const bottom = sorted.slice(0, bottomCount);

  return {
    whole: stats(sorted),
    bottom: stats(bottom),
  };
}

function stats(sorted) {
  if (!sorted.length) {
    return { median: null, mean: null, p10: null, p90: null };
  }

  return {
    median: percentile(sorted, 0.50),
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p10: percentile(sorted, 0.10),
    p90: percentile(sorted, 0.90),
  };
}

function percentile(sorted, p) {
  if (sorted.length === 1) return sorted[0];

  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function findBaseline(settings, defaultValue) {
  return settings.find((setting) => Object.is(setting, defaultValue));
}

function formatTable(knob, settings, population, baselineSetting, rows) {
  const min = settings[0];
  const max = settings[settings.length - 1];
  const lines = [
    `Sweep: ${knob}`,
    `Range: ${formatSetting(min)}..${formatSetting(max)} (${settings.length} settings)`,
    `Population: ${population.length} students (${Object.keys(ARCHETYPES).length} archetypes + ${RANDOM_STUDENT_COUNT} seeded-random)`,
    `Baseline: ${formatSetting(baselineSetting)} (CONFIG default)`,
    '',
  ];

  const tableRows = rows.map((row) => [
    formatSetting(row.setting),
    row.setting === baselineSetting ? '*' : '',
    formatStat(row.whole.median),
    formatDelta(row.whole.median, row.baseline.whole.median),
    formatStat(row.whole.mean),
    formatDelta(row.whole.mean, row.baseline.whole.mean),
    formatStat(row.whole.p10),
    formatDelta(row.whole.p10, row.baseline.whole.p10),
    formatStat(row.whole.p90),
    formatDelta(row.whole.p90, row.baseline.whole.p90),
    formatStat(row.bottom.median),
    formatDelta(row.bottom.median, row.baseline.bottom.median),
    formatStat(row.bottom.mean),
    formatDelta(row.bottom.mean, row.baseline.bottom.mean),
    formatStat(row.bottom.p10),
    formatDelta(row.bottom.p10, row.baseline.bottom.p10),
    formatStat(row.bottom.p90),
    formatDelta(row.bottom.p90, row.baseline.bottom.p90),
  ]);

  lines.push(renderRows([
    [
      'setting', 'base',
      'all_med', 'd_med', 'all_mean', 'd_mean', 'all_p10', 'd_p10', 'all_p90', 'd_p90',
      'bot_med', 'd_med', 'bot_mean', 'd_mean', 'bot_p10', 'd_p10', 'bot_p90', 'd_p90',
    ],
    ...tableRows,
  ]));

  return lines.join('\n');
}

function renderRows(rows) {
  const widths = rows[0].map((_, column) => (
    Math.max(...rows.map((row) => String(row[column]).length))
  ));

  return rows.map((row, rowIndex) => {
    const line = row.map((cell, column) => String(cell).padStart(widths[column])).join('  ');
    if (rowIndex === 0) {
      const rule = widths.map((width) => '-'.repeat(width)).join('  ');
      return `${line}\n${rule}`;
    }
    return line;
  }).join('\n');
}

function formatSetting(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatStat(value) {
  return value == null ? 'n/a' : round(value, 1).toFixed(1);
}

function formatDelta(value, baseline) {
  if (value == null || baseline == null) return 'n/a';
  const delta = round(value - baseline, 1);
  if (Object.is(delta, -0)) return '+0.0';
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function printUsage() {
  console.log('Usage: node roster-server/tools/grade-sim-sweep.mjs --knob=<name>');
  console.log('');
  console.log('Known knobs:');
  for (const knob of Object.keys(KNOBS)) {
    console.log(`  ${knob}`);
  }
}

function main() {
  const knobArg = process.argv.slice(2).find((arg) => arg.startsWith('--knob='));
  const knob = knobArg ? knobArg.slice('--knob='.length) : null;

  if (!knob || !Object.hasOwn(KNOBS, knob)) {
    printUsage();
    return;
  }

  const settings = KNOBS[knob];
  const defaultValue = getKnob(CONFIG, knob);
  const baselineSetting = findBaseline(settings, defaultValue);

  if (baselineSetting == null) {
    throw new Error(`Sweep for ${knob} must include CONFIG default ${defaultValue}`);
  }

  const population = buildPopulation();
  const summaries = new Map();

  for (const setting of settings) {
    summaries.set(setting, evaluate(population, knob, setting));
  }

  const baseline = summaries.get(baselineSetting);
  const rows = settings.map((setting) => ({
    setting,
    baseline,
    ...summaries.get(setting),
  }));

  console.log(formatTable(knob, settings, population, baselineSetting, rows));
}

main();
