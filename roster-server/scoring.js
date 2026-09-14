

// blooketScore -- the authoritative per-student per-Blooket score on [0,1].
// SINGLE SOURCE OF TRUTH: the POST /class/blooket endpoint, the import tool, and
// the unit tests all import THIS function (BLOOKET_IMPORT_P2_BUILD.md section 1).
//
//   given correct, attempted, and the Blooket's total questions:
//     attempted <= 0           -> 0  (a no-show / walkaway records an honest 0)
//     acc = correct / attempted
//     cov = min(1, attempted / total)   (walkaway penalty; over-total -> pure acc)
//     score = clamp(acc * cov, 0, 1)    (== correct/total when attempted <= total)
//
// Worked: 30/30 of 30 -> 1.0 ; 20/25 of 30 -> 0.6667 ; 15/15 of 30 -> 0.5 ;
//         33/35 of 30 -> 0.9429 ; 0 attempted -> 0.
export function blooketScore(correct, attempted, total) {
  const c = Number(correct);
  const a = Number(attempted);
  const t = Number(total);
  if (!Number.isFinite(a) || a <= 0) return 0;
  if (!Number.isFinite(c) || c < 0) return 0;
  if (!Number.isFinite(t) || t <= 0) return 0;
  const acc = c / a;
  const cov = Math.min(1, a / t);
  const score = acc * cov;
  return Math.min(1, Math.max(0, score));
}

// Normalize a jsonb `response` to a comparable scalar string. DN2d records
// `response: answer` where `answer` is cr's letter-style value (cr's own
// checkIfAnswerCorrect compares String(value).trim().toLowerCase() to the
// letter answerKey). Tolerate string | {value|answer|selected|choice} | array.
export function normalizeResponse(response) {
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

// Mirror cr's checkIfAnswerCorrect exactly: trim + lowercase string equality.
export function isCorrect(response, answerKey) {
  const r = normalizeResponse(response);
  if (r == null || answerKey == null) return false;
  return r === String(answerKey).trim().toLowerCase();
}

function rowStableId(row) {
  return String(row?.ledger_id || row?.receipt_id || '');
}

// Stable row order for deterministic grading. Same item/attempt/timestamp ties
// are ordered by ledger_id, falling back to receipt_id for imported rows.
export function stableLedgerSort(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const itemCmp = String(a?.item_id || '').localeCompare(String(b?.item_id || ''));
    if (itemCmp !== 0) return itemCmp;
    const attemptCmp = (Number(a?.attempt) || 0) - (Number(b?.attempt) || 0);
    if (attemptCmp !== 0) return attemptCmp;
    const timeCmp = (Date.parse(a?.recorded_at || '') || 0) - (Date.parse(b?.recorded_at || '') || 0);
    if (timeCmp !== 0) return timeCmp;
    return rowStableId(a).localeCompare(rowStableId(b));
  });
}

// Keep only the authoritative attempt per item_id: highest `attempt`, tie
// broken by latest `recorded_at`, then lexicographic ledger_id/receipt_id.
// Defensive against missing fields.
export function latestPerItem(rows) {
  const best = new Map();
  for (const row of rows) {
    const id = row?.item_id;
    if (typeof id !== 'string' || !id) continue;
    const cur = best.get(id);
    if (!cur) { best.set(id, row); continue; }
    const a = Number(row.attempt) || 0;
    const b = Number(cur.attempt) || 0;
    if (a > b) { best.set(id, row); continue; }
    if (a === b) {
      const at = Date.parse(row.recorded_at || '') || 0;
      const bt = Date.parse(cur.recorded_at || '') || 0;
      if (at > bt) best.set(id, row);
      if (at === bt && rowStableId(row) >= rowStableId(cur)) best.set(id, row);
    }
  }
  return [...best.values()];
}

// Unit label for aggregation: prefer the answer-key entry's unit, else derive
// "U{n}" from the id (matches DN2d's `unit: 'U'+n` convention and DN2b's
// WS-U{n}.../U{n}-... ids). Returns "U?" when nothing parses.
export function unitOf(itemId, keyEntry) {
  if (keyEntry && keyEntry.unit != null && String(keyEntry.unit).trim() !== '') {
    return `U${String(keyEntry.unit).replace(/^U/i, '')}`;
  }
  const m = String(itemId).match(/U(\d+)[-L]/i);
  return m ? `U${m[1]}` : 'U?';
}

// Validate the bundled answer-key doc shape (fail CLOSED on parseable-but-wrong;
// substituting {} would silently mark everything ungradable — Codex MAJOR from
// Phase 2). A sparse object is fine (a MISSING key → ungradable by design), but
// a PRESENT-but-corrupt entry (e.g. 42, "x", []) must fail closed too, else
// answer-key corruption silently degrades to ungradable-200 (Codex Phase-3
// MAJOR). Valid entry = a non-null object whose `answerKey` is string|number
// |null (null = an objectively-unscorable FRQ entry, by design).
export function answerKeyMapOrNull(answerKeyDoc) {
  if (
    !answerKeyDoc ||
    typeof answerKeyDoc !== 'object' ||
    !answerKeyDoc.answerKey ||
    typeof answerKeyDoc.answerKey !== 'object' ||
    Array.isArray(answerKeyDoc.answerKey)
  ) {
    return null;
  }
  const map = answerKeyDoc.answerKey;
  for (const k of Object.keys(map)) {
    const e = map[k];
    if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
    const ak = e.answerKey;
    if (ak !== null && typeof ak !== 'string' && typeof ak !== 'number') return null;
  }
  return map;
}

// Validate the bundled skill-map (build-skill-map.mjs output: id → entry).
// Fail CLOSED on parseable-but-wrong so corruption can't silently empty the
// diagnostic (Codex Phase-3 MAJOR). The bundled map is NEVER empty (3449+
// keys; bundle-parity guards it) ⇒ {} = load corruption → reject. A valid
// entry is a non-null object; `skill` may be a string OR null/absent
// (unresolved tags are valid and excluded downstream, per the tagging spec).
export function skillMapValidOrNull(skillMap) {
  if (!skillMap || typeof skillMap !== 'object' || Array.isArray(skillMap)) {
    return null;
  }
  const keys = Object.keys(skillMap);
  if (keys.length === 0) return null;
  for (const k of keys) {
    const e = skillMap[k];
    if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
    if (e.skill !== null && e.skill !== undefined && typeof e.skill !== 'string') return null;
  }
  return skillMap;
}

export function scoreAgainstKey(rows, answerKey) {
  const units = {};
  const ensure = (u) =>
    (units[u] || (units[u] = { attempted: 0, graded: 0, correct: 0, ungradable: 0 }));

  for (const row of latestPerItem(rows)) {
    const itemId = row.item_id;
    const keyEntry = answerKey[itemId];
    const u = ensure(unitOf(itemId, keyEntry));
    u.attempted += 1;
    if (!keyEntry || keyEntry.answerKey == null) {
      u.ungradable += 1;
      continue;
    }
    u.graded += 1;
    if (isCorrect(row.response, keyEntry.answerKey)) u.correct += 1;
  }

  const totals = { attempted: 0, graded: 0, correct: 0, ungradable: 0 };
  for (const u of Object.keys(units)) {
    const x = units[u];
    x.pct = x.graded > 0 ? Math.round((x.correct / x.graded) * 1000) / 10 : null;
    totals.attempted += x.attempted;
    totals.graded += x.graded;
    totals.correct += x.correct;
    totals.ungradable += x.ungradable;
  }
  totals.pct = totals.graded > 0
    ? Math.round((totals.correct / totals.graded) * 1000) / 10
    : null;

  return { units, totals };
}


