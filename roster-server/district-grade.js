// Pure district arithmetic. Callers supply today (YYYY-MM-DD) for reproducibility.
export const A2_CATEGORIES = {
  assessments: { weight: 0.50, min: 4 },
  assignments: { weight: 0.40, min: 10 },
  engagement: { weight: 0.10, min: 10 },
};
export const A2_FEEDERS = {
  'lesson-check': { category: 'assessments', maxPoints: 10 },
  'try-it': { category: 'assignments', maxPoints: 2 },
  'topic-assessment': { category: 'assessments', maxPoints: 100 },
  flashcard: { category: 'engagement', maxPoints: 1 },
};

// Callers supply due items from one category (or one v3 source track).
export function selectOnlyRaiseBonus(items, bonusOnlyThrough) {
  const earnedPoints = item => item.attempted
    ? Math.min(item.maxPoints, Math.max(0, Number(item.points) || 0)) : 0;
  const isBonus = item => bonusOnlyThrough && item.dueDate <= bonusOnlyThrough;
  const members = items.filter(item => !isBonus(item));
  const excluded = items.filter(item => isBonus(item) && !item.attempted);
  const candidates = items.filter(item => isBonus(item) && item.attempted);
  candidates.sort((a, b) => earnedPoints(b) / b.maxPoints - earnedPoints(a) / a.maxPoints
    || b.maxPoints - a.maxPoints
    || (String(a.itemId) < String(b.itemId) ? -1 : String(a.itemId) > String(b.itemId) ? 1 : 0));
  let earned = members.reduce((sum, item) => sum + earnedPoints(item), 0);
  let possible = members.reduce((sum, item) => sum + item.maxPoints, 0);
  const ignored = [];
  for (const item of candidates) {
    const points = earnedPoints(item);
    // Cross multiplication avoids dividing the running average; equality counts.
    if (possible && points * possible < earned * item.maxPoints) {
      ignored.push(item);
      continue;
    }
    members.push(item);
    earned += points;
    possible += item.maxPoints;
  }
  return { members, excluded, ignored, earned, possible };
}

export function quarterGradeDistrict(items, quarter, cfg) {
  const window = typeof quarter === 'string' ? cfg.quarters[quarter] : quarter;
  if (!cfg.today) throw new Error('District grading requires cfg.today');
  const categories = cfg.a2Categories || A2_CATEGORIES;
  const inQuarter = (items || []).filter(item => window && item.dueDate >= window.start
    && item.dueDate <= window.end && Number.isFinite(item.maxPoints) && item.maxPoints > 0);
  const due = inQuarter.filter(item => cfg.dueAfterLessonDay
    ? item.dueDate < cfg.today : item.dueDate <= cfg.today);
  const categoryBreakdown = {};
  let earnedGrade = 0, presentWeight = 0, bestGrade = 0, bestWeight = 0;
  for (const [category, rule] of Object.entries(categories)) {
    const categoryDue = due.filter(item => item.category === category);
    const { members, excluded: bonusExcluded, ignored, earned, possible } =
      selectOnlyRaiseBonus(categoryDue, cfg.bonusOnlyThrough);
    const score = possible ? 100 * earned / possible : null;
    categoryBreakdown[category] = { score, earned, possible, count: members.length,
      bonusWindowExcluded: bonusExcluded.length,
      bonusWindowIgnored: { count: ignored.length, itemIds: ignored.map(item => item.itemId) },
      minimum: rule.min, minimumMet: members.length >= rule.min };
    if (possible) { earnedGrade += score * rule.weight; presentWeight += rule.weight; }
    const all = inQuarter.filter(item => item.category === category
      && !(cfg.today > window.end && cfg.bonusOnlyThrough
        && item.dueDate <= cfg.bonusOnlyThrough && !item.attempted));
    const allPossible = all.reduce((sum, item) => sum + item.maxPoints, 0);
    // Remaining includes unattempted overdue work and scheduled future work.
    // Completed work is held fixed; once the quarter closes no recovery remains.
    const best = all.reduce((sum, item) => {
      const remaining = cfg.today <= window.end && (!item.attempted || !categoryDue.includes(item));
      return sum + (remaining ? item.maxPoints : item.attempted
        ? Math.min(item.maxPoints, Math.max(0, Number(item.points) || 0)) : 0);
    }, 0);
    if (allPossible) { bestGrade += 100 * best / allPossible * rule.weight; bestWeight += rule.weight; }
  }
  return { quarterGrade: presentWeight ? earnedGrade / presentWeight : null,
    categoryBreakdown, ceiling: presentWeight && bestWeight ? Math.max(earnedGrade / presentWeight, bestGrade / bestWeight) : null,
    formula: 'district' };
}

export function yearGradeDistrict(quarters) {
  const values = Object.values(quarters).map(q => typeof q === 'number' ? q : q?.quarterGrade)
    .filter(value => typeof value === 'number' && Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
