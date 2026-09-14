// Canonical, dependency-free E/P/I parser shared by live and sweep grading.
export function verdictToScore(verdict, missing) {
  const rawScore = verdict && typeof verdict === 'object' ? verdict.score : verdict;
  const missingElements = verdict && typeof verdict === 'object' ? verdict.missing : missing;
  const letter = rawScore == null ? '' : String(rawScore).trim().charAt(0).toUpperCase();
  if (!(letter === 'E' || letter === 'P' || letter === 'I')) return null;
  if (letter === 'P' && Array.isArray(missingElements) && missingElements.length === 0) return 1;
  return { E: 1, P: 0.5, I: 0 }[letter];
}
