// server.js — Algebra 2 Gradebook Phase 0 roster auth service
// Implements FROZEN CONTRACT 2 exactly.
// ES module, Express, injectable db for testing.

import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { createLiveDb } from './db.js';
import { createLedgerDb, createServiceClient } from './ledger-db.js';
import { createFrqLedgerDb } from './frq-ledger-db.js';
import { createFrqWorker } from './frq-worker.js';
import { loadFrqRubricRegistry } from './frq-prompt.js';
import { createLiveRemediationDb } from './remediation-db.js';
import { signToken, verifyToken } from './token.js';
import { generateUsername } from './username.js';
import { mountLedger } from './ledger.js';
import { mountA2 } from './a2-routes.js';
import { mountAnnouncements } from './announcements.js';
import { createA2Store } from './a2-lessons.js';
import { mountLedgerImport } from './ledger-import.js';
import { mountAdminSnapshot } from './admin-snapshot.js';
import { mountAdminRestore } from './admin-restore.js';
import { mountDonow } from './donow.js';
import { mountRollup } from './rollup.js';
import { mountGrade } from './grade.js';
import { mountOfflineInputs } from './grade-offline-inputs.js';
import { mountAnswerKey } from './grade-answer-key.js';
import { mountTranscript } from './transcript.js';
import { mountCommits } from './commits.js';
import { mountMastery } from './mastery.js';
import { mountClass } from './class.js';
import { mountReview } from './review.js';
import { mountTeacherStudent } from './teacher.js';
import { mountRemediation } from './remediation.js';
import { mountNudge } from './nudge.js';
import { mountWorksheetDiagnostics, createLiveDiagnosticsStore } from './worksheet-diagnostics.js';
import { createLiveNudgesDb } from './nudge-db.js';
import { mountLessonUnlock } from './lesson-unlock.js';
import { createLiveLessonUnlockDb } from './lesson-unlock-db.js';
import {
  ACTIVE_SCHOOL_YEAR,
  resolveProductionGradeInputs,
} from './grade-contexts.js';
// PHASE3_CONFIG is resolved via grade-contexts (M2b'); do not import it here for mounts.
import { buildWorksheetBlankCounts } from './lesson-grade.js';
import { encryptPassword, decryptPassword } from './crypto.js';
import { requireTeacher, getTeacherKey } from './teacher-auth.js';
import { getOpenSections, isOpenSection } from './signup-config.js';
import { createRateLimiter, createLoginThrottle } from './rate-limit.js';
import { getReceiptHealth, initReceipts, issueLedgerReceipt, mountReceipts } from './receipts.js';
import { mountStudentKeys } from './student-keys.js';
import { mountFlashcardState } from './flashcard-state.js';
import { mountSubmissions } from './submissions.js';
import { readFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let frqBundleCache;
let frqBundleLoaded = false;
let frqBundleWarningLogged = false;

export function resolveFrqGradeMode(value = process.env.FRQ_GRADE_MODE) {
  const normalized = String(value || 'off').trim().toLowerCase();
  return ['off', 'shadow', 'authoritative'].includes(normalized) ? normalized : 'off';
}

function loadLiveFrqBundle() {
  if (frqBundleLoaded) return frqBundleCache;
  frqBundleLoaded = true;
  try {
    const source = readFileSync(resolve(__dirname, 'data', 'frq-rubrics.SY2627.json'), 'utf8');
    frqBundleCache = loadFrqRubricRegistry(source);
  } catch (error) {
    frqBundleCache = null;
    if (!frqBundleWarningLogged) {
      frqBundleWarningLogged = true;
      console.warn('roster-server: FRQ rubric bundle unavailable; FRQ worker degraded:', error.message);
    }
  }
  return frqBundleCache;
}

// bcrypt work factor. Production stays 12 (BCRYPT_COST unset). Tests set
// BCRYPT_COST=4 so the auth paths (signup/change-password/PIN hash + verify) stop
// starving the full parallel run and timing out — the "passes isolated, flakes
// under load" tax. Clamped to a valid bcrypt range so a bad env can't weaken prod.
function bcryptCost() {
  const c = Number(process.env.BCRYPT_COST);
  return Number.isInteger(c) && c >= 4 && c <= 15 ? c : 12;
}

// ── App factory (accepts injected db for tests) ───────────────────────────────
// ledgerDb is optional; defaults to createLiveLedgerDb() in production.
// Tests pass a fake ledgerDb alongside the fake db.
// loadManifest is optional; defaults to reading WORK_MANIFEST_PATH (or repo default).
// Tests inject a fake loadManifest that returns a fixture manifest directly.

/**
 * @param {*} db
 * @param {*} ledgerDb
 * @param {*} loadManifest
 * @param {*} loadAnswerKey
 * @param {*} loadSkillMap
 * @param {*} bkt
 * @param {*} remediationDb
 * @param {*} lessonSchedule
 * @param {*} configOverrides
 * @param {*} worksheetBlankCounts
 * @param {*} nudgesDbOverride
 * @param {*} lessonUnlockDbOverride
 * @param {*} worksheetKey
 * @param {object} [productionGradeInputs] Optional pre-resolved bundle from
 *   resolveProductionGradeInputs(). When provided (production boot), createApp
 *   does NOT re-resolve — all seven mounts share this single object. When
 *   omitted (tests), createApp resolves once for ACTIVE_SCHOOL_YEAR.
 */
export function createApp(db, ledgerDb, loadManifest, loadAnswerKey, loadSkillMap, bkt, remediationDb, lessonSchedule, configOverrides, worksheetBlankCounts, _unusedPollArchive, nudgesDbOverride, lessonUnlockDbOverride, _unusedTrainer, worksheetKey, productionGradeInputs) {
  // Atomic grade-year bundle: resolve ONCE, thread to every grade mount.
  const _gradeCtx = productionGradeInputs || resolveProductionGradeInputs(ACTIVE_SCHOOL_YEAR);
  // Only an explicitly supplied production bundle activates the yearly key.
  // Tests that inject loadAnswerKey without a bundle retain their fixture loader.
  const _frozenGradingAnswerKey = productionGradeInputs?.answerKey
    ? JSON.parse(JSON.stringify(productionGradeInputs.answerKey))
    : null;
  const _gradingLoadAnswerKey = _frozenGradingAnswerKey
    ? async () => _frozenGradingAnswerKey
    : loadAnswerKey;
  const gradeConfig = configOverrides
    ? { ..._gradeCtx.config, ...configOverrides }
    : _gradeCtx.config;
  const _sched = lessonSchedule || (ledgerDb?.a2Store ? {} : null);
  
  const _events = productionGradeInputs ? (_gradeCtx.eventSchedule || null) : null;
  const _presence = _gradeCtx.blooketPresence || _gradeCtx.blooketTopics;
  const _required = _gradeCtx.blooketRequired;
  const _bonus = _gradeCtx.blooketBonusTopics || [];
  const _blooketBundle = {
    blooketPresence: _presence,
    blooketRequired: _required,
    blooketBonusTopics: _bonus,
    blooketLessons: _presence, // legacy alias = presence
  };
  const _frqMode = () => resolveFrqGradeMode();
  const _frqBundle = ledgerDb && Object.hasOwn(ledgerDb, 'frqBundle')
    ? ledgerDb.frqBundle
    : loadLiveFrqBundle();
  const _frqDb = ledgerDb && ledgerDb.frqDb ? ledgerDb.frqDb : null;
  const _frqWorker = ledgerDb && ledgerDb.frqWorker
    ? ledgerDb.frqWorker
    : createFrqWorker({
      frqDb: _frqDb,
      bundle: _frqBundle,
      graderUrl: process.env.FRQ_GRADER_URL,
      // Either name works: the spec says FRQ_GRADER_SECRET, the runbook (and the
      // curriculum-render side) say ROSTER_GRADER_SECRET — accept both so the
      // same variable name can be set on both Railway services.
      graderSecret: process.env.FRQ_GRADER_SECRET || process.env.ROSTER_GRADER_SECRET,
      mode: _frqMode,
      issueReceipt: issueLedgerReceipt,
      log: console,
    });

  const app = express();
  const schema = process.env.ROSTER_DB_SCHEMA || 'a2';
  if (schema.trim().toLowerCase() === 'public') {
    console.error('Refusing to start: ROSTER_DB_SCHEMA must isolate A2; the public schema is forbidden.');
    throw new Error('Unsafe ROSTER_DB_SCHEMA');
  }
  const origins = process.env.CORS_ORIGINS;
  if (origins === undefined) console.warn('CORS_ORIGINS is unset; allowing all origins. Set the deployment allowlist.');
  app.use(cors({ origin: origins === undefined ? '*' : origins.split(',').map(value => value.trim()).filter(Boolean) }));
  
  app.use(express.json({ limit: '8mb' }));
  mountAnnouncements(app, { db, config: gradeConfig });
  // Railway runs behind a SINGLE edge proxy — trust exactly ONE hop so req.ip is
  // the proxy-appended client address. `true` (trust the whole chain) would let a
  // client forge X-Forwarded-For and rotate it to defeat the limiter; a bounded
  // hop count ignores any client-supplied XFF prefix. If Railway's proxy depth
  // changes, log req.ip for a known client and set the smallest matching value.
  app.set('trust proxy', 1);
  initReceipts();
  mountReceipts(app, { db, requireTeacher });
  // OFFLINE_GRADING_MESH_SPEC §0.1-0.3 — the student SUBMISSION trust set
  // (authenticated pubkey→sid binding + terminal revocation). 503 until
  // migration 0027 runs. Disjoint from the issuer trust set by construction.
  mountStudentKeys(app, { db });
  mountWorksheetDiagnostics(app, { db, store: createLiveDiagnosticsStore() });
  mountFlashcardState(app, { db });
  // OFFLINE_GRADING_MESH_SPEC §4/§0.10 — the hub reconcile: verify + archive raw
  // student submissions (decoupled from grading, so no competing score). 503 until
  // migration 0028 runs. Teacher grades reach the ledger via /admin/restore.
  mountSubmissions(app, { db });

  // Per-IP throttle for the un-authed self-signup claim. Generous on purpose: a
  // whole class shares one school NAT, so a low cap would block real students.
  // Tunable via env for tests / future tightening. See rate-limit.js.
  const signupClaimLimiter = createRateLimiter({
    windowMs: Number(process.env.SIGNUP_CLAIM_WINDOW_MS) || 15 * 60 * 1000,
    // 300/15min: comfortably above any single class (and multi-period same-NAT)
    // onboarding burst, while still bounding abuse. Raise via env for very large
    // same-day cohorts, or if trust-proxy resolves req.ip to a shared address.
    max:      Number(process.env.SIGNUP_CLAIM_MAX) || 300
  });

  // Per-IP request cap for /roster/verify — bcrypt-DoS hardening that complements
  // the per-username lockout below. Unknown usernames 401 BEFORE bcrypt, so the
  // costly vector is a flood of KNOWN usernames (publicly listable) from one IP;
  // this bounds total verify attempts per IP per window regardless of username.
  // Default is generous (a whole class signs in from one school NAT) — tighten via
  // env if req.ip resolves per-client. Mirrors signupClaimLimiter. See rate-limit.js.
  const verifyIpLimiter = createRateLimiter({
    windowMs: Number(process.env.VERIFY_IP_WINDOW_MS) || 15 * 60 * 1000,
    max:      Number(process.env.VERIFY_IP_MAX) || 300
  });

  // Per-USERNAME failed-attempt lockout for /roster/verify. A self-signup account's
  // credential is a 4-digit PIN (10k keyspace) and usernames are publicly listable,
  // so without this a classmate's account is brute-forceable. IP throttling can't
  // help (NAT-shared + XFF-spoofable), so this is keyed on the username instead.
  const verifyThrottle = createLoginThrottle({
    windowMs:    Number(process.env.VERIFY_LOCKOUT_WINDOW_MS) || 15 * 60 * 1000,
    maxFailures: Number(process.env.VERIFY_LOCKOUT_MAX) || 10
  });

  // ── GET /health ─────────────────────────────────────────────────────────────
  // FROZEN CONTRACT 2: → 200 { ok:true, service:"roster", time:"<iso>" }
  app.get('/health', (_req, res) => {
    res.json({
      ok: true, schema, service: 'roster', time: new Date().toISOString(), receipts: getReceiptHealth(),
      // Deploy verification: Railway injects the deployed commit; null elsewhere.
      commit: process.env.RAILWAY_GIT_COMMIT_SHA || null,
      frq: {
        mode: _frqMode(),
        bundle: _frqBundle ? _frqBundle.sourceDigest : null,
        storage: _frqDb && _frqDb.health
          ? { ..._frqDb.health }
          : { degraded: true, errorCode: 'not_configured', lastDegradedAt: null },
        worker: { ..._frqWorker.counters },
      },
    });
  });

  async function resolveReceiptUsername(studentId) {
    if (!db || typeof db.findByStudentId !== 'function') return undefined;
    try {
      const { data } = await db.findByStudentId(studentId);
      return data && data.login_username ? data.login_username : undefined;
    } catch (_) {
      return undefined;
    }
  }

  // ── POST /roster/enroll (teacher-gated) ─────────────────────────────────────
  // FROZEN CONTRACT 2:
  //   Headers: x-teacher-secret required; 401 {ok:false,error:"forbidden"} if missing/wrong.
  //   Body: { realName, section, password, email? }
  //   Behavior: generate unique login_username (fruit_animal), bcryptjs.hash(password,12),
  //     insert into roster. On login_username collision (DB unique violation) regenerate up to 8×.
  //   → 200 { ok:true, studentId, username, realName, section }
  //   → 400 missing field · → 401 bad teacher secret · → 500 on failure
  app.post('/roster/enroll', async (req, res) => {
    // Teacher auth check (WI-2d: secret OR verified teacher token).
    if (!await requireTeacher(req, db)) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    const { realName, section, password, email } = req.body || {};

    if (!realName || !section || !password) {
      return res.status(400).json({ ok: false, error: 'realName, section, and password are required' });
    }

    // Hash password with bcrypt cost 12 (sole auth path — unchanged).
    let passwordHash;
    try {
      passwordHash = await bcrypt.hash(password, bcryptCost());
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to hash password' });
    }

    // TR1 additive: reversible copy for teacher login-recovery (best-effort —
    // null if ROSTER_PW_ENC_KEY is unset; enroll must still succeed).
    const passwordCipher = encryptPassword(password);

    // Retry loop: generate username, attempt insert, retry on unique collision (up to 8×)
    const MAX_ATTEMPTS = 8;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const loginUsername = generateUsername(attempt);

      const { data, error } = await db.insertRoster({
        realName,
        section,
        loginUsername,
        passwordHash,
        email,
        passwordCipher
      });

      if (!error) {
        return res.json({
          ok: true,
          studentId: data.student_id,
          username: data.login_username,
          realName: data.real_name,
          section: data.section
        });
      }

      // DB unique violation on login_username → retry with a new name
      const isUniqueViolation =
        error.code === '23505' ||
        (error.message && error.message.includes('duplicate key'));

      if (!isUniqueViolation) {
        console.error('Enroll DB error:', error);
        return res.status(500).json({ ok: false, error: 'Database error during enrollment' });
      }

      // Otherwise loop and try again with a new username
    }

    return res.status(500).json({ ok: false, error: 'Could not generate a unique username after maximum retries' });
  });

  // ── POST /roster/verify ──────────────────────────────────────────────────────
  // FROZEN CONTRACT 2:
  //   Body: { username, password }
  //   Behavior: look up by login_username (case-insensitive), bcryptjs.compare.
  //     On success mint a session token (D-C).
  //   → 200 { ok:true, studentId, token, realName, section }
  //   → 401 { ok:false, error:"Invalid username or password" } (same for unknown user AND bad password)
  //   → 400 missing field
  app.post('/roster/verify', async (req, res) => {
    // Per-IP DoS hardening (see verifyIpLimiter above). Runs before any DB lookup
    // or bcrypt.compare. Generic 429 so it doesn't reveal which IPs are throttled.
    if (!verifyIpLimiter(req.ip || 'unknown')) {
      return res.status(429).json({ ok: false, error: 'Too many sign-in attempts — please wait a few minutes and try again.' });
    }

    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'username and password are required' });
    }

    const INVALID_MSG = 'Invalid username or password';
    const throttleKey = String(username).toLowerCase();

    // Brute-force lockout: after too many failures on this username, refuse for the
    // window (turns a 10k-PIN brute force into maxFailures/window). Generic 429 so
    // it doesn't reveal whether the username exists.
    if (verifyThrottle.isLocked(throttleKey)) {
      return res.status(429).json({ ok: false, error: 'Too many sign-in attempts — please wait a few minutes and try again.' });
    }

    const { data, error } = await db.findByUsername(username);

    // Unknown user — same generic message (no user enumeration). Do NOT count this
    // as a lockout failure: there is no account to protect, and counting attacker-
    // supplied non-existent usernames would let a flood inflate the throttle Map.
    if (error || !data) {
      return res.status(401).json({ ok: false, error: INVALID_MSG });
    }

    if (data.status === 'archived') {
      return res.status(403).json({ ok: false, error: 'account archived — ask your teacher' });
    }

    // Bcrypt compare — never plaintext
    const passwordMatch = await bcrypt.compare(password, data.password_hash);
    if (!passwordMatch) {
      verifyThrottle.fail(throttleKey);
      return res.status(401).json({ ok: false, error: INVALID_MSG });
    }

    // Correct credential — clear the failure counter for this username.
    verifyThrottle.succeed(throttleKey);

    let token;
    try {
      token = signToken(data.student_id);
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to issue token' });
    }

    // WI-2b: look up role defensively -- degrades to 'student' on any error.
    // Sign-in never depends on this; a failure here must not break sign-in.
    let role = 'student';
    try {
      role = await db.getRoleByStudentId(data.student_id);
    } catch (_) {
      role = 'student';
    }

    // r3 U1: look up sprite hue defensively -- degrades to null on any error.
    // getSpriteHueByStudentId never throws; the try/catch is an extra belt-and-suspenders guard.
    let spriteHue = null;
    try {
      spriteHue = await db.getSpriteHueByStudentId(data.student_id);
    } catch (_) {
      spriteHue = null;
    }

    return res.json({
      ok: true,
      studentId: data.student_id,
      token,
      realName: data.real_name,
      section: data.section,
      mustChangePassword: !!data.must_change_password,
      role,
      spriteHue
    });
  });

  // ── POST /roster/resolve (Phase-1 helper, contract fixed now) ────────────────
  // FROZEN CONTRACT 2:
  //   Body: { token }
  //   → 200 { ok:true, studentId } if signature valid and not expired
  //   → 401 otherwise
  app.post('/roster/resolve', (req, res) => {
    const { token } = req.body || {};

    if (!token) {
      return res.status(401).json({ ok: false, error: 'Token required' });
    }

    const studentId = verifyToken(token);
    if (!studentId) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    }

    return res.json({ ok: true, studentId });
  });

  // ── POST /roster/change-password (TR1 — token-gated) ─────────────────────────
  // Body: { token, newPassword }. Student changes their own password.
  //   → 401 {ok:false,error:"invalid token"} (missing/invalid/expired token)
  //   → 400 {ok:false,error:"newPassword must be at least 6 characters"}
  //   → 500 {ok:false,error:"Database error"}
  //   → 200 {ok:true}  (re-hashes, re-encrypts, clears must_change_password)
  app.post('/roster/change-password', async (req, res) => {
    const { token, newPassword } = req.body || {};

    if (!token) {
      return res.status(401).json({ ok: false, error: 'invalid token' });
    }

    const studentId = verifyToken(token);
    if (!studentId) {
      return res.status(401).json({ ok: false, error: 'invalid token' });
    }

    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ ok: false, error: 'newPassword must be at least 6 characters' });
    }

    let passwordHash;
    try {
      passwordHash = await bcrypt.hash(String(newPassword), bcryptCost());
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to hash password' });
    }

    const passwordCipher = encryptPassword(String(newPassword));

    const { error } = await db.updatePassword({ studentId, passwordHash, passwordCipher });

    if (error) {
      console.error('change-password DB error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    return res.json({ ok: true });
  });

  // ── GET /roster/open-sections (public — student self-signup) ─────────────────
  // Returns the value:label section list students may self-enroll into.
  //   value = gradebook section written to roster.section
  //   label = what the student SEES (the real period is never revealed; e.g. value
  //           "PeriodX" shows as "Period X")
  // Configured via env OPEN_SIGNUP_SECTIONS; defaults to one hidden period.
  //   → 200 { ok:true, sections:[{ value, label }] }
  app.get('/roster/open-sections', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=120');
    return res.json({ ok: true, sections: getOpenSections() });
  });

  // ── POST /roster/claim (public, rate-limited — student self-signup) ──────────
  //   Body: { realName, section, username, pin }
  //   Behavior:
  //     - section MUST be in the open-sections allowlist (the server NEVER trusts
  //       the client's section — that would let anyone write any bucket).
  //     - username charset ^[a-z0-9_]{3,40}$, lowercased — the student picked it
  //       via client-side re-roll; the claim is the authoritative availability check.
  //     - pin exactly 4 digits; hashed with bcrypt cost 12 (a PIN is just a
  //       4-digit password — it flows through /roster/verify unchanged).
  //     - reversible password_cipher stored so the teacher can recover a forgotten
  //       PIN via /roster/list. must_change_password=false (the student set it).
  //   First-come-first-serve: the DB UNIQUE on login_username arbitrates. A taken
  //   username returns 409 {error:'username-taken'} so the client re-rolls.
  //   → 200 { ok, studentId, username, token, realName, section, role, spriteHue, mustChangePassword }
  //         (mirrors /roster/verify so the client persists the session and signs in)
  //   → 400 bad field · 403 section not open · 409 username taken · 429 rate-limited · 500 failure
  app.post('/roster/claim', async (req, res) => {
    // TEMP go-live diagnostic — REMOVE after the req.ip check (CONTINUATION_PROMPT #1).
    // Verify req.ip is the real per-client address on Railway (not a shared proxy hop).
    // Hit this from a phone on cellular vs. school Wi-Fi and compare the two log lines.
    console.log('[GOLIVE] claim req.ip=', req.ip, 'xff=', req.headers['x-forwarded-for']);
    if (!signupClaimLimiter(req.ip || 'unknown')) {
      return res.status(429).json({ ok: false, error: 'Too many sign-up attempts — please wait a few minutes and try again.' });
    }

    const body = req.body || {};

    // realName — strip control chars + angle brackets (defense-in-depth), trim, 1..80.
    const realName = String(body.realName || '').replace(/[^\p{L}\p{M} .'\-]/gu, '').trim();
    if (!realName || realName.length > 80) {
      return res.status(400).json({ ok: false, error: 'Please enter your real name.' });
    }

    // section — authoritative allowlist gate.
    const section = String(body.section || '').trim();
    if (!isOpenSection(section)) {
      return res.status(403).json({ ok: false, error: 'That class is not open for signup.' });
    }

    // username — the re-rolled candidate.
    const username = String(body.username || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,40}$/.test(username)) {
      return res.status(400).json({ ok: false, error: 'Please pick a username (tap Re-roll).' });
    }

    // pin — exactly 4 digits.
    const pin = String(body.pin || '');
    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ ok: false, error: 'Your PIN must be exactly 4 digits.' });
    }

    // Optional teacher elevation. A self-signup account becomes role='teacher' iff
    // the body carries the correct teacher key. Wrong key → reject (don't silently
    // downgrade to student — the colleague should fix the key and retry).
    let role = 'student';
    const teacherKey = body.teacherKey;
    if (teacherKey != null && String(teacherKey) !== '') {
      if (String(teacherKey) !== getTeacherKey()) {
        return res.status(403).json({ ok: false, error: 'invalid-teacher-key' });
      }
      role = 'teacher';
    }

    let passwordHash;
    try {
      passwordHash = await bcrypt.hash(pin, bcryptCost());
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to secure your PIN' });
    }

    // Reversible copy for teacher PIN-recovery (null if ROSTER_PW_ENC_KEY unset).
    const passwordCipher = encryptPassword(pin);

    const { data, error } = await db.insertRoster({
      realName,
      section,
      loginUsername: username,
      passwordHash,
      passwordCipher,
      mustChangePassword: false,
      role
    });

    if (error) {
      const isUniqueViolation =
        error.code === '23505' ||
        (error.message && error.message.includes('duplicate key'));
      if (isUniqueViolation) {
        // First-come-first-serve: someone claimed this name first. Re-roll, re-claim.
        return res.status(409).json({ ok: false, error: 'username-taken' });
      }
      console.error('Claim DB error:', error);
      return res.status(500).json({ ok: false, error: 'Database error during signup' });
    }

    let token;
    try {
      token = signToken(data.student_id);
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to issue token' });
    }

    return res.json({
      ok: true,
      studentId: data.student_id,
      username: data.login_username,
      token,
      realName: data.real_name,
      section: data.section,
      role,
      spriteHue: null,
      mustChangePassword: false
    });
  });

  // ── GET /roster/list (TR1 — teacher-gated) ───────────────────────────────────
  // Header: x-teacher-secret == process.env.ROSTER_TEACHER_SECRET; 401 otherwise.
  // Query: ?section= (optional filter).
  //   → 200 { ok:true, students:[{ realName, username, section, status,
  //           currentPassword, mustChangePassword, createdAt }] }
  // currentPassword is the decrypted current password (teacher login-recovery),
  // or null when the cipher is absent / undecryptable / ROSTER_PW_ENC_KEY unset.
  app.get('/roster/list', async (req, res) => {
    // Teacher auth check (WI-2d: secret OR verified teacher token).
    if (!await requireTeacher(req, db)) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    const section = req.query.section || null;

    const { data, error } = await db.listRoster(section, { includeArchived: true });

    if (error) {
      console.error('roster list DB error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    const students = (data || []).map(row => ({
      studentId:          row.student_id,
      realName:           row.real_name,
      username:           row.login_username,
      section:            row.section,
      status:             row.status || 'active',
      currentPassword:    decryptPassword(row.password_cipher),
      mustChangePassword: !!row.must_change_password,
      createdAt:          row.created_at
    }));

    return res.json({ ok: true, students });
  });

  // ── PATCH /roster/:studentId (Thread 3 — teacher-gated roster edit) ──────────
  // Body: { realName?, section? }. At least one field required; each present
  // field must be a non-empty string after trim.
  //   → 200 { ok:true, student:{ studentId, realName, section, username } }
  //   → 400 { ok:false, error } missing/blank field(s)
  //   → 401               auth failure
  //   → 404 { ok:false, error } no roster row with that student_id
  //   → 500 { ok:false, error } unexpected DB error
  // Writes ONLY real_name, section, updated_at. Never touches login_username,
  // password_hash, password_cipher, must_change_password, role, status, email,
  // or created_at.
  app.patch('/roster/:studentId', async (req, res) => {
    if (!await requireTeacher(req, db)) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    const studentId = req.params.studentId;
    const { realName, section } = req.body || {};

    // At least one editable field must be present.
    const hasRealName = realName !== undefined;
    const hasSection  = section  !== undefined;

    if (!hasRealName && !hasSection) {
      return res.status(400).json({ ok: false, error: 'At least one of realName or section is required' });
    }

    // Each present field must be a non-empty STRING after trim. A non-string
    // (object / boolean / number) is rejected with 400 -- never coerced -- so
    // a payload like { realName: {} } cannot persist "[object Object]".
    if (hasRealName && (typeof realName !== 'string' || !realName.trim())) {
      return res.status(400).json({ ok: false, error: 'realName must be a non-empty string' });
    }
    if (hasSection && (typeof section !== 'string' || !section.trim())) {
      return res.status(400).json({ ok: false, error: 'section must be a non-empty string' });
    }

    const updates = {};
    if (hasRealName) updates.realName = realName.trim();
    if (hasSection)  updates.section  = section.trim();

    const { data, error } = await db.updateStudent({ studentId, ...updates });

    if (error) {
      console.error('PATCH /roster/:studentId DB error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    if (!data) {
      return res.status(404).json({ ok: false, error: 'Student not found' });
    }

    return res.json({
      ok: true,
      student: {
        studentId: data.student_id,
        realName:  data.real_name,
        section:   data.section,
        username:  data.login_username
      }
    });
  });

  function setRosterStatusRoute(status) {
    return async (req, res) => {
      if (!await requireTeacher(req, db)) {
        return res.status(401).json({ ok: false, error: 'forbidden' });
      }

      const studentId = req.params.studentId;
      if (!studentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) {
        return res.status(400).json({ ok: false, error: 'Invalid studentId' });
      }

      const { data, error } = await db.setRosterStatus(studentId, status);
      if (error) {
        console.error(`POST /roster/:studentId/${status === 'archived' ? 'archive' : 'unarchive'} DB error:`, error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }

      if (!data) {
        return res.status(404).json({ ok: false, error: 'Student not found' });
      }

      return res.json({ ok: true, studentId: data.student_id, status: data.status });
    };
  }

  app.post('/roster/:studentId/archive', setRosterStatusRoute('archived'));
  app.post('/roster/:studentId/unarchive', setRosterStatusRoute('active'));

  // ── DELETE /roster/:studentId (teacher-gated — remove a student account) ─────
  // Auth: teacher (simple key / legacy secret / verified teacher token).
  // DESTRUCTIVE: the roster FKs are ON DELETE CASCADE, so this removes the login
  // AND the student's item_ledger (work/grades), remediation, and aliases. The
  // teacher console confirms before calling this.
  //   → 200 { ok:true, studentId }
  //   → 400 missing id · 401 auth · 404 not found · 500 DB error
  app.delete('/roster/:studentId', async (req, res) => {
    if (!await requireTeacher(req, db)) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    const studentId = req.params.studentId;
    // student_id is a uuid column; reject a malformed id with 400 up front so a
    // garbage path doesn't surface as a 22P02 "DB error" 500.
    if (!studentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) {
      return res.status(400).json({ ok: false, error: 'Invalid studentId' });
    }

    const { data, error } = await db.deleteRoster(studentId);

    if (error) {
      console.error('DELETE /roster/:studentId DB error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    if (!data) {
      return res.status(404).json({ ok: false, error: 'Student not found' });
    }

    // Also purge this student's curriculum_render peer answers. They live in the cr
    // `answers` table (same Supabase instance) keyed by login_username — NOT FK'd to
    // the roster, so the ON DELETE CASCADE above doesn't reach them, and a deleted
    // student's answers would otherwise keep showing to peers. Best-effort: the
    // roster row is already gone, so a cleanup hiccup must not turn this into a 500.
    if (data.login_username && typeof db.deletePeerAnswers === 'function') {
      try {
        const cr = await db.deletePeerAnswers(data.login_username);
        if (cr && cr.error) console.error('cr peer-answers cleanup failed for', data.login_username, cr.error);
      } catch (e) {
        console.error('cr peer-answers cleanup threw for', data.login_username, e);
      }
    }

    return res.json({ ok: true, studentId: data.student_id });
  });

  // ── GET /roster/:studentId/sprite-hue (cross-device read -- student-own-token) ─
  // Reads a student's current avatar hue from the roster DB so a signed-in
  // surface can reconcile its cached session WITHOUT a re-sign-in (a hue picked
  // on another device, or changed on the Desk, propagates on the next load).
  // Auth mirrors the PATCH below: Bearer token (or ?token=), and the token's
  // studentId MUST equal the :studentId path param.
  //   Responses:
  //     200 { ok:true, spriteHue: integer 0-359 | null }
  //     401 missing / invalid token
  //     403 { ok:false, error:'cross-student' } token studentId != path id
  // getSpriteHueByStudentId degrades to null pre-migration / on any DB error,
  // so this read never 500s on a missing column -- it returns spriteHue:null.
  app.get('/roster/:studentId/sprite-hue', async (req, res) => {
    const { studentId } = req.params;

    let token = null;
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
      token = authHeader.replace(/^Bearer\s+/i, '').trim() || null;
    }
    if (!token && typeof req.query.token === 'string' && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    const tokenSid = verifyToken(token);
    if (!tokenSid) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    if (tokenSid !== studentId) {
      return res.status(403).json({ ok: false, error: 'cross-student' });
    }

    let spriteHue = null;
    try {
      spriteHue = await db.getSpriteHueByStudentId(studentId);
    } catch (_) {
      spriteHue = null;
    }

    return res.json({ ok: true, spriteHue });
  });

  // ── PATCH /roster/:studentId/sprite-hue (r3 U1 -- student-own-token auth) ────
  // Persists a student's chosen avatar hue to the roster DB.
  //   Auth: Bearer token (or ?token=) verified by verifyToken. The token's
  //         studentId MUST equal the :studentId path param -- same pattern as
  //         GET /ledger/student/:studentId. Cross-student attempts get 403.
  //   Body: { spriteHue: integer 0-359 | null }
  //   Responses:
  //     200 { ok:true, spriteHue }
  //     400 spriteHue not (integer 0-359 or null)
  //     401 missing / invalid token
  //     403 { ok:false, error:'cross-student' } token studentId != path id
  //     503 { ok:false, error:'sprite_hue not provisioned' } pre-migration
  app.patch('/roster/:studentId/sprite-hue', async (req, res) => {
    const { studentId } = req.params;

    // ── Auth resolution (mirrors GET /ledger/student/:studentId) ────────────
    // Extract token from Authorization: Bearer <t> OR ?token=<t>.
    let token = null;
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
      token = authHeader.replace(/^Bearer\s+/i, '').trim() || null;
    }
    if (!token && typeof req.query.token === 'string' && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    const tokenSid = verifyToken(token);
    if (!tokenSid) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    if (tokenSid !== studentId) {
      return res.status(403).json({ ok: false, error: 'cross-student' });
    }

    // ── Body validation ──────────────────────────────────────────────────────
    // The contract body is { spriteHue: integer 0-359 | null }. The spriteHue
    // key MUST be present -- a missing field is a 400, never a silent
    // hue-clearing write (Codex r3 review, MAJOR).
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!Object.prototype.hasOwnProperty.call(body, 'spriteHue')) {
      return res.status(400).json({ ok: false, error: 'spriteHue is required (integer 0-359 or null)' });
    }
    const spriteHue = body.spriteHue;

    // spriteHue must be exactly null or an integer in [0, 359].
    if (spriteHue !== null) {
      const isValidInt = Number.isInteger(spriteHue) && spriteHue >= 0 && spriteHue <= 359;
      if (!isValidInt) {
        return res.status(400).json({ ok: false, error: 'spriteHue must be an integer 0-359 or null' });
      }
    }

    // ── Write ────────────────────────────────────────────────────────────────
    // Only the specific "sprite_hue column does not exist yet" (pre-migration)
    // condition maps to 503. Every other error or throw is a real 500 -- a
    // constraint violation or a generic DB failure must not be mislabelled
    // "not provisioned" (Codex r3 review, MINOR).
    function isSpriteHueColumnMissing(e) {
      if (!e) return false;
      const code = String(e.code || '');
      const msg  = String(e.message || '').toLowerCase();
      if (code === '42703') return true;   // undefined_column
      return msg.includes('sprite_hue') && msg.includes('does not exist');
    }

    let data, error;
    try {
      ({ data, error } = await db.updateSpriteHue({ studentId, spriteHue }));
    } catch (err) {
      if (isSpriteHueColumnMissing(err)) {
        return res.status(503).json({ ok: false, error: 'sprite_hue not provisioned' });
      }
      console.error('PATCH /roster/:studentId/sprite-hue threw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    if (error) {
      if (isSpriteHueColumnMissing(error)) {
        return res.status(503).json({ ok: false, error: 'sprite_hue not provisioned' });
      }
      console.error('PATCH /roster/:studentId/sprite-hue DB error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    return res.json({ ok: true, spriteHue: data ? data.sprite_hue : spriteHue });
  });

  // -- PATCH /roster/:studentId/schoology-uid (grade-pipeline P4b -- teacher) ---
  // Backfills the roster -> Schoology user-id bridge so the grade-sync producer
  // (tools/build_schoology_fixture.py) can key the fixture by Schoology uid
  // directly. ADDITIVE: the frozen PATCH /roster/:studentId (realName/section)
  // is untouched; population goes through this dedicated sub-route.
  //   Auth: requireTeacher (x-teacher-secret OR a verified teacher token).
  //   Body: { schoologyUid: string | null }. The key MUST be present (a missing
  //         key is 400, never a silent clear -- same rule as sprite-hue). A
  //         number coerces to its string form (Schoology uids are numeric
  //         strings). A non-empty trimmed string is stored trimmed. null clears.
  //   Responses:
  //     200 { ok:true, schoologyUid }
  //     400 schoologyUid missing / bad type / empty-or-whitespace string
  //     401 { ok:false, error:'forbidden' } not a teacher
  //     404 { ok:false, error:'Student not found' } no row matched
  //     503 { ok:false, error:'schoology_uid not provisioned' } pre-migration
  //     500 { ok:false, error:'Database error' } any other DB failure
  app.patch('/roster/:studentId/schoology-uid', async (req, res) => {
    if (!await requireTeacher(req, db)) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    const { studentId } = req.params;

    // ── Body validation ──────────────────────────────────────────────────────
    // The schoologyUid key MUST be present -- a missing field is a 400, never a
    // silent clearing write (mirrors sprite-hue's required-key rule).
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!Object.prototype.hasOwnProperty.call(body, 'schoologyUid')) {
      return res.status(400).json({ ok: false, error: 'schoologyUid is required (string or null)' });
    }
    const raw = body.schoologyUid;

    // Normalize to the value we store: null clears; a number coerces to its
    // string form; a non-empty trimmed string is stored trimmed. Anything else
    // (object / boolean / empty-or-whitespace string) is a 400.
    let schoologyUid;
    if (raw === null) {
      schoologyUid = null;
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      schoologyUid = String(raw);
    } else if (typeof raw === 'string' && raw.trim()) {
      schoologyUid = raw.trim();
    } else {
      return res.status(400).json({ ok: false, error: 'schoologyUid must be a non-empty string, a number, or null' });
    }

    // ── Write ────────────────────────────────────────────────────────────────
    // Only the specific "schoology_uid column does not exist yet" (pre-migration)
    // condition maps to 503. Every other error or throw is a real 500 -- a
    // constraint violation (e.g. duplicate uid) or a generic DB failure must not
    // be mislabelled "not provisioned" (mirrors isSpriteHueColumnMissing).
    function isSchoologyUidColumnMissing(e) {
      if (!e) return false;
      const code = String(e.code || '');
      const msg  = String(e.message || '').toLowerCase();
      if (code === '42703') return true;   // undefined_column
      return msg.includes('schoology_uid') && (msg.includes('does not exist') || msg.includes('column'));
    }

    let data, error;
    try {
      ({ data, error } = await db.updateSchoologyUid({ studentId, schoologyUid }));
    } catch (err) {
      if (isSchoologyUidColumnMissing(err)) {
        return res.status(503).json({ ok: false, error: 'schoology_uid not provisioned' });
      }
      console.error('PATCH /roster/:studentId/schoology-uid threw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    if (error) {
      if (isSchoologyUidColumnMissing(error)) {
        return res.status(503).json({ ok: false, error: 'schoology_uid not provisioned' });
      }
      console.error('PATCH /roster/:studentId/schoology-uid DB error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    if (data === null) {
      return res.status(404).json({ ok: false, error: 'Student not found' });
    }

    return res.json({ ok: true, schoologyUid: data.schoology_uid });
  });

  // ── GET /roster/section/:section — PUBLIC student picker (2026-05-20) ────────
  // Returns { username, realName, section } for one period. NO password
  // info, NO email. Powers the Desk's sign-in dropdown so students who
  // remember their real name (but not their generated username) can
  // find themselves. Privacy posture: usernames + real names are not
  // secret — students see their classmates in the classroom. No
  // password hashes or recoverable ciphers are exposed.
  app.get('/roster/section/:section', async (req, res) => {
    const section = req.params.section;
    if (!section || typeof section !== 'string') {
      return res.status(400).json({ ok: false, error: 'section parameter required' });
    }
    const { data, error } = await db.listRoster(section);
    if (error) {
      console.error('roster public section DB error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const students = (data || []).map(row => ({
      username: row.login_username,
      realName: row.real_name,
      section:  row.section,
      role:     row.role || 'student',   // lets the gift picker drop the teacher account
    }));
    // Archive/unarchive must take effect on the next picker load. A public cache
    // could otherwise keep an archived student visible for its full TTL.
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, section, students });
  });

  // ── Ledger routes (Sprint 1 additive) ────────────────────────────────────────
  // Mounts POST /ledger/record and GET /ledger/student/:studentId.
  // ledgerDb must be passed in (tests inject a fake; production passes createLiveLedgerDb()).
  if (ledgerDb) {
    mountA2(app, { db, ledgerDb, config: gradeConfig,
      schedule: ledgerDb.a2Store ? _sched : null, store: ledgerDb.a2Store });
    mountLedger(app, {
      config: gradeConfig, lessonSchedule: _sched, eventSchedule: _events,
      db: ledgerDb,
      verifyToken,
      resolveUsername: resolveReceiptUsername,
      worksheetKey,
      rosterDb: db,
      frqDb: _frqDb,
      frqBundle: _frqBundle,
      frqMode: _frqMode,
    });
    // OFFLINE_MODE_SPEC §4.D — teacher-gated batch import of offline-captured work.
    mountLedgerImport(app, { db, ledgerDb, resolveUsername: resolveReceiptUsername });
    // GRADE_LEDGER_DURABILITY_SPEC — teacher-gated read-only snapshot of the whole
    // signed ledger + per-student chain heads + a signed epoch anchor. The off-Supabase
    // git mirror pulls this so grades survive a Supabase loss.
    mountAdminSnapshot(app, { db, ledgerDb });
    // GRADE_LEDGER_DURABILITY_SPEC — faithful disaster recovery: replays issuer-signed
    // rows byte-for-byte (score AS-IS, tier from the signed payload, original recorded_at
    // + receipt). Only writes what the issuer already signed, so no 0..1 clamp needed.
    mountAdminRestore(app, { db, ledgerDb });
  }

  // ── Do Now routes (Sprint DN1 additive) ──────────────────────────────────────
  // Mounts GET /donow.
  // ledgerDb and loadManifest must be passed in.
  // Tests inject fakes; production uses live ledger + file-based manifest loader.
  if (ledgerDb && loadManifest) {
    mountDonow(app, { verifyToken, ledgerDb, loadManifest });
  }

  // ── Rollup route (Phase 2b additive) ─────────────────────────────────────────
  // Mounts GET /rollup (cr-quiz feeder per-unit correctness rollup).
  // ledgerDb + loadAnswerKey injected; tests pass fakes.
  if (ledgerDb && loadAnswerKey) {
    mountRollup(app, { verifyToken, ledgerDb, loadAnswerKey: _gradingLoadAnswerKey });
  }

  // ── Grade route (Phase 3+6 additive) ─────────────────────────────────────────
  // Mounts GET /grade (cumulative + capped-booster grade of record).
  // Read-only; reuses the Phase-2 cr-quiz aggregation. Same injection as rollup.
  // Phase 6: lessonSchedule is passed in for date-driven lesson-weighted quarter
  // grade. If null/missing, /grade degrades gracefully to the old unit-mean logic.
  if (ledgerDb && loadAnswerKey) {
    // Atomic _gradeCtx / gradeConfig / _blooketBundle resolved once at createApp top.
    mountGrade(app, {
      verifyToken, ledgerDb, loadAnswerKey: _gradingLoadAnswerKey, lessonSchedule: _sched, eventSchedule: _events, db,
      config: gradeConfig, worksheetBlankCounts: worksheetBlankCounts || null,
      ..._blooketBundle,
    });
    mountOfflineInputs(app, {
      verifyToken, ledgerDb, loadAnswerKey: _gradingLoadAnswerKey, lessonSchedule: _sched, eventSchedule: _events, db,
      config: gradeConfig, worksheetBlankCounts: worksheetBlankCounts || null,
      ..._blooketBundle,
    });
    // OFFLINE_GRADING_MESH Phase 3b — TEACHER-gated full (unredacted) key so the
    // teacher device auto-grades gossiped submissions offline (§7.1). Students never
    // hit this — they get the REDACTED key from /grade/offline-inputs.
    mountAnswerKey(app, {
      db, worksheetKey, loadAnswerKey, lessonSchedule: _sched, eventSchedule: _events, config: gradeConfig,
      worksheetBlankCounts: worksheetBlankCounts || null, ..._blooketBundle,
    });
    mountTranscript(app, {
      verifyToken, ledgerDb, loadAnswerKey: _gradingLoadAnswerKey, lessonSchedule: _sched, eventSchedule: _events, db,
      config: gradeConfig, worksheetBlankCounts: worksheetBlankCounts || null,
      ..._blooketBundle,
    });
    mountCommits(app, { verifyToken, ledgerDb, db });
  }

  // ── Mastery route (Phase 3 additive — decoupled diagnostic) ──────────────────
  // Mounts GET /mastery (BKT over skill-map tags; weak-skill flag at θ).
  // Needs the bundled skill-map loader + the AS-IS bkt engine; tests inject fakes.
  if (ledgerDb && loadAnswerKey && loadSkillMap && bkt) {
    mountMastery(app, {
      verifyToken, ledgerDb, loadAnswerKey: _gradingLoadAnswerKey, loadSkillMap, bkt,
    });
  }

  // ── Class routes (Phase 4a additive — teacher-gated class aggregation) ──────
  // Mounts GET /class/grades (always, when grade deps present) and
  // GET /class/mastery (only when diagnostic deps present too — same guard as
  // /mastery). Auth = x-teacher-secret (mirrors /roster/list); reuses pure
  // computeGrade / computeMastery so the math has a single source.
  if (db && ledgerDb && loadAnswerKey) {
    mountClass(app, {
      db, ledgerDb, loadAnswerKey: _gradingLoadAnswerKey, loadSkillMap, bkt,
      lessonSchedule: _sched, eventSchedule: _events, config: gradeConfig,
      worksheetBlankCounts: worksheetBlankCounts || null,
      verifyToken, resolveUsername: resolveReceiptUsername,
      ..._blooketBundle,
    });
  }

  if (loadAnswerKey) {
    mountTeacherStudent(app, {
      db, ledgerDb, loadAnswerKey: _gradingLoadAnswerKey, loadSkillMap, bkt,
      lessonSchedule: _sched, eventSchedule: _events,
      config: gradeConfig,
      worksheetBlankCounts: worksheetBlankCounts || null,
      loadManifest: loadManifest || null,
      ..._blooketBundle,
    });
  }

  // ── Remediation routes (Phase 4b additive — write loop + retake gate) ──────
  // Needs remediationDb (data-access wrapper for the new remediation_assignment
  // table). Until migrations/0004 is run on Supabase, the DB returns 42P01 and
  // routes respond 503 "remediation table not yet provisioned" — service stays
  // up. propose-from-mastery additionally needs the mastery dep set; that
  // single route guard lives inside mountRemediation. See GRADEBOOK_PHASE4B_BUILD.md.
  if (remediationDb && db) {
    mountRemediation(app, {
      verifyToken,
      remediationDb,
      db,
      ledgerDb,
      loadAnswerKey: _gradingLoadAnswerKey,
      loadSkillMap,
      bkt,
    });
  }

  // ── Nudge routes (Phase 3 of TEACHER_STUDENT_CONSOLE_SPEC.md) ─────────────
  // Needs nudgesDb (data-access wrapper for the new nudges_log table).
  // Until migrations/0008 is run on Supabase, the DB returns 42P01 and
  // routes respond 503 "nudges_log not provisioned -- run migration 0008" --
  // service stays up.
  const nudgesDb = (typeof nudgesDbOverride !== 'undefined') ? nudgesDbOverride : createLiveNudgesDb();
  if (nudgesDb && db) {
    mountNudge(app, { db, nudgesDb });
  }

  if (db && ledgerDb) {
    mountReview(app, {
      db, ledgerDb, nudgesDb,
      loadAnswerKey: _gradingLoadAnswerKey || null,
      lessonSchedule: _sched, eventSchedule: _events,
      config: gradeConfig,
      worksheetBlankCounts: worksheetBlankCounts || null,
      ..._blooketBundle,
    });
  }

  // ── Lesson-unlock routes (Phase 5 of TEACHER_STUDENT_CONSOLE_SPEC.md) ─────
  // Needs lessonUnlockDb (data-access wrapper for the new lesson_unlock table).
  // Until migrations/0009 is run on Supabase, the DB returns 42P01 and
  // routes respond 503 "lesson_unlock not provisioned -- run migration 0009" --
  // service stays up.
  const lessonUnlockDb = (typeof lessonUnlockDbOverride !== 'undefined') ? lessonUnlockDbOverride : createLiveLessonUnlockDb();
  if (lessonUnlockDb && db) {
    mountLessonUnlock(app, { db, lessonUnlockDb });
  }

  // The production entrypoint owns timer lifecycle; tests can inspect/inject
  // this dormant worker without createApp ever scheduling background work.
  app.locals.frqWorker = _frqWorker;

  return app;
}

// ── Entrypoint (production only) ─────────────────────────────────────────────

// ── Live manifest loader (production only) ────────────────────────────────────
// Resolves the work-manifest path in priority order, then parses it.
// Throws on a missing/unparseable file.
//
//   1. WORK_MANIFEST_PATH env — explicit override always wins.
//   2. Bundled copy inside roster-server (./data/work-manifest.json) — this is
//      the ONLY copy present in the Railway container, because Railway deploys
//      with Root Directory = roster-server, so the repo-root data/ dir is NOT
//      shipped. scripts/build-work-manifest.mjs writes this copy byte-identical.
//   3. Repo-root ../data/work-manifest.json — local dev / running from a full
//      checkout where the bundled copy was not regenerated.
function resolveManifestPath() {
  if (process.env.WORK_MANIFEST_PATH) {
    return process.env.WORK_MANIFEST_PATH;
  }

  const bundledPath = resolve(__dirname, 'data', 'work-manifest.json');
  if (existsSync(bundledPath)) {
    return bundledPath;
  }

  return resolve(__dirname, '..', 'data', 'work-manifest.json');
}

async function loadLiveManifest() {
  const raw = await readFile(resolveManifestPath(), 'utf8');
  return JSON.parse(raw);
}

// ── Live answer-key loader (production only) ──────────────────────────────────
// Same priority + bundled-copy rationale as the manifest loader.
// scripts/build-answer-key.mjs writes ./data/answer-key.json byte-identical.
function resolveAnswerKeyPath() {
  if (process.env.ANSWER_KEY_PATH) {
    return process.env.ANSWER_KEY_PATH;
  }
  const bundledPath = resolve(__dirname, 'data', 'answer-key.json');
  if (existsSync(bundledPath)) {
    return bundledPath;
  }
  return resolve(__dirname, '..', 'data', 'answer-key.json');
}

async function loadLiveAnswerKey() {
  const raw = await readFile(resolveAnswerKeyPath(), 'utf8');
  return JSON.parse(raw);
}

function resolveWorksheetKeyPath() {
  if (process.env.WORKSHEET_KEY_PATH) {
    return process.env.WORKSHEET_KEY_PATH;
  }
  const bundledPath = resolve(__dirname, 'data', 'worksheet-key.json');
  if (existsSync(bundledPath)) {
    return bundledPath;
  }
  return resolve(__dirname, '..', 'data', 'worksheet-key.json');
}

function loadLiveWorksheetKey() {
  try {
    const raw = readFileSync(resolveWorksheetKeyPath(), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[worksheet-key] unavailable; worksheet scores remain client-reported:', err.message);
    return null;
  }
}

// ── Live skill-map loader (production only) ──────────────────────────────────
// Same priority + bundled-copy rationale as the answer-key loader.
// scripts/build-skill-map.mjs writes ./data/skill-map.json byte-identical.
function resolveSkillMapPath() {
  if (process.env.SKILL_MAP_PATH) {
    return process.env.SKILL_MAP_PATH;
  }
  const bundledPath = resolve(__dirname, 'data', 'skill-map.json');
  if (existsSync(bundledPath)) {
    return bundledPath;
  }
  return resolve(__dirname, '..', 'data', 'skill-map.json');
}

async function loadLiveSkillMap() {
  const raw = await readFile(resolveSkillMapPath(), 'utf8');
  return JSON.parse(raw);
}

// ── Live BKT engine (production only) ─────────────────────────────────────────
// The study-guide engine reused AS-IS via the byte-identical bundled copy
// (roster-server/bkt.js — guarded by tests/bundle-parity.test.js). lib/bkt.js
// is a UMD module; roster-server is "type":"module" so its CommonJS branch is
// skipped — we import it for its `globalThis.BKT` side-effect exactly as the
// study guide / lib/bkt.test.js do (reuse AS-IS, NOT a fork).
async function loadLiveBkt() {
  await import('./bkt.js');
  return globalThis.BKT;
}

// ── Live lesson-schedule loader (Phase 6) ────────────────────────────────────
// Mirrors the manifest/answer-key loader pattern. Returns the .lessons map from
// lesson-schedule.json, or null on any failure (fault-tolerant degrade).
//
// Priority:
//   1. LESSON_SCHEDULE_PATH env — explicit override.
//   2. Bundled copy ./data/lesson-schedule.json (Railway container).
//   3. Repo-root ../data/lesson-schedule.json (local dev full checkout).
function resolveLessonSchedulePath() {
  if (process.env.LESSON_SCHEDULE_PATH) {
    return process.env.LESSON_SCHEDULE_PATH;
  }
  const bundledPath = resolve(__dirname, 'data', 'lesson-schedule.json');
  if (existsSync(bundledPath)) {
    return bundledPath;
  }
  return resolve(__dirname, '..', 'data', 'lesson-schedule.json');
}

function loadLiveLessonSchedule() {
  try {
    const raw = readFileSync(resolveLessonSchedulePath(), 'utf8');
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== 'object' || !doc.lessons || typeof doc.lessons !== 'object') {
      console.warn('[phase6] lesson schedule malformed — date filter disabled');
      return null;
    }
    return doc.lessons;
  } catch (err) {
    console.warn('[phase6] lesson schedule unavailable; date filter disabled:', err.message);
    return null;
  }
}

// ── Live worksheet blank-count loader (W1) ────────────────────────────────────
// Mirrors loadLiveLessonSchedule. Reads work-manifest.json synchronously at
// boot and calls buildWorksheetBlankCounts to produce the count map.
//
// A missing or malformed manifest degrades gracefully: returns null so that
// Cws is null for every lesson and W/Q renormalize. Never throws.
//
// Priority (same as resolveManifestPath above):
//   1. WORK_MANIFEST_PATH env — explicit override.
//   2. Bundled copy ./data/work-manifest.json (Railway container).
//   3. Repo-root ../data/work-manifest.json (local dev full checkout).
function loadLiveWorksheetBlankCounts() {
  try {
    const raw = readFileSync(resolveManifestPath(), 'utf8');
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.units)) {
      console.warn('[W1] work manifest malformed — worksheet blank scoring disabled');
      return null;
    }
    return buildWorksheetBlankCounts(doc);
  } catch (err) {
    console.warn('[W1] work manifest unavailable; worksheet blank scoring disabled:', err.message);
    return null;
  }
}

// Only start listening when run directly (not imported by tests)
if (process.env.NODE_ENV !== 'test') {
  (async () => {
    const schema = process.env.ROSTER_DB_SCHEMA || 'a2';
    if (schema.trim().toLowerCase() === 'public') {
      console.error('Refusing to start: ROSTER_DB_SCHEMA must isolate A2; the public schema is forbidden.');
      process.exitCode = 1;
      return;
    }
    const db = createLiveDb();
    const ledgerClient = createServiceClient();
    const ledgerDb = createLedgerDb(ledgerClient);
    ledgerDb.a2Store = createA2Store(ledgerClient);
    ledgerDb.frqDb = createFrqLedgerDb(ledgerClient);
    // Phase 3 is ADDITIVE: the diagnostic engine must never take down the
    // LIVE auth service. If bkt.js is missing/corrupt, log and continue —
    // createApp's guard then simply does not mount /mastery (everything else,
    // incl. /health /roster/* /donow /rollup /grade, stays up). (Codex BLOCKER.)
    let bkt = null;
    try {
      bkt = await loadLiveBkt();
    } catch (err) {
      console.error('roster-server: BKT engine failed to load — /mastery disabled, service continues:', err);
    }
    // Phase 4b: same fault-tolerant ethos. If remediation-db can't construct
    // (e.g. transient env issue), the remediation routes simply don't mount —
    // the rest of the service stays up. The table not being migrated yet is
    // NOT a construction failure (Supabase client is happy); table-missing
    // is signalled per-query as 42P01 → 503 by the route module.
    let remediationDb = null;
    try {
      remediationDb = createLiveRemediationDb();
    } catch (err) {
      console.error('roster-server: remediation-db failed to construct — /remediation/* disabled, service continues:', err);
    }
    // Phase 3 (TEACHER_STUDENT_CONSOLE_SPEC.md): nudge-db. createLiveNudgesDb
    // returns null when env vars are absent (no throw). The mount block in
    // createApp handles the null case -- routes simply don't mount until the
    // table is provisioned.
    // NOTE: nudgesDb is resolved inside createApp via createLiveNudgesDb() when
    // nudgesDbOverride is undefined. Passing undefined here lets the factory
    // pick it up automatically, so no explicit construction is needed in the
    // production entrypoint.
    // Resolve production grade inputs ONCE at boot; createApp threads the same
    // object to all seven mounts (no re-resolve inside).
    const _prodGrade = resolveProductionGradeInputs(ACTIVE_SCHOOL_YEAR);
    const lessonSchedule = _prodGrade.lessonSchedule || loadLiveLessonSchedule();
    // W1: worksheet blank counts — synchronous load at boot; fault-tolerant (null
    // = Cws null for all lessons, W/Q renormalize). Same pattern as lesson schedule.
    const worksheetBlankCounts = loadLiveWorksheetBlankCounts();
    const worksheetKey = loadLiveWorksheetKey();
    const app = createApp(
      db,
      ledgerDb,
      loadLiveManifest,
      loadLiveAnswerKey,
      loadLiveSkillMap,
      bkt,
      remediationDb,
      lessonSchedule,
      undefined,          // configOverrides -- not used in production
      worksheetBlankCounts,
      undefined,
      undefined,
      undefined,
      undefined,
      worksheetKey,
      _prodGrade          // atomic bundle — no second resolve inside createApp
    );
    
    if (app.locals.frqWorker) app.locals.frqWorker.start();
    const PORT = process.env.PORT || 8090;
    app.listen(PORT, () => {
      console.log(`roster-server listening on port ${PORT}`);
    });
  })();
}
