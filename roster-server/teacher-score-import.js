import { requireTeacher } from './teacher-auth.js';
import { A2_FEEDERS } from './district-grade.js';
import { serializeStudent, saveTeacherScore, scoreWriteError } from './a2-score-write.js';

const sectionKey = value => String(value || '').replace(/^Period/i, '').toUpperCase();
const nameKey = value => String(value || '').normalize('NFC').trim().toLowerCase();

// A complete section/quarter bonus snapshot clears removed awards to zero.
// Engagement includes nulls for absences so corrections can retire an earlier score.
export async function importTeacherScores(req, res, { db, ledgerDb, config }) {
  try {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'teacher only' });
    const { source, date, quarter, scores } = req.body || {};
    const section = sectionKey(req.body?.section);
    const feeder = (config.a2Feeders || A2_FEEDERS)[source];
    if (!['daily-engagement', 'bonus'].includes(source) || !['C', 'D', 'G'].includes(section)
        || !Array.isArray(scores) || scores.length > 5000) {
      return res.status(400).json({ ok: false, error: 'invalid import' });
    }
    const window = config.quarters[quarter];
    const dueDate = source === 'bonus' ? window?.start : date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate || '')
        || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate
        || !Object.values(config.quarters).some(q => dueDate >= q.start && dueDate <= q.end)) {
      return res.status(400).json({ ok: false, error: 'invalid date or quarter' });
    }
    const itemId = source === 'bonus' ? `BONUS-${quarter}` : `${date}-Period${section}`;
    const roster = await db.listRoster();
    if (roster.error) throw new Error('roster');
    const students = (roster.data || []).filter(student => sectionKey(student.section) === section
      && student.role !== 'teacher' && (!student.status || student.status === 'active'));
    const selected = new Map();
    for (const entry of scores) {
      if (!entry || !(Number.isFinite(entry.score) && entry.score >= 0
          && entry.score <= (source === 'bonus' ? feeder.quarterCap : feeder.maxPoints))
          && !(source === 'daily-engagement' && entry?.score === null)) {
        return res.status(400).json({ ok: false, error: 'invalid score' });
      }
      const matches = students.filter(student => entry.studentId
        ? student.student_id === entry.studentId
        : nameKey(entry.student) && [student.real_name, student.login_username].some(value => nameKey(value) === nameKey(entry.student)));
      if (matches.length !== 1 || selected.has(matches[0].student_id)) {
        return res.status(400).json({ ok: false, error: 'unresolved or duplicate student' });
      }
      selected.set(matches[0].student_id, entry.score);
    }
    if (source === 'bonus') {
      for (const student of students) if (!selected.has(student.student_id)) selected.set(student.student_id, 0);
    }
    // Validate the whole batch before any mutation. Fixed attempt + stable response
    // make retries safe; unchanged rows retain timestamps and signed receipts.
    const response = { assignedDate: dueDate, dueDate, maxPoints: feeder.maxPoints };
    let written = 0;
    let unchanged = 0;
    let rejected = 0;
    let rejection;
    const currentRows = [];
    for (const [studentId, score] of selected) {
      try {
        await serializeStudent(ledgerDb, studentId, async () => {
          const previous = await ledgerDb.getLedgerByStudent(studentId);
          if (previous.error) throw previous.error;
          const existing = (previous.data || []).find(row => row.source === source && row.item_id === itemId && row.attempt === 1);
          if (!existing && score === null) { unchanged++; return; }
          const result = await saveTeacherScore(ledgerDb, existing, { studentId, source, itemId, score,
            response, attempt: 1, evidenceTier: 'practice' }, existing?.response?.version || 0);
          if (result.unchanged) unchanged++; else written++;
          currentRows.push({ studentId, itemId, score: result.row.score, version: result.row.response.version, receipt: result.receipt });
        });
      } catch (error) {
        error = scoreWriteError(error);
        if (![409, 503].includes(error.status)) throw error;
        rejected++;
        rejection = error;
      }
    }
    if (rejected) return res.status(rejection.status).json({ ok: false, written, unchanged, rejected, error: rejection.message });
    return res.json({ ok: true, written, unchanged, rejected, rows: currentRows });
  } catch (error) {
    error = scoreWriteError(error);
    if (error.status) return res.status(error.status).json({ ok: false, error: error.message });
    return res.status(500).json({ ok: false, error: 'Score import failed; retry the same import.' });
  }
}
