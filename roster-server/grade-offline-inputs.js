

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { latestPerItem, isCorrect, normalizeResponse, answerKeyMapOrNull } from './scoring.js';

// A value no real student response normalizes to → gradable (non-null) but never
// matches, so a redacted item scores "wrong" without revealing its answer.
export const REDACTION_SENTINEL = 'REDACTED';

// Blooket presence + required (M2a). Offline pack ships BOTH so the device
// engine can match the server Due denominator (core 67) while keeping
// hasBlooket on all 77. Legacy blooketLessons remains presence for compat.
const _BLOOKET_DOC = (() => {
  try {
    const p = resolve(dirname(fileURLToPath(import.meta.url)), 'data', 'blooket-lessons.json');
    return JSON.parse(readFileSync(p, 'utf8')) || {};
  } catch (_) {
    return {};
  }
})();
const BLOOKET_PRESENCE_DEFAULT = Array.isArray(_BLOOKET_DOC.topics)
  ? _BLOOKET_DOC.topics
  : Array.isArray(_BLOOKET_DOC.allTopics)
    ? _BLOOKET_DOC.allTopics
    : [];
const BLOOKET_REQUIRED_DEFAULT = Array.isArray(_BLOOKET_DOC.requiredTopics)
  ? _BLOOKET_DOC.requiredTopics
  : BLOOKET_PRESENCE_DEFAULT.slice();
const BLOOKET_BONUS_DEFAULT = Array.isArray(_BLOOKET_DOC.bonusTopics)
  ? _BLOOKET_DOC.bonusTopics
  : [];
/** @deprecated presence alias */
const BLOOKET_LESSONS = BLOOKET_PRESENCE_DEFAULT;

export function buildRedactedKey(realKey, studentRows) {
  const respByItem = new Map();
  for (const row of latestPerItem(Array.isArray(studentRows) ? studentRows : [])) {
    if (row && typeof row.item_id === 'string') respByItem.set(row.item_id, row.response);
  }

  const out = {};
  for (const itemId of Object.keys(realKey || {})) {
    const entry = realKey[itemId];
    // Preserve ungradable entries verbatim (e.g. FRQ answerKey:null) — they carry
    // no answer and the engine treats them as completion-only.
    if (!entry || entry.answerKey == null) {
      out[itemId] = { ...entry };
      continue;
    }
    let redacted = REDACTION_SENTINEL;
    const resp = respByItem.get(itemId);
    if (resp != null && isCorrect(resp, entry.answerKey)) {
      // The device only sees its own correct answer.
      redacted = normalizeResponse(resp);
    }
    out[itemId] = { ...entry, answerKey: redacted };
  }
  return out;
}

function extractToken(req) {
  const h = typeof req.headers['authorization'] === 'string' ? req.headers['authorization'] : '';
  if (h.startsWith('Bearer ')) { const t = h.slice(7).trim(); if (t) return t; }
  const q = req.query?.token;
  if (typeof q === 'string' && q.trim()) return q;
  return null;
}

export function mountOfflineInputs(app, {
  verifyToken, ledgerDb, loadAnswerKey, lessonSchedule, eventSchedule = null, db,
  config, worksheetBlankCounts = null,
  blooketLessons = null, blooketPresence = null, blooketRequired = null,
  blooketBonusTopics = null,
}) {
  const _presence = blooketPresence || blooketLessons || BLOOKET_PRESENCE_DEFAULT;
  const _required = blooketRequired || BLOOKET_REQUIRED_DEFAULT;
  const _bonus = blooketBonusTopics || BLOOKET_BONUS_DEFAULT;
  // GET /grade/offline-inputs
  //   Auth: roster token (Bearer or ?token=) — SELF only (no view-as: a device
  //   only ever re-derives its own grade). Read-only.
  //   → 200 { ok, redactedKey, schedule, config, section, worksheetBlankCounts,
  //           blooketLessons, blooketPresence, blooketRequired, blooketBonusTopics,
  app.get('/grade/offline-inputs', async (req, res) => {
    const rawToken = extractToken(req);
    if (!rawToken) return res.status(401).json({ ok: false, error: 'Token required' });
    const studentId = verifyToken(rawToken);
    if (!studentId) return res.status(401).json({ ok: false, error: 'Invalid or expired token' });

    let ledgerRows = [];
    try {
      const r = await ledgerDb.getLedgerByStudent(studentId);
      if (r && r.error) throw r.error;
      ledgerRows = (r && r.data) || [];
    } catch (err) {
      console.error('GET /grade/offline-inputs ledger error:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    let answerKey;
    try {
      answerKey = answerKeyMapOrNull(await loadAnswerKey());
    } catch (err) {
      console.error('GET /grade/offline-inputs answer-key error:', err);
      return res.status(500).json({ ok: false, error: 'Could not load answer key' });
    }
    if (!answerKey) return res.status(500).json({ ok: false, error: 'Answer key malformed' });

    // Resolve section for the lesson-due date filter (mirrors GET /grade).
    let section = null;
    if (db && typeof db.findByStudentId === 'function') {
      try {
        const { data: rosterRow } = await db.findByStudentId(studentId);
        if (rosterRow && rosterRow.section) section = rosterRow.section;
      } catch (_) { /* section stays null → defensive degrade */ }
    }

    const redactedKey = buildRedactedKey(answerKey, ledgerRows);

    return res.json({
      ok: true,
      redactedKey,
      schedule: lessonSchedule || null,
      
      eventSchedule: eventSchedule || null,
      config: config || null,
      section,
      worksheetBlankCounts: worksheetBlankCounts || null,
      blooketLessons: _presence, // legacy alias = presence
      blooketPresence: _presence,
      blooketRequired: _required,
      // M2d: enrichment ids so offline re-derive stamps lessons[].blooketBonus
      // (shared "(bonus)" column title for My Gradebook / My Ledger).
      blooketBonusTopics: _bonus,
    });
  });
}
