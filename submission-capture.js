// submission-capture.js — self-sign raw work into the submissions lane
// (OFFLINE_GRADING_MESH_SPEC.md §3 step 1, §0.2). window.SubmissionCapture.
//
// A student device turns a piece of RAW work into a t:'submission' record signed
// by its OWN device key, content-addressed, and stored in SubmissionStore for the
// mesh to carry to a teacher device (which grades + signs, Phase 3). This is
// ADDITIVE and does NOT replace the existing offline capture (OfflineQueue): the
// queue keeps the fast, unsigned, server-sync path; submissions are the signed,
// gossip-able copy for the fully-offline classroom.
//
// Signing is biometric-gated (SecureKeyStore), so it CANNOT run per keystroke. Work
// is captured normally, then signPendingWork() unlocks the key ONCE and signs a
// batch — the same "unlock once, sign many" pattern as teacher-app.html.
//
// A submission payload carries NO grade fields (sc/g) — verifySubmissionRow rejects
// any that do (§0.1b). The response is bound by `ah` so a peer can't swap the answer.

(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;

  function available() {
    return !!(root.StudentKey && root.StudentKey.available && root.StudentKey.available()
      && root.ReceiptSign && root.SubmissionStore);
  }

  // Build the signed submission payload for a work item. Pure aside from the
  // async answerHash. `now` is injectable for tests. No sc/g fields by design.
  function buildPayload(RS, work, now) {
    return Promise.resolve(RS.answerHash(work.response)).then(function (ah) {
      return {
        v: 1,
        t: 'submission',
        sid: work.sid,
        src: work.source,
        i: work.itemId,
        a: (work.attempt == null ? 1 : work.attempt),
        e: work.evidenceTier || 'practice',
        ah: ah,
        ts: (typeof work.ts === 'number' ? work.ts : now)
      };
    });
  }

  // Sign ONE work item with an already-unlocked device key and return the stored
  // submission row (also written to SubmissionStore). Requires: work.sid matches the
  // key's registered student (the server + verifySubmissionRow enforce this on
  // ingest; here we just build the row the signer's identity claims).
  function signOne(unlockedKey, work, opts) {
    opts = opts || {};
    var RS = opts.receiptSign || root.ReceiptSign;
    var Store = opts.store || root.SubmissionStore;
    var now = (typeof opts.now === 'number') ? opts.now : (typeof Date !== 'undefined' && Date.now ? Date.now() : 0);
    if (!RS || typeof RS.signPayload !== 'function') return Promise.reject(new Error('no signer'));
    if (!work || !work.sid || !work.source || !work.itemId) return Promise.reject(new Error('bad work'));
    return buildPayload(RS, work, now).then(function (payload) {
      return RS.signPayload(unlockedKey, payload).then(function (sig) {
        var row = {
          source: work.source,
          item_id: work.itemId,
          student_id: work.sid,
          response: work.response,
          attempt: payload.a,
          recorded_at: new Date(payload.ts).toISOString(),
          receipt_id: sig.receiptId,
          receipt_compact: sig.compact
        };
        if (Store && typeof Store.put === 'function') {
          return Promise.resolve(Store.put(row)).then(function () { return row; });
        }
        return row;
      });
    });
  }

  // Unlock the device key ONCE, then sign a batch of work items. Returns
  // { signed:[rows], failed:[{work, error}] }. A per-item failure never aborts the
  // batch. `sid` scopes the key label; every work item must be for THIS sid (a
  // student can only sign their own work — the row's student_id is forced to sid).
  function signPendingWork(sid, workItems, opts) {
    opts = opts || {};
    var SK = opts.studentKey || root.StudentKey;
    var items = (Array.isArray(workItems) ? workItems : []).filter(Boolean);
    if (!sid) return Promise.resolve({ signed: [], failed: [], reason: 'no-identity' });
    if (!items.length) return Promise.resolve({ signed: [], failed: [] });
    if (!SK || typeof SK.unlock !== 'function') return Promise.resolve({ signed: [], failed: [], reason: 'unavailable' });

    return SK.unlock(sid).then(function (key) {
      var signed = [], failed = [];
      var chain = Promise.resolve();
      items.forEach(function (w) {
        chain = chain.then(function () {
          var work = {
            sid: sid,                       // force self-attribution (§0.2)
            source: w.source, itemId: w.itemId, response: w.response,
            attempt: w.attempt, evidenceTier: w.evidenceTier, ts: w.ts
          };
          return signOne(key, work, opts).then(
            function (row) { signed.push(row); },
            function (e) { failed.push({ work: w, error: (e && e.message) || String(e) }); }
          );
        });
      });
      return chain.then(function () { return { signed: signed, failed: failed }; });
    }).catch(function (e) {
      return { signed: [], failed: [], reason: 'unlock-failed', detail: (e && e.message) || String(e) };
    });
  }

  root.SubmissionCapture = {
    available: available,
    buildPayload: buildPayload,
    signOne: signOne,
    signPendingWork: signPendingWork
  };

})();
