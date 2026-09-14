// grade-answer-key.js — GET /grade/answer-key (offline-grading mesh Phase 3b).
//
// The TEACHER device auto-grades gossiped student submissions OFFLINE (§7.1), which
// needs the REAL, unredacted answer key + worksheet key — the exact opposite of
// /grade/offline-inputs, which returns a REDACTED key to STUDENT devices so a student
// never learns answers. So this endpoint is TEACHER-GATED and returns the full keys,
// which the teacher device caches while online and uses to grade offline.
//
// It also returns a `keyVersion` hash (§0.10): the deterministic hash of the exact
// keys served. The teacher stamps it into each offline grade's `kv` field, so a grade
// carries the provenance of which key version scored it — and two teacher devices on
// the same key version mint byte-identical grades (§0.8 dedup).
//
// SECURITY: the full key is a cheating surface. This route MUST stay teacher-gated,
// and the key MUST NOT be bundled into the student APK (see the deploy note in the
// spec). requireTeacher accepts the teacher secret OR a teacher bearer token.

import crypto from 'crypto';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { requireTeacher } from './teacher-auth.js';
import { answerKeyMapOrNull } from './scoring.js';

// Blooket presence + required for teacher offline re-derive (mesh Phase 3b).
// Ships both so teacher devices match server Due denom (core 67) + presence UI.
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

// Deterministic, order-independent canonical JSON (sorted keys, recursively) so the
// version hash is stable regardless of object key order. Mirrors the sorted-key
// canonicalization used for receipts.
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

// The §0.10 key-version: a short sha256 over the canonical (answerKey, worksheetKey).
// Both are what actually gets served, so the version pins exactly what a grade scored
// against. Exported for tests + so a future server-side re-grade can pin the same kv.
export function keyVersionHash(answerKey, worksheetKeyMap) {
  const payload = canonical({ a: answerKey || {}, w: worksheetKeyMap || {} });
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 16);
}

function worksheetMapOf(worksheetKey) {
  if (!worksheetKey || typeof worksheetKey !== 'object') return {};
  return (worksheetKey.worksheetKey && typeof worksheetKey.worksheetKey === 'object')
    ? worksheetKey.worksheetKey
    : worksheetKey;
}

export function mountAnswerKey(app, {
  db, worksheetKey, loadAnswerKey, lessonSchedule, config,
  worksheetBlankCounts = null,
  blooketLessons = null, blooketPresence = null, blooketRequired = null,
  blooketBonusTopics = null,
}) {
  const _presence = blooketPresence || blooketLessons || BLOOKET_PRESENCE_DEFAULT;
  const _required = blooketRequired || BLOOKET_REQUIRED_DEFAULT;
  const _bonus = blooketBonusTopics || BLOOKET_BONUS_DEFAULT;
  // GET /grade/answer-key — TEACHER only. Returns the full unredacted keys + a version.
  //   → 200 { ok, answerKey, worksheetKey, blooketLessons, blooketPresence,
  //           blooketRequired, blooketBonusTopics, schedule, config,
  //           worksheetBlankCounts, keyVersion }
  //   → 401 not a teacher · 500 key load/malformed
  app.get('/grade/answer-key', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    let answerKey;
    try {
      answerKey = answerKeyMapOrNull(await loadAnswerKey());
    } catch (err) {
      console.error('GET /grade/answer-key answer-key error:', err);
      return res.status(500).json({ ok: false, error: 'Could not load answer key' });
    }
    if (!answerKey) return res.status(500).json({ ok: false, error: 'Answer key malformed' });

    const worksheetMap = worksheetMapOf(worksheetKey);
    const keyVersion = keyVersionHash(answerKey, worksheetMap);

    return res.json({
      ok: true,
      answerKey,
      worksheetKey: worksheetMap,
      blooketLessons: _presence, // legacy alias = presence
      blooketPresence: _presence,
      blooketRequired: _required,
      blooketBonusTopics: _bonus,
      schedule: lessonSchedule || null,
      config: config || null,
      worksheetBlankCounts: worksheetBlankCounts || null,
      keyVersion,
    });
  });
}
