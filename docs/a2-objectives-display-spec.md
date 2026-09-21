# Objectives on the Desk desktop — spec (2026-09-21)

Administrators observe this class. They must be able to read the day's **learning objective** and
**language objective** from the back of the room on any student's Chromebook or the projected
teacher screen, **even while a student is inside flashcards, a lesson panel or any other dialog**.
Algebra 2 only (this fork); nothing to port to AP Stats.

Rules: match surrounding style; no new dependencies; do not run `scripts/bump-build.mjs`, commit
or push; add tests; root suite may fail only the six inherited files (`tests/a2-fork-freeze`,
`tests/phase4b-structure`, the three `tests/progress-reset-matrix-*`,
`tests/journeys/j7-offline-grade`), `roster-server` `npm test` fully green. GitNexus does not
index this checkout: do not refresh or write any index; grep for callers before editing a
function and list the blast radius in your report.

O1. **Data.** `content/a2/lesson-objectives.json` (already authored for 1-1; do not change its
wording). Load it the way the Desk loads `content/a2/day-log.json` (cache-busted by build, offline
tolerant, precached by the service worker if day-log is).
O2. **Which lesson.** The current lesson for the section being viewed: the same lesson the Do Now
banner calls "Current lesson" (section pill for signed-out visitors and teachers; the student's own
section when signed in). It follows the section pills and teacher pacing changes live.
O3. **Display.** A fixed strip docked to the bottom edge of the viewport, full width, on the
desktop layer:
  - line 1: `Learning objective` label + the math objective(s) (join several with " · ") and the
    standards in parentheses; line 2: `Language objective` label + the language objective. The
    essential question goes in the `title` tooltip and the expanded view, not the strip.
  - legible from a distance: labels bold, body text at least 15px on a 1366x768 Chromebook and
    scaling up with viewport width (clamp), dark text on a light solid background with a clear top
    border, WCAG AA contrast; at most two lines per objective with ellipsis, full text on hover/tap
    (tap toggles an expanded card that also shows the essential question).
  - it must stay visible above every Desk overlay and dialog (flashcards, review, lesson panel,
    sign-in, password change, receipts), so its z-index is above theirs; it must not swallow
    clicks meant for a dialog: the strip reserves its own height by adding equal bottom padding to
    the desktop and to every overlay/dialog container, so no dialog button can sit under it. Check
    the flashcard dialog and the sign-in dialog at 1366x768 and at 1920x1080.
  - hidden entirely when the current lesson has no entry, in print, and on `mobile-home.html`
    (phones are not what an observer reads).
O4. **Accessibility.** `role="region"` with `aria-label="Today's objectives"`; the expand toggle is
a real button, keyboard reachable; respects reduced motion.
O5. **Tests** with the real Desk page in jsdom: strip shows 1-1's two objectives verbatim for a
signed-out visitor on Section C; switches with the section pill; hidden for a lesson with no
entry; its z-index is above the flashcard overlay's; overlays get the reserved bottom padding; the
json is in the service worker's precache list if day-log.json is.
