#!/usr/bin/env node
// Merge fast-lesson drafts (docs/a2-fast-lesson-spec.md, sections 7-9) into the three authored
// files, one lesson per sub-folder of the drafts directory:
//
//   <drafts>/<L>/prep.json        -> content/a2/lesson-prep.json      lessons[<L>]   (replace)
//   <drafts>/<L>/objectives.json  -> content/a2/lesson-objectives.json lessons[<L>]  (replace)
//   <drafts>/<L>/skills.json      -> data/a2-lesson-skills.json        lessons[<L>]
//        an array inserts a lesson that has no entry yet; an existing entry is kept unless the
//        draft is { "replace": true, "entries": [...] } (Topics 1-2 are pinned by tests).
//
//   node scripts/merge-fast-lesson-drafts.mjs <drafts-dir> [--dry-run] [--only 2-1,2-2]
//
// Deterministic and idempotent: lesson keys are sorted by topic then lesson, the files keep their
// indentation, nothing else in them changes. Prints one line per merged entry. After it:
// build-a2-lesson-skills.mjs, sync-server-shared.mjs, build-a2-roadmap-data.mjs,
// build-a2-work-manifest.mjs, build-lesson-tree.mjs --all, npx vitest run, bump-build.mjs.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
  prep: 'content/a2/lesson-prep.json',
  objectives: 'content/a2/lesson-objectives.json',
  skills: 'data/a2-lesson-skills.json',
};
const KEY = /^\d+-\d+$/;

export function lessonOrder(a, b) {
  const [ta, la] = a.split('-').map(Number);
  const [tb, lb] = b.split('-').map(Number);
  return ta - tb || la - lb;
}

export function sortLessons(lessons) {
  return Object.fromEntries(Object.keys(lessons).sort(lessonOrder).map(key => [key, lessons[key]]));
}

function detectIndent(text) {
  const m = text.match(/\n( +)"/);
  return m ? m[1].length : 2;
}

function readJsonFile(path) {
  const text = readFileSync(path, 'utf8');
  return { data: JSON.parse(text), indent: detectIndent(text), newline: text.endsWith('\n') };
}

function writeJsonFile(path, file) {
  writeFileSync(path, JSON.stringify(file.data, null, file.indent) + (file.newline ? '\n' : ''));
}

export function readDrafts(dir, only) {
  const drafts = [];
  for (const name of readdirSync(dir).sort(lessonOrder)) {
    if (!KEY.test(name) || (only && !only.includes(name))) continue;
    const folder = join(dir, name);
    const draft = { lesson: name };
    for (const kind of Object.keys(FILES)) {
      const path = join(folder, `${kind}.json`);
      if (existsSync(path)) draft[kind] = JSON.parse(readFileSync(path, 'utf8'));
    }
    if (Object.keys(draft).length > 1) drafts.push(draft);
  }
  return drafts;
}

export function mergeDrafts(files, drafts) {
  const lines = [];
  for (const draft of drafts) {
    const key = draft.lesson;
    if (draft.prep) {
      if (draft.prep.title === undefined || !Array.isArray(draft.prep.examples)) throw new Error(`${key}: prep.json needs title and examples[]`);
      files.prep.data.lessons[key] = draft.prep;
      lines.push(`${key}: lesson-prep entry ${draft.prep.status ? '(' + draft.prep.status.slice(0, 60) + ')' : ''}`);
    }
    if (draft.objectives) {
      const o = draft.objectives;
      if (!Array.isArray(o.mathObjectives) || !o.languageObjective) throw new Error(`${key}: objectives.json needs mathObjectives[] and languageObjective`);
      if (!Array.isArray(o.standards)) o.standards = [];
      files.objectives.data.lessons[key] = o;
      lines.push(`${key}: objectives entry (${o.standards.length} standards)`);
    }
    if (draft.skills !== undefined && draft.skills !== null) {
      const existing = files.skills.data.lessons[key];
      const replace = !Array.isArray(draft.skills) && draft.skills.replace === true;
      const entries = Array.isArray(draft.skills) ? draft.skills : draft.skills.entries;
      if (!Array.isArray(entries)) throw new Error(`${key}: skills.json must be an array or { replace: true, entries: [] }`);
      if (existing && !replace) {
        lines.push(`${key}: skills entry kept (already authored; pass { replace: true } to overwrite)`);
      } else {
        files.skills.data.lessons[key] = entries;
        lines.push(`${key}: skills entry ${existing ? 'replaced' : 'added'} (${entries.length} codes)`);
      }
    }
  }
  for (const file of Object.values(files)) file.data.lessons = sortLessons(file.data.lessons);
  return lines;
}

function main() {
  const argv = process.argv.slice(2);
  const dir = argv.find(a => !a.startsWith('--'));
  if (!dir) { console.error('usage: merge-fast-lesson-drafts.mjs <drafts-dir> [--dry-run] [--only 2-1,2-2]'); process.exit(2); }
  const dryRun = argv.includes('--dry-run');
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1].split(',') : null;
  const files = Object.fromEntries(Object.entries(FILES).map(([kind, rel]) => [kind, readJsonFile(resolve(ROOT, rel))]));
  const drafts = readDrafts(resolve(dir), only);
  if (!drafts.length) { console.log('no drafts found in ' + dir); return; }
  const lines = mergeDrafts(files, drafts);
  for (const line of lines) console.log((dryRun ? '[dry-run] ' : '') + line);
  if (dryRun) return;
  for (const [kind, rel] of Object.entries(FILES)) writeJsonFile(resolve(ROOT, rel), files[kind]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
