// Daily Schoology engagement only; independent of the Desk grade engine.
function unitScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function blooketScore({ correct, answered }, config) {
  if (!Number.isFinite(answered) || answered <= 0) return 0;
  const accuracy = unitScore(correct / answered);
  const participation = unitScore(answered / config.questionsForFullParticipation);
  return unitScore(config.accuracyWeight * accuracy + config.participationWeight * participation);
}

export function flashcardScore({ correct, total }) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return unitScore(correct / total);
}

// Paper Do Now / exit ticket checked in the room: raw score out of the day's total.
export function paperScore({ score, outOf }) {
  if (!Number.isFinite(outOf) || outOf <= 0) return 0;
  return unitScore(score / outOf);
}

export function combine(a, b, cap = 1) {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.min(cap, Math.max(a, b) + 0.5 * Math.min(a, b));
}

// Any number of sources for one day: the best one plus half the second best, capped.
// A day with no source at all stays null (absent, never auto-zero).
export function combineAll(scores, cap = 1) {
  const present = scores.filter(score => score != null).sort((a, b) => b - a);
  if (!present.length) return null;
  if (present.length === 1) return present[0];
  return Math.min(cap, present[0] + 0.5 * present[1]);
}

export function dayPoints(score, config) {
  if (score == null) return null;
  return Math.round(score * config.pointsPerDay * 2) / 2;
}
