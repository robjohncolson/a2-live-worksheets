import { A2_FEEDERS, quarterGradeDistrict, yearGradeDistrict } from './district-grade.js';

export function bestA2Attempt(scores) {
  return scores.reduce((best, row) => !best || Number(row.score) > Number(best.score) ? row : best, null);
}

function periodDate(entry, section) {
  const period = String(section || '').replace(/^Period/i, '').toUpperCase();
  return entry?.periods?.[period] || entry?.dueDate || null;
}

// The content pipeline can provide explicit items (including individual Try-Its).
// Default lesson IDs only apply to future A2 authoring; flashcards keep BL-...-DESK_DONE.
export function districtItemsFromLedger(rows, schedule = {}, section, cfg, extraItems = []) {
  const definitions = [];
  for (const [lessonKey, lesson] of Object.entries(schedule || {})) {
    const dueDate = periodDate(lesson, section);
    if (!dueDate) continue;
    const [unit, number] = lessonKey.split('.');
    const items = lesson.items || [
      { itemId: `LC-U${unit}-L${number}`, source: 'lesson-check' },
      ...Array.from({ length: lesson.tryItCount ?? 5 }, (_, index) => ({
        itemId: `TI-U${unit}-L${number}-${index + 1}`, source: 'try-it',
      })),
      { itemId: `BL-U${unit}-L${lesson.worksheetKey || number}-DESK_DONE`, source: 'flashcard' },
    ];
    for (const item of items) definitions.push({ lessonKey, dueDate, ...item });
  }
  for (const item of extraItems || []) definitions.push({ ...item, dueDate: periodDate(item, section) });
  for (const row of rows || []) {
    if (row.source !== 'topic-assessment' || definitions.some(item => item.itemId === row.item_id)) continue;
    definitions.push({ itemId: row.item_id, source: row.source,
      dueDate: row.response?.dueDate || String(row.recorded_at || '').slice(0, 10) });
  }
  const result = new Map();
  for (const definition of definitions) {
    const feeder = A2_FEEDERS[definition.source];
    if (!feeder) continue;
    const id = definition.itemId;
    const quarter = Object.keys(cfg.quarters).find(key => definition.dueDate >= cfg.quarters[key].start
      && definition.dueDate <= cfg.quarters[key].end);
    if (!quarter) continue;
    const candidates = (rows || []).filter(row => (row.item_id || row.itemId) === id
      && (row.source === definition.source || definition.source === 'flashcard' && /^BL-.*-DESK_DONE/.test(id))
      && (!(row.recorded_at || row.created_at) || (String(row.recorded_at || row.created_at).slice(0, 10) >= cfg.quarters[quarter].start
        && String(row.recorded_at || row.created_at).slice(0, 10) <= cfg.quarters[quarter].end)));
    const scores = candidates.filter(row => row.score != null && row.score !== '' && Number.isFinite(Number(row.score)));
    scores.sort((a, b) => String(a.recorded_at || a.updated_at || a.created_at || '').localeCompare(String(b.recorded_at || b.updated_at || b.created_at || ''))
      || Number(a.attempt || 1) - Number(b.attempt || 1));
    const selected = ['try-it', 'topic-assessment'].includes(definition.source) ? scores.at(-1)
      : bestA2Attempt(scores);
    let points = selected ? Number(selected.score) : 0;
    if (definition.source === 'flashcard') points = points >= 80 ? 1 : 0;
    points = Math.min(feeder.maxPoints, Math.max(0, points));
    const item = { ...definition, ...feeder, itemId: id, quarter, points,
      attempted: !!selected, due: cfg.dueAfterLessonDay ? definition.dueDate < cfg.today : definition.dueDate <= cfg.today };
    // Shared/combined lesson deck may only contribute once within a quarter.
    const key = `${quarter}/${definition.source}/${id}`;
    if (!result.has(key)) result.set(key, item);
  }
  return [...result.values()];
}

export function computeDistrictGrade(rows, config, opts, today) {
  const cfg = { ...config, today };
  const schedule = opts.lessonSchedule || {};
  const items = districtItemsFromLedger(rows, schedule, opts.section, cfg, opts.items || opts.eventSchedule?.topicAssessments || cfg.a2Items || []);
  const quarters = {};
  for (const quarter of Object.keys(cfg.quarters)) {
    const members = items.filter(item => item.quarter === quarter);
    quarters[quarter] = { ...quarterGradeDistrict(items, quarter, cfg), units: cfg.quarters[quarter].units || [],
      unitGrades: {}, unitsGraded: 0, unitsTotal: 0,
      lessonsDue: new Set(members.filter(item => item.due).map(item => item.lessonKey).filter(Boolean)).size,
      lessonsGraded: new Set(members.filter(item => item.attempted).map(item => item.lessonKey).filter(Boolean)).size,
      lessonsTotal: new Set(members.map(item => item.lessonKey).filter(Boolean)).size };
  }
  const lessons = Object.entries(schedule).map(([lessonKey, lesson]) => {
    const members = items.filter(item => item.lessonKey === lessonKey);
    const tries = members.filter(item => item.source === 'try-it');
    const check = members.find(item => item.source === 'lesson-check');
    const flashcard = members.find(item => item.source === 'flashcard');
    return { lessonKey, unit: lesson.unit, worksheetKey: lesson.worksheetKey, due: lesson.periods || {},
      tryIts: { scored: tries.filter(item => item.attempted).length, total: tries.length,
        points: tries.reduce((sum, item) => sum + item.points, 0), maxPoints: tries.length * 2 },
      lessonCheck: check?.attempted ? check.points / check.maxPoints * 100 : null,
      flashcardPassed: flashcard?.points === 1,
      items: { 'try-it': tries, 'lesson-check': check ? [check] : [], flashcard: flashcard ? [flashcard] : [] } };
  });
  return { units: {}, completion: {}, quarters, lessons, items, formula: 'district', today,
    yearGrade: yearGradeDistrict(quarters), a2Categories: cfg.a2Categories };
}

export function districtGradebook(grade) {
  const labels = { assessments: 'Assessments', assignments: 'Assignments', engagement: 'Engagement' };
  const weights = { Assessments: 50, Assignments: 40, Engagement: 10 };
  const quarters = {};
  for (const [key, quarter] of Object.entries(grade.quarters)) {
    const items = grade.items.filter(item => item.quarter === key);
    const columns = items.map(item => ({ key: item.itemId, kind: item.source.replaceAll('-', '_'),
      category: labels[item.category], title: item.title || `${item.lessonKey || ''} ${{'lesson-check': 'Lesson check', 'topic-assessment': 'Topic assessment', 'try-it': 'Try-It', flashcard: 'Flashcards'}[item.source]}${item.source === 'try-it' ? ' ' + item.itemId.split('-').at(-1) : ''}`.trim(),
      maxPoints: item.maxPoints, due: item.due, dueDate: item.dueDate, topicKeys: item.lessonKey ? [item.lessonKey] : [] }));
    const cells = Object.fromEntries(items.map(item => [item.itemId, item.attempted ? item.points : null]));
    const completed = items.filter(item => item.due && item.attempted);
    const total = quarterGradeDistrict(completed, { start: '0000', end: '9999' }, {
      today: grade.today, a2Categories: grade.a2Categories,
    });
    quarters[key] = { columns, cells, categoryAverages: Object.fromEntries(Object.entries(total.categoryBreakdown)
      .map(([category, value]) => [labels[category], value.score])), schoologyTotal: total.quarterGrade,
      quarterGrade: quarter.quarterGrade, v3Total: quarter.quarterGrade, ceiling: quarter.ceiling,
      categoryBreakdown: quarter.categoryBreakdown, formula: grade.formula,
      reconciliation: { branch: 'district', delta: quarter.quarterGrade == null || total.quarterGrade == null
        ? null : quarter.quarterGrade - total.quarterGrade,
        reason: 'The Desk counts unattempted due items as zero. Schoology today includes due, completed items.' } };
  }
  return { weights, quarters };
}
