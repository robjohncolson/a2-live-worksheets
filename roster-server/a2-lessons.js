import { readFileSync } from 'node:fs';
import { createServiceClient } from './ledger-db.js';

export function loadA2Lessons() {
  return JSON.parse(readFileSync(new URL('./data/a2-lessons.json', import.meta.url), 'utf8'));
}

// The year plan (data/a2-lesson-targets.json, synced by scripts/sync-server-shared.mjs):
// every Savvas lesson with its plan and, for scheduled lessons, planned section dates.
export function loadA2Targets() {
  try { return JSON.parse(readFileSync(new URL('./data/a2-lesson-targets.json', import.meta.url), 'utf8')); }
  catch (_) { return { lessons: [] }; }
}

// Lessons the pacing tool may date: the published model plus every year-plan lesson
// that is not `later`. An overlay for an unpublished lesson waits until it is published.
export function pacingKeys(lessons, targets) {
  const keys = new Set(lessons.map(lesson => lesson.key));
  for (const lesson of targets?.lessons || []) if (lesson.plan !== 'later') keys.add(lesson.key);
  return keys;
}

export function overlayLessons(lessons, overlay = {}) {
  return lessons.map(lesson => ({ ...lesson, ...(overlay[lesson.key] || {}) }));
}

export function lessonScheduleFromModel(lessons) {
  return Object.fromEntries(lessons.map(lesson => [lesson.key, {
    unit: lesson.topic, worksheetKey: lesson.key.split('-')[1], periods: lesson.sections || {},
    items: [
      { itemId: `LC-${lesson.key}`, source: 'lesson-check' },
      ...lesson.tryIts.map(item => ({ itemId: `TI-${lesson.key}-${item.n}`, source: 'try-it' })),
      { itemId: `BL-U${lesson.topic}-L${lesson.key.split('-')[1]}-DESK_DONE`, source: 'flashcard' },
    ],
  }]));
}

export function validatePacing(lessons, changes, targets) {
  if (!Array.isArray(changes)) throw new Error('lessons must be an array');
  const allowed = pacingKeys(lessons, targets);
  const overlay = {};
  for (const change of changes) {
    if (!change || !allowed.has(change.key)) throw new Error('Unknown lesson');
    const sections = {};
    for (const section of ['C', 'D', 'G']) {
      const date = change.sections?.[section];
      if (date == null || date === '') continue;
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
        || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Invalid pacing date');
      sections[section] = date;
    }
    const onenoteUrl = change.onenoteUrl || null;
    if (onenoteUrl && (typeof onenoteUrl !== 'string' || !/^https:\/\//i.test(onenoteUrl))) throw new Error('OneNote URL must use HTTPS');
    overlay[change.key] = { sections: Object.keys(sections).length ? sections : null, onenoteUrl };
  }
  return overlay;
}

// One row per lesson prevents an editor from overwriting other lessons.
export function createA2Store(client = createServiceClient()) {
  return {
    async getPacing() {
      const { data, error } = await client.from('a2_lesson_pacing').select('lesson, sections, onenote_url');
      if (error) throw error;
      return Object.fromEntries(data.map(row => [row.lesson, { sections: row.sections, onenoteUrl: row.onenote_url }]));
    },
    async putPacing(overlay) {
      const rows = Object.entries(overlay).map(([lesson, value]) => ({ lesson, sections: value.sections, onenote_url: value.onenoteUrl }));
      if (!rows.length) return;
      const { error } = await client.from('a2_lesson_pacing').upsert(rows);
      if (error) throw error;
    },
    async getRescores(studentId) {
      const { data, error } = await client.from('a2_rescore_requests').select('item_id, requested_at').eq('student_id', studentId);
      if (error) throw error;
      return Object.fromEntries(data.map(row => [row.item_id, row.requested_at]));
    },
    async requestRescore(studentId, itemId) {
      const { error } = await client.from('a2_rescore_requests').upsert({ student_id: studentId, item_id: itemId, requested_at: new Date().toISOString() });
      if (error) throw error;
    },
  };
}
