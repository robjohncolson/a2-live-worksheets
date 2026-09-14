# SIGNIN_WALL_BUILD.md — frozen contract (session 103)

> Goal: NO guest mode. A student must be signed in to reach any
> material, so work is never silently un-recorded. Two walls:
> 1. **Desk wall** — the Desk's sign-in modal auto-opens on load and is
>    non-dismissable until sign-in succeeds.
> 2. **Worksheet wall** — every worksheet, opened without a signed-in
>    session, shows a blocking overlay linking back to the Desk.
>
> Status: contract frozen 2026-05-20. Planner implements the Desk wall
> directly; Sonnet implements the worksheet wall + rollout. Codex
> reviews. Planner reverifies before commit.

## §1 — Access-granted definition (shared by both walls)

Access is granted when the visitor is EITHER:
- a signed-in **student** — `window.rosterClient.current()` returns a
  session (Desk also accepts the legacy `getStudentEmail()` proxy), OR
- a **teacher** — `localStorage['apstats_user_role'] === 'teacher'`.

Both walls **fail OPEN**: if the check throws (e.g. `rosterClient`
missing), treat access as granted. A bug must never permanently brick
a student out of the material — better a rare un-walled load than a
hard lockout.

## §2 — Desk wall (`ap_stats_roadmap_square_mode.html`, planner-direct)

Today the sign-in modal (`#signin-overlay`) is opened only from the
"User ▸ Sign In" menu, is dismissable (Cancel button + outside-click),
and the calendar renders regardless — that is the guest hole.

Changes:
- **Helper `_deskAccessGranted()`**: `!!getStudentEmail() || _deskIsTeacher()`.
  (`_deskIsTeacher` already exists from the lesson gate.) Wrap in
  try/catch → return `true` on error (fail open).
- **`_signinWallActive`** module flag.
- **On Desk init/load** (after the splash, where the calendar first
  renders): `if (!_deskAccessGranted()) openSignInModal();`.
- **`openSignInModal()`**: set `_signinWallActive = !_deskAccessGranted()`.
  When mandatory: hide the Cancel button (`#signin-cancel-btn`, give it
  that id) and any "later"/dismiss affordance. When NOT mandatory (menu
  re-open while already signed in): show Cancel as today.
- **`closeSignInModal()`**: guard at the top —
  `if (_signinWallActive && !_deskAccessGranted()) return;` — so the
  outside-click handler and a stray Cancel cannot dismiss the wall. The
  successful-sign-in path closes fine because by then
  `_deskAccessGranted()` is true (sign-in sets the rosterClient session
  / teacher role BEFORE `closeSignInModal` is called — verify this
  order in `submitSignIn`; if the order is not guaranteed, pass an
  explicit `force` arg from the success path).
- The outside-click handler on `#signin-overlay`
  (`onclick="if(event.target===this)closeSignInModal()"`) stays — it
  now no-ops while the wall is active because `closeSignInModal`
  refuses.
- Teachers: the modal's existing teacher checkbox + access-code path
  satisfies the wall (`_deskIsTeacher()` becomes true on teacher
  sign-in). No teacher lockout.
- The lesson gate's "not signed in → unlocked" branch becomes moot on a
  walled Desk but is harmless — LEAVE it (defensive; also covers the
  fail-open case).

## §3 — Worksheet wall (all 69 `u*_lesson*_live.html`, Sonnet + rollout)

A self-contained `<script>` block, inserted AFTER the
`<script src="gradebook-client.js"></script>` tag (present + unique in
all 69 — `roster-client.js` loads earlier in the same head, so
`window.rosterClient` is defined by the time this runs):

```html
<script>
(function () {
    // No-guest-mode wall (SIGNIN_WALL_BUILD.md §3). A worksheet opened
    // without a signed-in roster session blocks until the student signs
    // in at the Desk. Fails OPEN — if rosterClient is unavailable, do
    // NOT wall (degrade, never brick).
    function _wallAccessGranted() {
        try {
            if (localStorage.getItem('apstats_user_role') === 'teacher') return true;
            return !!(window.rosterClient && typeof rosterClient.current === 'function'
                      && rosterClient.current());
        } catch (_) { return true; }
    }
    function _removeSigninWall() {
        var el = document.getElementById('ws-signin-wall');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }
    function _showSigninWall() {
        if (document.getElementById('ws-signin-wall')) return;
        if (!document.body) return;
        var ov = document.createElement('div');
        ov.id = 'ws-signin-wall';
        ov.style.cssText = 'position:fixed;inset:0;z-index:99999;'
            + 'background:#eceff1;display:flex;align-items:center;'
            + 'justify-content:center;font-family:Geneva,Verdana,sans-serif;';
        var box = document.createElement('div');
        box.style.cssText = 'max-width:380px;margin:16px;padding:22px 26px;'
            + 'background:#fff;border:1px solid #999;border-radius:8px;'
            + 'text-align:center;box-shadow:0 6px 24px rgba(0,0,0,0.25);';
        var h = document.createElement('div');
        h.textContent = '🔒 Sign in to open this worksheet';
        h.style.cssText = 'font-size:15px;font-weight:bold;margin-bottom:10px;';
        var p = document.createElement('div');
        p.textContent = 'Your answers are only saved when you are signed in. '
            + 'Sign in at the Desk, then come back to this page.';
        p.style.cssText = 'font-size:12px;color:#444;margin-bottom:16px;line-height:1.5;';
        var a = document.createElement('a');
        a.href = 'ap_stats_roadmap_square_mode.html';
        a.textContent = 'Open the Desk to sign in';
        a.style.cssText = 'display:inline-block;padding:7px 16px;background:#0000cc;'
            + 'color:#fff;text-decoration:none;border-radius:5px;font-size:12px;';
        box.appendChild(h); box.appendChild(p); box.appendChild(a);
        ov.appendChild(box);
        document.body.appendChild(ov);
    }
    function _checkSigninWall() {
        if (_wallAccessGranted()) _removeSigninWall();
        else _showSigninWall();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _checkSigninWall);
    } else {
        _checkSigninWall();
    }
    // Self-dismiss / re-show: when sign-in state changes (often in
    // another Desk tab) the storage event fires here — re-check. Watches
    // the roster session key AND the teacher-role key, since
    // _wallAccessGranted keys off both.
    try {
        window.addEventListener('storage', function (e) {
            if (e && (e.key === 'apstats_roster.v1'
                      || e.key === 'apstats_user_role')) _checkSigninWall();
        });
    } catch (_) {}
})();
</script>
```

- XSS-safe: `createElement` + `textContent` only; static `cssText`.
- Fail-open: `_wallAccessGranted` returns `true` on any error → no wall.
- Self-dismiss: the `storage` listener removes the overlay once the
  student signs in elsewhere (mirrors the hydration block's pattern).
- The Desk link is relative (`ap_stats_roadmap_square_mode.html`) —
  worksheets and the Desk share the GH Pages root directory.

### Rollout — `scripts/wire-signin-wall.mjs`

Mirror `scripts/wire-hydration.mjs` / `wire-completion-tracker.mjs`:
- Idempotent — skip files already containing `id="ws-signin-wall"` (or
  the function name `_wallAccessGranted`).
- EOL-preserving per file.
- Anchor: the line `<script src="gradebook-client.js"></script>`
  (unique + present in all 69). Insert the wall `<script>` block
  immediately AFTER it.
- FAIL (report, not silent-skip) if the anchor count != 1.
- Hand-pilot one worksheet, then roll the other 68.

## §4 — Out of scope

- No server / roster-server change. No migration. Pure client.
- No sign-in UI ON the worksheet — the worksheet wall only links back
  to the Desk (the single sign-in surface).
- No change to the lesson gate, completion gate, flashcard gate,
  gradebook, or the sign-in modal's internal sign-in logic.
- Sacred `curriculum_render/data/curriculum.js` never touched.

## §5 — Tests

### Desk — extend a desk test (or NEW `tests/desk-signin-wall.test.js`)
- `_deskAccessGranted` exists, fails open.
- The init path calls `openSignInModal()` when `!_deskAccessGranted()`.
- `openSignInModal` hides `#signin-cancel-btn` in mandatory mode.
- `closeSignInModal` refuses while `_signinWallActive` && not granted.
- `#signin-cancel-btn` id is on the Cancel button.

### Worksheet — NEW `tests/worksheet-signin-wall.test.js`
- For every `u*_lesson*_live.html`: the wall block is present
  (`id="ws-signin-wall"`, `_wallAccessGranted`, the `storage` listener),
  and it appears AFTER the `gradebook-client.js` script tag.
- The wall is XSS-safe (no `innerHTML` with dynamic data in the block).
- Fail-open: `_wallAccessGranted` has a `catch` returning `true`.
- Smoke: extract `_wallAccessGranted` via `new Function`, inject a fake
  `localStorage` + `window` → teacher role → true; rosterClient session
  → true; neither → false; throwing rosterClient → true (fail open).

## §6 — Acceptance (GREEN gate)

- root vitest: prior baseline + the new test file(s) pass; only the
  known unrelated `study-guide.test.js` fail remains.
- roster-server untouched (291/291).
- `scripts/audit-feeder-ids.mjs` CLEAN 69.
- Desk file + all 69 worksheets keep their EOL (LF).
- A teacher can always pass both walls via teacher sign-in.
- `git status`: only `ap_stats_roadmap_square_mode.html`, the 69
  `u*_lesson*_live.html`, `scripts/wire-signin-wall.mjs`, the new test
  file(s), any desk test touched, and this build doc.

## §7 — Sonnet sub-agent prompt (worksheet wall only)

```
Implement the worksheet-side sign-in wall per SIGNIN_WALL_BUILD.md §3
and §5. Steps:
1. Read SIGNIN_WALL_BUILD.md fully. Read u4_lesson1-2_live.html around
   the <script src="gradebook-client.js"></script> line to confirm the
   anchor.
2. Hand-edit u4_lesson1-2_live.html: insert the §3 wall <script> block
   immediately after the gradebook-client.js script tag. Preserve LF.
3. Write scripts/wire-signin-wall.mjs — idempotent, EOL-preserving,
   mirrors scripts/wire-hydration.mjs. Sentinel: id="ws-signin-wall".
   Anchor: the gradebook-client.js script tag. FAIL on non-unique anchor.
4. Run it (--apply). Expect 68 wired + 1 already (the pilot) + 0 failed.
   Re-run dry → 0 wired / 69 already (idempotent).
5. Write tests/worksheet-signin-wall.test.js per §5.
6. Run npx vitest run (repo root) — only the known study-guide.test.js
   fail allowed. node scripts/audit-feeder-ids.mjs — CLEAN 69.
7. Report changed files, the exact anchor, test counts.

CONSTRAINTS: additive only; preserve per-file EOL; do NOT touch the
Desk file ap_stats_roadmap_square_mode.html (planner owns it); do NOT
touch curriculum_render/data/curriculum.js; do not git-commit.
```
