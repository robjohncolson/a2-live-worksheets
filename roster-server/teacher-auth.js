// teacher-auth.js -- async teacher authorization helper (WI-2c).
//
// Implements the Section 1 security model:
//   A request is a teacher iff EITHER:
//   (A) x-teacher-secret header === ROSTER_TEACHER_SECRET, OR
//   (B) a roster token resolves via verifyToken() to a studentId whose
//       db.getRoleByStudentId() returns 'teacher'.
//
// Returns a boolean. Never writes to res. Callers send the 401.
// Degrades to false (non-teacher) on any ambiguity -- never grants on error.

import { verifyToken } from './token.js';

// The simple, shared teacher key. Teacher decision (2026-06-03): deprecate the
// long random ROSTER_TEACHER_SECRET in favor of one memorable key that BOTH
// elevates a self-signup account to role='teacher' AND works as the x-teacher-secret
// for every teacher-gated endpoint. Overridable via env; defaults to 'apteacher2627'.
// SECURITY NOTE (teacher-accepted): this key unlocks all student grades + the bulk
// endpoints (decrypted passwords). It is intentionally low-friction for onboarding a
// trusted colleague; rotate via TEACHER_KEY if it leaks.
// NOTE: keep this DISTINCT from the default student/enroll password — if they match,
// anyone who knows the handed-out password also holds the teacher key. (This repo is
// public, so for real secrecy set TEACHER_KEY as a Railway env var, not this default.)
export function getTeacherKey() {
  return process.env.TEACHER_KEY || 'apteacher2627';
}

function isPublishedTeacherKey(value) {
  return typeof value === 'string' && value.trim() === 'apteacher2627';
}

// Extract a bearer token from Authorization: Bearer <t> or ?token=<t>.
// Mirrors the pattern in ledger.js GET /ledger/student/:studentId exactly.
function extractToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
    const t = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (t) return t;
  }
  if (req.query && typeof req.query.token === 'string' && req.query.token) {
    return req.query.token;
  }
  return null;
}

// requireTeacher(req, db) -> Promise<boolean>
//
// Path (A): x-teacher-secret matches ROSTER_TEACHER_SECRET -> true.
// Path (B): valid token -> studentId -> role === 'teacher' -> true.
// Anything else (no match, bad token, DB error, missing role) -> false.
export async function requireTeacher(req, db) {
  // Path (A): x-teacher-secret matches EITHER the legacy long secret (if still
  // configured) OR the simple shared teacher key (getTeacherKey(), default
  // 'apteacher2627'). The simple key is the deprecation path for the long secret.
  const configuredTeacherSecret = process.env.ROSTER_TEACHER_SECRET;
  const teacherSecret = isPublishedTeacherKey(configuredTeacherSecret)
    ? null
    : configuredTeacherSecret;
  const provided = req.headers['x-teacher-secret'];
  if (provided && (provided === getTeacherKey() || (teacherSecret && provided === teacherSecret))) {
    return true;
  }

  // Path (B): roster token resolved to a teacher role.
  const token = extractToken(req);
  if (!token) return false;

  let studentId = null;
  try {
    studentId = verifyToken(token);
  } catch (_) {
    return false;
  }
  if (!studentId) return false;

  // Role lookup degrades to 'student' on any error (pre-migration safety).
  let role = 'student';
  try {
    role = await db.getRoleByStudentId(studentId);
  } catch (_) {
    return false;
  }
  return role === 'teacher';
}

