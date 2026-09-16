#!/usr/bin/env node
// Published A2 lessons only; classroom order is Try-Its, check, then deck.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function buildA2WorkManifest(root = ROOT, generated = new Date().toISOString()) {
  const lessons = JSON.parse(readFileSync(resolve(root, 'content/a2/lessons.json'), 'utf8'));
  const targets = JSON.parse(readFileSync(resolve(root, 'data/a2-lesson-targets.json'), 'utf8'));
  const units = [];
  const index = {};
  const ordered = [...lessons].sort((a, b) => a.topic - b.topic
    || Number(a.key.split('-')[1]) - Number(b.key.split('-')[1]));

  for (const lesson of ordered) {
    const unitKey = `U${lesson.topic}`;
    const number = lesson.key.split('-')[1];
    const lessonKey = `${lesson.topic}.${number}`;
    let unit = units.find(entry => entry.unit === unitKey);
    if (!unit) {
      // Targets currently has lesson titles only. Honor topic titles when authored.
      const topic = targets.topics?.find(entry => Number(entry.topic) === lesson.topic);
      unit = { unit: unitKey, title: topic?.title || `Topic ${lesson.topic}`, lessons: [] };
      units.push(unit);
    }
    const activities = [
      { activity: 'try-it', source: 'try-it', itemIds: [...lesson.tryIts]
        .sort((a, b) => a.n - b.n).map(item => `TI-${lesson.key}-${item.n}`) },
      { activity: 'lesson-check', source: 'lesson-check', itemIds: [`LC-${lesson.key}`] },
      { activity: 'flashcard', source: 'flashcard', itemIds: [`BL-U${lesson.topic}-L${number}-DESK_DONE`] },
    ];
    unit.lessons.push({ lesson: lessonKey, activities });
    for (const activity of activities) {
      for (const id of activity.itemIds) {
        index[id] = { unit: unitKey, lesson: lessonKey, activity: activity.activity };
      }
    }
  }
  return {
    generatedFrom: 'content/a2/lessons.json + data/a2-lesson-targets.json',
    generated,
    units,
    index: Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b))),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const json = JSON.stringify(buildA2WorkManifest(), null, 2) + '\n';
  for (const path of ['data/work-manifest.json', 'roster-server/data/work-manifest.json']) {
    writeFileSync(resolve(ROOT, path), json);
  }
}
