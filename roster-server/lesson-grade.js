// @ts-check
// lesson-grade.js — Gradebook Phase 6 + W1 (worksheet blank scoring) + F2 (quarters-by-date).
//
// Pure functions for lesson-level aggregation + date filter.
// No I/O. Designed to be unit-tested independently of the server.
//
// Key design:
//   - parseItemLesson(itemId)  → { unit, lessonKey } or null
//   - expandLessonKey(unit, lessonKey, schedule) → [topicKey, ...]
//   - buildWorksheetBlankCounts(manifestDoc) → { "<unit>.<lessonKey>": <int> }
//   - computeLessonGrades(rows, frqBand, answerKey, schedule, opts) → Map<topicKey, lessonResult>
//   - quarterOfLesson(entry, period, config) → 'Q1'..'Q4'
//   - computeQuarterFromLessons({ quarterKey, config, lessonMap, schedule, ... })
//   - buildLessonsArray(lessonMap, schedule) → lessons[]

import { quarterOfDate, quarterOfUnit } from './grade-config.js';

// ── Item-ID → lesson parsing ───────────────────────────────────────────────────

export function parseItemLesson(itemId) {
  if (typeof itemId !== 'string' || !itemId) return null;

  // WS-U{N}L{key}-... (worksheet items, FRQ items)
  // e.g. WS-U4L1-2-reflect1, WS-U1L2-Q5
  const wsMatch = itemId.match(/^WS-U(\d+)L([\d-]+)-/);
  if (wsMatch) {
    return { unit: Number(wsMatch[1]), lessonKey: wsMatch[2] };
  }

  // BLOOKET-U{N}L{key} (per-lesson Blooket, teacher-imported)
  // e.g. BLOOKET-U1L2 -> {unit:1, lessonKey:"2"}; BLOOKET-U4L1-2 -> {unit:4, lessonKey:"1-2"}
  const blMatch = itemId.match(/^BLOOKET-U(\d+)L([\d-]+)$/);
  if (blMatch) {
    return { unit: Number(blMatch[1]), lessonKey: blMatch[2] };
  }

  // WS-U{N}-L{n}-DESK_DONE
  const wsDeskMatch = itemId.match(/^WS-U(\d+)-L(\d+)-DESK_DONE/);
  if (wsDeskMatch) {
    return { unit: Number(wsDeskMatch[1]), lessonKey: wsDeskMatch[2] };
  }

  // CR-U{N}-L{n}-DESK_DONE
  const crDeskMatch = itemId.match(/^CR-U(\d+)-L(\d+)-DESK_DONE/);
  if (crDeskMatch) {
    return { unit: Number(crDeskMatch[1]), lessonKey: crDeskMatch[2] };
  }

  // BL-U{N}-L{key}-DESK_DONE — Blooket flashcard make-up self-attest. Bucketed
  // so the flashcard can stand in as the Blooket score when there's no game
  // score (BLOOKET_MAKEUP_BUILD.md). Still grade-INERT for Cws/quiz (it fails
  // BLANK_ITEM_PATTERN + isn't a curriculum_quiz). [key] allows combined topics.
  const blDeskMatch = itemId.match(/^BL-U(\d+)-L([\d-]+)-DESK_DONE/);
  if (blDeskMatch) {
    return { unit: Number(blDeskMatch[1]), lessonKey: blDeskMatch[2] };
  }

  // U{N}-L{n}-Q{n} (curriculum_quiz)
  const crMatch = itemId.match(/^U(\d+)-L(\d+)-Q/i);
  if (crMatch) {
    return { unit: Number(crMatch[1]), lessonKey: crMatch[2] };
  }

  return null;
}

// ── Expand a lessonKey to topic keys using the lesson schedule ─────────────────
//
// A worksheetKey like "1-2" in unit 4 maps to topics 4.1 AND 4.2
// (the schedule stores combinedWith for these). A solo key like "6" in unit 4
// maps to just ["4.6"].
//
// schedule: the lessons map from lesson-schedule.json (topicKey → entry).
// Returns an array of topicKeys (strings), empty if nothing matches.
export function expandLessonKey(unit, lessonKey, schedule, bonusTopics) {
  if (lessonKey === null) return [];

  // No schedule (Codex MAJOR 2 fold 2026-05-20): synthesize a topicKey so
  // the lesson-level aggregation still works in the graceful-degrade path.
  // Combined-worksheet expansion isn't recoverable without a schedule, so
  // the dashed key acts as its own topic — that bundles the FRQ/quiz items
  // under one synthetic lesson, which is a reasonable approximation when
  // we can't enumerate the real topics.
  if (!schedule) {
    return [`${unit}.${lessonKey}`];
  }

  // If the lessonKey contains dashes, it's a combined worksheet.
  // Find all topics in the given unit whose worksheetKey matches.
  if (lessonKey.includes('-')) {
    const matches = [];
    for (const [topicKey, entry] of Object.entries(schedule)) {
      if (entry && entry.unit === unit && entry.worksheetKey === lessonKey) {
        matches.push(topicKey);
      }
    }
    // A shared worksheet must not fan its rows into bonus topics — that
    // double-weights the worksheet and resurrects the topic as a graded
    // lesson (Codex HIGH, 2026-08-07: old-3.7 via the 3.6-7 worksheet).
    // Year-aware by construction: bonus = presence minus required, so the
    // SY2526 freeze (bonusTopics empty) keeps its historical expansion.
    if (bonusTopics && bonusTopics.size > 0) {
      const core = matches.filter((t) => !bonusTopics.has(t));
      if (core.length > 0) return core;
    }
    return matches;
  }

  // Solo key: construct the topicKey directly.
  const topicKey = `${unit}.${lessonKey}`;
  return schedule[topicKey] ? [topicKey] : [];
}

// ── buildWorksheetBlankCounts ─────────────────────────────────────────────────
//
// Walk manifest.units[].lessons[].activities[] where activity === 'worksheet',
// count itemIds matching /-Q\d+$/ (blanks only, not reflections/exitTickets),
// key by the manifest lesson value ("1.1", "4.1-2", etc.).
//
// manifestDoc: the parsed work-manifest.json object.
// Returns { "<unit>.<lessonKey>": <int> }
//
// Returns {} on any structural problem — callers treat missing keys as Cws null.
export function buildWorksheetBlankCounts(manifestDoc) {
  const counts = {};

  if (!manifestDoc || !Array.isArray(manifestDoc.units)) return counts;

  for (const unitEntry of manifestDoc.units) {
    if (!unitEntry || !Array.isArray(unitEntry.lessons)) continue;

    for (const lessonEntry of unitEntry.lessons) {
      if (!lessonEntry || typeof lessonEntry.lesson !== 'string') continue;
      if (!Array.isArray(lessonEntry.activities)) continue;

      let blankCount = 0;
      for (const activity of lessonEntry.activities) {
        if (!activity || activity.activity !== 'worksheet') continue;
        if (!Array.isArray(activity.itemIds)) continue;
        for (const itemId of activity.itemIds) {
          if (typeof itemId === 'string' && /-Q\d+$/.test(itemId)) {
            blankCount += 1;
          }
        }
      }

      // Key is the manifest lesson value verbatim ("1.1", "4.1-2", etc.)
      counts[lessonEntry.lesson] = blankCount;
    }
  }

  return counts;
}

// ── FRQ score → percentage (mirrors grade.js frqScoreToPct) ───────────────────

function frqScoreToPct(score, frqBand) {
  if (score === null || score === undefined || score === '') return null;
  const s = Number(score);
  if (!Number.isFinite(s)) return null;
  if (s >= 0.75) return frqBand.E;
  if (s >= 0.25) return frqBand.P;
  return frqBand.I;
}

// ── Blank itemId pattern (W1) ─────────────────────────────────────────────────
//
// Real worksheet blanks: WS-U{N}L{key}-Q{n}  (e.g. WS-U4L1-2-Q5)
// EXCLUDES: WS-U{N}-L{n}-DESK_DONE, WS-U{N}L{key}-reflect{n}, etc.
const BLANK_ITEM_PATTERN = /^WS-U(\d+)L([\d-]+)-Q\d+$/;

// ── computeLessonGrades ───────────────────────────────────────────────────────
//
// Walk the ledger rows (latest-per-item already resolved) and accumulate
// per-lesson FRQ, quiz, and worksheet-blank data. Returns a Map<topicKey,
// lessonResult> where:
//
//   lessonResult = {
//     topicKey,
//     frqItems: [{ itemId, score(pct|null), rawScore, ts }],
//     quizItems: [{ itemId, correct(bool), ts }],    // scored against key
//     worksheetItems: [{ itemId, ts, score }],       // blanks w/ numeric score
//     wsCountKey: string|null,                       // "<unit>.<lessonKey>"
//     Cws: number|null,  // worksheet blank pct (null if no manifest count)
//     W: number|null,    // mean frq pct (null if no gradable frq)
//     Q: number|null,    // quiz correctness % (null if no scorable quiz)
//     lessonGrade: number|null,  // weighted B, or null
//   }
//
// rows: array of ledger rows (latest-per-item pre-filtered).
// frqBand: { E, P, I } config.
// answerKey: map of itemId → { answerKey, ... } (for quiz scoring).
// schedule: topicKey → entry (to expand combined worksheets).
// opts: { worksheetBlankCounts, weights }
//   - worksheetBlankCounts: { "<unit>.<lessonKey>": <int> } or null/undefined
//   - weights: { ws, W, Q } — lessonFeederWeights; defaults to { ws:1, W:2, Q:3 }
//
// Note: this function intentionally does NOT filter by "due date" —
// that is applied at the quarter level in computeQuarterFromLessons.
export function computeLessonGrades(rows, frqBand, answerKey, schedule, opts) {
  const worksheetBlankCounts = (opts && opts.worksheetBlankCounts) || null;
  const bonusTopics = (opts && opts.bonusTopics instanceof Set)
    ? opts.bonusTopics
    : new Set((opts && opts.bonusTopics) || []);
  const weights = (opts && opts.weights) || { ws: 1, W: 2, Q: 3 };

  // lessonMap: topicKey → accumulator
  const byTopic = new Map();

  function ensure(topicKey) {
    if (!byTopic.has(topicKey)) {
      byTopic.set(topicKey, {
        topicKey,
        frqItems: [],
        quizItems: [],
        worksheetItems: [],
        wsCountKey: null,
        blankCount: null,       // manifest blank count for this worksheet (early-bonus coverage)
        blooket: null,          // 0..100 — RESOLVED: game score, else flashcard make-up, else null
        blooketGame: null,      // 0..100 from a real Blooket game row (source 'blooket')
        blooketFlashcard: null, // 0..100 from a BL-…-DESK_DONE flashcard pass (make-up)
      });
    }
    return byTopic.get(topicKey);
  }

  function isCorrect(response, keyEntry) {
    if (!keyEntry || keyEntry.answerKey == null) return false;
    const r = normalizeResponse(response);
    if (r == null) return false;
    return r === String(keyEntry.answerKey).trim().toLowerCase();
  }

  function normalizeResponse(response) {
    if (response == null) return null;
    if (typeof response === 'string' || typeof response === 'number') {
      return String(response).trim().toLowerCase();
    }
    if (Array.isArray(response)) {
      return response.length ? normalizeResponse(response[0]) : null;
    }
    if (typeof response === 'object') {
      for (const k of ['value', 'answer', 'selected', 'choice', 'key']) {
        if (response[k] != null) return normalizeResponse(response[k]);
      }
    }
    return null;
  }

  // AI-review partial credit per quiz item (generalizes the s125 quiz_exception):
  //   source='quiz_review',    item_id `<base>#rev`, score = earned credit (1 / 2/3 / 1/3)
  //   source='quiz_exception', item_id `<base>#exc` (legacy E-only flip) = credit 1.0
  // Built before the scoring loop so row order doesn't matter. The review rows
  // match no scoring branch below (never double-counted); the #rev/#exc suffixes
  // keep them distinct from the quiz row under latestPerItem.
  const reviewCredit = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    if (!row || typeof row.item_id !== 'string') continue;
    let base = null, credit = 0;
    if (row.source === 'quiz_review') {
      base = row.item_id.replace(/#rev$/i, '');
      const c = Number(row.score);
      credit = Number.isFinite(c) ? Math.min(Math.max(c, 0), 1) : 0;
    } else if (row.source === 'quiz_exception') {
      base = row.item_id.replace(/#exc$/i, '');
      credit = 1;
    }
    if (base) reviewCredit.set(base, Math.max(reviewCredit.get(base) || 0, credit));
  }

  for (const row of (Array.isArray(rows) ? rows : [])) {
    if (!row || !row.item_id) continue;
    const parsed = parseItemLesson(row.item_id);
    if (!parsed) continue;
    const { unit, lessonKey } = parsed;
    if (lessonKey === null) continue; 

    const topicKeys = expandLessonKey(unit, lessonKey, schedule, bonusTopics);
    if (!topicKeys.length) continue;

    const ts = row.recorded_at || null;
    const src = row.source || '';

    for (const topicKey of topicKeys) {
      const acc = ensure(topicKey);

      // Blooket flashcard MAKE-UP (BL-…-DESK_DONE): a passed flashcard quiz that
      // stands in for the Blooket score when there's no game score. Its score is
      // 0..100 (the pass %, pinned at 80 by the 8/10 early-stop). Detected by
      // itemId so it works regardless of source; it never feeds Cws (fails
      // BLANK_ITEM_PATTERN) or the quiz track. (BLOOKET_MAKEUP_BUILD.md)
      if (/^BL-U\d+-L[\d-]+-DESK_DONE/.test(row.item_id)) {
        // Reject null/blank/non-numeric BEFORE coercion: Number(null)===0 and
        // Number('')===0 are finite, so a score-less row would otherwise write a
        // spurious 0 instead of leaving the make-up absent. Mirrors frqScoreToPct.
        const raw = row.score;
        if (raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw))) {
          acc.blooketFlashcard = Math.min(100, Math.max(0, Number(raw)));
        }
      }

      if (src === 'frq') {
        const pct = frqScoreToPct(row.score, frqBand);
        acc.frqItems.push({ itemId: row.item_id, score: pct, rawScore: row.score, ts });
      } else if (src === 'curriculum_quiz') {
        const keyEntry = answerKey && answerKey[row.item_id];
        if (keyEntry && keyEntry.answerKey != null) {
          // Partial credit = max of the answer-key result (1/0) and any AI-review
          // credit (E=1, P=2/3, I=1/3) for this item. "correct" = full credit.
          const credit = Math.max(
            isCorrect(row.response, keyEntry) ? 1 : 0,
            reviewCredit.get(row.item_id) || 0
          );
          acc.quizItems.push({ itemId: row.item_id, correct: credit >= 1, credit, ts });
        }
        // ungradable quiz item — don't add to quizItems
      } else if (src === 'worksheet') {
        // Only real blanks count for Cws. DESK_DONE and reflections are excluded.
        if (BLANK_ITEM_PATTERN.test(row.item_id)) {
          // Treat null or non-numeric score as 0 (unattempted blank = 0 points).
          const rawScore = row.score;
          const numScore = (rawScore !== null && rawScore !== undefined && Number.isFinite(Number(rawScore)))
            ? Number(rawScore)
            : 0;
          acc.worksheetItems.push({ itemId: row.item_id, ts, score: numScore });
          // Record the count key for manifest lookup.
          // All blanks in a lesson share the same "<unit>.<lessonKey>".
          if (acc.wsCountKey === null) {
            acc.wsCountKey = `${unit}.${lessonKey}`;
          }
        }
      } else if (src === 'blooket') {
        // Real Blooket GAME score (teacher CSV import), stored 0..1 (no answer
        // key). Latest row wins (pre-deduped via latestPerItem). Kept on 0..100.
        // The GAME score is preferred over the flashcard make-up at finalize.
        // Reject null/blank/non-numeric before coercion (Number(null)===0 would
        // write a spurious 0 = "played and bombed" for a score-less row).
        const raw = row.score;
        if (raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw))) {
          acc.blooketGame = Math.min(1, Math.max(0, Number(raw))) * 100;
        }
      }
    }
  }

  // Now compute Cws, W, Q, lessonGrade for each topic.
  const wsWeight = weights.ws;
  const wWeight  = weights.W;
  const qWeight  = weights.Q;

  // Per-topic total gradable quiz questions (the Q denominator), so Q scores
  // correct / WHOLE-quiz (unanswered = wrong), mirroring how Cws uses the full
  // blank count. Computed once from the answer key.
  const quizTotals = computeQuizTotals(answerKey, schedule);

  for (const [, acc] of byTopic) {
    // Cws = clamp((sum of blank scores) / blankCount, 0, 1) * 100
    // blankCount = manifest count for this lesson (DENOMINATOR = ALL blanks,
    // not just recorded ones — unattempted blanks contribute 0 to numerator).
    let Cws = null;
    if (worksheetBlankCounts && acc.wsCountKey !== null) {
      const blankCount = worksheetBlankCounts[acc.wsCountKey];
      acc.blankCount = blankCount && blankCount > 0 ? blankCount : null;
      if (blankCount && blankCount > 0) {
        const scoreSum = acc.worksheetItems.reduce((s, w) => s + w.score, 0);
        const rawFrac = scoreSum / blankCount;
        Cws = Math.min(Math.max(rawFrac, 0), 1) * 100;
      }
    }

    // W = mean of graded frqItems (null-score items excluded from denominator)
    const gradableFrqs = acc.frqItems.filter(f => f.score != null);
    const W = gradableFrqs.length > 0
      ? gradableFrqs.reduce((s, f) => s + f.score, 0) / gradableFrqs.length
      : null;

    // Q = correctness % over the WHOLE quiz (DENOMINATOR = total quiz questions
    // from the answer key, mirroring Cws — unanswered questions contribute 0 to
    // the numerator, so 1-right-of-3 = 33%, not 100%). Only when the student has
    // ATTEMPTED the quiz; a wholly un-attempted quiz stays null so it never
    // tanks a not-yet-taken lesson (the v3 due-by-today track logic decides
    // whether an absent quiz counts as 0). Defensive fallback to attempted count
    // if the topic's total is somehow unknown.
    let Q = null;
    if (acc.quizItems.length > 0) {
      const creditSum = acc.quizItems.reduce((s, q) => s + (q.credit || 0), 0);
      const quizDenom = (quizTotals[acc.topicKey] && quizTotals[acc.topicKey] > 0)
        ? quizTotals[acc.topicKey]
        : acc.quizItems.length;
      Q = (creditSum / quizDenom) * 100;
    }

    // B = three-way weighted mean, renormalized over PRESENT feeders
    let B = null;
    {
      let num = 0, den = 0;
      if (Cws != null) { num += wsWeight * Cws; den += wsWeight; }
      if (W   != null) { num += wWeight  * W;   den += wWeight; }
      if (Q   != null) { num += qWeight  * Q;   den += qWeight; }
      if (den > 0) B = num / den;
    }

    acc.Cws = Cws != null ? Math.round(Cws * 10) / 10 : null;
    acc.W = W != null ? Math.round(W * 10) / 10 : null;
    acc.Q = Q != null ? Math.round(Q * 10) / 10 : null;
    acc.lessonGrade = B != null ? Math.round(B * 10) / 10 : null;
    // Lessons-track value EXCLUDING the quiz feeder: {Cws, W} weighted (ws:W),
    // renormalized over present feeders. This is exactly computeQuarterV3's
    // lessonTrackValue (lessonGradeNoQuiz) — surfaced so the in-app/Schoology
    // "Follow-Along" cell can be the FULL worksheet grade (blanks + AI-graded
    // reflections), apples-to-apples with the v3 Lessons track. Additive; the
    // quarter math still recomputes its own value and is untouched.
    // Computed from the ROUNDED sibling feeders (acc.Cws/acc.W) — the exact inputs
    // computeQuarterV3's lessonTrackValue uses — so the in-app Follow-Along cell
    // equals the v3 Lessons-track value with no rounding-order drift (a stray sub-0.1
    // gap would otherwise read as a spurious Schoology-vs-v3 divergence).
    let Bnq = null;
    {
      let num = 0, den = 0;
      if (acc.Cws != null) { num += wsWeight * acc.Cws; den += wsWeight; }
      if (acc.W   != null) { num += wWeight  * acc.W;   den += wWeight; }
      if (den > 0) Bnq = num / den;
    }
    acc.lessonGradeNoQuiz = Bnq != null ? Math.round(Bnq * 10) / 10 : null;

    // Exit tickets retain all helpful credit and add a bonus. Cws and W stay
    // unchanged: completion gates and the original feeder displays still use them.
    const exitItem = acc.frqItems.find(f => /-exitTicket$/.test(f.itemId) && f.score != null);
    acc.exitBonus = exitItem == null ? 0 : (exitItem.score >= frqBand.E ? 5 : exitItem.score >= frqBand.P ? 3 : 1);
    acc.exitCounted = false;
    if (exitItem != null) {
      const withoutExit = blendLessonFeeders(Cws, reflectionMean(acc.frqItems), Q, weights);
      acc.exitCounted = B != null && (withoutExit == null || B > withoutExit);
      const base = withoutExit == null ? B : Math.max(B, withoutExit);
      acc.lessonGrade = base == null ? null : Math.round(Math.min(105, base + acc.exitBonus) * 10) / 10;
      const noQuiz = lessonGradeNoQuiz(acc, weights);
      acc.lessonGradeNoQuiz = noQuiz == null ? null : Math.round(noQuiz * 10) / 10;
    }
    // Blooket (0..100): the BETTER of the two efforts — the real game score OR the
    // flashcard score (the timed full deck can legitimately reach 100%, so a strong
    // flashcard run beats a mediocre game, and vice-versa). Either may be null; the
    // present one wins, both null → null. Learning is rewarded, not penalized
    // (FLASHCARD_TIMED_DECK_BUILD.md, supersedes the old "game wins"). The quarter
    // track turns a missing-but-due Blooket into 0; null here = "no evidence yet."
    if (acc.blooketGame != null && acc.blooketFlashcard != null) {
      acc.blooket = Math.max(acc.blooketGame, acc.blooketFlashcard);
    } else if (acc.blooketGame != null) {
      acc.blooket = acc.blooketGame;
    } else if (acc.blooketFlashcard != null) {
      acc.blooket = acc.blooketFlashcard;
    } else {
      acc.blooket = null;
    }
    acc.blooket = acc.blooket != null ? Math.round(acc.blooket * 10) / 10 : null;

  }

  return byTopic;
}

// ── "Today" in schoolTz ────────────────────────────────────────────────────────
//
// Returns YYYY-MM-DD string for the current moment in the given IANA timezone.
// Falls back to UTC if the timezone is unavailable.
export function todayInTz(tz, now) {
  const instant = now === undefined ? new Date() : new Date(now);
  try {
    // Use Intl.DateTimeFormat to render the current moment in the given timezone.
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const d = parts.find(p => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch (_) {
    // fallthrough to UTC
  }
  return instant.toISOString().slice(0, 10);
}

// ── Due semantics (SY2627, teacher 2026-09-03) ──────────────────────────────
//
// config.dueAfterLessonDay === true → a lesson is due once its lesson DAY HAS
// ENDED (11:59 PM school time): on the lesson date itself it is still "open",
// so a missing worksheet is not a 0 until the next day. Absent/false (the
// frozen SY2526 config) → the original rule: due from the start of the day.
export function isDateDue(dateStr, todayDateStr, config) {
  if (!dateStr || !todayDateStr) return false;
  if (config && config.dueAfterLessonDay) return dateStr < todayDateStr;
  return dateStr <= todayDateStr;
}

// Epoch ms of 23:59:59 on a YYYY-MM-DD date in an IANA timezone (the deadline
// instant used by the early-completion bonus). Falls back to UTC.
export function endOfDayEpochInTz(dateStr, tz) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 23, 59, 59);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(guess));
    const g = (k) => Number(parts.find((p) => p.type === k).value);
    const asIfUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
    return guess - (asIfUtc - guess);
  } catch (_) {
    return guess;
  }
}

function stampOf(it) {
  if (!it || it.ts == null) return NaN;
  return typeof it.ts === 'number' ? it.ts : Date.parse(it.ts);
}

// When a lesson's worksheet work was last submitted (epoch ms), from the
// recorded_at stamps on its worksheet + FRQ items. null when nothing is stamped.
export function lessonCompletedAt(result) {
  if (!result) return null;
  let latest = null;
  for (const list of [result.worksheetItems, result.frqItems]) {
    if (!Array.isArray(list)) continue;
    for (const it of list) {
      const t = stampOf(it);
      if (Number.isFinite(t) && (latest === null || t > latest)) latest = t;
    }
  }
  return latest;
}

// The instant (epoch ms) at which a worksheet reached `minComplete` coverage of
// its blanks — the k-th earliest recorded_at among its blank rows, with
// k = ceil(minComplete × blankCount). This is what the early bonus judges:
//   - one blank is never "done" (needs ≥ 80% of the blanks by default);
//   - a later edit, appeal or FRQ regrade moves ONE row's stamp, which cannot
//     drag the k-th earliest past the deadline unless most rows moved;
//   - FRQ / AI-grade stamps are ignored (grading time is not the student's).
// Unknown blankCount → every stamped row must be in (k = all rows, ≥ 1).
export function worksheetCoverageReachedAt(result, minComplete) {
  if (!result || !Array.isArray(result.worksheetItems)) return null;
  const stamps = result.worksheetItems.map(stampOf).filter(Number.isFinite).sort((a, b) => a - b);
  if (stamps.length === 0) return null;
  const blanks = Number.isFinite(result.blankCount) && result.blankCount > 0 ? result.blankCount : null;
  const frac = Number.isFinite(minComplete) && minComplete > 0 && minComplete <= 1 ? minComplete : 0.8;
  const need = blanks ? Math.max(1, Math.ceil(frac * blanks)) : stamps.length;
  if (stamps.length < need) return null;
  return stamps[need - 1];
}





// Extract the single-letter period key from a section string.
// "PeriodB" → "B", "PeriodE" → "E", "B" → "B", etc.
// Returns null if it can't be extracted.
export function sectionToPeriod(section) {
  if (!section) return null;
  // PeriodX is the live universal section. The Desk shows it on Period E's
  // schedule (boot forces cP='E'), so the grade engine's due-date filter AND the
  // teacher-dashboard `due` flag must read E's dates too — NOT the B-OR-E union
  // that a null period triggers (which marked lessons due early → premature zeros).
  if (String(section).toUpperCase() === 'PERIODX') return 'E';
  const m = String(section).match(/([BCDEG])$/i);
  return m ? m[1].toUpperCase() : null;
}

// ── quarterOfLesson ───────────────────────────────────────────────────────────
//
// Resolve dates consistently across quarter placement, due work, and bonuses.
// Known sections keep their own date, including an unscheduled null date.
function scheduledDate(entry, period) {
  const periods = (entry && entry.periods) || {};
  if (period) return periods[period] || null;
  return periods.C || periods.D || periods.G || periods.B || periods.E || null;
}

// The quarter a scheduled lesson belongs to. Date-driven, with a
// unit-band fallback for a lesson that has no usable date.
//   entry  -- a lesson-schedule entry { unit, periods: {C,D,G,B,E}, ... }
//   period -- section letter or null (from sectionToPeriod)
// Returns 'Q1'..'Q4' (quarterOfUnit always resolves for units 1-9).
export function quarterOfLesson(entry, period, config) {
  const date = scheduledDate(entry, period);
  if (date) {
    const q = quarterOfDate(date, config);
    if (q) return q;
  }
  return quarterOfUnit(entry && entry.unit, config);
}

export function deriveQuarterBands(config, schedule, period, gradingWindowStart) {
  const quarterKeys = Object.keys((config && config.quarters) || {});
  const configured = {};
  for (const q of quarterKeys) {
    const u = config.quarters[q] && Array.isArray(config.quarters[q].units) ? config.quarters[q].units : [];
    configured[q] = u.slice();
  }
  if (!schedule || typeof schedule !== 'object') return configured;

  // Count each unit's in-window dated lessons per quarter for this period.
  // A unit lands in the quarter holding MOST of its lessons (ties → the earlier
  // quarter). SY2627 fix (2026-09-05): the previous "latest date" rule put ALL of
  // old Unit 1 into Q2 because 1.10 (the Normal distribution, now CED 2.11) is
  // taught in November — Q1 showed nothing while the first month's work sat in Q2.
  const countsByUnit = new Map();   // unitNum -> Map(quarterKey -> lesson count)
  for (const entry of Object.values(schedule)) {
    if (!entry || !Number.isFinite(Number(entry.unit))) continue;
    const unitNum = Number(entry.unit);
    const d = scheduledDate(entry, period);
    if (!d || typeof d !== 'string') continue;
    if (gradingWindowStart && d < gradingWindowStart) continue;
    const q = quarterOfDate(d, config);
    if (!q) continue;
    if (!countsByUnit.has(unitNum)) countsByUnit.set(unitNum, new Map());
    const counts = countsByUnit.get(unitNum);
    counts.set(q, (counts.get(q) || 0) + 1);
  }

  const bands = {};
  for (const q of quarterKeys) bands[q] = [];
  const placed = new Set();
  for (const [unitNum, counts] of countsByUnit) {
    let bestQ = null, bestN = -1;
    for (const q of quarterKeys) {           // quarterKeys are in calendar order → ties go earlier
      const n = counts.get(q) || 0;
      if (n > bestN) { bestQ = q; bestN = n; }
    }
    if (!bestQ || !bands[bestQ]) continue;
    bands[bestQ].push(unitNum);
    placed.add(unitNum);
  }
  // Fallback: configured units the schedule could not place keep their quarter.
  for (const q of quarterKeys) {
    for (const unitNum of configured[q]) {
      if (!placed.has(unitNum)) { bands[q].push(unitNum); placed.add(unitNum); }
    }
  }
  for (const q of quarterKeys) bands[q].sort((a, b) => a - b);
  return bands;
}

// ── computeQuarterFromLessons ─────────────────────────────────────────────────
//
// F2 (quarters-by-date): the quarter a lesson belongs to is date-driven.
// A lesson whose scheduled date falls in a quarter window is assigned to
// that quarter, regardless of its unit band. A lesson with no usable date
// falls back to quarterOfUnit (graceful degradation).
//
// params:
//   quarterKey  -- 'Q1'..'Q4' (replaces the old quarterBand array)
//   config      -- PHASE3_CONFIG (or a test config)
//   lessonMap   -- Map<topicKey, { lessonGrade, ... }>
//   schedule    -- topicKey → { unit, periods: { B, E }, ... }
//   todayDateStr -- "YYYY-MM-DD"
//   section     -- "PeriodB" / "PeriodE" / "B" / "E" / null
//   pcBandData  -- { P_quarter: number }
//   C           -- cap (default 85)
//   gradingWindowStart -- cohort window start (or null)
//
// Returns:
//   {
//     quarterGrade: number|null,
//     ceiling: number|null,
//     lessonsDue: number,
//     lessonsGraded: number,
//     lessonsTotal: number,
//   }
export function computeQuarterFromLessons({
  quarterKey,
  config,
  lessonMap,
  schedule,
  todayDateStr,
  section,
  C = 85,
  gradingWindowStart = /** @type {string|null} */ (null),
}) {
  const period = sectionToPeriod(section); // "B" | "E" | null

  // Unscheduled lessons remain visible; dated lessons must belong to this cohort.
  function inWindow(entry) {
    const date = scheduledDate(entry, period);
    return !gradingWindowStart || !date || date >= gradingWindowStart;
  }

  // All lessons assigned to this quarter (those that exist in the schedule AND
  // are in the active grading window). F2: assignment is date-driven via
  // quarterOfLesson (falls back to unit band for null-date entries).
  // Codex MAJOR 3 fold (2026-05-20): defensive skip on malformed entries —
  // per-entry corruption must not crash this loop or the iteration that
  // follows. Treat any entry missing `unit` as if it weren't in the schedule.
  const bandLessons = [];
  for (const [topicKey, entry] of Object.entries(schedule)) {
    if (!entry || typeof entry !== 'object' || typeof entry.unit !== 'number') continue;
    if (quarterOfLesson(entry, period, config) !== quarterKey) continue;
    if (!inWindow(entry)) continue;
    bandLessons.push(topicKey);
  }

  const lessonsTotal = bandLessons.length;

  if (lessonsTotal === 0) {
    return {
      quarterGrade: null,
      ceiling: null,
      lessonsDue: 0,
      lessonsGraded: 0,
      lessonsTotal: 0,
    };
  }

  // Use the same section date for due work and quarter placement.
  function isDue(topicKey) {
    return isDateDue(scheduledDate(schedule[topicKey], period), todayDateStr, config);
  }

  // 2026-05-20 v2: include any lesson with recorded work in dueLessons,
  // even if its due date is in the future or null. The student's grade
  // should reflect work they've actually completed — silently ignoring
  // ahead-of-schedule work (or pre-cohort work) is confusing UX. The
  // teacher's mental model: "if work is done, count it." After the cohort
  // starts, due-by-date lessons join in (still counted as 0 if ungraded).
  const dueLessons = bandLessons.filter((topicKey) => {
    if (isDue(topicKey)) return true;
    const result = lessonMap.get(topicKey);
    return !!(result && result.lessonGrade != null);
  });
  const lessonsDue = dueLessons.length;

  if (lessonsDue === 0) {
    
    const P_quarter = 0;
    const quarterGrade = P_quarter > 0 ? P_quarter : null;
    return {
      quarterGrade,
      ceiling: null,
      lessonsDue: 0,
      lessonsGraded: 0,
      lessonsTotal,
    };
  }

  // Separate due lessons into graded and ungraded.
  let gradedSum = 0;
  let gradedCount = 0;

  for (const topicKey of dueLessons) {
    const result = lessonMap.get(topicKey);
    const lg = result ? result.lessonGrade : null;
    if (lg != null) {
      gradedSum += lg;
      gradedCount += 1;
    }
  }

  // rawQuarter = sum(graded) / len(due)  [ungraded-due count as 0 in numerator]
  const rawQuarter = gradedSum / lessonsDue;

  const banked = Math.min(rawQuarter, C);
  const P_quarter = 0;
  const quarterGrade = Math.round(Math.max(banked, P_quarter) * 10) / 10;

  // Ceiling: best-case if student aces every unfinished lesson.
  // remaining = future lessons (not yet due)
  // unattempted = due but no grade
  const remaining = lessonsTotal - lessonsDue;
  const unattempted = lessonsDue - gradedCount;
  let ceiling = null;
  if (remaining > 0 || unattempted > 0) {
    const maxRest = (remaining + unattempted) * 100;
    ceiling = Math.round(((gradedSum + maxRest) / lessonsTotal) * 10) / 10;
  }

  return {
    quarterGrade,
    ceiling,
    lessonsDue,
    lessonsGraded: gradedCount,
    lessonsTotal,
  };
}

// ── v3 grading model (GRADING_MODEL_V3_BUILD.md) ──────────────────────────────
//
// Two-track max/mean conditional that supersedes the Phase 6 mean(lessonGrade)
// quarter grade. Gated behind config.useV3 (env USE_V3_GRADING); the Phase 6
// path above is left untouched. See GRADING_MODEL_V3_BUILD.md for the formula,
// worked examples, and pedagogy.

export const V3_WORK_WEIGHTS = { lessons: 3 / 7, quizzes: 3 / 7, blooket: 1 / 7 };

export const V3_GATES = { floor: 0.40, ceiling: 0.70 };

export function quarterGradeV3(pcAvg, workAvg, gates = V3_GATES) {
  const floor = gates && gates.floor != null ? gates.floor : V3_GATES.floor;
  const ceiling = gates && gates.ceiling != null ? gates.ceiling : V3_GATES.ceiling;
  if (pcAvg >= floor && workAvg >= floor) return Math.max(pcAvg, workAvg);
  return Math.max(ceiling * pcAvg, ceiling * workAvg, (pcAvg + workAvg) / 2);
}

export function workAvgV3(tracks, weights = V3_WORK_WEIGHTS) {
  let num = 0, den = 0;
  for (const key of Object.keys(weights)) {
    const v = tracks ? tracks[key] : null;
    if (v == null) continue;
    num += weights[key] * v;
    den += weights[key];
  }
  if (den === 0) return null;
  return num / den;
}

export function combineV3(pcAvg, workAvg, gates = V3_GATES) {
  if (pcAvg == null && workAvg == null) return null;
  if (pcAvg == null) return workAvg;
  if (workAvg == null) return pcAvg;
  return quarterGradeV3(pcAvg, workAvg, gates);
}

// A missing reflection feeder stays null, so blanks/quiz carry the baseline.
function reflectionMean(frqItems) {
  const reflections = (frqItems || []).filter(f => f.score != null && !/-exitTicket$/.test(f.itemId));
  if (reflections.length === 0) return null;
  return reflections.reduce((sum, f) => sum + f.score, 0) / reflections.length;
}

function blendLessonFeeders(Cws, W, Q, weights) {
  let num = 0, den = 0;
  if (Cws != null) { num += weights.ws * Cws; den += weights.ws; }
  if (W != null) { num += weights.W * W; den += weights.W; }
  if (Q != null) { num += weights.Q * Q; den += weights.Q; }
  return den > 0 ? num / den : null;
}

// Per-lesson grade EXCLUDING the curriculum-quiz feeder (v3 splits quizzes into
// their own track). Weighted blend of {Cws, W} renormalized over present
// feeders, plus the exit bonus, on 0..105. null when neither feeder is present.
function lessonGradeNoQuiz(result, weights, fixCwsReveal = false) {
  if (!result) return null;
  let num = 0, den = 0;
  if (result.Cws != null) { num += weights.ws * result.Cws; den += weights.ws; }
  if (result.W   != null) { num += weights.W  * result.W;   den += weights.W; }
  if (den === 0) return null;
  const blended = num / den;
  // FINDING F3 fix (flagged off by default): the Cws feeder is null (ignored, W
  // carries the lesson) until the FIRST blank, then counts the unfilled blanks as
  // 0 — so doing one of four blanks drops the lesson 100→75. With the fix, doing
  // blanks can only RAISE the lesson, never fall below its FRQ-only (W) value.
  // (When W is absent, Cws stands alone unchanged.) See GRADE_FIX_F1_F3_BUILD.md.
  const withExit = fixCwsReveal && result.W != null ? Math.max(blended, result.W) : blended;
  if (!result.exitBonus) return withExit;

  const reflections = reflectionMean(result.frqItems);
  // Match the existing rounded W sibling used by this no-quiz track.
  const W = reflections == null ? null : Math.round(reflections * 10) / 10;
  let withoutExit = blendLessonFeeders(result.Cws, W, null, weights);
  if (fixCwsReveal && W != null) withoutExit = Math.max(withoutExit, W);
  const base = withoutExit == null ? withExit : Math.max(withExit, withoutExit);
  return Math.min(105, base + result.exitBonus);
}

// [0,1] → 0..100 with one-decimal rounding (the 0..100 response surface).
function to100(x) { return x == null ? null : Math.round(x * 1000) / 10; }

export function computeQuarterV3({
  quarterKey,
  config,
  lessonMap,
  schedule,
  todayDateStr,
  section,
  gradingWindowStart = /** @type {string|null} */ (null),
  blooketLessons = /** @type {string[]|null} */ (null),   // [topicKey] that HAVE a Blooket — the Blooket-track denominator
  quizLessons = /** @type {string[]|null} */ (null),      // [topicKey] that HAVE a quiz — the Quiz-track denominator
}) {
  const period = sectionToPeriod(section);
  const lessonWeights = (config && config.lessonFeederWeights) || { ws: 1, W: 2, Q: 3 };
  const excludeQuiz = !(config && config.v3LessonsExcludeQuiz === false); // default true
  // F2: the v3 Work-track weights + the floor/ceiling gates are config-tunable,
  // defaulting to today's frozen values (behavior-identical when absent).
  const workWeights = (config && config.v3WorkWeights) || V3_WORK_WEIGHTS;
  const gates = (config && config.v3Gates) || V3_GATES;

  // Perverse-incentive fixes (GRADE_FIX_F1_F3_BUILD.md), all DEFAULT-OFF so
  // production grades + pinned tests are unchanged until the teacher opts in.
  const fixCwsReveal = !!(config && config.v3FixCwsReveal);            // F3
  const fixQuizZero  = !!(config && config.v3FixQuizZero);             // F1-B
  const aheadMode    = (config && config.v3AheadOfScheduleLessons) || 'count-all'; // F1-A

  // The Lessons-track value for one topic (respects the exclude-quiz flag).
  function lessonTrackValue(r) {
    if (excludeQuiz) return lessonGradeNoQuiz(r, lessonWeights, fixCwsReveal);
    return r && r.lessonGrade != null ? r.lessonGrade : null;
  }

  // ── Band lessons in the active grading window (mirrors computeQuarterFromLessons) ──
  function inWindow(entry) {
    const date = scheduledDate(entry, period);
    return !gradingWindowStart || !date || date >= gradingWindowStart;
  }

  // SY2627 (2026-09-03): v3 buckets lessons by CALENDAR DATE (quarterOfLesson,
  // the same rule Phase 6 uses), no longer by the static old-unit band. The
  // real schedule teaches the OLD units in Fall-2026 CED order, so an old unit
  // now straddles quarters (old U2 = 2.1-2.3 in Oct, 2.4-2.8 in Jan-Mar; old
  // U8 taught in Dec). Unit banding put December work in Q4 and kept Q1
  // growing after it closed. A lesson counts in the quarter it was due; a
  // null-dated (bonus) entry still falls back to its unit band.
  // Gated by config.v3LessonsByDate so the FROZEN SY2526 config (which lacks
  // the flag) keeps its original unit-band bucketing — historical grades must
  // not move. The live SY2627 grade-config sets it.
  const lessonsByDate = !!(config && config.v3LessonsByDate);
  const bandLessons = [];
  for (const [topicKey, entry] of Object.entries(schedule)) {
    if (!entry || typeof entry !== 'object' || typeof entry.unit !== 'number') continue;
    const q = lessonsByDate ? quarterOfLesson(entry, period, config) : quarterOfUnit(entry.unit, config);
    if (q !== quarterKey) continue;
    if (!inWindow(entry)) continue;
    bandLessons.push(topicKey);
  }
  const lessonsTotal = bandLessons.length;

  function isDue(topicKey) {
    return isDateDue(scheduledDate(schedule[topicKey], period), todayDateStr, config);
  }

  // Due = scheduled-due OR has recorded work (same convention as Phase 6).
  const dueLessons = bandLessons.filter((topicKey) => {
    if (isDue(topicKey)) return true;
    const r = lessonMap.get(topicKey);
    return !!(r && r.lessonGrade != null);
  });
  const lessonsDue = dueLessons.length;

  // ── Lessons track (worksheet blanks + FRQ; quiz excluded by default) ──
  // Denominator = ALL due lessons: every lesson has a worksheet, so a null is
  // genuinely "no work done" = 0 (an ungraded-due lesson legitimately tanks it).
  //
  // FINDING F1-A fix (flagged; default 'count-all' = today): an ahead-of-schedule
  // lesson (has work but NOT scheduled-due) joining the denominator at a low value
  // can DRAG the grade down — doing future work poorly hurts you. The lessons the
  // LESSONS TRACK counts depend on the mode (quiz/blooket/reporting untouched):
  //   'count-all'     — scheduled-due OR has-work (today's behavior).
  //   'not-until-due' — scheduled-due only; early work simply waits to count.
  //   'only-helps'    — scheduled-due always, PLUS early lessons whose value is
  //                     >= the scheduled-due average (early work can lift, never drag).
  const scheduledDue = bandLessons.filter(isDue);
  let lessonTrackKeys = dueLessons;
  if (aheadMode !== 'count-all' && scheduledDue.length > 0) {
    if (aheadMode === 'not-until-due') {
      lessonTrackKeys = scheduledDue;
    } else if (aheadMode === 'only-helps') {
      let s = 0;
      for (const tk of scheduledDue) {
        const lv = lessonTrackValue(lessonMap.get(tk));
        s += lv != null ? lv : 0; // a scheduled-due lesson with no work counts as 0
      }
      const schedAvg = s / scheduledDue.length;
      const aheadKept = dueLessons.filter((tk) => {
        if (isDue(tk)) return false; // scheduled-due handled above
        const lv = lessonTrackValue(lessonMap.get(tk));
        return lv != null && lv >= schedAvg; // early work counts only if it lifts
      });
      lessonTrackKeys = [...scheduledDue, ...aheadKept];
    }
  }
  // Degenerate (all-early student, no scheduled-due lesson): fall back to
  // count-all so they still get a grade rather than a null lessons track.

  let lessonSum = 0, lessonGradedCount = 0;
  for (const topicKey of lessonTrackKeys) {
    const r = lessonMap.get(topicKey);
    const lv = lessonTrackValue(r);
    if (lv != null) { lessonSum += lv; lessonGradedCount += 1; }
  }
  const lessonsAvg = lessonTrackKeys.length > 0 ? (lessonSum / lessonTrackKeys.length) / 100 : null;

  // ── Quizzes track (curriculum-quiz correctness) ──
  // Denominator = due lessons that HAVE a quiz (quizLessons), NOT all due lessons.
  // Most units have an opener (1.1, 4.1, 6.1...) + combined opener-halves with NO
  // quiz; counting those quiz-less lessons in the denominator unfairly dragged the
  // quiz average down — a perfect-quiz student still landed below 100. This mirrors
  // the Blooket track (blooketDue). An un-taken-but-due quiz on a quiz-BEARING
  // lesson still counts as 0 (engagement preserved). Back-compat: when quizLessons
  // is null (older caller / tests), fall back to the all-due-lessons denominator.
  const quizSet = quizLessons == null ? null : new Set(quizLessons);
  let quizSum = 0, quizDue = 0, quizDone = 0;
  const quizTodo = /** @type {string[]} */ ([]);
  // FINDING F1-B fix (flagged; default off): when on, a quiz-bearing lesson counts
  // only if scheduled-due OR actually attempted — so starting a FUTURE lesson's
  // worksheet doesn't turn its un-taken quiz into a 0 (mirrors the Blooket track's
  // `isDue || attempted` guard). Default (off): today's dueLessons (has-work) loop.
  const quizCandidates = fixQuizZero ? bandLessons : dueLessons;
  for (const topicKey of quizCandidates) {
    if (quizSet != null && !quizSet.has(topicKey)) continue; // quiz-less lesson excluded
    const r = lessonMap.get(topicKey);
    const q = r && r.Q != null ? r.Q : null;
    if (fixQuizZero && !(isDue(topicKey) || q != null)) continue; // early + un-attempted → not a 0
    quizDue += 1;
    if (q != null) { quizSum += q; quizDone += 1; }
    else { quizTodo.push(topicKey); } // due quiz-bearing lesson, not taken -> 0
  }
  const quizzesAvg = quizDue > 0 ? (quizSum / quizDue) / 100 : null;

  // -- Blooket track (BLOOKET_MAKEUP_BUILD.md) -- now a real per-lesson grade:
  // denominator = due lessons that HAVE a Blooket (blooketLessons), and a
  // missing-but-due Blooket counts as 0 (mirrors the lessons/quizzes tracks).
  // r.blooket is the real game score, else the flashcard make-up (80%), else
  // null→0. A lesson with NO Blooket is excluded from the denominator, so it is
  // never an unfair 0. If blooketLessons isn't supplied (older caller), the set
  // is empty → blooketAvg null → renormalized away (back-compat, no tank).
  // blooketDone = due Blooket lessons WITH a score (game or flashcard make-up);
  // blooketTodo = due Blooket lessons with NO score yet — the flashcard make-up
  // opportunities the grade coach surfaces (each can become an 80%).
  // Iterate bandLessons (NOT dueLessons): a Blooket-bearing lesson counts once
  // it's scheduled-due OR the student has already earned a Blooket score for it
  // (game or flashcard make-up). This mirrors the lessons track's "if the work is
  // done, count it" rule — lessonGrade EXCLUDES blooket, so an ahead-of-schedule
  // blooket-only lesson would otherwise be dropped and the earned score lost. A
  // not-due lesson with NO blooket score is skipped (future blookets are never
  // surfaced as missing). Drawing from bandLessons (not dueLessons) also keeps a
  // phantom 0 out of the lessons/quizzes tracks for that ahead-of-schedule lesson.
  const blooketSet = new Set(Array.isArray(blooketLessons) ? blooketLessons : []);
  const seenBlooketGroups = new Set();
  let blooketSum = 0, blooketDue = 0, blooketDone = 0;
  const blooketTodo = /** @type {string[]} */ ([]);
  for (const topicKey of bandLessons) {
    if (!blooketSet.has(topicKey)) continue;
    const r = lessonMap.get(topicKey);
    if (!(isDue(topicKey) || (r && r.blooket != null))) continue;
    // Collapse combined-worksheet constituents into ONE slot. A single combined
    // Blooket (e.g. BLOOKET-U4L1-2) attaches the SAME score to every constituent
    // topic (4.1 AND 4.2), so counting each separately would over-weight it vs a
    // solo Blooket. Group by unit|worksheetKey; fall back to the topicKey for
    // solo lessons (and test schedules with no worksheetKey) so solos are never
    // collapsed. No-op for today's all-solo Blooket set — guards a future rebake.
    const entry = schedule[topicKey];
    const groupKey = (entry && entry.worksheetKey != null)
      ? `${entry.unit}|${entry.worksheetKey}`
      : topicKey;
    if (seenBlooketGroups.has(groupKey)) continue;
    seenBlooketGroups.add(groupKey);
    blooketDue += 1;
    if (r && r.blooket != null) { blooketSum += r.blooket; blooketDone += 1; }
    else { blooketTodo.push(topicKey); }   // due but no score → 0, a make-up opportunity
  }
  const blooketAvg = blooketDue > 0 ? (blooketSum / blooketDue) / 100 : null;

  // The mastery input is absent until Phase 3 defines A2 assessments.
  // Keep the two-track combiner and its gates available.
  const pcAvg = null;
  const pcDue = false;

  // ── Combine to the quarter grade ──
  const tracks = {
    lessons: lessonsAvg,
    quizzes: quizzesAvg,
    // Blooket now flows from the ledger (per-topic, mean-of-recorded), NOT the
    // workTracks channel. null -> renormalized away by workAvgV3.
    blooket: blooketAvg,
  };
  const effectiveWorkWeights = workWeights;
  const workAvg = workAvgV3(tracks, effectiveWorkWeights);
  const quarterGradeBase = to100(combineV3(pcAvg, workAvg, gates));

  // ── Early-completion bonus (SY2627, teacher 2026-09-03) ──
  // +config.v3EarlyBonus.perLesson points on the quarter grade for every
  // scheduled-due WORKSHEET that reached minComplete (default 80%) of its blanks
  // by 11:59 PM school time on its due day (worksheetCoverageReachedAt), capped
  // at config.v3EarlyBonus.cap per quarter (cap 0 = off, absent = uncapped).
  // A combined worksheet (4.1-2, 6.1-2 …) earns ONE bonus, judged against the
  // latest of its topics' due dates. Ahead-of-schedule worksheets (work
  // recorded, not yet due) are counted separately (aheadLessons) and earn
  // theirs once due. Absent config (the frozen SY2526 config) → no bonus.
  const earlyCfg = (config && config.v3EarlyBonus) || null;
  const earlyPerLesson = earlyCfg && Number.isFinite(earlyCfg.perLesson) ? earlyCfg.perLesson : 0;
  const earlyCap = earlyCfg && Number.isFinite(earlyCfg.cap) ? earlyCfg.cap : Infinity;
  const earlyMin = earlyCfg && Number.isFinite(earlyCfg.minComplete) ? earlyCfg.minComplete : 0.8;
  const schoolTz = (config && config.schoolTz) || 'America/New_York';
  const earlyKeys = /** @type {string[]} */ ([]);
  const aheadKeys = /** @type {string[]} */ ([]);
  if (earlyPerLesson > 0 && earlyCap > 0) {
    const seenWorksheets = new Set();
    const dateFor = (entry) => scheduledDate(entry, period);
    for (const topicKey of bandLessons) {
      const r = lessonMap.get(topicKey);
      if (lessonTrackValue(r) == null) continue; // no worksheet work → nothing to credit
      const entry = schedule[topicKey];
      const dueDate = dateFor(entry);
      if (!dueDate) continue; // bonus/unscheduled lesson — no deadline to beat
      const worksheetId = `${entry.unit}/${entry.worksheetKey || topicKey}`;
      if (seenWorksheets.has(worksheetId)) continue; // combined worksheet: one bonus
      seenWorksheets.add(worksheetId);
      let deadlineDate = dueDate;
      for (const other of (Array.isArray(entry.combinedWith) ? entry.combinedWith : [])) {
        const od = dateFor(schedule[other]);
        if (od && od > deadlineDate) deadlineDate = od;
      }
      if (!isDateDue(deadlineDate, todayDateStr, config)) { aheadKeys.push(topicKey); continue; }
      const reachedAt = worksheetCoverageReachedAt(r, earlyMin);
      if (reachedAt != null && reachedAt <= endOfDayEpochInTz(deadlineDate, schoolTz)) earlyKeys.push(topicKey);
    }
  }
  const earlyBonus = earlyCap > 0 ? Math.min(earlyCap, earlyKeys.length * earlyPerLesson) : 0;
  const quarterGrade = quarterGradeBase == null ? null : Math.min(100, quarterGradeBase + earlyBonus);

  // ── Ceiling: best case if every remaining/un-attempted item scores 100 ──
  const lessonsAvgBest = lessonsTotal > 0
    ? (lessonSum + (lessonsTotal - lessonGradedCount) * 100) / lessonsTotal / 100
    : null;
  // Quiz best case uses the quiz-BEARING band total (matching the quizzesAvg
  // denominator), not lessonsTotal — a quiz-less lesson is never a "missing quiz".
  const quizBandTotal = quizSet == null ? lessonsTotal : bandLessons.filter((tk) => quizSet.has(tk)).length;
  const quizzesAvgBest = quizBandTotal > 0
    ? (quizSum + (quizBandTotal - quizDone) * 100) / quizBandTotal / 100
    : null;
  const pcAvgBest = null;
  const bestTracks = {
    lessons: lessonsAvgBest,
    quizzes: quizzesAvgBest,
    
    blooket: blooketAvg,
  };
  const workAvgBest = workAvgV3(bestTracks, effectiveWorkWeights);
  // Ceiling only when the quarter has signal (matches Phase 6: nothing due → null).
  const ceilingBase = quarterGrade == null ? null : to100(combineV3(pcAvgBest, workAvgBest, gates));
  const ceiling = ceilingBase == null ? null : Math.min(100, ceilingBase + earlyBonus);

  return {
    quarterGrade,
    quarterGradeBase,
    earlyBonus,
    earlyLessons: earlyKeys.length,
    earlyKeys,
    aheadLessons: aheadKeys.length,
    aheadKeys,
    ceiling,
    lessonsDue,
    // lessonsGraded counts lessons graded on the LESSONS-track feeders (blanks/
    // FRQ). A quiz-only lesson feeds quizzesAvg instead, so it does NOT count
    // here (differs from Phase 6, where the quiz folded into lessonGrade).
    // Informational only — no grade depends on this field.
    lessonsGraded: lessonGradedCount,
    lessonsTotal,
    pcAvg: to100(pcAvg),
    workAvg: to100(workAvg),
    
    pcDue,
    // Raw [0,1] track fractions — the EXACT values combineV3/quarterGradeV3 gate on
    // (the 40% floor is 0.40 here). Surfaced so the gradebook reconciliation can
    // pick the v3 branch from the same numbers the grade used, instead of the
    // rounded 0..100 display values (40.0 is ambiguous between 0.3996 and 0.4004).
    pcAvgRaw: pcAvg,
    workAvgRaw: workAvg,
    // Work sub-track breakdown (0..100 or null), so the "Why so low?" coach can
    // show what's inside the Work track — esp. the Blooket track, which the
    // student can't otherwise see. null tracks are renormalized away in workAvg.
    workTracks: {
      lessons: to100(lessonsAvg),
      quizzes: to100(quizzesAvg),
      blooket: to100(blooketAvg),
      
    },
    // Blooket make-up surface: how many Blooket-bearing lessons are due, how many
    // have a score, and the topicKeys still needing one (the flashcard make-ups).
    blooketDue,
    blooketDone,
    blooketTodo,
    // Quiz surface (symmetry with Blooket): how many quiz-bearing lessons are due,
    // how many were taken, and the topicKeys still owing a quiz. Lets the grade
    // coach + gradebook show the Quiz track honestly (quiz-less lessons excluded).
    quizDue,
    quizDone,
    quizTodo,
    
  };
}

export function computeQuizTotals(answerKey, schedule) {
  const totals = {};
  if (!answerKey || !schedule) return totals;
  for (const itemId of Object.keys(answerKey)) {
    const keyEntry = answerKey[itemId];
    if (!keyEntry || keyEntry.answerKey == null) continue; 
    const m = itemId.match(/^U(\d+)-L(\d+)-Q/i);
    if (!m) continue;
    const topicKeys = expandLessonKey(Number(m[1]), m[2], schedule);
    for (const tk of topicKeys) {
      totals[tk] = (totals[tk] || 0) + 1;
    }
  }
  return totals;
}

export function buildLessonsArray(lessonMap, schedule, topicNames, gradingWindowStart, quizTotals = {}, blooketLessons = [], _unusedTrainer = [], blooketBonusTopics = []) {
  const result = [];
  const blooketSet = new Set(Array.isArray(blooketLessons) ? blooketLessons : []);
  const bonusSet = new Set(Array.isArray(blooketBonusTopics) ? blooketBonusTopics : []);

  // Include every lesson from the schedule (not just those with data).
  const sortedKeys = Object.keys(schedule).sort((a, b) => {
    const [ua, la] = a.split('.');
    const [ub, lb] = b.split('.');
    const ud = Number(ua) - Number(ub);
    return ud !== 0 ? ud : Number(la) - Number(lb);
  });

  for (const topicKey of sortedKeys) {
    const entry = schedule[topicKey];
    // 2026-05-20 hotfix: exclude lessons whose dates are entirely before the
    // active cohort's grading window. Mirrors the band filter in
    // computeQuarterFromLessons so the day-grade modal also skips stale
    // prior-year entries.
    const date = scheduledDate(entry, null);
    if (gradingWindowStart && date && date < gradingWindowStart) continue;
    // Codex MAJOR 3 fold (2026-05-20): defensive skip on malformed entries
    // — the loader only validates the top-level shape, so per-entry corruption
    // (missing unit / periods) reaches here. Per the contract, malformed data
    // must NEVER crash; just exclude the entry from the lessons[] output.
    if (!entry || typeof entry !== 'object' || typeof entry.unit !== 'number') continue;
    const periods = entry.periods && typeof entry.periods === 'object' ? entry.periods : {};
    const lessonResult = lessonMap.get(topicKey);

    result.push({
      lessonKey: topicKey,
      unit: entry.unit,
      worksheetKey: entry.worksheetKey,
      topicName: (topicNames && topicNames[topicKey]) || null,
      due: {
        B: periods.B || null, E: periods.E || null,
        ...('C' in periods ? { C: periods.C || null } : {}),
        ...('D' in periods ? { D: periods.D || null } : {}),
        ...('G' in periods ? { G: periods.G || null } : {}),
      },
      lessonGrade: lessonResult ? lessonResult.lessonGrade : null,
      // v3 Lessons-track value ({Cws, W} blend, quiz excluded) — the apples-to-apples
      // "Follow-Along" cell for the in-app/Schoology gradebook (worksheet blanks +
      // AI reflections). null when neither feeder is present.
      lessonGradeNoQuiz: lessonResult ? (lessonResult.lessonGradeNoQuiz != null ? lessonResult.lessonGradeNoQuiz : null) : null,
      // Keep no-ticket public responses byte-identical to the original engine.
      ...(lessonResult && lessonResult.exitBonus ? {
        exitBonus: lessonResult.exitBonus,
        exitCounted: lessonResult.exitCounted,
      } : {}),
      Cws: lessonResult ? (lessonResult.Cws !== undefined ? lessonResult.Cws : null) : null,
      W: lessonResult ? lessonResult.W : null,
      Q: lessonResult ? lessonResult.Q : null,
      // Total gradable quiz questions for this topic (from the answer key),
      // so the client can compute "% answered" = items.quiz.length / quizTotal.
      // Independent of what the student attempted; 0 when the topic has no quiz.
      quizTotal: quizTotals[topicKey] || 0,
      // Per-lesson Blooket score (0..100), surfaced for the Desk day-grade modal
      // + the grade coach; null when no game/flashcard score attached.
      blooket: lessonResult ? (lessonResult.blooket != null ? lessonResult.blooket : null) : null,
      // Whether this lesson HAS a Blooket at all (presence list), so
      // the coach can tell "Blooket not done yet" apart from "no Blooket exists".
      hasBlooket: blooketSet.has(topicKey),
      // M2d: enrichment topic (crosswalk bonus / BLOOKET_BONUS_TOPICS). Visible in
      // teacher dashboards as "bonus"; NEVER counts toward required Due (core 67).
      blooketBonus: bonusSet.has(topicKey),
      
      items: lessonResult
        ? {
            frq: lessonResult.frqItems.map(f => ({ itemId: f.itemId, score: f.score, ts: f.ts })),
            quiz: lessonResult.quizItems.map(q => ({ itemId: q.itemId, correct: q.correct, credit: q.credit, ts: q.ts })),
            worksheet: lessonResult.worksheetItems.map(w => ({ itemId: w.itemId, score: w.score !== undefined ? w.score : null, ts: w.ts })),
          }
        : { frq: [], quiz: [], worksheet: [] },
    });
  }

  return result;
}
