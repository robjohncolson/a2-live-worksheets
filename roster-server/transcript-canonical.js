import crypto from 'node:crypto';

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

function normalizeNumber(value) {
  if (!Number.isFinite(value)) {
    throw new TypeError('Transcript canonicalization rejects NaN and Infinity');
  }
  return value;
}

function stableArrayKey(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return String(value.lessonKey ?? value.itemId ?? value.key ?? JSON.stringify(canonicalValue(value)));
  }
  return JSON.stringify(canonicalValue(value));
}

export function canonicalValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number') return normalizeNumber(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value
      .map(canonicalValue)
      .filter((v) => v !== undefined)
      .sort((a, b) => stableArrayKey(a).localeCompare(stableArrayKey(b)));
  }

  const out = {};
  for (const key of Object.keys(value).sort()) {
    const v = canonicalValue(value[key]);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

export function canonicalizeTranscript(value) {
  return JSON.stringify(canonicalValue(value));
}

function roundedLeaf(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number') return round1(normalizeNumber(value));
  if (Array.isArray(value)) return value.map(roundedLeaf).filter((v) => v !== undefined);
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      const v = roundedLeaf(value[key]);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  return value;
}

export function transcriptGradeProjection(grade) {
  const src = grade && typeof grade === 'object' ? grade : {};
  return roundedLeaf({
    units: src.units || {},
    quarters: src.quarters || {},
    completion: src.completion || {},
    lessons: Array.isArray(src.lessons) ? src.lessons : [],
  });
}

export function hashTranscriptGradeProjection(grade) {
  return crypto
    .createHash('sha256')
    .update(canonicalizeTranscript(transcriptGradeProjection(grade)), 'utf8')
    .digest('hex');
}
