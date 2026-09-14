# TI-84 Trainer — Per-Student State + Compact Status Strip

The trainer's persisted state (`ti84trainer_v2_state`) is one device-wide
localStorage blob. On shared classroom devices, students blend each other's
SM-2 scheduling, mastery, and generated-problem seeds — so the home cards are
untrustworthy, and the future grade path has no per-student evidence locally.
Quiz and curriculum_render already key identity through the roster; the
trainer joins them. Design-only until reviewed.

## 1. Storage keying

| Session | localStorage key |
|---|---|
| Signed in (roster) | `ti84trainer_v2_state.<studentId>` |
| Signed out | `ti84trainer_v2_state.anon` |
| Legacy (pre-this-change) | `ti84trainer_v2_state` — frozen, never written again |

- Identity source: `window.rosterClient.current()?.studentId` — the exact
  field quiz/cr use, shared via `apstats_roster.v1` on the same origin, so a
  Desk sign-in carries into the trainer automatically.
- The active key resolves at boot, and identity changes are detected by
  CONCRETE triggers (Codex amendment 1 — the trainer currently only reads at
  boot): a `storage` event listener on `apstats_roster.v1`, a recheck on
  `visibilitychange`/window focus, and a cheap recheck before every
  `savePersisted`. On a detected change: save state to the OLD key, reset the
  active walkthrough/question/handheld/practice session state cleanly, then
  reload the persisted layer from the NEW key — a full re-boot of state,
  never an in-place merge, and never a save of student A's session under
  student B's key.
- **`ti84-trainer-list-memory` gets the same suffix** (Codex amendment 2):
  the list/matrix data-target cache is also cross-student device state — a
  shared key would leak one student's problem data into another's "remembered
  data" checks. It namespaces identically (`ti84-trainer-list-memory.<studentId>`
  / `.anon`, legacy copied to anon once) and reloads on the same identity
  triggers. No shared keys remain.
- Desk deep links (`#topic=…`) keep working signed out: anon sessions get the
  full practice flow on the anon key. Server-side records were never blurred
  (the gradebook token is per-student); only local state was.

## 2. Migration — no silent merges (the core invariant)

**Anonymous state never merges into a real student without an explicit,
one-time, clearly-worded action.** Auto-migrating the device blob to whoever
signs in first would re-create the identity corruption this spec exists to
fix.

1. **Legacy blob → anon, once.** On first run of the new version, the frozen
   legacy blob is copied to `…anon` (if `…anon` doesn't already exist). The
   device's history lives on for signed-out use; no student inherits it
   implicitly.
2. **Explicit import, offered once per device.** A signed-in student whose
   own state is EMPTY, on a device whose anon blob is non-empty and
   unclaimed, sees a one-time dialog:
   > "This device has practice history that isn't linked to anyone
   > (N procedures, M mastered). Is it yours?"
   > [Import as mine] [No — start fresh]
   - **Import**: anon state is COPIED to the student's key, and the anon blob
     is marked `claimedBy: <studentId>` (it remains usable for future
     signed-out sessions, but is never offered again — a second student
     importing the same history would be the exact corruption we're
     preventing).
   - **Start fresh**: marks `importDeclined: true`; never asked again on this
     device for this student.
3. Signed-in students with existing state never see the dialog.

## 3. Home screen — compact status strip replaces the cards

The three large due/new/mastery cards give way to one line above a
calculator-first layout:

```
👤 fig_panda's progress   ·   Due 3 · New 5 · Mastered 12/31   ·   [Unit ▾]
```

- **The identity label is the trust anchor** — it says WHOSE numbers these
  are. Signed out it reads "This device (not signed in)", which makes the
  shared-device situation honest instead of silently wrong.
- Counts are computed exactly as the cards computed them; only the
  presentation shrinks. The freed vertical space goes to the calculator
  (compounding the height-aware scaling already shipped in `ed4c702`).
- Start Session / practice flows are unchanged.

## 4. Unchanged

SM-2 fields and semantics, `gen` seed provenance, `handheldPassed`, practice
mode and its SRS guards, property/verification checks, the ledger write path,
and the grade policy (visible-first, uncounted until 0016 verification + real
usage — per-student local state is a PREREQUISITE for that path, not a change
to it).

## 5. Tests (app-boot pattern)

1. Signed-in boot reads/writes `…<studentId>`; anon boot reads/writes
   `…anon`; the legacy key is never written.
2. Legacy blob copies to anon exactly once (idempotent on re-boot).
3. Import dialog: shown only when (signed-in ∧ own state empty ∧ anon
   non-empty ∧ unclaimed); Import copies + claims; a SECOND student on the
   same device never sees the offer; Decline persists.
4. Identity change mid-session re-boots state from the new key (no merge —
   assert student A's mastery never appears under student B), fired through
   each concrete trigger: a `storage` event on `apstats_roster.v1`, a
   `visibilitychange` recheck, and the pre-save recheck.
4b. `ti84-trainer-list-memory` is student-suffixed and never written to the
   bare legacy key; list memory from student A is invisible to student B.
5. Status strip renders the identity label + counts; signed-out label
   correct.
6. Desk deep-link practice works signed out on the anon key (extends
   ti84-practice-links).

## 6. Rollout

One PR: keying + migration + strip + tests → full suite → smoke on a real
shared-device sequence (student A signs in → import → sign out → student B
signs in → no offer, clean state). GH Pages + Vercel deploy as usual.
