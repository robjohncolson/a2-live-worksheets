# LESSON_GATE_BUILD.md — frozen contract (session 103)

> Two changes to the Desk (`ap_stats_roadmap_square_mode.html`):
> 1. **Sequential lesson gate** — lessons unlock in order; a student can't
>    hop to a future lesson until the prior one is complete (or its date
>    arrives). Guides the summer self-pacer 1.1 → onward.
> 2. **Video Done button removed** — the worksheet presupposes the video,
>    so the video auto-shows a checkmark once the worksheet is done.
>
> Status: contract frozen 2026-05-20. Planner implements directly (single
> contended Desk file). Codex reviews. Planner reverifies before commit.

## §1 — The sequential lesson gate

> ⚠ **§1–§4 below describe the ORIGINAL (session-103) design. §8 (2026-06-16)
> SUPERSEDES the date condition and the `_prevLessonTopic` walk-trail with a strict
> topic-sequence gate. Read §8 before re-implementing anything here.**

A lesson (calendar cell with `inf.t`) is **unlocked** iff ANY of:
- the student is **not signed in** (`getStudentEmail()` falsy) — no
  identity, no progression to track; behave as today (all open);
- the student is a **teacher** (`apstats_user_role === 'teacher'`);
- it is the **first lesson** in the active schedule's render order;
- **today is on/past the lesson's scheduled date** (`cellDate <= today`);
- the **previous lesson is complete**.

Otherwise the lesson is **locked**.

**"Complete"** (for the prior-lesson check) = the lesson's worksheet is
Done **AND** its Blooket is Done — counting only the artifacts the lesson
actually has (a missing artifact is vacuously satisfied). Read from
`getStudentMarks()`: `marks[topic+'|worksheet'].ts` and
`marks[topic+'|blooket'].ts`. Artifact presence from
`getRegistryEntry(topic).urls` (`.worksheet`, `.blooket`).

- **Year-round, all schedules.** During the school year lessons open on
  their scheduled dates anyway, so the gate only blocks jumping ahead of
  the class. In summer (SUMMER26) it drives 1.1→onward self-pacing.
- **Scope = the previous lesson only.** The chain emerges: to reach
  lesson 5 you completed 4 (which completed-or-dated 3, etc.). The date
  condition can break the chain (a date-passed lesson is open even if its
  prior isn't done) — that is intended (a student who falls behind still
  gets on-schedule access).
- **Fail OPEN.** Any error in the gate logic → treat the lesson as
  unlocked. Never hard-lock the calendar on a bug.

## §2 — Video Done button removed

The video Done button (`_doneBtn('video')`) and the video visited tag
(`_visitedTag('video')`) are removed from the resource panel's video
render. Rationale: the video is a weak signal and completing the
worksheet presupposes watching the video.

Replace with `_videoDoneTag()`: when this lesson's worksheet is marked
Done (`marks[topic+'|worksheet'].ts`), render a small green
`✓ done` indicator next to EACH video link. Before the worksheet is
done, the video link shows nothing extra.

- `_doneBtn` and `_visitedTag` stay (still used by worksheet/quiz/
  blooket) — only the `'video'` calls are removed.
- The video `<a>` keeps its `_linkClick('video')` onclick (harmless
  visit recording; no behavior depends on it now).
- After this change `_doneBtn`'s `deskDoneGateMs()` timer path is reached
  by `quiz` only — update the inline comment accordingly.

## §3 — Locked-cell UX

- A locked cell gets a `cell-locked` CSS class: dimmed (`opacity`),
  plus a 🔒 marker. It stays click-able (cursor pointer).
- Clicking a locked cell does NOT open the resource panel. It calls a
  new `_showLessonLockedDialog(topic, prevTopic, dateStr)` →
  `showDialog('🔒', msg, 'OK')` where msg names the blocking prior
  lesson and the unlock date, e.g.
  `"Lesson 1.3 is locked. Finish Lesson 1.2 first — or it unlocks on Jun 15."`
- Unlocked cells behave exactly as today (`maybeBumpThenOpen`). The
  existing soft speed-bump is unchanged — it still nudges on unlocked
  but skipped-past lessons.

## §4 — Implementation

### Helpers (module scope, near `getStudentMarks`)

```js
function _deskIsTeacher() {
  try { return localStorage.getItem('apstats_user_role') === 'teacher'; }
  catch (_) { return false; }
}
// "Complete" = worksheet Done AND Blooket Done, counting only artifacts
// the lesson has. marks = getStudentMarks() result.
function _isLessonComplete(topic, marks) {
  try {
    if (!topic) return true;
    var reg = (typeof getRegistryEntry === 'function') ? getRegistryEntry(topic) : null;
    var urls = (reg && reg.urls) || {};
    var m = marks || {};
    var wsOk = !urls.worksheet || !!(m[topic + '|worksheet'] && m[topic + '|worksheet'].ts);
    var blOk = !urls.blooket   || !!(m[topic + '|blooket']   && m[topic + '|blooket'].ts);
    return wsOk && blOk;
  } catch (_) { return true; }
}
// A lesson cell is unlocked per §1. Fails OPEN.
function _isLessonUnlocked(topic, lessonDate, prevTopic, today, marks, signedIn) {
  try {
    if (!signedIn) return true;
    if (_deskIsTeacher()) return true;
    if (!prevTopic) return true;
    if (lessonDate && today && lessonDate.getTime() <= today.getTime()) return true;
    return _isLessonComplete(prevTopic, marks);
  } catch (_) { return true; }
}
```

### `rCal` integration

- Before the week loop: `var _gateMarks = getStudentMarks();`
  `var _gateSignedIn = !!getStudentEmail();`
  `var _prevLessonTopic = null;`
- In the cell loop, for a real lesson cell (`inf` object with `inf.t`):
  - `var _unlocked = _isLessonUnlocked(inf.t, dt, _prevLessonTopic, t, _gateMarks, _gateSignedIn);`
  - if `!_unlocked`: `c.classList.add('cell-locked')`; append a 🔒
    marker; set `c.onclick` to `_showLessonLockedDialog(inf.t,
    _prevLessonTopic, ds)` (capture `inf.t`/`_prevLessonTopic`/`ds`
    in per-iteration consts to avoid the closure-capture bug).
  - if `_unlocked`: existing `maybeBumpThenOpen` onclick.
  - AFTER processing the cell: `_prevLessonTopic = inf.t;`
- The dblclick/contextmenu (day-grade modal) handlers stay on locked
  cells too — viewing the day's grades is fine.

### Re-render on Done

In `_studentMarkSave`, after the existing `showResourcePanel` re-render
on success, also call `rCal()` (typeof-guarded) so completing a
worksheet/blooket unlocks the next lesson live, no reload.

### CSS

Add a `.cell-locked` rule to the Desk `<style>` — dim the cell
(`opacity:0.45`), `cursor:pointer` retained. The 🔒 can be a small
absolutely-positioned span (the cell already uses
`position:relative` for the DN3b status dot).

## §5 — Out of scope

- No server / roster-server change. No migration. Pure client.
- No teacher unlock codes (the study guide has those; not here).
- No change to the gradebook, the completion gate, the flashcard gate.
- The soft speed-bump (`maybeBumpThenOpen`) stays as-is.
- Sacred `curriculum_render/data/curriculum.js` never touched.

## §6 — Tests — `tests/desk-lesson-gate.test.js` (NEW)

Static-parse pins + real-execution smoke tests (extract the helpers via
`new Function`, inject fakes):
- `_isLessonComplete` / `_isLessonUnlocked` / `_deskIsTeacher` /
  `_videoDoneTag` exist.
- `_isLessonComplete` smoke: ws+bl both done → true; ws done bl not →
  false; lesson with no blooket → ws-only decides; no marks → false.
- `_isLessonUnlocked` smoke: not-signed-in → true; first lesson
  (no prevTopic) → true; date passed → true even if prior incomplete;
  prior incomplete + future date → false; prior complete → true.
- `rCal` adds `cell-locked` + a locked onclick path; tracks
  `_prevLessonTopic`.
- `_studentMarkSave` calls `rCal()` on the success path.
- Video render: no `_doneBtn('video')`, no `_visitedTag('video')`;
  `_videoDoneTag` is called in the video loop.
- `.cell-locked` CSS rule present.

## §8 — Amendment (2026-06-16): strict topic-sequence gate

**Supersedes the §1 "date" condition and the §4 `_prevLessonTopic` walk-trail.**

Why: the walk-order `_prevLessonTopic` keyed each lesson's gate on the previous
CALENDAR CELL, not its true sequential predecessor. The contract assumed cells
render in clean topic order, but the two-period / summer-vs-fall layout interleaves
topics, so the "previous cell" frequently landed on an unrelated (often already-done)
topic. Observed symptom (a real student account): lessons 1.2 / 1.4 / 1.6 unlocked
while 1.3 / 1.5 stayed locked — a parity leak letting a student hop ahead.

Changes (pure client, `ap_stats_roadmap_square_mode.html`):
- New `_prevTopicInSequence(topic)` (near `_orderedPeriodTopics`): the immediately-
  prior topic in the period's ordered, de-duplicated topic list — the lesson's TRUE
  predecessor, independent of the visible calendar window. `rCal` and
  `paintLocalDoneCells` both pass it to `_isLessonUnlocked` instead of trailing
  `_prevLessonTopic` (now removed). Because completion is topic-keyed, this is
  cross-portion by construction: finishing topic N anywhere (summer block or fall
  block) unlocks N+1 in every block.
- `_isLessonUnlocked`: the **date bypass is removed** (strict sequential). A lesson
  opens ONLY when its predecessor is complete — a past-due lesson stays locked until
  you finish the one before it. The not-signed-in / teacher / first-lesson / P5
  teacher-override bypasses are unchanged. `lessonDate`/`today` stay in the signature
  (callers + tests still pass them) but no longer affect the verdict.
- `_showLessonLockedDialog`: drops the "— or it unlocks on <date>" clause.

This makes the summer self-pacer (Unit 1: 1.1→1.10) advance purely by completion,
solidly, with no nav-window leak and no date escape hatch.

**Granularity (critical — the live config):** the Desk forces period **E**, whose
pacing is COMBINED (`1.1`, `1.2+1.3`, `1.4+1.5`, `1.6`, `1.7+1.8`, `1.9+1.10`, …),
while the **summer** schedule (`data/summer-schedule.json`) is INDIVIDUAL
(`1.1`…`1.10`). So an individual summer topic is not found in the combined
`_orderedPeriodTopics()` list. The gate dispatches by the cell's own surface:
- **Summer cells** (`wk._summer` / `dataset.summer`) → `_prevSummerTopic(topic)`,
  the prior topic in the summer schedule's order (individual → individual marks).
- **Fall cells** → `_prevTopicInSequence(topic)`, the prior combined cell
  (combined → combined marks).
Both render paths (`rCal` + `paintLocalDoneCells`) dispatch identically so they stay
in sync. A **completion bridge** in `_isLessonComplete` makes a combined `A+B`
lesson count as done when its own combined artifact is done OR every individual part
is — so a summer student's individual work satisfies the fall combined cell when
school starts (full cross-portion). Without this, the gate is a no-op on the live
summer surface and 1.6 hard-locks — the blocker the §8 adversarial review caught.

## §7 — Acceptance (GREEN gate)

- root vitest: prior baseline + the new test file pass; only the known
  unrelated `study-guide.test.js` fail remains.
- roster-server untouched (291/291).
- `scripts/audit-feeder-ids.mjs` CLEAN 69.
- Desk file stays LF.
- `git status`: only `ap_stats_roadmap_square_mode.html`,
  `tests/desk-lesson-gate.test.js`, any desk test touched for the
  removed video Done button, and this build doc.
