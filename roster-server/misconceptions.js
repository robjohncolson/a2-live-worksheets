// Read-only, deterministic interpretation of recorded grading evidence.
import { TEACHER_DIAGNOSTIC_CONFIG } from './grade-config.js';
import { triageStatus, untriagedFirst } from './misconception-triage.js';
const DAY = 86400000;
const STOPWORDS = new Set('a an the is are was were be been being of to in on for and or that this it with as by from explains states describes identifies mentions'.split(' '));
export const MISCONCEPTION_DEFAULTS = Object.freeze(TEACHER_DIAGNOSTIC_CONFIG.misconceptions);

export function normalizeLabel(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
function tokens(value) {
  return new Set(normalizeLabel(value).split(' ').filter(word => word && !STOPWORDS.has(word)));
}
export function resolveElement(missing, elements = []) {
  const words = tokens(missing);
  let best = null;
  let bestScore = 0;
  for (const element of elements) {
    const other = tokens(element.description);
    const overlap = [...words].filter(word => other.has(word)).length;
    const union = new Set([...words, ...other]).size;
    const score = union ? overlap / union : 0;
    if (score >= 0.5 && score > bestScore) { best = element; bestScore = score; }
  }
  return best;
}

function isQuizSource(source) {
  return source === 'quiz' || source === 'curriculum_quiz';
}

export function extractEvents(rows, { answerKey = {}, rubricMap = {}, distractorMap = {} } = {}) {
  const events = [];
  for (const row of rows) {
    if (!row || !row.student_id || !row.item_id || !Number.isFinite(Date.parse(row.recorded_at))) continue;
    const itemId = row.item_id;
    const base = { studentId: row.student_id, ts: new Date(row.recorded_at).toISOString(), itemId };
    if (isQuizSource(row.source)) {
      const correct = answerKey[itemId]?.answerKey;
      const chosen = typeof row.response === 'string' ? row.response.trim().toUpperCase() : '';
      if (!/^[A-E]$/.test(chosen) || !/^[A-E]$/.test(correct || '') || chosen === correct) continue;
      events.push({ ...base, source: 'mcq', evidence: { chosen, correct },
        tags: distractorMap.items?.[itemId]?.[chosen] || [], label: `chose ${chosen} on ${itemId}` });
      continue;
    }
    if (row.source !== 'frq') continue;
    const rubric = rubricMap.rubrics?.[itemId];
    const feedback = typeof row.frq_result?.feedback === 'string' ? row.frq_result.feedback : '';
    const hasMissing = Array.isArray(row.frq_result?.missing);
    const missing = hasMissing ? row.frq_result.missing : [];
    // A legacy I identifies an item to revisit, not a particular misconception.
    if (!hasMissing && row.score === 0) {
      events.push({ ...base, source: 'frq', weak: true, tags: [],
        label: rubric?.question || itemId, evidence: { kind: 'score-only', feedback } });
    }
    for (const text of missing) {
      if (typeof text !== 'string' || !text.trim()) continue;
      const element = resolveElement(text, rubric?.elements);
      events.push({ ...base, source: 'frq', evidence: { missing: text, elementId: element?.id ?? null, feedback },
        tags: element ? (rubricMap.items?.[itemId]?.[element.id] || []) : [],
        label: element?.description || text });
    }
    for (const mistake of rubric?.commonMistakes || []) {
      if (mistake && feedback.includes(mistake)) events.push({ ...base, source: 'frq',
        evidence: { missing: mistake, elementId: null, feedback }, tags: [], label: mistake });
    }
  }
  return events;
}

function lessonOf(event, answerKey) {
  const topic = answerKey[event.itemId]?.topic;
  if (topic) return String(topic);
  const match = /^(?:WS-)?U(\d+)-?L(\d+(?:-\d+)*)/.exec(event.itemId);
  return match ? `${match[1]}.${match[2]}` : null;
}

function worksheetLinksFor(rubrics = {}) {
  const links = {};
  const widths = {};
  for (const [id, rubric] of Object.entries(rubrics)) {
    const match = /^WS-U(\d+)L(\d+)(?:-(\d+))?-/.exec(id);
    if (!match || !rubric.worksheet) continue;
    const start = Number(match[2]);
    const end = Number(match[3] || match[2]);
    const width = end - start;
    links[`${match[1]}.${match[2]}${match[3] ? '-' + match[3] : ''}`] = rubric.worksheet;
    for (let lesson = start; lesson <= end; lesson++) {
      const key = `${match[1]}.${lesson}`;
      if (widths[key] === undefined || width < widths[key]) {
        links[key] = rubric.worksheet;
        widths[key] = width;
      }
    }
  }
  return links;
}

export function computeMisconceptions(fan, assets, options = {}) {
  const config = { ...MISCONCEPTION_DEFAULTS, ...options.config };
  const now = options.now ?? Date.now();
  const days = options.days ?? config.windowDays;
  const floor = days === 0 ? null : now - days * DAY;
  const students = Object.create(null);
  const rows = [];
  const active = new Set();
  for (const { roster, ledgerRows } of fan) {
    if (!roster?.student_id || roster.role === 'teacher') continue;
    students[roster.student_id] = { username: roster.login_username || '', realName: roster.real_name || '', persistent: [] };
    for (const row of ledgerRows || []) {
      const ts = Date.parse(row.recorded_at);
      if (!Number.isFinite(ts) || ts > now || (floor !== null && ts < floor)) continue;
      active.add(roster.student_id);
      rows.push({ ...row, student_id: roster.student_id });
    }
  }
  const groups = new Map();
  const events = extractEvents(rows, assets).sort((a, b) => a.ts.localeCompare(b.ts));
  for (const event of events) {
    const keys = event.tags.length ? [...new Set(event.tags)] : [`label:${normalizeLabel(event.label)}`];
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(event);
    }
  }
  const classEntries = [];
  const frequent = [];
  const postTriage = [];
  const triage = options.triage || { entries: {}, weeklyRuns: [] };
  const evidence = Object.create(null);
  for (const [key, grouped] of groups) {
    const triagedAt = triage.entries?.[key]?.triagedAt;
    const afterTriage = triagedAt ? grouped.filter(event => Date.parse(event.ts) > Date.parse(triagedAt)) : grouped;
    if (afterTriage.length) postTriage.push({ key, students: new Set(afterTriage.map(event => event.studentId)).size,
      events: afterTriage.length });
    const tag = assets.vocabulary.tags[key];
    const draft = !!tag && (assets.vocabulary.reviewed !== true || grouped.some(event =>
      (event.source === 'mcq' ? assets.distractorMap.reviewed : assets.rubricMap.reviewed) !== true));
    const label = tag?.label || grouped[0].label;
    const byStudent = new Map();
    for (const event of grouped) {
      if (!byStudent.has(event.studentId)) byStudent.set(event.studentId, []);
      byStudent.get(event.studentId).push(event);
    }
    const first = grouped[0];
    const questionId = key.startsWith('label:') && first.source === 'mcq' ? first.itemId : null;
    frequent.push({ key,
      label: questionId ? `${questionId} · chose ${first.evidence.chosen}, correct ${first.evidence.correct}` : label,
      draft, weak: grouped.every(event => event.weak === true),
      students: byStudent.size, activeStudents: active.size, events: grouped.length,
      itemIds: [...new Set(grouped.map(event => event.itemId))].sort().slice(0, 10),
      lessons: [...new Set(grouped.map(event => lessonOf(event, assets.answerKey)).filter(Boolean))].sort(),
      sources: { mcq: grouped.filter(event => event.source === 'mcq').length,
        frq: grouped.filter(event => event.source === 'frq').length },
      lastSeen: grouped.at(-1).ts, skills: tag?.skills || [],
      ...(questionId ? { questionId } : {}),
    });
    for (const [studentId, own] of byStudent) {
      const itemIds = [...new Set(own.map(event => event.itemId))].sort();
      const firstSeen = own[0].ts;
      const lastSeen = own.at(-1).ts;
      if (itemIds.length >= config.minAssessmentsPerStudent &&
          Date.parse(lastSeen) - Date.parse(firstSeen) >= config.minDaysApart * DAY) {
        students[studentId].persistent.push({ key, label, draft, count: own.length, itemIds, firstSeen, lastSeen });
      }
    }
    const strong = grouped.filter(event => !event.weak);
    const classStudents = new Set(strong.map(event => event.studentId));
    const lessons = [...new Set(strong.map(event => lessonOf(event, assets.answerKey)).filter(Boolean))].sort();
    if (active.size && classStudents.size / active.size >= config.classShare && lessons.length >= config.classMinLessons) {
      classEntries.push({ key, label, draft, students: classStudents.size, activeStudents: active.size, lessons,
        sources: { mcq: strong.filter(event => event.source === 'mcq').length,
          frq: strong.filter(event => event.source === 'frq').length },
        firstSeen: strong[0].ts, lastSeen: strong.at(-1).ts, skills: tag?.skills || [] });
    }
    evidence[key] = grouped.slice(-50).reverse().map(({ studentId, ts, source, itemId, evidence, weak }) =>
      ({ studentId, ts, source, itemId, evidence, ...(weak ? { weak: true } : {}) }));
  }
  classEntries.sort((a, b) => b.students - a.students || b.lastSeen.localeCompare(a.lastSeen) || a.key.localeCompare(b.key));
  frequent.sort((a, b) => b.students - a.students || b.events - a.events || a.key.localeCompare(b.key));
  postTriage.sort((a, b) => b.students - a.students || b.events - a.events || a.key.localeCompare(b.key));
  const postTriageFrequent = postTriage.slice(0, 15);
  const qualifyingKeys = new Set(postTriageFrequent.map(row => row.key));
  const frequentRows = frequent.slice(0, 15);
  for (const row of [...classEntries, ...frequentRows]) Object.assign(row, triageStatus(row.key, triage, qualifyingKeys, now));
  classEntries.sort(untriagedFirst);
  frequentRows.sort(untriagedFirst);
  for (const student of Object.values(students)) student.persistent.sort((a, b) =>
    b.count - a.count || b.lastSeen.localeCompare(a.lastSeen) || a.key.localeCompare(b.key));
  return { ok: true, section: options.section || null, window: { days, from: floor === null ? null : new Date(floor).toISOString() },
    vocabReviewed: assets.vocabulary.reviewed === true, class: classEntries, frequent: frequentRows, postTriageFrequent, students, evidence,
    worksheetLinks: worksheetLinksFor(assets.rubricMap.rubrics) };
}
