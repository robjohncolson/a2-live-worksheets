import bcrypt from 'bcryptjs';
import { encryptPassword } from './crypto.js';
import { verifyToken, tokenMatchesPassword } from './token.js';
import { requireTeacher } from './teacher-auth.js';

export const STARTING_PASSWORD = process.env.ROSTER_STARTING_PASSWORD || 'password';

export function mountPasswordGate(app, db) {
  app.use(async (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const path = req.path.toLowerCase().replace(/\/+$/, '');
    if (['/roster/verify', '/roster/resolve', '/roster/change-password', '/roster/claim'].includes(path)) return next();

    // Routes accept body, query, or Bearer tokens with different precedence.
    // Check every presented identity so a second token cannot bypass the gate.
    const bearer = req.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    const tokens = [bearer, req.body?.token, req.query.token];
    const presented = [...new Set(tokens.filter(token => typeof token === 'string' && verifyToken(token)))];
    try {
      for (const token of presented) {
        const studentId = verifyToken(token);
        const { data, error } = await db.findByStudentId(studentId);
        if (error) return res.status(503).json({ ok: false, error: 'Unable to check password status' });
        if (!data) return res.status(401).json({ ok: false, error: 'unauthorized' });
        if (!tokenMatchesPassword(token, data.password_hash)) {
          return res.status(401).json({ ok: false, error: 'session expired' });
        }
        if (data.must_change_password) {
          return res.status(403).json({ ok: false, error: 'password change required' });
        }
      }
      return next();
    } catch (_) {
      return res.status(503).json({ ok: false, error: 'Unable to check password status' });
    }
  });
}

export function mountPasswordReset(app, db, cost) {
  app.post('/roster/reset-passwords', async (req, res) => {
    if (!await requireTeacher(req, db)) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }
    const { section, studentIds } = req.body || {};
    const password = STARTING_PASSWORD;
    if ((section !== undefined && (typeof section !== 'string' || !section.trim())) ||
        (studentIds !== undefined && (!Array.isArray(studentIds) || !studentIds.length ||
          studentIds.some(id => typeof id !== 'string' || !id.trim()))) ||
        (!section && !studentIds?.length)) {
      return res.status(400).json({ ok: false, error: 'section or studentIds required' });
    }
    try {
      const { data, error } = await db.listRoster(section?.trim());
      if (error) return res.status(500).json({ ok: false, error: 'Database error' });
      const students = (data || []).filter(row => row.status === 'active' && row.role !== 'teacher' &&
        (!section || row.section === section.trim()) && (!studentIds || studentIds.includes(row.student_id)));
      let updated = 0;
      for (const row of students) {
        const result = await db.updatePassword({
          studentId: row.student_id, passwordHash: await bcrypt.hash(password, cost),
          passwordCipher: encryptPassword(password), mustChangePassword: true,
        });
        if (result.error) return res.status(500).json({ ok: false, error: 'Database error', updated });
        updated++;
      }
      return res.json({ ok: true, updated });
    } catch (_) {
      return res.status(500).json({ ok: false, error: 'Password reset failed' });
    }
  });
}
