# Teacher -> Student Console -- Phase 10 (cockpit micro-polish) BUILD Contract

> FROZEN, session 113, 2026-05-24. Implements items #4 (proactive
> idMap hydration) + #6 (popup animations) from the s113 NEXT queue.
>
> Item #5 (real-name avatar labels) was previously thought to need
> work; recon confirmed it already ships -- `fetchNameMap` builds the
> username -> real_name map, classroom-board.js's `nameMap` plumbing
> uses it for `BoardSprite.labelText`, the canvas-engine label pass
> renders it. The grades table at `teacher-dashboard.html:793` also
> already shows realName. So #5 is moot; P10 carries only #4 + #6.
>
> Parent: `TEACHER_STUDENT_CONSOLE_SPEC.md`. Sibling BUILD: P9 (the
> popup this polishes).
>
> NO migration. NO server change. NO Desk change.
> NO `curriculum_render/data/curriculum.js` change.
> NO `canvas_engine.js` / `sprite_sheet.js` change.

## 0. Scope

Two small cockpit changes to `teacher-classroom.html`:

**T1 -- proactive idMap hydration (#4)**

P9's `currentIdMap` (username -> studentId, from `/roster/list`) is
populated ONCE in `mountBoard` after `fetchIdMap(section)`. When a
new student joins the section AFTER mount, the cockpit's
`classroom_member_update` event adds them to `currentNameMap` but
NOT to `currentIdMap`. The popup's sid-required actions silently
no-op for that student until the next section switch.

Fix: re-hydrate `currentIdMap` on `classroom_member_update` events
when the joining student is missing from the map. Debounce so a
burst of joins fires at most one `/roster/list` call per 2 seconds.

**T2 -- popup animations (#6)**

P9's `.avatar-popup` opens via `style.display = 'block'`. No
transition. Add a small `popup-fade-in` keyframe that fades opacity
+ slides 4px from the right when the popup appears. Closing stays
instant (no exit animation -- pure show/hide on close to keep the
state machine simple).

## 1. File ownership (one wave -- cockpit-only)

| Wave | Files                                                                                                  | Touched by |
|------|--------------------------------------------------------------------------------------------------------|------------|
| Single | `teacher-classroom.html` (CSS + JS), `tests/p10-cockpit-polish.test.js` (NEW)                        | Sonnet     |

## 2. T1 -- proactive idMap hydration

### 2.1 Re-hydration trigger

The cockpit already subscribes to the classroom board via
`onStateChange(summary)`. On every state delta, the summary's
`members` map carries the current online roster.

Add a helper that walks `summary.members` after every onStateChange,
detects any username NOT in `currentIdMap`, and -- if at least one
gap exists -- fires a debounced `fetchIdMap(section)` to refresh the
whole map.

```js
// P10 T1: re-hydration of currentIdMap when new students join after
// mountBoard. Debounced so a burst of joins doesn't spam /roster/list.
var _idMapRefreshTimer = null;
var _IDMAP_REFRESH_DEBOUNCE_MS = 2000;

function _maybeRefreshIdMap(summary) {
  if (!summary || !summary.members) return;
  var section = summary.section;
  if (!section) return;
  // Find any online student username that is NOT in the current id map.
  var gap = false;
  var usernames = Object.keys(summary.members);
  for (var i = 0; i < usernames.length; i++) {
    var u = usernames[i];
    var m = summary.members[u];
    if (m && m.role === 'student' && !currentIdMap[u]) {
      gap = true;
      break;
    }
  }
  if (!gap) return;
  if (_idMapRefreshTimer) return;  // already pending
  _idMapRefreshTimer = setTimeout(function () {
    _idMapRefreshTimer = null;
    // Re-fetch ONLY if we still have a board mounted for the same section.
    if (boardHandle && _lastSummary && _lastSummary.section === section) {
      fetchIdMap(section).then(function (fresh) {
        if (fresh && typeof fresh === 'object') {
          currentIdMap = fresh;
        }
      }).catch(function () { /* silent -- next refresh will try again */ });
    }
  }, _IDMAP_REFRESH_DEBOUNCE_MS);
}
```

Wire `_maybeRefreshIdMap` into the existing onStateChange callback
inside the `boardHandle.mount` call. The hook lives alongside
`_refreshNudgeRecipients` -- same trigger, different concern.

### 2.2 Cleanup

In `teardown()`, clear any pending refresh timer:

```js
if (_idMapRefreshTimer) {
  clearTimeout(_idMapRefreshTimer);
  _idMapRefreshTimer = null;
}
```

## 3. T2 -- popup animations

### 3.1 CSS keyframe

Append to the existing `.avatar-popup` CSS block:

```css
@keyframes avatar-popup-fade-in {
  from { opacity: 0; transform: translateX(4px); }
  to   { opacity: 1; transform: translateX(0); }
}
.avatar-popup {
  animation: avatar-popup-fade-in 140ms ease-out;
}
```

### 3.2 No JS change needed

The animation fires every time the popup transitions from
`display:none` to `display:block` (browsers re-run the animation
when an element re-enters the rendering tree). The close path keeps
its instant `style.display = 'none'`.

## 4. Tests: `tests/p10-cockpit-polish.test.js`

Mirror the harness from `tests/broadcast-nudge-cockpit.test.js`.

Required cases:

**describe('T1 idMap re-hydration')**
- Source contains `_maybeRefreshIdMap` function.
- Source contains `_IDMAP_REFRESH_DEBOUNCE_MS` constant set to 2000.
- Source contains `_idMapRefreshTimer` variable declaration.
- `_maybeRefreshIdMap(summary)` with a member missing from `currentIdMap` schedules a setTimeout.
- `_maybeRefreshIdMap(summary)` with all members already present does NOT schedule a timer.
- A second call within the debounce window is a no-op (does NOT schedule a 2nd timer).
- After the timer fires + the fetch resolves, `currentIdMap` reflects the fresh data.
- `teardown()` clears the pending refresh timer.

**describe('T2 popup animation')**
- Source contains `@keyframes avatar-popup-fade-in`.
- The `.avatar-popup` CSS rule references the `avatar-popup-fade-in` animation.
- The keyframe duration is 140ms ease-out.

Test count target: 10-14.

## 5. What is explicitly OUT of P10

- **Item #5 real-name labels**: already ships (see header note). No code change.
- **Exit animation** on popup close: out of scope; close stays instant.
- **Other popup polish** (e.g. arrow indicator pointing at the sprite): a follow-up.
- **Server-side currentIdMap cache** (e.g. WebSocket push of id changes): out of scope; the polling debounce is sufficient.

## 6. Smoke checks

1. `cd roster-server && npm test` -- expect zero new cases. 589/589 unchanged.
2. `npm test` from root -- expect +10-14 cases. Total fails unchanged from 5293/5294 baseline.
3. **Manual**: open the cockpit; verify the popup fades in smoothly when clicking an avatar. Have a student join the section AFTER cockpit is mounted; click their avatar -> the popup actions (View as / View grade / etc.) MUST work (not silently no-op).

## 7. Dispatch instructions

One Sonnet agent. Prompt embeds Section 2 + 3 + 4 verbatim + a
reminder that #5 is already shipped (don't accidentally re-do it).

After return:
1. Planner smoke.
2. Codex review (read-only, 540s).
3. Fold findings.
4. ONE commit: `feat: Teacher Student Console Phase 10 (cockpit polish)`.

## 8. Notes for the build agent

- **ASCII-only**. (P6/P7/P8/P9 BLOCKER lesson repeated four times.)
- **No re-saves of classroom-board.js + teacher-classroom.html that
  introduce BOM / mojibake** (P9 BLOCKER lesson). Use Edit, not Write.
- **Stage own paths only**. Two files.
- **PowerShell 5.1 + git** -- Bash heredoc for commits.

## 9. Recall on reload

- P9 BUILD documents the popup the animation polishes.
- The fetchIdMap function lives at `teacher-classroom.html` lines
  740-770.
- The `onStateChange` callback in the boardHandle.mount call site
  is the wire-up point for `_maybeRefreshIdMap` (alongside the
  existing `_refreshNudgeRecipients` call).
- `_lastSummary` at line ~815 is the source of `summary.section`.
