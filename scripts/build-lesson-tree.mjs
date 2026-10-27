// Build the lesson trees from the Teacher's Edition material in lesson-prep
// (school/class-log/KNOWLEDGE_TREE_SPEC.md, WP-1 1.1).
//
//   node scripts/build-lesson-tree.mjs [--lesson 1-3] [--all] [--check]
//        [--prep LESSON_PREP] [--day-log DAY_LOG] [--out-dir DIR]
//        [--te-dir DIR] [--prompts-dir DIR]
//
// Deterministic, no model. Reads content/a2/lesson-prep.json (and the day log, for
// the cards' traps and minutes) and writes content/a2/lesson-trees/<lesson>.json
// (tracked: the TE text holds no student data). The mapping lives in
// scripts/lib/lesson-tree.mjs. A tree that fails validation is never written: the
// script exits 1 with the first problem. A file is rewritten only when its content
// changed, so a nightly run leaves git quiet. --check also validates every tree file
// already in the folder (a hand edit included) and exits 1 on the first problem.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTree, treeProblem } from './lib/lesson-tree.mjs';
import { loadLessonTeacherPrompts } from './lib/lesson-teacher-source.mjs';
import { writeFileAtomic } from './draft-observer-cards.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const args = { all: false, check: false };
  const valued = ['--lesson', '--prep', '--day-log', '--out-dir', '--te-dir', '--prompts-dir'];
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--all') { args.all = true; continue; }
    if (key === '--check') { args.check = true; continue; }
    if (!valued.includes(key)) throw new Error(`unknown argument ${key}`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`${key} needs a value`);
    args[key.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = value;
  }
  if (!args.all && !args.lesson) throw new Error('pass --lesson <key> or --all');
  if (args.all && args.lesson) throw new Error('--lesson and --all cannot be combined');
  return args;
}

const treeText = tree => JSON.stringify(tree, null, 2) + '\n';
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

function main() {
  const args = parseArgs(process.argv.slice(2));
  const defaultPrep = resolve(REPO_ROOT, 'content/a2/lesson-prep.json');
  const prepPath = args.prep ? resolve(args.prep) : defaultPrep;
  const prepAll = readJson(prepPath);
  const lessons = prepAll.lessons || prepAll;
  const dayLogPath = args.dayLog ? resolve(args.dayLog) : resolve(REPO_ROOT, 'content/a2/day-log.json');
  const dayLog = existsSync(dayLogPath) ? readJson(dayLogPath) : null;
  const outDir = args.outDir ? resolve(args.outDir) : resolve(REPO_ROOT, 'content/a2/lesson-trees');
  // Custom prep fixtures are self-contained; the production build always requires
  // guidance for every kept example. Cached extractions travel with the repo.
  const canonical = prepPath === defaultPrep;
  const teDir = args.teDir ? resolve(args.teDir) : canonical ? resolve(REPO_ROOT, '../Lesson_planning') : null;
  const cacheDir = args.promptsDir ? resolve(args.promptsDir) : resolve(dirname(prepPath), 'teacher-prompts');

  const keys = args.all ? Object.keys(lessons).sort() : [args.lesson];
  for (const key of keys) {
    if (!lessons[key]) throw new Error(`no lesson-prep entry for ${key}`);
    const loaded = loadLessonTeacherPrompts(key, lessons[key], { teDir, cacheDir, required: canonical || Boolean(args.teDir || args.promptsDir) });
    for (const warning of loaded.warnings || []) console.warn(`build-lesson-tree: ${key}: ${warning}`);
    const tree = buildTree(key, loaded.prep, dayLog);
    const problem = treeProblem(tree);
    if (problem) { console.error(`build-lesson-tree: ${key}: ${problem}; nothing written for it.`); process.exitCode = 1; return; }
    if (loaded.cache && (!existsSync(loaded.cache.path) || readFileSync(loaded.cache.path, 'utf8') !== loaded.cache.text)) {
      writeFileAtomic(loaded.cache.path, loaded.cache.text);
    }
    const path = resolve(outDir, `${key}.json`);
    const next = treeText(tree);
    const same = existsSync(path) && readFileSync(path, 'utf8') === next;
    if (!same) writeFileAtomic(path, next);
    const counts = {};
    for (const node of tree.nodes) counts[node.type] = (counts[node.type] || 0) + 1;
    const byType = Object.entries(counts).map(([type, count]) => `${count} ${type}`).join(', ');
    console.log(`${key}: ${tree.nodes.length} nodes (${byType}) ${same ? 'unchanged' : 'written'}`);
  }

  if (!args.check) return;
  const files = existsSync(outDir) ? readdirSync(outDir).filter(name => name.endsWith('.json')).sort() : [];
  for (const name of files) {
    let problem;
    try { problem = treeProblem(readJson(resolve(outDir, name))); } catch (error) { problem = `not valid JSON (${error.message})`; }
    if (problem) { console.error(`build-lesson-tree: check ${name}: ${problem}`); process.exitCode = 1; return; }
  }
  console.log(`check: ${files.length} tree(s) valid.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error('build-lesson-tree: ' + error.message); process.exitCode = 1; }
}
