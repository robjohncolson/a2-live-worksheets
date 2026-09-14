// donow.js — mounts GET /donow onto an Express app.
// Implements FROZEN CONTRACT 3 exactly (DESK_DONOW_DN1_BUILD.md).
// Call mountDonow(app, { verifyToken, ledgerDb, loadManifest }) from createApp().

// ── Helpers ───────────────────────────────────────────────────────────────────

// Extract Bearer token from Authorization header or ?token= query param.
// Returns the raw token string, or null if absent.
function extractToken(req) {
  const authHeader =
    typeof req.headers['authorization'] === 'string'
      ? req.headers['authorization']
      : '';

  if (authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken) return bearerToken;
  }

  const queryToken = req.query?.token;
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken;
  }

  return null;
}

// Build a Set of item_ids that a student has completed (row exists = done, per D3).
// "done" = a row exists in item_ledger for (student_id, item_id) — NOT score-gated.
function buildDoneSet(ledgerRows) {
  const done = new Set();
  const rows = Array.isArray(ledgerRows) ? ledgerRows : [];

  for (const row of rows) {
    if (typeof row?.item_id !== 'string' || !row.item_id) continue;
    done.add(row.item_id);
  }

  return done;
}

// Compute done/total/state for one activity (CONTRACT 3).
// done   = count of itemIds that have a row in doneSet
// total  = itemIds.length
// state  = "none" | "partial" | "done"
function activityStats(activity, doneSet) {
  const itemIds = Array.isArray(activity?.itemIds) ? activity.itemIds : [];
  const total = itemIds.length;
  const done = itemIds.filter(id => doneSet.has(id)).length;
  const state = done === 0 ? 'none' : done === total ? 'done' : 'partial';
  return { done, total, state };
}

// Roll-up lessonState across all activities in a lesson.
// "done" only if every activity is done; "none" only if every activity is none.
function rollupLessonState(activities) {
  if (activities.length === 0) return 'none';

  const allDone = activities.every(a => a.state === 'done');
  const allNone = activities.every(a => a.state === 'none');
  if (allDone) return 'done';
  if (allNone) return 'none';
  return 'partial';
}

// ── computeDonow: pure helper, no HTTP ───────────────────────────────────────
// Accepts ledgerRows (array) and manifest (object). Returns the full
// { nextTask, lessons, units, earlierGapFlag } payload verbatim.
// Exported so teacher.js can reuse it for the per-student teacher endpoint.

export function computeDonow(ledgerRows, manifest) {
  const doneSet = buildDoneSet(ledgerRows || []);

  // Which RESOURCES the student self-attested "Done" on, per topic (a DESK_DONE
  // row written by the Desk's Done button). Drives the CROSS-DEVICE calendar
  // grey-out AND the per-resource Done button: the client hydrates a local
  // '<topic>|<artifact>' mark from this, so a worksheet/quiz marked Done on ANY
  // device shows greyed + "Completed" on every device (per-identity, follows the
  // login). Artifact comes from the itemId prefix (CR- = quiz, WS- = worksheet);
  // topic from row.topic, fallback to parsing the itemId. (DESK_DONE rows live in
  // doneSet but never match a manifest activity, so they're otherwise unused.)
  const selfDoneByTopic = new Map();
  for (const row of (Array.isArray(ledgerRows) ? ledgerRows : [])) {
    if (typeof row?.item_id !== 'string' || !/-DESK_DONE$/.test(row.item_id)) continue;
    let topic = (typeof row.topic === 'string' && row.topic) ? row.topic : null;
    if (!topic) {
      const m = /^(?:WS|CR|BL)-U(\d+)-L([\d-]+)-DESK_DONE$/.exec(row.item_id);
      if (m) topic = m[1] + '.' + m[2];
    }
    if (!topic) continue;
    // CR- = quiz, BL- = blooket (flashcard pass), WS- = worksheet.
    const artifact = /^CR-/.test(row.item_id) ? 'quiz'
      : /^BL-/.test(row.item_id) ? 'blooket'
      : 'worksheet';
    if (!selfDoneByTopic.has(topic)) selfDoneByTopic.set(topic, new Set());
    selfDoneByTopic.get(topic).add(artifact);
  }

  const lessonsOut = [];
  const unitsOut   = [];
  const allActivities = [];
  const manifestUnits = Array.isArray(manifest?.units) ? manifest.units : [];

  for (const unit of manifestUnits) {
    const lessons = Array.isArray(unit?.lessons) ? unit.lessons : [];

    // Per-lesson activities
    for (const lesson of lessons) {
      const activitiesOut = [];
      const lessonActivities = Array.isArray(lesson?.activities) ? lesson.activities : [];

      for (const act of lessonActivities) {
        const itemIds = Array.isArray(act?.itemIds) ? act.itemIds : [];
        const stats = activityStats(act, doneSet);
        activitiesOut.push({
          activity: act.activity,
          source:   act.source,
          done:     stats.done,
          total:    stats.total,
          state:    stats.state
        });
        allActivities.push({
          unit:     unit.unit,
          lesson:   lesson.lesson,
          activity: act.activity,
          source:   act.source,
          itemIds,
          done:     stats.done,
          total:    stats.total,
          state:    stats.state
        });
      }

      const lessonState = rollupLessonState(activitiesOut);
      const _sdSet = selfDoneByTopic.get(lesson.lesson);
      lessonsOut.push({
        unit:         unit.unit,
        lesson:       lesson.lesson,
        activities:   activitiesOut,
        lessonState,
        // Cross-device self-attest: which resources were marked Done (any device)
        // + the lenient lesson-level flag. The client hydrates local marks from these.
        selfDone:           !!(_sdSet && _sdSet.size),
        selfDoneArtifacts:  _sdSet ? Array.from(_sdSet) : []
      });
    }

    if (unit?.pc) {
      const pcItemIds = Array.isArray(unit.pc.itemIds) ? unit.pc.itemIds : [];
      const pcStats = activityStats(unit.pc, doneSet);
      unitsOut.push({
        unit: unit.unit,
        pc: {
          done:  pcStats.done,
          total: pcStats.total,
          state: pcStats.state
        }
      });
      allActivities.push({
        unit:     unit.unit,
        lesson:   null,
        activity: unit.pc.activity,
        source:   unit.pc.source,
        itemIds:  pcItemIds,
        done:     pcStats.done,
        total:    pcStats.total,
        state:    pcStats.state
      });
    }
    
  }

  // ── nextTask: earliest incomplete activity ────────────────────────────────
  const firstIncomplete = allActivities.find(a => a.state !== 'done');
  const nextTask = firstIncomplete
    ? {
        unit:     firstIncomplete.unit,
        lesson:   firstIncomplete.lesson,
        activity: firstIncomplete.activity,
        source:   firstIncomplete.source,
        progress: { done: firstIncomplete.done, total: firstIncomplete.total },
        reason:   'earliest-incomplete'
      }
    : null;

  // ── earlierGapFlag ────────────────────────────────────────────────────────
  let earlierGapFlag = false;

  const lastTouchedIdx = (() => {
    let idx = -1;
    for (let i = 0; i < allActivities.length; i++) {
      if (allActivities[i].done > 0) idx = i;
    }
    return idx;
  })();

  if (lastTouchedIdx >= 0) {
    for (let i = 0; i < lastTouchedIdx; i++) {
      if (allActivities[i].state !== 'done') {
        earlierGapFlag = true;
        break;
      }
    }
  }

  return { nextTask, lessons: lessonsOut, units: unitsOut, earlierGapFlag };
}

// ── Route mounter ─────────────────────────────────────────────────────────────

export function mountDonow(app, { verifyToken, ledgerDb, loadManifest }) {

  // ── GET /donow ──────────────────────────────────────────────────────────────
  // FROZEN CONTRACT 3:
  //   Auth: roster session token via Authorization: Bearer <t> OR ?token=.
  //     verifyToken → studentId; 401 if absent/invalid.
  //   Reads item_ledger rows for that studentId + the work-manifest.
  //   Computes and returns the full do-now completion structure.
  //   → 200 { ok:true, nextTask, lessons, units, earlierGapFlag }
  app.get('/donow', async (req, res) => {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const rawToken = extractToken(req);
    if (!rawToken) {
      return res.status(401).json({ ok: false, error: 'Token required' });
    }

    const studentId = verifyToken(rawToken);
    if (!studentId) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    }

    // ── Load ledger rows for this student ────────────────────────────────────
    let ledgerResult;
    try {
      ledgerResult = await ledgerDb.getLedgerByStudent(studentId);
    } catch (ledgerError) {
      console.error('GET /donow ledger error:', ledgerError);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    const { data: ledgerRows, error: ledgerError } = ledgerResult || {};
    if (ledgerError) {
      console.error('GET /donow ledger error:', ledgerError);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    // ── Load work-manifest ───────────────────────────────────────────────────
    let manifest;
    try {
      manifest = await loadManifest();
    } catch (err) {
      console.error('GET /donow manifest error:', err);
      return res.status(500).json({ ok: false, error: 'Could not load work manifest' });
    }

    // ── Compute + respond ─────────────────────────────────────────────────────
    const computed = computeDonow(ledgerRows || [], manifest);

    return res.json({ ok: true, ...computed });
  });
}
