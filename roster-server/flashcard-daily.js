import { requireTeacher } from './teacher-auth.js';
import { todayInTz } from './lesson-grade.js';
import { loadA2Lessons } from './a2-lessons.js';

export function validDailyDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

// Reserved inside flashcard_state.state. Practice sync cannot replace this field.
export function mountFlashcardDaily(app, { db, getStore, studentIdentity, maxStateBytes }) {
  const lessonKeys = new Set(loadA2Lessons().map(lesson => lesson.key));
  app.post('/flashcards/daily', studentIdentity, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.body?.studentId !== undefined && req.body.studentId !== req.flashcardStudentId) {
      return res.status(400).json({ ok: false, error: 'Student identity mismatch' });
    }
    const { lesson, mode, correct, total } = req.body || {};
    const today = todayInTz('America/New_York');
    const date = req.body?.date ?? today;
    const age = (Date.parse(today) - Date.parse(date)) / 86400000;
    const timestamp = req.body?.timestamp;
    if (!lessonKeys.has(lesson)
        || !['quick', 'full'].includes(mode) || !validDailyDate(date)
        || age < 0 || age > 7
        || (timestamp !== undefined && (!Number.isSafeInteger(timestamp) || timestamp < 0))
        || !Number.isSafeInteger(correct) || !Number.isSafeInteger(total)
        || correct < 0 || total <= 0 || correct > total) {
      return res.status(400).json({ ok: false, error: 'Invalid flashcard run' });
    }
    const run = { lesson, date, mode, correct, total, ...(timestamp === undefined ? {} : { timestamp }) };
    try {
      // Compare-and-swap retries preserve simultaneous practice/device writes.
      for (let attempt = 0; attempt < 8; attempt++) {
        const old = await getStore().get(req.flashcardStudentId);
        let runs = [...(old?.state?.dailyRuns || [])];
        const index = runs.findIndex(r => r.date === date && r.mode === mode && r.lesson === lesson);
        if (index < 0) runs.push(run);
        else if (runs[index].correct / runs[index].total < correct / total) runs[index] = run;
        const dates = [...new Set(runs.map(r => r.date))].sort().reverse().slice(0, 60);
        runs = runs.filter(r => dates.includes(r.date));
        const state = { v: 1, e: [], ...old?.state, dailyRuns: runs };
        if (Buffer.byteLength(JSON.stringify(state), 'utf8') > maxStateBytes) {
          return res.status(413).json({ ok: false, error: 'state too large' });
        }
        if (await getStore().put(req.flashcardStudentId, state, old?.updated_at || null)) {
          return res.json({ ok: true });
        }
      }
      return res.status(409).json({ ok: false, error: 'Retry flashcard run' });
    } catch (_) {
      return res.status(503).json({ ok: false, error: 'Flashcard results unavailable' });
    }
  });

  app.get('/teacher/flashcards/daily', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    const { section, date } = req.query;
    if (!['PeriodC', 'PeriodD', 'PeriodG'].includes(section) || !validDailyDate(date)) {
      return res.status(400).json({ ok: false, error: 'Valid section and date required' });
    }
    try {
      // Existing rosters contain both bare and Period-prefixed section values.
      const { data, error } = await db.listRoster();
      if (error) throw error;
      const roster = (data || []).filter(row => row.status === 'active' && row.role !== 'teacher'
        && String(row.section).replace(/^Period/, '') === section.slice(6));
      const students = await Promise.all(roster.map(async row => {
        const state = await getStore().get(row.student_id);
        const runs = (state?.state?.dailyRuns || []).filter(run => run.date === date);
        const best = runs.reduce((best, run) => !best || run.correct / run.total > best.correct / best.total ? run : best, null);
        return { studentId: row.student_id, realName: row.real_name, username: row.login_username,
          runs, best: best ? { correct: best.correct, total: best.total, mode: best.mode } : null };
      }));
      return res.json({ ok: true, section, date, students });
    } catch (_) {
      return res.status(503).json({ ok: false, error: 'Flashcard results unavailable' });
    }
  });
}
