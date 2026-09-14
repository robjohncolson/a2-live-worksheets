# PREVIEW_AS_STUDENT_SPEC.md

> Status: DRAFT -- written 2026-05-21 (session 108). A small Desk-only
> feature: let a teacher view the Desk through the student gating, so
> the teacher can verify lesson-gating / Do-Now focus / the sign-in flow
> that the teacher role otherwise bypasses. Next: freeze a *_BUILD.md
> contract -> planner-direct implementation (the Desk is the contended
> single file).

## 1. Problem

The Desk (`ap_stats_roadmap_square_mode.html`) carries several
student-facing gates shipped over sessions 102-107:

- the sequential lesson gate -- a lesson is locked (dimmed + lock icon)
  until the prior lesson is complete or its scheduled date arrives;
- the Do-Now focus -- the calendar / Do-Now card steering a student to
  today's lesson;
- the sign-in wall and the worksheet / Blooket completion gates.

Every one of these bypasses for a teacher. The bypass is correct for
daily teacher use, but it means the teacher CANNOT SEE WHAT A STUDENT
SEES -- they cannot verify the gating is correct, preview a student's
first-run experience, or debug a "this lesson is locked" report. Today
the only way to "become a student" is a DevTools poke at the
`apstats_user_role` localStorage key, which `updateUserRoleUI()`
re-derives from the server role on the next load -- so it evaporates on
reload.

## 2. Goal / non-goals

Goal: a one-click, per-tab "Preview as student" toggle that makes the
Desk's teacher-bypass checks behave as if the viewer were a student,
survives an in-tab reload, and is obvious and reversible.

Non-goals:

- NOT an identity change. The roster session, the signed-in username,
  the server role, and the `apstats_user_role` cache are all untouched.
  Work the teacher submits while previewing still writes to the
  teacher's own account. Preview mode flips ONLY the teacher-bypass view
  checks.
- NOT a worksheet-level preview. The 69 live worksheets carry their own
  teacher bypasses (completion gate, sign-in wall); reaching those is a
  future extension, out of scope here. v1 is Desk-only.
- No server change. Purely client-side, `ap_stats_roadmap_square_mode.html`
  only.

## 3. Mechanism

`_deskIsTeacher()` is the single chokepoint -- every Desk gate asks it
whether to bypass. The feature adds one guard at the TOP of that
function:

- a `sessionStorage` flag `apstats_preview_as_student` with value `'1'`;
- `_deskIsTeacher()` returns `false` whenever that flag is set, before
  any other logic runs.

`sessionStorage` (not `localStorage`) is deliberate:

- per-TAB -- on a shared classroom machine it never leaks to a student's
  tab, and it auto-clears when the teacher closes the tab;
- it DOES survive an in-tab reload -- which is exactly what the
  DevTools-poke approach lacked.

The flag read is wrapped in try/catch; if `sessionStorage` is
unavailable the guard falls through to normal teacher behavior.

## 4. UI

1. The Teacher menu gains a new item, below the existing Live Classroom
   / Gradebook items: "Preview as student". When preview mode is active
   the label reads "Exit student preview".
2. Toggling the item sets or clears the flag, then calls
   `location.reload()` so every gate re-evaluates cleanly on load. The
   flag survives the reload (sessionStorage).
3. While preview mode is active, a fixed, unobtrusive indicator badge is
   shown (proposed: bottom-left): a short label "Previewing as student"
   plus an "Exit" button. It is the always-visible escape hatch and the
   reminder.
4. The Teacher menu itself STAYS visible in preview mode -- the teacher
   is still a teacher server-side, and the menu is how the teacher finds
   "Exit student preview". This is deliberate; the indicator badge makes
   the mode unambiguous. A real student never has the Teacher menu.

## 5. Edge cases

- A non-teacher with the flag set: harmless -- a real student's
  `_deskIsTeacher()` is already `false`, and the menu item that sets the
  flag is teacher-only.
- The flag set, then the teacher signs out / a student signs in on the
  same tab: still harmless (the flag only ever WEAKENS the teacher
  bypass, it never grants anything) and it clears on tab close. The
  BUILD doc decides whether the sign-in flow also clears it explicitly.
- `sessionStorage` throwing (private-mode quirk): try/catch falls
  through to normal teacher behavior.

## 6. Testing

`tests/preview-as-student.test.js` (new) -- structure + behavior:

- the Teacher menu contains a "Preview as student" item;
- `_deskIsTeacher()` returns `false` when `apstats_preview_as_student`
  is `'1'`, and its normal teacher value otherwise;
- the indicator-badge markup exists and is gated on the flag.

## 7. Locked decisions

- D1. Per-tab `sessionStorage`, not `localStorage` -- shared-machine
  safety + auto-clear, while still surviving an in-tab reload.
- D2. The toggle reloads the page rather than re-running gate renders
  in place -- reliable, and the gates already run on load.
- D3. Desk-only for v1; worksheet-level preview is deferred.
