// Future seam: display teacher-entered packet grades read-only; never a student write.
window.A2_SHOW_TRYIT_GRADES = false;

function a2FocusedView() {
  if (sessionStorage.getItem('a2_preview_as_student') === '1' || sessionStorage.getItem('a2_view_as_context')) return true;
  const identity = window.rosterClient?.current();
  return !identity || identity.role !== 'teacher';
}

function a2StudentLine(dt) {
  return a2DayLogFor(dt).map(entry => entry.student || '').filter(Boolean).join(' · ');
}

function a2FocusTitle(inf) {
  if (inf.kind === 'assessment') return 'Topic ' + inf.u + ' Assessment';
  const lesson = window.A2Desk?.getLesson(inf.t);
  return String(inf.t).replace('.', '-') + ' · ' + (lesson?.title || inf.n || 'Lesson');
}

function a2FocusSentence() {
  const today = tdy();
  for (const row of S) {
    const date = new Date(row[0], row[1], row[2]);
    const inf = calendarEntry(row);
    if (date < today || !inf || typeof inf !== 'object' || !inf.t) continue;
    const line = a2StudentLine(date) || a2FocusTitle(inf);
    return (eq(date, today) ? 'Today: ' : 'Next class ' + date.toLocaleDateString('en-US', { weekday: 'long' }) + ': ') + line;
  }
  return 'Today: No class scheduled.';
}

function a2PaintFocusedCell(cell, date, inf, dateLabel, today) {
  cell.dataset.dts = +date;
  const end = new Date(today);
  end.setDate(today.getDate() - (today.getDay() + 6) % 7 + 11);
  const student = a2StudentLine(date);
  const assessment = inf?.kind === 'assessment';
  const quiz = /\bquiz\b/i.test(student) && !/review/i.test(student);
  const meeting = inf && typeof inf === 'object' && inf.t;
  if (date < today || !meeting || (date > end && !assessment && !quiz) || (inf.planned && !quiz)) {
    cell.classList.add('a2-quiet');
    return;
  }
  if (eq(date, today)) cell.classList.add('cell-today');
  const title = document.createElement('div');
  title.textContent = date > end && quiz ? student : a2FocusTitle(inf);
  cell.appendChild(title);
  if (student && date <= end) {
    const line = document.createElement('div');
    line.className = 'a2-student-line'; line.textContent = student; cell.appendChild(line);
  }
  cell.setAttribute('aria-label', cell.textContent);
  if (assessment || inf.planned) return;
  cell.dataset.topic = inf.t;
  cell.setAttribute('role', 'button'); cell.tabIndex = 0;
  cell.onclick = () => {
    hTip();
    _showA2ResourcePanel(inf, dateLabel, window.A2Desk?.getLesson(inf.t) || { title: inf.n });
  };
  cell.onkeydown = event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); cell.click(); }
  };
}
