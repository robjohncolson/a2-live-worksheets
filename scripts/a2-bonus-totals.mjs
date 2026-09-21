#!/usr/bin/env node
// Bonus ledger -> one cumulative Desk "Bonus" score per student (0-point column in
// Assignments, capped per quarter). The ledger holds student names, so it lives in the
// gitignored roster-local/. Every award is one row; the column is always overwritten with
// the total, so re-running is safe.
//   node scripts/a2-bonus-totals.mjs [--quarter 1] [--ledger roster-local/a2-bonus-ledger.json]
// Add --commit to replace live scores; --dry-run is the default and prints counts only.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importScores } from './a2-daily-engagement.mjs';
import { A2_FEEDERS } from '../roster-server/district-grade.js';

export const BONUS_CAP = A2_FEEDERS.bonus.quarterCap;

export function bonusTotals(entries, quarter, cap = BONUS_CAP) {
  const totals = Object.create(null);
  for (const entry of entries) {
    if (entry.quarter !== quarter) continue;
    const section = (totals[entry.section] ??= Object.create(null));
    section[entry.student] = (section[entry.student] ?? 0) + entry.points;
  }
  for (const section of Object.values(totals)) {
    for (const student of Object.keys(section)) section[student] = Math.min(cap, Math.round(section[student] * 100) / 100);
  }
  return totals;
}

async function main() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (['--commit', '--dry-run'].includes(key)) { args[key] = true; continue; }
    if (!['--quarter', '--ledger', '--url'].includes(key)) throw new Error('arguments');
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error('arguments');
    args[key] = value;
  }
  if (args['--commit'] && args['--dry-run']) throw new Error('arguments');
  const quarter = Number(args['--quarter'] ?? 1);
  if (![1, 2, 3, 4].includes(quarter)) throw new Error('quarter');
  const ledger = JSON.parse(readFileSync(args['--ledger'] ?? 'roster-local/a2-bonus-ledger.json', 'utf8'));
  if (!Array.isArray(ledger.entries)) throw new Error('ledger');
  const entries = ledger.entries.map(entry => {
    const section = String(entry.section).replace(/^Period/i, '').toUpperCase();
    if (!['C', 'D', 'G'].includes(section) || ![1, 2, 3, 4].includes(entry.quarter)
        || typeof entry.student !== 'string' || !entry.student.trim()
        || !Number.isFinite(entry.points) || entry.points < 0) throw new Error('entry');
    return { ...entry, section };
  });
  const totals = bonusTotals(entries, quarter);
  let scored = 0;
  for (const section of ['C', 'D', 'G']) {
    const scores = Object.entries(totals[section] || {}).map(([student, score]) => ({ student, score }));
    scored += scores.length;
    if (args['--commit']) await importScores({ source: 'bonus', quarter: `Q${quarter}`, section, scores }, args['--url']);
  }
  console.log(`awards: ${entries.filter(entry => entry.quarter === quarter).length}, scored: ${scored}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('Bonus import failed. Check arguments, local ledger, and teacher service access.');
    process.exitCode = 1;
  });
}
