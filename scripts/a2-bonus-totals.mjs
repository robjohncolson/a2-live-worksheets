#!/usr/bin/env node
// Bonus ledger -> one cumulative Schoology "Bonus" score per student (0-point column in
// Assignments, capped per quarter). The ledger holds student names, so it lives in the
// gitignored roster-local/. Every award is one row; the column is always overwritten with
// the total, so re-running is safe.
//   node scripts/a2-bonus-totals.mjs [--quarter 1] [--ledger roster-local/a2-bonus-ledger.json]
import { readFileSync } from 'node:fs';

export const BONUS_CAP = 10;

export function bonusTotals(entries, quarter, cap = BONUS_CAP) {
  const totals = {};
  for (const entry of entries) {
    if (entry.quarter !== quarter) continue;
    const section = (totals[entry.section] ??= {});
    section[entry.student] = (section[entry.student] ?? 0) + entry.points;
  }
  for (const section of Object.values(totals)) {
    for (const student of Object.keys(section)) section[student] = Math.min(cap, Math.round(section[student] * 100) / 100);
  }
  return totals;
}

if (process.argv[1]?.endsWith('a2-bonus-totals.mjs')) {
  const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const ledger = JSON.parse(readFileSync(arg('--ledger') ?? 'roster-local/a2-bonus-ledger.json', 'utf8'));
  console.log(JSON.stringify(bonusTotals(ledger.entries, Number(arg('--quarter') ?? 1)), null, 1));
}
