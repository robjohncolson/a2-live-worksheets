#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourcePath = 'data/sources/blooket/a2-number-line-interval/set.json';
const source = JSON.parse(readFileSync(resolve(root, sourcePath), 'utf8'));
const check = process.argv.includes('--check');
const header = ['Question #', 'Question Text', 'Answer 1', 'Answer 2', 'Answer 3', 'Answer 4', 'Time Limit (sec)', 'Correct Answer(s)', 'source', 'image'];
const rows = [header];
const lineage = {};
const artifacts = new Map();
const questions = source.questions.filter(question => question.number >= 1 && question.number <= 40).sort((a, b) => a.number - b.number);
for (const question of questions) {
  if ([question.question, ...question.answers].some(text => text.includes('`*'))) throw new Error(`Unsupported math markup in question ${question.number}`);
  const { number, answers, correctAnswers, image = '' } = question;
  if (lineage[number] || answers.length < 2 || answers.length > 4 || correctAnswers.length !== 1 || !answers.includes(correctAnswers[0])) {
    throw new Error(`Invalid Blooket question ${number}`);
  }
  const id = `blooket:${source.setId}:q${number}`;
  lineage[number] = id;
  rows.push([number, question.question, ...answers, ...Array(4 - answers.length).fill(''), question.timeLimit, answers.indexOf(correctAnswers[0]) + 1, id, image]);
  if (image) {
    if (!/^q\d+\.png$/.test(image)) throw new Error(`Invalid image for question ${number}`);
    artifacts.set(`content/a2/1-1/images/blooket/${image}`, readFileSync(resolve(root, dirname(sourcePath), image)));
  }
}
const csv = rows.map(row => row.map(value => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}).join(',')).join('\n') + '\n';
artifacts.set('content/a2/1-1/deck.csv', Buffer.from(csv, 'utf8'));
artifacts.set('content/a2/1-1/deck.sources.json', Buffer.from(JSON.stringify(lineage, null, 2) + '\n', 'utf8'));
for (const [relative, bytes] of artifacts) {
  const path = resolve(root, relative);
  if (check) {
    if (!existsSync(path) || !readFileSync(path).equals(bytes)) throw new Error(`Generated artifact differs: ${relative}`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }
}
console.log(`${check ? 'Checked' : 'Built'} ${questions.length} cards and ${artifacts.size - 2} images.`);
