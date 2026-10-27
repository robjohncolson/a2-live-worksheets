// Load the TE guidance for a lesson without writing anything. The caller can save
// the returned cache after the enriched lesson tree passes its own validation.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTeacherPrompts } from './teacher-prompts.mjs';

const text = value => typeof value === 'string' ? value.trim() : '';
const KINDS = new Set(['question', 'trap', 'support']);

function discrepancyIn(notes) {
  return notes.some(note => {
    if (/\b(?:conflicts?|discrepanc\w*|inconsisten\w*|incorrect|erroneous|misprint|typo|uncertain|unclear|overstates?|omits?|mismatch\w*|likely)\b/i.test(note)) return true;
    return /\bprinted\b.*\b(?:but|whereas|while|instead|rather|although|differs?|says)\b/i.test(note);
  });
}

function normalizePrompt(prompt, lesson, index, authoredExample = null) {
  if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) {
    throw new Error(`${lesson}: teacher prompt ${index + 1} must be an object`);
  }
  const example = Number(prompt.example ?? authoredExample);
  const question = text(prompt.question ?? prompt.q);
  const answer = text(prompt.answer ?? prompt.a);
  if (!Number.isInteger(example) || example < 1 || !question || !answer) {
    throw new Error(`${lesson}: teacher prompt ${index + 1} needs a numbered example, question, and answer`);
  }
  const kind = prompt.kind ?? 'question';
  if (!KINDS.has(kind)) throw new Error(`${lesson}: teacher prompt ${index + 1} has an unknown kind`);
  const notes = prompt.notes ?? [];
  if (!Array.isArray(notes) || notes.some(note => typeof note !== 'string')) {
    throw new Error(`${lesson}: teacher prompt ${index + 1} notes must be an array of strings`);
  }
  const category = text(prompt.category) || 'Authored';
  const key = text(prompt.key) || `examples[n=${example}].teacherPrompts.authored[${index}]`;
  const source = prompt.source ?? { file: 'lesson-prep.json', anchor: example, category, item: index };
  return { ...prompt, example, category, key, kind, question, answer, source,
    variant: prompt.variant ?? 'example', notes: [...notes] };
}

function cachedPrompts(path, lesson) {
  let cache;
  try { cache = JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new Error(`${lesson}: cannot read teacher-prompt cache ${path}: ${error.message}`); }
  if (cache?.lesson !== lesson || !Array.isArray(cache.prompts)) {
    throw new Error(`${lesson}: teacher-prompt cache must contain this lesson and a prompts array (${path})`);
  }
  return cache.prompts.map((prompt, index) => normalizePrompt(prompt, lesson, index));
}

function authoredPrompts(examples, lesson) {
  return examples.flatMap(example => {
    if (example.teacherPrompts == null) return [];
    if (!Array.isArray(example.teacherPrompts)) {
      throw new Error(`${lesson}: Example ${example.n} teacherPrompts must be an array`);
    }
    return example.teacherPrompts.map((prompt, index) => normalizePrompt(prompt, lesson, index, example.n));
  });
}

function usablePrompts(prompts, lesson, warnings) {
  const usable = new Map();
  const keys = new Set();
  for (const prompt of prompts) {
    if (keys.has(prompt.key)) throw new Error(`${lesson}: duplicate teacher-prompt key ${prompt.key}`);
    keys.add(prompt.key);
    const reason = prompt.variant === 'additional' ? 'additional example'
      : discrepancyIn(prompt.notes) ? 'source note flags a printed-answer discrepancy' : null;
    if (reason) {
      warnings.push(`${lesson}: excluded ${prompt.key} from practice (${reason})`);
      continue;
    }
    if (!usable.has(prompt.example)) usable.set(prompt.example, []);
    usable.get(prompt.example).push(prompt);
  }
  return usable;
}

/**
 * Prefer the current textbook transcription, then its portable cache, then
 * teacher-authored example.teacherPrompts. Authored guidance can also fill a kept
 * example with no usable source prompts. A present but malformed source remains
 * an error, never permission to silently use an older version.
 */
export function loadLessonTeacherPrompts(lesson, prep, { teDir, cacheDir, required = true } = {}) {
  if (!/^\d+-\d+$/.test(lesson)) throw new Error(`invalid teacher-prompt lesson: ${lesson}`);
  const examples = Array.isArray(prep?.examples) ? prep.examples : [];
  const filename = `a2_${lesson}_TE.tex`;
  const sourcePath = teDir ? resolve(teDir, filename) : null;
  const cachePath = cacheDir ? resolve(cacheDir, `${lesson}.json`) : null;
  let prompts;
  let origin;
  let cache = null;

  if (sourcePath && existsSync(sourcePath)) {
    prompts = parseTeacherPrompts(readFileSync(sourcePath, 'utf8'), { sourceFile: filename })
      .map((prompt, index) => normalizePrompt(prompt, lesson, index));
    origin = 'textbook';
    if (cachePath) cache = { path: cachePath, text: JSON.stringify({ lesson, prompts }, null, 2) + '\n' };
  } else if (cachePath && existsSync(cachePath)) {
    prompts = cachedPrompts(cachePath, lesson);
    origin = 'cache';
  } else {
    prompts = authoredPrompts(examples, lesson);
    origin = prompts.length ? 'authored' : 'none';
  }

  const warnings = [];
  const usable = usablePrompts(prompts, lesson, warnings);
  if (origin === 'textbook' || origin === 'cache') {
    const uncovered = examples.filter(example => example.keep === true && !usable.get(Number(example.n))?.length);
    const authored = usablePrompts(authoredPrompts(uncovered, lesson), lesson, warnings);
    const sourceKeys = new Set([...usable.values()].flat().map(prompt => prompt.key));
    for (const example of uncovered) {
      const fallback = authored.get(Number(example.n));
      if (!fallback?.length) continue;
      for (const prompt of fallback) {
        if (sourceKeys.has(prompt.key)) throw new Error(`${lesson}: duplicate teacher-prompt key ${prompt.key}`);
        sourceKeys.add(prompt.key);
      }
      usable.set(Number(example.n), fallback);
      warnings.push(`${lesson}: using authored teacher prompts for kept Example ${example.n}; no usable ${origin} prompts`);
    }
  }

  const missing = examples.filter(example => example.keep === true && !usable.get(Number(example.n))?.length)
    .map(example => example.n);
  if (required && missing.length) {
    const detail = warnings.length ? ` ${warnings.join('; ')}.` : '';
    throw new Error(`${lesson}: no usable teacher prompts for kept Example${missing.length === 1 ? '' : 's'} ${missing.join(', ')}. `
      + `Provide the TE transcription, its prompt cache, or authored example.teacherPrompts.${detail}`);
  }
  if (!required && missing.length && origin !== 'none') {
    warnings.push(`${lesson}: no usable teacher prompts for kept Examples ${missing.join(', ')}`);
  }

  const enriched = origin === 'none' ? prep : { ...prep, examples: examples.map(example => ({
    ...example, teacherPrompts: usable.get(Number(example.n)) ?? [],
  })) };
  return { prep: enriched, cache, origin, warnings };
}
