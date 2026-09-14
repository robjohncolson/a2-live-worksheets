// @ts-check
// submission-grader.js — the teacher device's grade-from-submission core for the
// offline-grading mesh (OFFLINE_GRADING_MESH_SPEC.md §3, §0.4, §0.8-0.11).
// window.SubmissionGrader. PURE logic only: it turns a verified student submission
// into the UNSIGNED fields for ReceiptSign.signLedgerReceipt. The teacher-app wiring
// (Phase 3b) verifies submissions, calls this, signs with the teacher key, and emits
// the grade onto the grades lane. Loaded as a classic <script>; inert without inputs.
//
// Two grade kinds:
//   - AUTO (worksheet / curriculum_quiz / pc): scored deterministically against the
//     REAL key. The TEACHER device assigns the attempt (= max existing grade attempt
//     + 1), never the student's forgeable submission attempt (§0.4/§0.9), and only ever
//     emits an UPGRADE (never-downgrade). So the newest emit is both the highest
//     attempt and the max score → the grade engine's latest-by-attempt supersession
//     records the max. ts/n stay deterministic-from-submission, so receipts dedup once
//     devices' grade sets converge; a student can't farm an item down or up past their
//     best answer.
//   - HUMAN (frq): the teacher judges E/P/I; the grade is not key-derived. Latest-wins
//     by attempt (the shipped online path's model).
//
// Every grade carries `sub` = the submission's receipt_id so SubmissionStore suppresses
// the graded submission (§0.7), and `kv` = the answer-key version it was scored against
// (§0.10). Anti-farming (§0.4) — the ATTEMPT is assigned by the teacher device (a pure
// function of the submission for auto; existing+1 for human), never the submission's raw
// claim used as the supersession winner; the flood cap lives on the ingest side (3b).

(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  /** @type {Record<string, 1>} */
  var AUTO_SOURCES = { worksheet: 1, curriculum_quiz: 1, pc: 1 };
  /** @type {Record<string, 1>} */
  var HUMAN_SOURCES = { frq: 1 };

  // What grading a submission needs: 'auto' (key-scored), 'human' (teacher E/P/I),
  // or 'skip' (blooket/trainer/unknown — not gradable off a raw submission here).
  /** @param {unknown} source - a row's `source` string @returns {'auto' | 'human' | 'skip'} */
  function gradeableKind(source) {
    var s = String(source || '');
    if (AUTO_SOURCES[s]) return 'auto';
    if (HUMAN_SOURCES[s]) return 'human';
    return 'skip';
  }

  // ── Worksheet scoring — BYTE-MATCHES roster-server/ledger.js (pinned by a test) ──
  // Uses the exact `String(value || '')` the server uses (not `== null`), so it agrees
  // for EVERY input type — including falsy non-strings (0/false/NaN) that can't occur
  // for a DOM-string worksheet response but must still match to satisfy §0.10.
  /** @param {unknown} value @returns {string} */
  function normalizeWorksheetAnswer(value) {
    return String(value || '').toLowerCase().trim().replace(/[^\w\s./-]/g, '');
  }
  /** @param {string} dataAnswer - pipe-separated accepted answers @param {unknown} response @returns {Pct01} 1 exact, 0.5 partial, 0 blank/wrong */
  function scoreWorksheetAnswer(dataAnswer, response) {
    var accepted = String(dataAnswer).split('|').map(normalizeWorksheetAnswer);
    var user = normalizeWorksheetAnswer(response);
    if (!user) return 0;
    if (accepted.indexOf(user) !== -1) return 1;
    for (var i = 0; i < accepted.length; i++) {
      var a = accepted[i];
      if (user.indexOf(a) !== -1 || a.indexOf(user) !== -1) return 0.5;
    }
    return 0;
  }
  /**
   * @param {Record<string, any> | null | undefined} worksheetKey - item→"a|b" map, or a {worksheetKey: map} wrapper
   * @param {string} itemId
   * @returns {string | undefined}
   */
  function findWorksheetAnswer(worksheetKey, itemId) {
    if (!worksheetKey || typeof worksheetKey !== 'object') return undefined;
    var values = (worksheetKey.worksheetKey && typeof worksheetKey.worksheetKey === 'object')
      ? worksheetKey.worksheetKey : worksheetKey;
    return values[itemId] === undefined ? undefined : String(values[itemId]);
  }

  // MC (curriculum_quiz / pc) scoring via the shared normalization (§0.10). Uses the
  // injected isCorrect (default GradeEngine.isCorrect = the bundled scoring.js) so the
  // teacher device grades exactly as the server would.
  /** @param {{isCorrect?: (response: any, answer: any) => boolean} | null | undefined} opts @returns {((response: any, answer: any) => boolean) | null} */
  function mcCorrect(opts) {
    if (opts && typeof opts.isCorrect === 'function') return opts.isCorrect;
    if (root.GradeEngine && typeof root.GradeEngine.isCorrect === 'function') return root.GradeEngine.isCorrect;
    return null;
  }

  // Auto-score a submission against the real keys. Returns a number in [0,1], or null
  // when it's not auto-gradable OR the key is missing (→ the item can't be auto-graded;
  // the caller queues it or skips it, never fabricates a score).
  //   inputs: { answerKey (MC map: item→{answerKey}), worksheetKey (item→"a|b"),
  //             isCorrect? }
  /**
   * @param {SubmissionRow | null | undefined} submission
   * @param {{answerKey?: Record<string, any>, worksheetKey?: Record<string, any>, isCorrect?: (response: any, answer: any) => boolean}} [inputs]
   * @returns {Pct01 | null}
   */
  function autoScore(submission, inputs) {
    inputs = inputs || {};
    if (!submission) return null;
    var kind = gradeableKind(submission.source);
    if (kind !== 'auto') return null;
    var item = submission.item_id;
    var response = submission.response;

    if (String(submission.source) === 'worksheet') {
      var ws = findWorksheetAnswer(inputs.worksheetKey, item);
      if (ws === undefined) return null;                 // unkeyed blank → can't auto-grade
      return scoreWorksheetAnswer(ws, response);
    }
    // curriculum_quiz / pc → MC against the answer key.
    var key = inputs.answerKey && inputs.answerKey[item];
    var answer = key && (typeof key === 'object' ? key.answerKey : key);
    if (answer === undefined || answer === null) return null;   // unkeyed / ungradable FRQ entry
    var isCorrect = mcCorrect(inputs);
    if (!isCorrect) return null;                          // no scorer available
    return isCorrect(response, answer) ? 1 : 0;
  }

  // ── Deterministic receipt fields (§0.8) ──────────────────────────────────────
  // ts + n are PURE functions of the submission, so a re-grade of the SAME submission
  // is byte-identical → dedups. ts = the submission's own recorded_at (deterministic
  // once signed, AND a real date — §0.11 lets the student clock be display-only, and a
  // grade's ts is never a supersession input). n = an FNV-1a hash of the receipt_id
  // (dependency-free, sync) — an opaque dedup token, NOT cryptographic (the receipt's
  // integrity is the Ed25519 signature over these bytes). Note: the receipt_id is
  // sha256 of the WHOLE payload (incl. `sub` = this submission's id), so two DIFFERENT
  // submissions can never collide on receipt_id even if their n tokens collide.
  /** @param {string} str @param {string} salt @returns {string} 8 hex chars (FNV-1a) */
  function hashHex(str, salt) {
    var s = String(salt || '') + '|' + String(str || '');
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }
  /** @param {SubmissionRow} submission @returns {{ts: number, n: string} | null} null when the submission has no receipt_id */
  function deterministicReceiptFields(submission) {
    var rid = submission && submission.receipt_id;
    if (!rid) return null;
    var n = hashHex(rid, 'n');
    var parsed = submission.recorded_at ? Date.parse(submission.recorded_at) : NaN;
    // Real date from the submission when present; else a stable hash-derived fallback.
    var ts = (typeof parsed === 'number' && isFinite(parsed)) ? parsed : parseInt(hashHex(rid, 'ts'), 16);
    return { ts: ts, n: n };
  }

  // ── Attempt assignment (§0.4, §0.9, §0.11) ───────────────────────────────────
  // The TEACHER device assigns the attempt = (max existing GRADE attempt for this
  // (sid,item)) + 1 — NEVER the student's self-signed submission.attempt. A student
  // forges their own submission attempt, and the grade engine's latestPerItem picks
  // the HIGHEST-attempt row — so trusting the submission attempt would let a student
  // bury a correct grade under a higher-attempt wrong one (farming DOWN). Assigning
  // existing+1 means the NEWEST emit always has the highest attempt; combined with
  // never-downgrade (planAutoGrades only emits an upgrade), the highest attempt is
  // always the max score, so the engine records the max. This trades strict §0.8
  // byte-determinism (the attempt now depends on device state) for the §0.9 guarantee
  // — dedup still holds once devices' grade sets converge (same existing → same attempt).
  //   existingAttempts = the GRADE attempts already recorded for this (sid,item).
  /** @param {SubmissionRow} submission @param {Array<number | string> | null | undefined} [existingAttempts] @returns {number} */
  function assignAttempt(submission, existingAttempts) {
    var max = 0;
    (Array.isArray(existingAttempts) ? existingAttempts : []).forEach(function (a) {
      var n = Number(a);
      if (Number.isFinite(n) && n > max) max = n;
    });
    return max + 1;
  }

  // Build the UNSIGNED fields for ReceiptSign.signLedgerReceipt from a submission + a
  // decided score. Carries `sub` (§0.7) + `kv` (§0.10); for AUTO it also pins the
  // deterministic ts/n (§0.8). The caller signs these with the teacher key.
  //   opts: { score (number|null), keyVersion?, existingAttempts?, provenance? }
  // evidenceTier is ALWAYS 'practice' — offline mesh work is self-reported and can
  // never be proctored (proctoring needs the server's x-proctor-secret), matching the
  // /ledger/import convention. Keeping it constant also keeps the auto-grade payload a
  // pure function of the submission (§0.8), independent of any caller context.
  /**
   * @param {(SubmissionRow & {sid?: string}) | null | undefined} submission - legacy feeds may carry `sid` instead of `student_id`
   * @param {{score?: number | null, keyVersion?: string | number | null, existingAttempts?: Array<number | string>, provenance?: string}} [opts]
   * @returns {LedgerGradeFields | null}
   */
  function buildGradeFields(submission, opts) {
    opts = opts || {};
    if (!submission || !submission.sid && !submission.student_id) return null;
    var sid = /** @type {string} */ (submission.student_id != null ? submission.student_id : submission.sid); // guard above ensures one id exists
    var kind = gradeableKind(submission.source);
    /** @type {LedgerGradeFields} */
    var fields = {
      sid: sid,
      src: submission.source,
      i: submission.item_id,
      a: assignAttempt(submission, opts.existingAttempts),
      e: 'practice',
      response: submission.response,
      sub: submission.receipt_id,
      g: opts.provenance || (kind === 'human' ? 'self' : 'key')
    };
    if (opts.score !== undefined && opts.score !== null) fields.sc = Number(opts.score);
    if (opts.keyVersion != null) fields.kv = String(opts.keyVersion);
    if (kind === 'auto') {
      var det = deterministicReceiptFields(submission);
      if (det) { fields.ts = det.ts; fields.n = det.n; }
    }
    return fields;
  }

  // ── Supersession (§0.9) ──────────────────────────────────────────────────────
  // Given several grade rows for the SAME (sid,item), the winner is the MAX score,
  // ties broken by the LEXICOGRAPHICALLY SMALLEST receipt_id (deterministic, and never
  // the student's attempt/ts — none of which a student can forge to win). Returns the
  // winning row (or null). The emit side uses this to decide what to record + to
  // NEVER-DOWNGRADE (only emit a grade that raises the recorded max).
  /** @param {LedgerRow[] | null | undefined} rows @returns {LedgerRow | null} */
  function supersede(rows) {
    var list = (Array.isArray(rows) ? rows : []).filter(Boolean);
    if (!list.length) return null;
    return list.reduce(function (best, r) {
      if (!best) return r;
      var bs = (best.score == null) ? -Infinity : Number(best.score);
      var rs = (r.score == null) ? -Infinity : Number(r.score);
      if (rs > bs) return r;
      if (rs < bs) return best;
      var bid = String(best.receipt_id == null ? '' : best.receipt_id);
      var rid = String(r.receipt_id == null ? '' : r.receipt_id);
      return (rid < bid) ? r : best;
    }, /** @type {LedgerRow | null} */ (null));
  }

  // ── Auto-grade emit plan (§0.9 max-score + never-downgrade) ──────────────────
  // The grade engine supersedes by ATTEMPT (latest-wins), but a student controls their
  // own submission attempt — so emitting every auto-graded submission would let a later
  // LOWER-score answer win. §0.9 says supersede AUTO items by MAX SCORE. We enforce it
  // at EMIT time: per (sid,item) grade ONLY the max-score submission (ties → min
  // receipt_id, deterministic), and only if it RAISES the currently-recorded score
  // (never-downgrade). So a student flooding wrong answers can't move their grade, and
  // a correct-then-wrong sequence keeps the correct score.
  //   submissions: verified auto-gradable submission rows
  //   inputs: { answerKey, worksheetKey, isCorrect? }
  //   recordedScoreByKey: { 'sid|item' -> current recorded score } (from the grades store)
  // Returns [{ submission, score }] — one plan per (sid,item) that should be signed+emitted.
  /** @typedef {{submission: SubmissionRow, score: Pct01}} AutoGradePlan */
  /**
   * @param {SubmissionRow[]} submissions - verified auto-gradable submission rows
   * @param {{answerKey?: Record<string, any>, worksheetKey?: Record<string, any>, isCorrect?: (response: any, answer: any) => boolean}} inputs
   * @param {Record<string, number | null>} [recordedScoreByKey] - 'sid|item' → currently-recorded score
   * @returns {AutoGradePlan[]} one plan per (sid,item) that should be signed+emitted
   */
  function planAutoGrades(submissions, inputs, recordedScoreByKey) {
    /** @type {Record<string, number | null>} */
    var recorded = recordedScoreByKey || {};
    /** @type {Record<string, AutoGradePlan[]>} */
    var groups = Object.create(null);
    (Array.isArray(submissions) ? submissions : []).forEach(/** @param {SubmissionRow & {sid?: string}} sub */ function (sub) {
      if (gradeableKind(sub && sub.source) !== 'auto') return;
      /** @type {Pct01 | null | undefined} */
      var score = autoScore(sub, inputs);
      if (score === null || score === undefined) return;   // unkeyed / not scorable → skip
      var sid = sub.student_id != null ? sub.student_id : sub.sid;
      var key = String(sid) + '|' + String(sub.item_id);
      (groups[key] = groups[key] || []).push({ submission: sub, score: Number(score) });
    });
    /** @type {AutoGradePlan[]} */
    var plans = [];
    Object.keys(groups).forEach(function (key) {
      // Max score, tie → min receipt_id (supersede semantics on the scored candidates).
      var best = groups[key].reduce(function (b, c) {
        if (!b) return c;
        if (c.score > b.score) return c;
        if (c.score < b.score) return b;
        var bid = String(b.submission.receipt_id || '');
        var cid = String(c.submission.receipt_id || '');
        return (cid < bid) ? c : b;
      }, /** @type {AutoGradePlan | null} */ (null));
      if (!best) return;
      var cur = (key in recorded && recorded[key] != null) ? Number(recorded[key]) : -Infinity;
      if (best.score > cur) plans.push(best);              // never-downgrade
    });
    return plans;
  }

  root.SubmissionGrader = {
    gradeableKind: gradeableKind,
    planAutoGrades: planAutoGrades,
    scoreWorksheetAnswer: scoreWorksheetAnswer,
    normalizeWorksheetAnswer: normalizeWorksheetAnswer,
    findWorksheetAnswer: findWorksheetAnswer,
    autoScore: autoScore,
    deterministicReceiptFields: deterministicReceiptFields,
    assignAttempt: assignAttempt,
    buildGradeFields: buildGradeFields,
    supersede: supersede
  };

})();
