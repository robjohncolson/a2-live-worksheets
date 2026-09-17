import './lib/a2-answers.js';
import './lib/a2-year-plan.js';
import { loadA2Lessons, loadA2Targets, loadA2SchoolYear, overlayLessons, lessonScheduleFromModel, validatePacing, reflowPacing, createA2Store } from './a2-lessons.js';
import { requireTeacher } from './teacher-auth.js';
import { verifyToken } from './token.js';
import { issueLedgerReceipt } from './receipts.js';
import { todayInTz } from './lesson-grade.js';
import { bestA2Attempt } from './district-ledger.js';

export function lessonStatus(lesson, rows, rescores = {}) {
  const latest = id => rows.filter(row => row.source === 'try-it' && row.item_id === id && row.score != null)
    .sort((a, b) => Number(a.attempt) - Number(b.attempt) || String(a.recorded_at).localeCompare(String(b.recorded_at))).at(-1);
  const scores = lesson.tryIts.map(item => {
    const itemId = `TI-${lesson.key}-${item.n}`;
    const row = latest(itemId);
    return { n: item.n, registryId: item.registryId, itemId, score: row?.score ?? null,
      rescoreRequested: !!rescores[itemId] && (!row || rescores[itemId] > row.recorded_at) };
  });
  const checks = rows.filter(row => row.source === 'lesson-check' && row.item_id === `LC-${lesson.key}`);
  const best = bestA2Attempt(checks);
  const flashcardId = `BL-U${lesson.topic}-L${lesson.key.split('-')[1]}-DESK_DONE`;
  return { lesson: lesson.key, tryIts: { scores, scored: scores.filter(item => item.score != null).length,
    total: scores.length, points: scores.reduce((sum, item) => sum + (item.score || 0), 0) },
  lessonCheck: best ? Number(best.score) * 10 : null,
  attempts: checks.length, flashcardPassed: rows.some(row => row.item_id === flashcardId && Number(row.score) >= 80) };
}

export function mountA2(app, { db, ledgerDb, config, schedule, lessons = loadA2Lessons(), targets = loadA2Targets(), schoolYear = loadA2SchoolYear(), store, now = () => todayInTz(config.schoolTz) }) {
  let liveStore = store;
  const storage = () => liveStore ||= createA2Store();
  const locks = new Map();
  // The roster service runs as one instance. Serialize score writes per student,
  // including retries, so each retained attempt has a distinct number.
  async function serialized(studentId, action) {
    const prior = locks.get(studentId) || Promise.resolve();
    const next = prior.catch(() => {}).then(action);
    locks.set(studentId, next);
    try { return await next; } finally { if (locks.get(studentId) === next) locks.delete(studentId); }
  }
  function route(handler) {
    return async (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      try { await handler(req, res, next); }
      catch (error) { res.status(error.status || 503).json({ ok: false, error: error.status ? error.message : 'Lesson service unavailable' }); }
    };
  }
  function fail(status, message) { throw Object.assign(new Error(message), { status }); }
  async function identity(req, teacher = false) {
    const isTeacher = await requireTeacher(req, db);
    if (teacher && !isTeacher) fail(403, 'Teacher sign-in required');
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '') || req.body?.token || req.query.token;
    const signedId = token ? verifyToken(token) : null;
    const studentId = isTeacher ? req.body?.studentId || req.query.studentId || signedId : signedId;
    if (!studentId) fail(401, 'Sign in on the Desk');
    const { data, error } = await db.findByStudentId(studentId);
    if (error) throw error;
    if (!data || data.status === 'archived') fail(401, 'Active roster identity required');
    return { ...data, student_id: studentId, isTeacher };
  }
  async function currentLessons() {
    const current = overlayLessons(lessons, await storage().getPacing());
    if (schedule) Object.assign(schedule, lessonScheduleFromModel(current));
    return current;
  }
  // The published model with its overlay, plus the raw overlay so the Desk and the
  // pacing tool can date year-plan lessons that are not published yet.
  async function lessonsResponse() {
    const pacing = await storage().getPacing();
    const current = overlayLessons(lessons, pacing);
    if (schedule) Object.assign(schedule, lessonScheduleFromModel(current));
    return { ok: true, lessons: current, pacing };
  }
  async function rowsFor(studentId) {
    const { data, error } = await ledgerDb.getLedgerByStudent(studentId);
    if (error) throw error;
    return data || [];
  }
  function ensureOpen(lesson, student, rows, source, itemId) {
    const section = String(student.section).replace(/^Period/i, '');
    const previous = rows.find(row => row.source === source && row.item_id === itemId);
    const date = source === 'topic-assessment' ? previous?.response?.dueDate || now()
      : lesson.sections?.[section] || String(previous?.recorded_at || now()).slice(0, 10);
    const quarter = Object.values(config.quarters).find(q => date >= q.start && date <= q.end);
    if (!quarter || now() > quarter.end) fail(409, 'Quarter is closed');
    if (source === 'try-it' && rows.some(row => row.source === 'topic-assessment' && row.item_id === `TA-${lesson.topicAssessmentKey}`)) fail(409, 'Topic assessment has closed Try-It rescoring');
    return date;
  }
  app.get('/lessons', route(async (_req, res) => res.json(await lessonsResponse())));
  app.get('/teacher/lessons', route(async (req, res) => {
    if (!await requireTeacher(req, db)) fail(403, 'Teacher sign-in required');
    res.json(await lessonsResponse());
  }));
  app.put('/teacher/lessons', route(async (req, res) => {
    if (!await requireTeacher(req, db)) fail(403, 'Teacher sign-in required');
    let overlay;
    try { overlay = validatePacing(lessons, req.body?.lessons, targets); } catch (error) { fail(400, error.message); }
    await storage().putPacing(overlay);
    res.json(await lessonsResponse());
  }));
  // Teacher: a lesson finished early (or late). Re-dates one section from that lesson on.
  app.put('/teacher/pacing/reflow', route(async (req, res) => {
    if (!await requireTeacher(req, db)) fail(403, 'Teacher sign-in required');
    const overlay = await storage().getPacing();
    let result;
    try { result = reflowPacing({ lessons, targets, schoolYear, overlay, section: req.body?.section, lesson: req.body?.lesson, due: req.body?.due }); }
    catch (error) { fail(400, error.message); }
    await storage().putPacing(result.rows);
    res.json({ ...(await lessonsResponse()), unscheduled: result.unscheduled });
  }));
  // Existing grade/class/transcript mounts share the same schedule object.
  if (schedule) app.use(['/grade', '/class/grades', '/teacher/student', '/transcript', '/donow'], route(async (_req, _res, next) => { await currentLessons(); next(); }));
  app.get('/lesson-status/:lesson', route(async (req, res) => {
    const student = await identity(req);
    const lesson = (await currentLessons()).find(item => item.key === req.params.lesson);
    if (!lesson) fail(404, 'Unknown lesson');
    res.set('Cache-Control', 'no-store').json({ ok: true, ...lessonStatus(lesson, await rowsFor(student.student_id), await storage().getRescores(student.student_id)) });
  }));
  app.post('/ledger/rescore', route(async (req, res) => {
    const student = await identity(req);
    const lesson = (await currentLessons()).find(item => item.tryIts.some(t => `TI-${item.key}-${t.n}` === req.body?.itemId));
    if (!lesson) fail(400, 'Unknown Try-It');
    const rows = await rowsFor(student.student_id);
    ensureOpen(lesson, student, rows, 'try-it', req.body.itemId);
    if (!rows.some(row => row.item_id === req.body.itemId)) fail(400, 'Try-It has not been scored');
    await storage().requestRescore(student.student_id, req.body.itemId);
    res.json({ ok: true, rescoreRequested: true });
  }));
  app.put('/student/section', route(async (req, res) => {
    const student = await identity(req);
    if (!['C', 'D', 'G'].includes(req.body?.section)) fail(400, 'Choose C, D or G');
    const { error } = await db.updateStudent({ studentId: student.student_id, section: req.body.section });
    if (error) throw error;
    res.json({ ok: true, section: req.body.section });
  }));
  app.post('/ledger/record', route(async (req, res, next) => {
    const body = req.body || {};
    const source = body.source;
    if (!['try-it', 'lesson-check', 'topic-assessment'].includes(source)) return next();
    const model = lessons.find(lesson => source === 'topic-assessment' ? body.itemId === `TA-${lesson.topicAssessmentKey}`
      : source === 'lesson-check' ? body.itemId === `LC-${lesson.key}` : lesson.tryIts.some(item => body.itemId === `TI-${lesson.key}-${item.n}`));
    if (!model) return next(); // Retained fixtures/older registered sources use their original validator.
    const student = await identity(req, source !== 'lesson-check');
    const lesson = (await currentLessons()).find(item => item.key === model.key);
    await serialized(student.student_id, async () => {
      const rows = await rowsFor(student.student_id);
      const existing = rows.filter(row => row.item_id === body.itemId && row.source === source);
      if (typeof body.requestId !== 'string' || body.requestId.length > 100 || !body.requestId) fail(400, 'requestId required');
      const duplicate = existing.find(row => row.response?.requestId === body.requestId);
      if (duplicate) {
        if (!duplicate.receipt_compact && ledgerDb.updateLedgerReceipt) {
          const receipt = issueLedgerReceipt({ studentId: student.student_id, username: student.login_username,
            source, itemId: body.itemId, score: duplicate.score, response: duplicate.response,
            attempt: duplicate.attempt, evidenceTier: duplicate.evidence_tier || 'practice' });
          if (receipt) {
            const saved = await ledgerDb.updateLedgerReceipt(duplicate.ledger_id, { receiptId: receipt.receiptId, receiptCompact: receipt.compact });
            if (saved?.error) throw saved.error;
            duplicate.receipt_compact = receipt.compact;
          }
        }
        return res.json({ ok: true, score: duplicate.score, attempt: duplicate.attempt, receipt: duplicate.receipt_compact,
          bestScore: source === 'lesson-check' ? bestA2Attempt(existing).score : duplicate.score, duplicate: true });
      }
      const dueDate = ensureOpen(lesson, student, rows, source, body.itemId);
      if (source === 'topic-assessment' && body.quarter) {
        const requestedQuarter = config.quarters[body.quarter];
        if (!requestedQuarter || dueDate < requestedQuarter.start || dueDate > requestedQuarter.end) fail(409, 'Assessment belongs to a different quarter');
      }
      let result = null;
      let score = body.score;
      if (source === 'lesson-check') {
        if (!body.answers || typeof body.answers !== 'object' || lesson.lessonCheck.some(item => typeof body.answers[item.registryId] !== 'string' || body.answers[item.registryId].length > 500)) fail(400, 'Answer every item');
        result = globalThis.A2Answers.scoreLessonCheck(lesson.lessonCheck, body.answers);
        score = result.score;
      }
      const maxPoints = source === 'try-it' ? 2 : source === 'lesson-check' ? 10 : 100;
      if (!Number.isFinite(score) || score < 0 || score > maxPoints || source === 'try-it' && !Number.isInteger(score)) fail(400, 'Invalid score');
      const attempt = Math.max(0, ...existing.map(row => Number(row.attempt) || 1)) + 1;
      const response = { requestId: body.requestId, lesson: lesson.key, maxPoints, dueDate,
        ...(result ? { answers: body.answers, registryIds: lesson.lessonCheck.map(item => item.registryId) } : {}) };
      const saved = await ledgerDb.insertLedgerRow({ studentId: student.student_id, source, itemId: body.itemId,
        score, response, attempt, evidenceTier: 'practice', unit: `U${lesson.topic}`, topic: lesson.key });
      if (saved.error) throw saved.error;
      const receipt = issueLedgerReceipt({ studentId: student.student_id, username: student.login_username,
        source, itemId: body.itemId, score, response, attempt, evidenceTier: 'practice' });
      if (receipt && ledgerDb.updateLedgerReceipt) {
        const persisted = await ledgerDb.updateLedgerReceipt(saved.data.ledger_id, { receiptId: receipt.receiptId, receiptCompact: receipt.compact });
        if (persisted?.error) throw persisted.error;
      }
      res.json({ ok: true, ...result, score, maxPoints, attempt, receipt,
        bestScore: source === 'lesson-check' ? bestA2Attempt([...existing, { score }]).score : score });
    });
  }));
}
