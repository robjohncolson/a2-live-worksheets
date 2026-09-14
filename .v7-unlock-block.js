// .v7-unlock-block.js - Pure logic for v7 summer gating + hash-based unlock codes + AP date auto-roll.
// Safe to paste inside study_guide_diagnostic.html's main IIFE; also runnable
// under Node via: new Function('window', src + '; return window.__studyGuideV7__;')({}).

(function(window) {
  'use strict';

  // Salt shared with teacher-code-generator.html — both must match exactly.
  const UNLOCK_SALT = 'apstats-unlock-v1-3f9a2c';

  // Crockford Base32 alphabet — no I/L/O/U to avoid ambiguity in hand-typed codes.
  const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  // Number of units in the curriculum. Must match UNIT_COUNT in study_guide_diagnostic.html.
  const UNIT_COUNT = 9;

  // --- normalization helpers ---

  // Trim, lowercase, collapse interior whitespace.
  function normalizeUnlockInput(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  // Uppercase, strip spaces and dashes, then map ambiguous chars: I→1, L→1, O→0.
  function normalizeCodeInput(s) {
    return String(s || '')
      .toUpperCase()
      .replace(/[\s\-]/g, '')
      .replace(/I/g, '1')
      .replace(/L/g, '1')
      .replace(/O/g, '0');
  }

  // --- Crockford Base32 encoder ---

  // Encodes a Uint8Array to a Crockford Base32 string.
  // Processes 5 bits at a time from the MSB side.
  function crockfordBase32(bytes) {
    let result = '';
    let buffer = 0;
    let bitsInBuffer = 0;
    let i;

    for (i = 0; i < bytes.length; i += 1) {
      buffer = (buffer << 8) | bytes[i];
      bitsInBuffer += 8;

      while (bitsInBuffer >= 5) {
        bitsInBuffer -= 5;
        result += CROCKFORD[(buffer >> bitsInBuffer) & 0x1f];
      }
    }

    if (bitsInBuffer > 0) {
      result += CROCKFORD[(buffer << (5 - bitsInBuffer)) & 0x1f];
    }

    return result;
  }

  // --- code generation + verification ---

  // SHA-256 of "${UNLOCK_SALT}|${normalizedUsername}|${unit}",
  // Crockford-encoded, first 6 chars, uppercase.
  async function generateUnlockCode(username, unit) {
    const payload = UNLOCK_SALT + '|' + normalizeUnlockInput(username) + '|' + unit;
    const bytes = new TextEncoder().encode(payload);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return crockfordBase32(new Uint8Array(digest)).slice(0, 6).toUpperCase();
  }

  // Returns true if inputCode (after normalization) matches the expected code for username/unit.
  async function verifyUnlockCode(inputCode, username, unit) {
    const normalized = normalizeCodeInput(inputCode);
    const expected = await generateUnlockCode(username, unit);
    return normalized === expected;
  }

  // --- unit access helpers ---

  // Returns true when the given unit is accessible for this state.
  // Absent curriculumMode or 'full' → always true.
  // 'gated' → unit must be in unlockedUnits.
  function isUnitUnlocked(unit, state) {
    if (!state || state.curriculumMode !== 'gated') return true;
    const list = Array.isArray(state.unlockedUnits) ? state.unlockedUnits : [];
    return list.includes(Number(unit));
  }

  // Returns the smallest unit in [1..UNIT_COUNT] not yet in unlockedUnits,
  // or null if the mode isn't gated or all units are unlocked.
  function nextLockedUnit(state) {
    if (!state || state.curriculumMode !== 'gated') return null;
    const unlocked = new Set((state.unlockedUnits || []).map(Number));
    let u;

    for (u = 1; u <= UNIT_COUNT; u += 1) {
      if (!unlocked.has(u)) return u;
    }

    return null;
  }

  // --- unlock flow ---

  // Applies an unlock code to state. Always verifies against nextLockedUnit.
  // Returns { ok, reason?, unlockedUnit?, attemptedUnit? }.
  // On success, mutates state.unlockedUnits (sorted) — caller must call saveSoon().
  async function applyUnlockCode(inputCode, state) {
    if (!state || state.curriculumMode !== 'gated') {
      return { ok: false, reason: 'not-gated' };
    }

    const nextUnit = nextLockedUnit(state);

    if (!nextUnit) {
      return { ok: false, reason: 'already-fully-unlocked' };
    }

    const valid = await verifyUnlockCode(inputCode, state.studentUsername, nextUnit);

    if (!valid) {
      return { ok: false, reason: 'invalid-code', attemptedUnit: nextUnit };
    }

    state.unlockedUnits = [...(state.unlockedUnits || []), nextUnit].sort((a, b) => a - b);
    return { ok: true, unlockedUnit: nextUnit };
  }

  // --- AP exam date auto-roll ---

  // Returns 'YYYY-05-07' for the current or next year depending on whether
  // May 7 has already passed. Passing `today` allows deterministic testing.
  function computeApExamDate(today) {
    const ref = today instanceof Date ? today : new Date();
    const year = ref.getFullYear();
    // Roll over at midnight May 8 so all of May 7 (the exam day) stays on the current year.
    const rolloverPoint = new Date(year + '-05-08T00:00:00');
    return ref >= rolloverPoint ? (year + 1) + '-05-07' : year + '-05-07';
  }

  // --- export ---
  window.__studyGuideV7__ = {
    UNLOCK_SALT: UNLOCK_SALT,
    UNIT_COUNT: UNIT_COUNT,
    normalizeUnlockInput: normalizeUnlockInput,
    normalizeCodeInput: normalizeCodeInput,
    crockfordBase32: crockfordBase32,
    generateUnlockCode: generateUnlockCode,
    verifyUnlockCode: verifyUnlockCode,
    isUnitUnlocked: isUnitUnlocked,
    nextLockedUnit: nextLockedUnit,
    applyUnlockCode: applyUnlockCode,
    computeApExamDate: computeApExamDate
  };
})(typeof window !== 'undefined' ? window : globalThis);
