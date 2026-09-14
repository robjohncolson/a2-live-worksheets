#!/usr/bin/env node

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(THIS_FILE), '..');
const WORKSHEET_PATTERN = /^u\d+_lesson.+_live\.html$/;
const PROMPTS_PATTERN = /(^|\/)ai-grading-prompts[^/]*\.js(?:[?#].*)?$/;

function requiredMatch(value, label, filename) {
  if (value) return value;
  throw new Error(`${filename}: could not derive ${label}`);
}

export function evaluatePromptsSource(source, filename = 'ai-grading-prompts.js') {
  const window = {};
  const context = createContext({ window, console });
  runInContext(source, context, { filename });
  return { window, context };
}

export function extractPromptsFile(html, filename = 'worksheet') {
  const document = new JSDOM(html).window.document;
  const source = [...document.querySelectorAll('script[src]')]
    .map((script) => script.getAttribute('src'))
    .find((src) => PROMPTS_PATTERN.test(src || ''));

  const promptsFile = requiredMatch(source, 'promptsFile', filename)
    .split(/[?#]/, 1)[0]
    .replace(/^\.\//, '');
  return promptsFile;
}

function extractPrefix(html, filename) {
  const unitId = html.match(/\bconst\s+UNIT_ID\s*=\s*(['"])([^'"]+)\1/)?.[2];
  if (unitId) return `WS-${unitId}`;

  const worksheetId = html.match(/\bconst\s+WORKSHEET_ID\s*=\s*(['"])([^'"]+)\1/)?.[2];
  return requiredMatch(worksheetId, 'prefix', filename);
}

function extractTopic(html, filename) {
  const gradeReflection = html.match(
    /async\s+function\s+gradeReflection\s*\([^)]*\)\s*\{|async\s+gradeReflection\s*\([^)]*\)\s*\{/,
  );
  requiredMatch(gradeReflection, 'gradeReflection function or method', filename);

  // The topic is near the start of every gradeReflection implementation. Limit
  // the search so later appeal/enrichment scenarios can never be selected.
  const functionSource = html.slice(gradeReflection.index, gradeReflection.index + 15_000);
  const topic = functionSource.match(/\btopic\s*:\s*(?:'([^'\r\n]*)'|"([^"\r\n]*)")/);
  return requiredMatch(topic?.[1] ?? topic?.[2], 'gradeReflection topic', filename);
}

function extractReflectionIds(html) {
  const document = new JSDOM(html).window.document;
  return [...document.querySelectorAll('textarea[id]')]
    .filter((textarea) => !textarea.closest('.appeal-form'))
    .map((textarea) => textarea.id);
}

function extractRailwayServerUrl(html, filename) {
  const assignment = html.match(/window\.RAILWAY_SERVER_URL\s*=\s*(['"])([^'"]+)\1/)?.[2];
  const fallback = html.match(/window\.RAILWAY_SERVER_URL\s*\|\|\s*(['"])([^'"]+)\1/)?.[2];
  return requiredMatch(assignment || fallback, 'railwayServerUrl', filename);
}

function findPromptGlobals(promptsSource, promptsFile) {
  const { window } = evaluatePromptsSource(promptsSource, promptsFile);
  const keys = Object.keys(window);
  const builderName = keys.find((key) => /^buildReflectionPrompt/.test(key));
  const contextName = keys.find((key) => /^LESSON_CONTEXT/.test(key));
  const exportedRubricsName = keys.find((key) => /^(?:REFLECTION_)?RUBRICS/.test(key));
  const lexicalRubricsName = promptsSource.match(
    /(?:const|let|var)\s+((?:REFLECTION_)?RUBRICS(?:_[A-Za-z0-9]+)?)\s*=/,
  )?.[1];

  requiredMatch(builderName, 'builderName', promptsFile);
  if (typeof window[builderName] !== 'function') {
    throw new Error(`${promptsFile}: window.${builderName} is not a function`);
  }

  return {
    builderName,
    contextName: requiredMatch(contextName, 'contextName', promptsFile),
    rubricsName: requiredMatch(exportedRubricsName || lexicalRubricsName, 'rubricsName', promptsFile),
  };
}

export function deriveWorksheetEntry({ filename, html, promptsSource }) {
  const promptsFile = extractPromptsFile(html, filename);
  const globals = findPromptGlobals(promptsSource, promptsFile);
  const textareaIds = extractReflectionIds(html);
  if (!textareaIds.length) throw new Error(`${filename}: no reflection textareas found`);

  return {
    filename,
    prefix: extractPrefix(html, filename),
    promptsFile,
    ...globals,
    topic: extractTopic(html, filename),
    textareaIds,
  };
}

export function deriveManifest(worksheetInputs) {
  const sortedInputs = [...worksheetInputs].sort((a, b) => (
    a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0
  ));
  const worksheets = sortedInputs.map(deriveWorksheetEntry);
  const prefixes = new Set();
  const railwayUrls = new Set();

  for (let index = 0; index < worksheets.length; index += 1) {
    const entry = worksheets[index];
    if (prefixes.has(entry.prefix)) throw new Error(`duplicate worksheet prefix: ${entry.prefix}`);
    prefixes.add(entry.prefix);
    railwayUrls.add(extractRailwayServerUrl(sortedInputs[index].html, entry.filename));
  }

  if (railwayUrls.size !== 1) {
    throw new Error(`worksheets disagree on railwayServerUrl: ${[...railwayUrls].join(', ')}`);
  }

  return {
    railwayServerUrl: [...railwayUrls][0],
    worksheets,
  };
}

export function buildManifest(rootDir = ROOT) {
  const filenames = readdirSync(rootDir)
    .filter((filename) => WORKSHEET_PATTERN.test(filename))
    .sort();

  const inputs = filenames.map((filename) => {
    const html = readFileSync(resolve(rootDir, filename), 'utf8');
    const promptsFile = extractPromptsFile(html, filename);
    const promptsPath = resolve(rootDir, promptsFile);
    const promptsSource = readFileSync(promptsPath, 'utf8');
    return { filename, html, promptsSource };
  });

  return deriveManifest(inputs);
}

export function writeManifest(rootDir = ROOT) {
  const manifest = buildManifest(rootDir);
  const outputPath = resolve(rootDir, 'data/frq-regrade-manifest.json');
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, outputPath };
}

if (process.argv[1] && resolve(process.argv[1]) === THIS_FILE) {
  try {
    const { manifest, outputPath } = writeManifest();
    console.log(`Wrote ${manifest.worksheets.length} worksheets to ${outputPath}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
