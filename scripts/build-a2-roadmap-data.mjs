#!/usr/bin/env node
// Builds roadmap-data.json for the Algebra 2 Desk from data/a2-lesson-targets.json
// (every Savvas lesson, its topic and title) and content/a2/lessons.json (what is
// published). The Desk merges `lessons[key].ced2026` into its label helper, so the
// calendar and unit strip read "1.2 · Transformations of Functions" instead of the
// inherited AP Statistics crosswalk entry for the same key. Keys use the Desk's
// dotted form ("1.2"); lesson files keep the dashed form ("1-2").
//
//   node scripts/build-a2-roadmap-data.mjs          # writes roadmap-data.json
//   node scripts/build-a2-roadmap-data.mjs --print  # prints JSON without writing
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function buildRoadmapData({ targets, published, generatedAt = new Date().toISOString() }) {
  const live = Object.fromEntries(published.map(lesson => [lesson.key, lesson]));
  const lessons = {};
  for (const lesson of targets.lessons) {
    const topic = lesson.key.replace('-', '.');
    const entry = live[lesson.key];
    lessons[topic] = {
      topic: 'Lesson ' + lesson.key,
      title: lesson.title,
      unit: lesson.topic,
      plan: lesson.plan,
      published: !!entry,
      ced2026: { status: 'core', newUnit: lesson.topic, newTopic: topic, newLabel: lesson.title, bonusUnit: null },
      urls: entry ? { check: 'check.html?lesson=' + lesson.key, deck: entry.deck } : {},
      periods: entry && entry.sections
        ? Object.fromEntries(Object.entries(entry.sections).filter(([, date]) => date).map(([section, date]) => [section, { date }]))
        : {},
    };
  }
  return { generatedAt, registryVersion: 'a2-' + targets.version, lessons };
}

const targets = JSON.parse(readFileSync(resolve(ROOT, 'data/a2-lesson-targets.json'), 'utf8'));
const published = JSON.parse(readFileSync(resolve(ROOT, 'content/a2/lessons.json'), 'utf8'));
const data = buildRoadmapData({ targets, published });
if (process.argv.includes('--print')) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
} else if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  writeFileSync(resolve(ROOT, 'roadmap-data.json'), JSON.stringify(data, null, 2) + '\n');
  console.log(`roadmap-data.json: ${Object.keys(data.lessons).length} lessons, ${published.length} published`);
}
