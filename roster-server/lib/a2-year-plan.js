// Shared by the Desk (calendar), scripts/build-a2-year-plan.mjs (year plan) and the
// roster server (teacher re-flow). Pure date math over the SY26-27 calendar definition
// (`def`: { range, periods: { C: { meetsDays } }, daysOff } — desk.html SCHEDULE_DEFS or
// data/a2-school-year.json, months 0-based in the arrays).
//
// A lesson window at the teacher's cadence (2026-09-17) is `weeks` calendar weeks: it
// opens on its first day and closes on the Friday of its last week. A window that would
// open on a Thursday or Friday opens the following Monday instead; a week with no meeting
// day (a vacation) is skipped; a closure inside the window shortens it. The due date is
// the last meeting day of the window. Each topic ends with an assessment day.
(function (root) {
  const pad = n => String(n).padStart(2, '0');
  const iso = dt => dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  const fromIso = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const fromArr = a => new Date(a[0], a[1], a[2], 12);

  function closureSet(daysOff) {
    const set = new Set();
    for (const entry of daysOff || []) {
      const first = fromArr(entry[0]), last = fromArr(entry[entry.length - 1]);
      for (let dt = new Date(first); dt <= last; dt.setDate(dt.getDate() + 1)) set.add(iso(dt));
    }
    return set;
  }
  function rangeEnd(def) { return iso(fromArr(def.range.end)); }
  function rangeStart(def) { return iso(fromArr(def.range.start)); }
  // Every meeting day of a section between two ISO dates inclusive.
  function meetingDays(def, section, fromDate, toDate) {
    const off = closureSet(def.daysOff);
    const meets = def.periods[section].meetsDays;
    const days = [];
    for (let dt = fromIso(fromDate); dt <= fromIso(toDate); dt.setDate(dt.getDate() + 1)) {
      if (meets.includes(dt.getDay()) && !off.has(iso(dt))) days.push(iso(dt));
    }
    return days;
  }
  function nextDay(isoDate) { const dt = fromIso(isoDate); dt.setDate(dt.getDate() + 1); return iso(dt); }
  // The Friday that closes the `weeks`-th calendar week of a window opening on `isoDate`.
  function fridayOf(isoDate, weeks) {
    const dt = fromIso(isoDate);
    const dow = dt.getDay();
    const toFriday = (5 - dow + 7) % 7 + (dow === 4 || dow === 5 ? 7 : 0);
    dt.setDate(dt.getDate() + toFriday + 7 * ((weeks || 1) - 1));
    return iso(dt);
  }
  // Meeting days of a `weeks`-week window opening on `from`, or null when the year is over.
  function weeksWindow(def, section, from, weeks) {
    const end = rangeEnd(def);
    let start = from;
    for (;;) {
      const closing = fridayOf(start, weeks);
      if (closing > end) return null;
      const window = meetingDays(def, section, start, closing);
      if (window.length) return window;
      start = nextDay(closing);
    }
  }
  // Re-dates one section from `lesson` onward: `lesson` is due on `due`, and every later
  // lesson in `order` (plan order, [{ key, topic }]) gets a fresh window, with an
  // assessment day after each topic's last lesson. `current` maps key -> effective
  // sections ({ C, D, G }) and `assessments` maps topic -> sections; other sections are
  // kept as they are. Returns full sections objects for every lesson and assessment that
  // changed, plus the keys that no longer fit in the year for this section.
  function reflowSection({ def, section, order, current, assessments, lesson, due, weeks, assessmentDays }) {
    weeks = weeks || 2; assessmentDays = assessmentDays == null ? 1 : assessmentDays;
    const index = order.findIndex(item => item.key === lesson);
    if (index < 0) throw new Error('Unknown lesson');
    const lastOfTopic = {};
    for (const item of order) lastOfTopic[item.topic] = item.key;
    const out = { lessons: {}, assessments: {}, unscheduled: [] };
    const end = rangeEnd(def);
    const set = (target, key, date) => {
      const sections = { ...(target[key] || {}) };
      if (date) sections[section] = date; else delete sections[section];
      return sections;
    };
    let cursor = nextDay(due);
    out.lessons[lesson] = set(current, lesson, due);
    const placeAssessment = topic => {
      const window = assessmentDays > 0 ? meetingDays(def, section, cursor, end).slice(0, assessmentDays) : [];
      const date = window.length === assessmentDays && assessmentDays > 0 ? window[window.length - 1] : null;
      out.assessments[topic] = set(assessments, topic, date);
      if (date) cursor = nextDay(date);
    };
    if (lastOfTopic[order[index].topic] === lesson) placeAssessment(order[index].topic);
    let overflow = false;
    for (const item of order.slice(index + 1)) {
      const window = overflow ? null : weeksWindow(def, section, cursor, weeks);
      if (!window) {
        overflow = true;
        out.lessons[item.key] = set(current, item.key, null);
        out.unscheduled.push(item.key);
        if (lastOfTopic[item.topic] === item.key && assessments[item.topic]) out.assessments[item.topic] = set(assessments, item.topic, null);
        continue;
      }
      const itemDue = window[window.length - 1];
      out.lessons[item.key] = set(current, item.key, itemDue);
      cursor = nextDay(itemDue);
      if (lastOfTopic[item.topic] === item.key) placeAssessment(item.topic);
    }
    return out;
  }
  root.A2YearPlan = { closureSet, meetingDays, nextDay, fridayOf, weeksWindow, reflowSection, rangeStart, rangeEnd, iso };
})(globalThis);
