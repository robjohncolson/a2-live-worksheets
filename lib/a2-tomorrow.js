// The nightly "Tomorrow" draft for one Algebra 2 section-day (FABLE_SPRINT_2026_10_22D_SPEC D0).
//
// Deterministic, no LLM: everything in the note is copied from the day log
// (content/a2/day-log.json), the lesson prep (content/a2/lesson-prep.json), the lesson
// skills (content/a2/lesson-skills.json), the IXL skill map and the latest Class Log
// summary. Teacher rule (2026-10-22): a Do Now is never a new task. It is a Group Jam on
// an assigned IXL skill, or a kept packet example / practice item not yet done. The note
// follows the existing class format (IXL skills, then the packet, then the quiz) and
// never adds an activity.
//
// Shared by scripts/draft-tomorrow.mjs (node: `import '../lib/a2-tomorrow.js'`, then
// globalThis.A2Tomorrow) and desk.html's "Tomorrow" fold (window.A2Tomorrow).
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.A2Tomorrow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var JAM = /\bjams?\b/i;
  var CODE = /\b[0-9A-Z]{3}\b/g;
  // A clause that says the thing did NOT happen (or moved to another day).
  var NEGATED = /\b(not|no time|dropped|skipped|move[sd]?|moving|postponed|waits?|optional|if time)\b/i;

  function clauses(text) {
    return String(text || '').split(/[.;]\s+|\n/).map(function (c) { return c.trim(); }).filter(Boolean);
  }

  // "Examples 4 and 5", "Examples 1-3", "Example 5", "Ex 4" -> [4, 5] / [1, 2, 3] / [5] / [4].
  function exampleNumbers(clause) {
    var out = [];
    var re = /\bEx(?:ample)?s?\.?\s+((?:\d+)(?:\s*(?:,|and|&|-|–)\s*\d+)*)/gi;
    var m;
    while ((m = re.exec(clause))) {
      var list = m[1];
      var range = list.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (range) {
        for (var n = Number(range[1]); n <= Number(range[2]); n++) out.push(n);
        continue;
      }
      (list.match(/\d+/g) || []).forEach(function (d) { out.push(Number(d)); });
    }
    return out;
  }

  // "practice item 27", "item 27", "P&PS 27", "practice 17" -> [27] / [17].
  function itemNumbers(clause) {
    var out = [];
    var re = /\b(?:practice(?:\s+items?)?|items?|P&PS)\s+((?:\d+)(?:\s*(?:,|and|&)\s*\d+)*)/gi;
    var m;
    while ((m = re.exec(clause))) (m[1].match(/\d+/g) || []).forEach(function (d) { out.push(Number(d)); });
    return out;
  }

  // The section's past days of one lesson, oldest first. A past day's `note` is what landed;
  // a past day with only a `plan` is read the same way (the teacher writes the outcome into
  // the plan before the nightly procedure moves it to a note) but is flagged unconfirmed.
  function landed(dayLog, section, lesson, before) {
    return ((dayLog && dayLog.entries) || []).filter(function (e) {
      return e && e.section === section && (!lesson || e.lesson === lesson) && (e.note || e.plan) && (!before || e.date < before);
    }).sort(function (a, b) { return a.date.localeCompare(b.date); })
      .map(function (e) { return { date: e.date, text: e.note || e.plan, unconfirmed: !e.note }; });
  }

  // What the past notes say was done: IXL codes jammed (`jamEntries`: every past day of the
  // section, since a Jam logged under the previous lesson is still that skill's Jam),
  // examples shown and practice items worked (`entries`: this lesson's days). A clause
  // counts only when it is not negated ("W67 not reached", "Example 5 moves to Monday").
  function done(entries, codes, jamEntries) {
    var skills = {}, examples = {}, items = {};
    var known = {};
    (codes || []).forEach(function (c) { known[c] = true; });
    (jamEntries || entries).forEach(function (e) {
      clauses(e.text).forEach(function (clause) {
        if (NEGATED.test(clause) || !JAM.test(clause)) return;
        (clause.match(CODE) || []).forEach(function (c) { if (known[c]) skills[c] = e.date; });
      });
    });
    entries.forEach(function (e) {
      clauses(e.text).forEach(function (clause) {
        if (NEGATED.test(clause)) return;
        exampleNumbers(clause).forEach(function (n) { examples[n] = e.date; });
        itemNumbers(clause).forEach(function (n) { items[n] = e.date; });
      });
    });
    return { skills: skills, examples: examples, items: items };
  }

  // The lesson's assigned IXL skills (content/a2/lesson-skills.json, the authored assignment;
  // a code that only the lesson prep proposes is not assigned) in jam order: core skills by
  // the example they back, then the prerequisites. One entry per code.
  function assignedSkills(lessonSkills) {
    var seen = {}, out = [];
    (lessonSkills || []).forEach(function (s, i) {
      if (!s || !s.code || seen[s.code]) return;
      seen[s.code] = true;
      var ex = Array.isArray(s.example) ? s.example[0] : s.example;
      out.push({ code: s.code, name: s.name || s.code, url: s.url || null, directoryId: s.directoryId || null,
        level: s.level === 'prereq' ? 'prereq' : 'core', example: ex || null, index: i });
    });
    out.sort(function (a, b) {
      if (a.level !== b.level) return a.level === 'core' ? -1 : 1;
      if (a.example && b.example && a.example !== b.example) return a.example - b.example;
      if (!!a.example !== !!b.example) return a.example ? -1 : 1;
      return a.index - b.index;
    });
    return out;
  }

  function skillPage(skill, lookup) {
    var mapped = lookup ? lookup(skill.code) : null;
    if (skill.url) return skill.url;
    if (mapped && mapped.url) return mapped.url;
    if (mapped && mapped.search) return mapped.search;
    return 'https://www.ixl.com/search?q=' + skill.code;
  }

  function jamText(skill, lookup) {
    return 'Group Jam: ' + skill.code + ' ' + skill.name + ' (' + skillPage(skill, lookup) + ')';
  }

  function keptExamples(prep) {
    return prep && Array.isArray(prep.examples) ? prep.examples.filter(function (e) { return e && e.keep; }) : [];
  }

  // The Do Now, in rule order: the assigned skill the day's own day-log plan names as a Jam,
  // else the Jam tied to the next kept example not yet done, else the first assigned skill
  // not yet jammed, else the next kept example, else the DOK 3 item. Returns null only when
  // the lesson has nothing assigned and nothing kept.
  function chooseDoNow(ctx) {
    var skills = ctx.skills, d = ctx.done, lookup = ctx.skillLookup;
    var byCode = {};
    skills.forEach(function (s) { byCode[s.code] = s; });
    var planned = clauses(ctx.planLine).filter(function (c) { return JAM.test(c) && !NEGATED.test(c); });
    for (var p = 0; p < planned.length; p++) {
      var named = (planned[p].match(CODE) || []).filter(function (c) { return byCode[c]; });
      if (named.length) return { kind: 'jam', code: named[0], text: jamText(byCode[named[0]], lookup), why: 'the Jam named in the day log plan for this day' };
    }
    var nextExamples = keptExamples(ctx.prep).filter(function (e) { return !d.examples[e.n]; });
    for (var i = 0; i < nextExamples.length; i++) {
      var codes = nextExamples[i].ixl || [];
      for (var j = 0; j < codes.length; j++) {
        var s = byCode[codes[j]];
        if (s && !d.skills[s.code]) return { kind: 'jam', code: s.code, text: jamText(s, lookup), why: 'IXL skill for Example ' + nextExamples[i].n + ', the next kept example' };
      }
    }
    var unfinished = skills.filter(function (s) { return !d.skills[s.code]; });
    if (unfinished.length) return { kind: 'jam', code: unfinished[0].code, text: jamText(unfinished[0], lookup), why: 'first assigned IXL skill not yet jammed' };
    if (nextExamples.length) {
      var ex = nextExamples[0];
      return { kind: 'packet', example: ex.n, text: 'Packet: Example ' + ex.n + ' (' + ex.title + ')', why: 'every assigned skill is jammed; next kept example' };
    }
    var dok3 = ctx.prep && ctx.prep.dok3;
    if (dok3 && dok3.item && !d.items[dok3.item]) return { kind: 'packet', item: dok3.item, text: 'Packet: practice item ' + dok3.item + ' (DOK 3)', why: 'every example is done; the DOK 3 item is left' };
    return null;
  }

  // Day-log entries for a section (and lesson) dated on or after `date` whose headline is a
  // quiz or assessment: the short `student` line, else the first clause of the plan or note.
  // A plan that only mentions a quiz ("quiz Q4", "Quiz Tuesday") is not a quiz day.
  function plannedDates(dayLog, section, lesson, date, pattern) {
    return ((dayLog && dayLog.entries) || []).filter(function (e) {
      if (!e || e.section !== section || (lesson && e.lesson !== lesson) || e.date < date) return false;
      var headline = e.student || clauses(e.note || e.plan)[0] || '';
      return pattern.test(headline);
    }).map(function (e) { return e.date; }).sort();
  }

  function draft(input) {
    var date = input.date, section = input.section, lesson = input.lesson;
    var prep = input.prep || null;
    var lessonSkills = input.lessonSkills || [];
    var dayLog = input.dayLog || { entries: [] };
    var skills = assignedSkills(lessonSkills);
    var entries = landed(dayLog, section, lesson, date);
    var d = done(entries, skills.map(function (s) { return s.code; }), landed(dayLog, section, null, date));
    var todayEntry = ((dayLog.entries) || []).filter(function (e) { return e && e.section === section && e.date === date; })[0] || null;
    var kept = keptExamples(prep);
    var then = kept.filter(function (e) { return !d.examples[e.n]; }).map(function (e) {
      var codes = (e.ixl || []).map(function (c) {
        var s = skills.filter(function (x) { return x.code === c; })[0];
        return s ? c + ' ' + s.name + (d.skills[c] ? ' (jammed ' + d.skills[c] + ')' : '') : c;
      });
      return { n: e.n, title: e.title, practice: e.practice || '', ixl: codes };
    });
    var jamsLeft = skills.filter(function (s) { return !d.skills[s.code]; });
    var left = [];
    kept.forEach(function (e) {
      if (!d.examples[e.n]) left.push('Example ' + e.n + (e.practice ? ' (practice ' + e.practice + ')' : ''));
    });
    if (prep && prep.dok3 && prep.dok3.item && !d.items[prep.dok3.item]) left.push('Practice item ' + prep.dok3.item + ' (DOK 3: ' + (prep.dok3.label || '') + ')');
    var topic = String(lesson).split('-')[0];
    var quizDates = plannedDates(dayLog, section, lesson, date, /\bquiz\b/i);
    var assessmentDates = plannedDates(dayLog, section, null, date, new RegExp('Topic ' + topic + ' Assessment', 'i'));
    var planAssessment = input.plan && input.plan.assessments && input.plan.assessments[topic] ? input.plan.assessments[topic][section] : null;
    var summary = input.summary || null;
    return {
      date: date, section: section, lesson: lesson,
      title: (prep && prep.title) || input.title || '',
      dayNumber: entries.length + 1,
      planLine: todayEntry ? (todayEntry.note || todayEntry.plan || todayEntry.student || '') : '',
      planIsLanded: !!(todayEntry && todayEntry.note),
      doNow: chooseDoNow({ skills: skills, done: d, prep: prep, skillLookup: input.skillLookup, planLine: todayEntry && !todayEntry.note ? todayEntry.plan : '' }),
      unconfirmed: entries.filter(function (e) { return e.unconfirmed; }).map(function (e) { return e.date; }),
      then: then,
      jamsLeft: jamsLeft.map(function (s) { return s.code + ' ' + s.name; }),
      quizTarget: prep && prep.quizFocus ? { item: prep.quizFocus.item, what: prep.quizFocus.what || '' } : null,
      quizDate: quizDates[0] || null,
      assessmentDate: assessmentDates[0] || planAssessment || null,
      assessmentSource: assessmentDates[0] ? 'day log' : (planAssessment ? 'year plan' : null),
      promises: summary && Array.isArray(summary.promises) ? summary.promises.slice() : [],
      questions: summary && Array.isArray(summary.studentQuestions) ? summary.studentQuestions.slice() : [],
      summaryDate: summary ? summary.date : null,
      left: left,
      hasPrep: !!prep,
      done: d,
    };
  }

  function pretty(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  // The one-screen note: Do Now, Then, Quiz target, Promises / questions, Left in the packet.
  function renderMarkdown(note) {
    var lines = ['# Section ' + note.section + ' · ' + pretty(note.date) + ' · ' + note.lesson + (note.title ? ' ' + note.title : '') + ' · day ' + note.dayNumber, ''];
    if (note.planLine) lines.push('*' + (note.planIsLanded ? 'Day log (landed): ' : 'Day log plan: ') + note.planLine + '*', '');
    if (note.unconfirmed && note.unconfirmed.length) lines.push('*Read as landed but not confirmed (a plan with no landed note yet): ' + note.unconfirmed.join(', ') + '.*', '');
    lines.push('## Do Now');
    lines.push(note.doNow ? '- ' + note.doNow.text + ' — ' + note.doNow.why : '- Nothing assigned or kept for ' + note.lesson + ' yet (no lesson-prep entry and no IXL skills); add them first.');
    lines.push('', '## Then');
    if (!note.hasPrep) lines.push('- No lesson-prep entry for ' + note.lesson + ' (content/a2/lesson-prep.json); kept examples unknown.');
    note.then.forEach(function (e) { lines.push('- Example ' + e.n + ': ' + e.title + (e.ixl.length ? ' — IXL ' + e.ixl.join(', ') : '') + (e.practice ? ' (practice ' + e.practice + ')' : '')); });
    if (note.hasPrep && !note.then.length) lines.push('- Every kept example is in the day log.');
    if (note.jamsLeft.length) lines.push('- Jams left: ' + note.jamsLeft.join('; '));
    lines.push('', '## Quiz target');
    if (note.quizTarget) lines.push('- Lesson quiz item ' + note.quizTarget.item + ': ' + note.quizTarget.what);
    else lines.push('- No quiz focus in the lesson prep for ' + note.lesson + '.');
    lines.push('- Quiz day: ' + (note.quizDate ? pretty(note.quizDate) : 'not in the day log'));
    lines.push('- Topic assessment: ' + (note.assessmentDate ? pretty(note.assessmentDate) + ' (' + note.assessmentSource + ')' : 'not dated'));
    lines.push('', '## Promises / questions' + (note.summaryDate ? ' (recording of ' + note.summaryDate + ')' : ''));
    if (!note.summaryDate) lines.push('- No recording summary for this section.');
    note.promises.forEach(function (p) { lines.push('- Promise: ' + p); });
    note.questions.forEach(function (q) { lines.push('- Asked: ' + q); });
    if (note.summaryDate && !note.promises.length && !note.questions.length) lines.push('- The summary lists no promises or student questions.');
    lines.push('', '## Left in the packet');
    if (!note.hasPrep) lines.push('- Unknown until ' + note.lesson + ' has a lesson-prep entry.');
    note.left.forEach(function (item) { lines.push('- ' + item); });
    if (note.hasPrep && !note.left.length) lines.push('- Nothing: every kept item is in the day log.');
    return lines.join('\n') + '\n';
  }

  // Desk fold: renders the note as plain lines under a <details> (first child is the <summary>).
  function render(doc, fold, note) {
    while (fold.lastChild && fold.lastChild !== fold.firstChild) fold.removeChild(fold.lastChild);
    renderMarkdown(note).split('\n').forEach(function (raw) {
      if (!raw.trim() || raw.charAt(0) === '#' && raw.indexOf('## ') !== 0) return;
      var p = doc.createElement('p');
      if (raw.indexOf('## ') === 0) { p.className = 'a2-rec-label'; p.textContent = raw.slice(3); }
      else { p.textContent = raw.replace(/^[-*]\s*/, '').replace(/^\*|\*$/g, ''); }
      fold.appendChild(p);
    });
  }

  // Desk fold: the latest recording summary of the section in the two weeks before `date`,
  // GET /teacher/summaries with the teacher token (as lib/class-log-summary.js), else null.
  function latestRecording(win, date, section) {
    var rc = win.rosterClient, who = rc && rc.current && rc.current();
    var token = who && who.role === 'teacher' && typeof rc.token === 'function' ? rc.token() : null;
    if (!token || !win.ROSTER_SERVICE_URL) return Promise.resolve(null);
    var from = new Date(date + 'T12:00:00Z'); from.setUTCDate(from.getUTCDate() - 14);
    var to = new Date(date + 'T12:00:00Z'); to.setUTCDate(to.getUTCDate() - 1);
    var url = win.ROSTER_SERVICE_URL + '/teacher/summaries?from=' + from.toISOString().slice(0, 10) + '&to=' + to.toISOString().slice(0, 10);
    return win.fetch(url, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (body) {
        var rows = (body && body.summaries || []).filter(function (r) { return r && r.section === section && r.course === 'algebra2' && r.date < date; });
        rows.sort(function (a, b) { return a.date.localeCompare(b.date); });
        return rows.pop() || null;
      })
      .catch(function () { return null; });
  }

  // Fill a <details> fold (first child is the <summary>) with the draft for one section-day.
  // `input` is the draft() input without `summary`; the recording is fetched here.
  function fill(win, fold, input) {
    render(win.document, fold, draft(input));
    return latestRecording(win, input.date, input.section).then(function (summary) {
      if (summary) render(win.document, fold, draft(Object.assign({}, input, { summary: summary })));
    });
  }

  return { draft: draft, renderMarkdown: renderMarkdown, render: render, fill: fill, latestRecording: latestRecording, chooseDoNow: chooseDoNow, done: done, landed: landed,
    assignedSkills: assignedSkills, exampleNumbers: exampleNumbers, itemNumbers: itemNumbers, clauses: clauses, jamText: jamText };
});
