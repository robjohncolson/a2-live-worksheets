import { computeDistrictGrade, districtItemsFromLedger } from './district-ledger.js';
import { combineV3, workAvgV3 } from './lesson-grade.js';
import { selectOnlyRaiseBonus, yearGradeDistrict } from './district-grade.js';

export function computeA2V3(rows, config, opts, today) {
  const grade = computeDistrictGrade(rows, config, opts, today);
  for (const [key, quarter] of Object.entries(grade.quarters)) {
    const all = grade.items.filter(item => item.quarter === key
      && !(today > config.quarters[key].end && config.bonusOnlyThrough
        && item.dueDate <= config.bonusOnlyThrough && !item.attempted));
    const due = [...new Set(all.map(item => item.source))].flatMap(source =>
      selectOnlyRaiseBonus(all.filter(item => item.due && item.source === source), config.bonusOnlyThrough).members);
    const average = (items, best = false) => items.length ? items.reduce((sum, item) => sum
      + (best && !item.attempted && today <= config.quarters[key].end ? 1 : item.points / item.maxPoints), 0) / items.length : null;
    const mastery = due.filter(item => item.source === 'topic-assessment');
    const track = (source, items, best) => average(items.filter(item => item.source === source), best);
    const work = (items, best = false) => workAvgV3({ lessons: track('try-it', items, best),
      quizzes: track('lesson-check', items, best), blooket: track('flashcard', items, best) }, config.v3WorkWeights);
    const pcAvg = average(mastery), workAvg = work(due);
    const value = combineV3(pcAvg, workAvg, config.v3Gates);
    const best = combineV3(average(all.filter(item => item.source === 'topic-assessment'), true), work(all, true), config.v3Gates);
    Object.assign(quarter, { formula: 'v3', quarterGrade: value == null ? null : value * 100,
      ceiling: value == null || best == null ? null : Math.max(value, best) * 100, masteryAvg: pcAvg == null ? null : pcAvg * 100,
      pcAvg: pcAvg == null ? null : pcAvg * 100, workAvg: workAvg == null ? null : workAvg * 100,
      pcAvgRaw: pcAvg, workAvgRaw: workAvg });
  }
  grade.formula = 'v3'; grade.yearGrade = yearGradeDistrict(grade.quarters);
  return grade;
}
