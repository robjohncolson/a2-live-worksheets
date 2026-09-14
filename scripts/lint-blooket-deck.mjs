#!/usr/bin/env node

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { lintCorpus } from './lib/blooket-lint.mjs';

const REPO = fileURLToPath(new URL('../', import.meta.url));
const FINDING_CODES = [
  'dupChoice',
  'answerInStem',
  'siblingStem',
  'crossCardLeak',
  'tfImbalance',
  'permutationUnsafe',
];

function requestedCsv(argv) {
  const index = argv.indexOf('--csv');
  if (index === -1) return null;
  if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
    throw new Error('--csv requires a deck filename');
  }
  return argv[index + 1];
}

function loadFlashcards() {
  const window = {};
  const source = readFileSync(resolve(REPO, 'flashcards.js'), 'utf8');
  runInContext(source, createContext({ window, Math, JSON }));
  return window.Flashcards;
}

function deckNames(csvName) {
  const names = readdirSync(REPO)
    .filter(function (name) { return /_blooket\.csv$/.test(name); })
    .sort();

  if (!csvName) return names;
  if (!existsSync(resolve(REPO, csvName))) throw new Error(`Blooket deck not found: ${csvName}`);
  return [csvName];
}

function findingCounts(findings) {
  const counts = {};
  for (const code of FINDING_CODES) counts[code] = 0;
  for (const item of findings) counts[item.code] += 1;
  return counts;
}

function main() {
  const csvName = requestedCsv(process.argv.slice(2));
  const names = deckNames(csvName);
  const flashcards = loadFlashcards();
  const pairsPath = resolve(REPO, 'data/blooket-card-pairs.json');
  const pairs = existsSync(pairsPath) ? JSON.parse(readFileSync(pairsPath, 'utf8')) : {};
  const decks = {};

  for (const name of names) {
    const csv = readFileSync(resolve(REPO, name), 'utf8');
    decks[name] = flashcards.rowsToDeck(flashcards.parseCsv(csv));
  }

  const findings = lintCorpus(decks, pairs);
  const report = {
    generatedAt: new Date().toISOString(),
    decks: names.map(function (name) {
      return { csv: name, cards: decks[name].length };
    }),
    findingsByCode: findingCounts(findings),
    findings,
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
