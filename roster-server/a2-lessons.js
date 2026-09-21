import { migrationError, scoreWriteError } from './a2-score-write.js';
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

// The SY26-27 calendar (range, meeting days, closures) for teacher re-flow; generated
// from desk.html's SCHEDULE_DEFS by scripts/build-a2-year-plan.mjs.
export function loadA2SchoolYear() {
  return JSON.parse(readFileSync(new URL('./data/a2-school-year.json', import.meta.url), 'utf8'));
}

// Lessons the pacing tool may date: the published model plus every year-plan lesson
// that is not `later`, and one `TA-<topic>` assessment row per topic. An overlay for
// an unpublished lesson waits until it is published.
export function pacingKeys(lessons, targets) {
  const keys = new Set(lessons.map(lesson => lesson.key));
  for (const lesson of targets?.lessons || []) {
    if (lesson.plan === 'later') continue;
    keys.add(lesson.key);
    keys.add('TA-' + lesson.topic);
  }
  return keys;
}

// Teacher re-flow ("this lesson is done early"): `lesson` becomes due on `due` for
// `section`, and every later keep/bridge lesson (published or planned) and topic
// assessment is re-dated at the plan's cadence. Returns pacing overlay rows, keyed
// by lesson key or `TA-<topic>`, with full sections objects (the overlay replaces a
// lesson's sections wholesale) and the OneNote links preserved.
export function reflowPacing({ lessons, targets, schoolYear, overlay, section, lesson, due, yearPlan = globalThis.A2YearPlan }) {
  if (!['C', 'D', 'G'].includes(section)) throw new Error('Unknown section');
  if (typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due) || new Date(due).toISOString().slice(0, 10) !== due) throw new Error('Invalid pacing date');
  const order = targets.lessons.filter(item => item.plan === 'keep' || item.plan === 'bridge');
  if (!order.some(item => item.key === lesson)) throw new Error('Unknown lesson');
  const live = Object.fromEntries(lessons.map(item => [item.key, item]));
  const current = Object.fromEntries(order.map(item => [item.key, overlay[item.key]?.sections || live[item.key]?.sections || item.sections || {}]));
  const topics = [...new Set(order.map(item => item.topic))];
  const assessments = Object.fromEntries(topics.map(topic => [topic, overlay['TA-' + topic]?.sections || targets.assessments?.[topic] || {}]));
  const result = yearPlan.reflowSection({ def: schoolYear, section, order, current, assessments, lesson, due,
    weeks: targets.pacing?.weeks || 2, assessmentDays: targets.pacing?.assessmentDays ?? 1 });
  const rows = {};
  for (const [key, sections] of Object.entries(result.lessons)) rows[key] = { sections: Object.keys(sections).length ? sections : null, onenoteUrl: overlay[key]?.onenoteUrl || null };
  for (const [topic, sections] of Object.entries(result.assessments)) rows['TA-' + topic] = { sections: Object.keys(sections).length ? sections : null, onenoteUrl: null };
  return { rows, unscheduled: result.unscheduled };
}

export function overlayLessons(lessons, overlay = {}) {
  return lessons.map(lesson => ({ ...lesson, ...(overlay[lesson.key] || {}) }));
}

export function lessonScheduleFromModel(lessons) {
  return Object.fromEntries(lessons.map(lesson => [lesson.key, {
    unit: lesson.topic, worksheetKey: lesson.key.split('-')[1], periods: lesson.sections || {},
    assignedDates: lesson.assignedDates || {},
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
    async getAssignments() {
      const { data, error } = await client.from('a2_tryit_assignments').select('lesson, section, assigned_date');
      if (migrationError(error)) return {}; // Pre-migration reads remain available.
      if (error) throw error;
      const assignments = {};
      for (const row of data) (assignments[row.lesson] ||= {})[row.section] = row.assigned_date;
      return assignments;
    },
    async assignTryIts(lesson, section, date) {
      // First collection starts the grace period; retries never move it forward.
      const { error } = await client.from('a2_tryit_assignments').upsert(
        { lesson, section, assigned_date: date }, { onConflict: 'lesson,section', ignoreDuplicates: true });
      if (error) throw scoreWriteError(error);
      return (await this.getAssignments())[lesson][section];
    },
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
