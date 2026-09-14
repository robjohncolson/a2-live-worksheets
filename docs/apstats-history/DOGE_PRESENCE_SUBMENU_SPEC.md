# DOGE PRESENCE SUBMENU — location labels + click→submenu (no auto-challenge)

> Status: SPEC (awaiting build). Author session 18 (2026-06-18).
> Touches TWO repos: **follow-alongs** (`master`, GH Pages) and **curriculum_render**
> (`main`, auto-deploys `railway-server/**` to Railway + the quiz client via GH Pages).

## 1. Problem

The 🐶 doge "Online Now" dropdown (`ap_stats_roadmap_square_mode.html`, `DogePresence`) has two
problems the teacher flagged:

1. **No location context.** A row just shows a name. The dropdown is fed by the *global* cr presence
   feed (`identify`/`user_online`), so it lists kids who are on a **live worksheet** or the **quiz app**,
   not just the Desk — but you can't tell which.
2. **Clicking a name instantly fires a Tetris challenge** (`onclick="DogePresence.sendChallenge(...)"`,
   `:16460`). That's an unwanted automatic action, and worse: **the Tetris game + challenge-receiver
   live only in the Desk**, so challenging a kid who's on a worksheet/quiz silently times out (30s).

There is also an **inverted asymmetry**: worksheet/quiz kids auto-register in global presence (via
`railway_client.js`), but the Desk does **not** auto-connect — a Desk kid only appears after they
click the doge icon. So today the visible kids are mostly the ones who *can't* play.

## 2. Decisions (teacher-confirmed)

- **D1 — coarse location for students, specific for the teacher.** A student viewing the dropdown sees
  only `Desk` / `Worksheet` / `Quiz` / `Study guide` / `Online`. The teacher (`_deskIsTeacher()`) sees
  the exact lesson, e.g. `Worksheet U3 L6-7`, `Quiz U3 L6`.
  - ⚠ This is a **UI-level coarseness, not a server-enforced privacy boundary** — the lesson detail is
    broadcast globally and a determined student could read it in devtools (same class of "speed bump,
    not boundary" as the s12 Show-Answers note). Server-enforced filtering is a documented follow-on
    (§8), not in this build.
- **D2 — click→submenu, never an instant action.** Clicking a row opens a small inline submenu showing
  where they are + context-aware actions.
- **D3 — "⚔ Challenge to Study Break" is enabled ONLY when the peer is on the Desk**; otherwise it is
  shown dimmed with a hint ("must be on the Desk to play"). Never sends a doomed challenge.
- **D4 — add "🍬 Send candy"** to the submenu (reuses `POST /wallet/gift`, 1 candy, the existing
  poke cooldown + server daily cap). Works regardless of where the peer is.
- **D5 — Desk kids reliably appear.** `DogePresence` auto-connects on Desk load (location `desk`) so the
  challengeable cohort is actually visible. (Mirrors the always-on Live-Classroom WS pattern.)

## 3. Surface taxonomy + detection

Derived purely from `window.location` — no per-page global needed.

| surface | detect | coarse (student) | specific (teacher) |
|---|---|---|---|
| `desk` | `ap_stats_roadmap_square_mode.html` (hardcoded in DogePresence) | Desk | Desk |
| `worksheet` | pathname `^u\d+_lesson.+_live\.html$` | Worksheet | `Worksheet U{unit} L{range}` |
| `quiz` | pathname contains `/curriculum_render/` | Quiz | `Quiz U{u} L{l}` (from `?u=&l=`) |
| `study-guide` | `study_guide_diagnostic.html` | Study guide | Study guide |
| `edgar` | `edgar_u6_conceptual_driller_live.html` | Worksheet | Driller (U6) |
| `mit` | `mit_ocw_6.0001_lec*_live.html` | Worksheet | MIT lecture |
| `other` | anything else loading the client | Online | Online |

`lesson` is parsed where available: worksheet filename → `U{unit} L{range}`; quiz query → `?u=&l=`.

## 4. Wire protocol changes (backward compatible)

The `identify` message gains an optional `location` object; everything else is additive so old
clients/servers keep working (unknown fields ignored).

```js
// client → server (identify), NEW optional field:
{ type:'identify', username, location:{ surface:'worksheet', lesson:'U3 L6-7' } }

// server → clients (user_online), NEW optional field:
{ type:'user_online', username, location:{ surface, lesson, onDesk }, timestamp }

// server → client (presence_snapshot): add a parallel, backward-compatible map.
// `users` STAYS a flat string[] (existing consumers untouched); add:
{ type:'presence_snapshot', users:[...], locations:{ [username]: { surface, lesson, onDesk } }, timestamp }
```

`onDesk` = true if ANY of the username's live connections is surface `desk` (the challengeable signal).

## 5. Server (curriculum_render/railway-server/server.js)

- **Per-connection location.** Today `presence: Map<username, {lastSeen, connections:Set<ws>}>`.
  Add a `Map<ws, {surface, lesson}>` (`wsLocation`) populated on `identify` and cleared on socket close,
  OR upgrade `connections` Set→Map<ws, loc>. Per-connection is required so a kid with Desk **and** a
  worksheet open resolves `onDesk:true`.
- **Aggregate per username** for broadcast: `onDesk = any conn surface==='desk'`; representative
  `surface`/`lesson` = `desk` if onDesk else the most recently identified non-desk surface.
- Echo `location` in the `user_online` broadcast and add the `locations` map to `presence_snapshot`
  (`sendPresenceSnapshot`/`getOnlineUsernames`). `user_offline` unchanged.
- No new endpoints. No migration (in-memory presence only).

## 6. Clients (3 sites — keep the `_presenceSurface()` helper in sync)

1. **follow-alongs `railway_client.js`** (worksheets, study-guide, edgar, mit): add `_presenceSurface()`
   next to `_presenceUsername()`; include `location` in the `identify` send.
2. **curriculum_render `railway_client.js`** (the quiz app): mirror `_presenceSurface()` → `quiz` + lesson
   from `?u=&l=`.
3. **Desk inline `DogePresence`** (`ap_stats_roadmap_square_mode.html`): `location:{surface:'desk'}` in its
   `identify` send (`:16483`); **auto-connect on Desk init** (D5).

## 7. Desk UI — the submenu (`DogePresence.renderDropdown` + new handlers)

- Each row: name (+ real name) + a **location chip** (coarse or specific per `_deskIsTeacher()`).
- Click a row → toggle an **inline submenu** under it (replaces the row's `sendChallenge` onclick):
  - Line 1: `📍 <where>` (coarse/specific per role).
  - **⚔ Challenge to Study Break** — `onDesk && !self` → active (calls the existing `sendChallenge`);
    else dimmed + title "must be on the Desk to play".
  - **🍬 Send candy** — active (1 candy via `/wallet/gift`, optimistic toast + poke cooldown + 20/day cap).
- Keyboard/escape + outside-click close the submenu; only one open at a time.
- Self-row: no actions (or just the chip).

## 8. Out of scope / follow-ons

- **Server-enforced lesson privacy** (omit `lesson` from non-teacher recipients) — `presence_snapshot` is
  per-ws so it *could* be role-filtered, but `user_online` is a global broadcast; deferred.
- Merging the Desk's two cr sockets (classroom-board WS + DogePresence WS) into one — not needed now.
- Showing ALL surfaces a kid has open (we show one representative + `onDesk`).

### Accepted known-gaps (from the s18 adversarial review — verified, deliberately NOT fixed here)

- **Dual-socket `Player###` ghost (nit, PRE-EXISTING):** the Study Break MP socket identifies under
  `studyBreak.mpUsername` (localStorage `student-name`/`username`, which the Desk never writes → a random
  `Player###`), NOT the roster username `DogePresence.getUsername()` uses. So while a kid is in Study Break
  1v1, a transient `Player###` ghost (location `desk`) appears in everyone's Online list and is challengeable.
  This change only added the `location` field to the pre-existing `mpUsername` identify; it did not create the
  ghost. NOT unified here because making the two sockets share one username changes challenge routing (a
  challenge would hit BOTH sockets) — needs its own design.
- **Redundant `user_online` re-broadcast (nit):** the close-handler re-announce fires even when the dropped
  socket was not the representative surface (aggregate unchanged). Idempotent + harmless; O(N) churn only,
  fine at class scale.
- **Reconnect jitter (nit):** the Desk presence socket reconnects on a fixed 5 s timer; a cr redeploy drops
  all sockets at once → a synchronized reconnect burst. Trivial at N≈30; jitter is an optional future tweak.

### Fixed during the s18 review (folded before push)

- **Blocker — stored XSS:** the peer username was interpolated into a double-quoted `onclick` with only
  single-quote escaping; the unauthenticated presence WS (`identify` only `.trim()`s the username) let a
  crafted client inject markup that fired in every viewer's Desk origin. FIXED across all sinks
  (`toggleRow`/`challengeFromMenu`/`candyFromMenu` and the Study Break lobby) via `_deskEsc(JSON.stringify(name))`
  — entity-escaping prevents an attribute breakout and JSON keeps the JS-string layer valid. The visible
  labels were already `_deskEsc`-escaped.
- **Minor — Study Break lobby parity:** the in-game lobby still auto-challenged on click with no `onDesk`
  gating (the exact behavior D2/D3 removed, in the other entry point). FIXED: the lobby now reads
  `DogePresence.locations`, offers a challenge ONLY for on-Desk peers, and shows everyone else as muted
  "elsewhere" (and its visible name is now `_deskEsc`-escaped).

## 9. Tests

- **follow-alongs** `tests/doge-presence-submenu.test.js` (new, jsdom): runs the real `DogePresence`
  render/submenu — location chip role-awareness (coarse vs specific), challenge gated on `onDesk`,
  candy action wired, no auto-challenge on row click, self-row guarded.
- `_presenceSurface()` unit tests (pathname → surface/lesson) for both `railway_client.js` copies.
- **curriculum_render** server: presence carries+broadcasts `location`; `onDesk` aggregation across
  multiple connections; snapshot `locations` map; backward-compat (no `location` ⇒ no crash).
- Full root suite stays green except the 6 known pre-existing onboarding failures.

## 10. Rollout

Either order is safe (additive fields). Plan: push cr (server + quiz client) and fa (worksheets + Desk)
together; verify on the public URL that a kid on a worksheet shows `Worksheet` and a kid on the Desk
shows `Desk` + is challengeable.
