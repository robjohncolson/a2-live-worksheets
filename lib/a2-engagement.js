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

export function combine(a, b, cap = 1) {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.min(cap, Math.max(a, b) + 0.5 * Math.min(a, b));
}

export function dayPoints(score, config) {
  if (score == null) return null;
  return Math.round(score * config.pointsPerDay * 2) / 2;
}
