import { readFileSync } from 'node:fs';

export function loadMisconceptionTriage() {
  const document = JSON.parse(readFileSync(new URL('./data/misconception-triage.json', import.meta.url), 'utf8'));
  if (document.schema !== 'apstats-misconception-triage/v1' || !document.entries) {
    throw new Error('Malformed misconception triage');
  }
  return document;
}

export function triageStatus(key, triage, qualifyingKeys, now) {
  const entry = triage.entries?.[key];
  if (!entry) return { triage: null, recurringAfterTriage: false };
  const week = value => Math.floor((Date.parse(value) - Date.UTC(1970, 0, 5)) / (7 * 86400000));
  const weeks = new Map();
  for (const run of [...(triage.weeklyRuns || [])].sort((a, b) => a.at.localeCompare(b.at))) {
    if (Date.parse(run.at) <= now) weeks.set(week(run.at), run);
  }
  const recent = [...weeks.values()].slice(-3);
  const recurringAfterTriage = qualifyingKeys.has(key) && recent.length === 3 && recent.every((run, index) =>
    run.at.slice(0, 10) > entry.triagedAt && run.keys.includes(key) &&
    (index === 0 || week(run.at) === week(recent[index - 1].at) + 1));
  return { triage: { sheet: entry.sheet, sheetTitle: entry.sheetTitle, triagedAt: entry.triagedAt }, recurringAfterTriage };
}

export function untriagedFirst(a, b) {
  return Number(Boolean(a.triage)) - Number(Boolean(b.triage));
}
