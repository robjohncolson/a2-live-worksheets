# TEACHER_CHAT_BUILD.md — persistent teacher↔student chat (Phases 2 & 3)

> **Goal for Codex.** Finish the persistent teacher↔student chat. A teacher can reach
> out to one student or the whole class; messages persist; the student sees them and
> can reply; delivery is real-time with an **unread badge**. **Phase 1 is already
> shipped** (the teacher Send button in the dashboard). **Implement Phases 2 & 3.**
> Read this whole file before writing code. Do NOT rebuild what §2 says exists.

---

## 1. Repos, servers, deploy (READ FIRST — there is a cross-server split)

| Thing | Lives in | Deploys to |
|------|----------|------------|
| **Desk** `ap_stats_roadmap_square_mode.html`, **teacher dashboard** `teacher-dashboard.html` | `follow-alongs/` (this repo) | GH Pages on push to `master` |
| **roster-server** (the message DATA + identity/grades) | `follow-alongs/roster-server/` | Railway `roster-production-12c1.up.railway.app` on push to `master` |
| **cr quiz app** + the **live WebSocket server** (presence) | sibling repo `curriculum_render/` (local at `../curriculum_render`) | cr GH Pages + Railway `curriculumrender-production…` (on `railway-server/**` push to `main`) |

**⚠ THE KEY CONSTRAINT:** the message **data** lives on **roster-server**; the live
**WebSocket** lives on the **cr server**. They are different services. So "instant
push" cannot be done in one place — see §3b.

---

## 2. What ALREADY EXISTS — do NOT rebuild

**Backend — fully built (`follow-alongs/roster-server/nudge.js`, migration `0008` `nudges_log` is RUN):**
- `POST /teacher/nudge` — body `{ nudgeId, recipientUsernames:string[], text }`. Teacher → ONE student **or a list/section (broadcast)**. Persisted, delivery-tracked. Auth: teacher Bearer token (sender+section derived from the token) OR `x-teacher-secret` break-glass. `text` ≤ 280. → `{ ok, nudgeId, rows }`.
- `GET /teacher/nudge-history?studentUsername=X&limit=N` → `{ ok, rows[] }` (the teacher↔student thread).
- `POST /student/nudge` (student → teacher), `POST /student/nudge-reply { parentNudgeId, recipientUsername, text }`.
- `GET /student/nudge-history?limit=N` (token-auth) → `{ ok, studentUsername, teacherUsername, rows[] }`. **Row shape:** `{ direction:'teacher'|'student', text, created_at, sender_username, … }` (`'teacher'` = incoming to the student; `'student'` = the student's own).

**Student inbox — built (Desk `ap_stats_roadmap_square_mode.html`, ~L5471–5650):**
- `_openStudentDmModal()` / `_closeStudentDmModal()` — the `#student-dm-modal`. Opened from the **File → "Message teacher…"** menu item (`#menu-message-teacher`, ~L1800).
- `_fetchStudentDmHistory()` → `GET /student/nudge-history` → renders via `_buildSdmHistoryLi(row)` (incoming `<<` vs outgoing `>>`). **Renders text via `textContent`** (keep that — see §5).
- `_sendStudentDm()` → the student's reply.

**Phase 1 teacher send — built (`teacher-dashboard.html`):** the drawer "Send message" button (`#tsc-action-nudge`) opens `#tsc-nudge-compose` (textarea `#tsc-nudge-text`, "whole class" `#tsc-nudge-broadcast`); `_tscSendNudge()` → `POST /teacher/nudge` for the open student or every PeriodX student (`_tscClassUsernames()`).

**Relay pattern to MIRROR — `candy_gift_received` (cr server `railway-server/server.js` `case 'candy_gift_received'` ~L2428; Desk handler `_onCandyGiftReceived` + dedupe `_candySeenGiftIds` ~L12035–12173, routed in `DogePresence.handleMessage` ~L18758).** It broadcasts a cosmetic WS message; each client acts only when `toUsername === its own identity`; a spoof can at worst show a fake toast. Build `nudge_notify` exactly like it.

---

## 3. Deliverables

### Phase 2a — unread badge + auto-refresh (NO backend change; covers ALL sends)
The student Desk learns about new teacher messages by polling the existing endpoint.
- On boot, every **30 s**, and on `visibilitychange` (tab refocus): `GET /student/nudge-history?limit=20` (token-auth; guard: skip if not roster-signed-in).
- **Unread** = there is a row with `direction:'teacher'` whose `created_at` > `localStorage['apstats_nudge_last_seen']` (ISO string; default = epoch).
- Show an **unread indicator** on the "Message teacher…" entry (a dot/count). A small badge on the File menu / the menu item is enough; keep it subtle + System-7-styled.
- When the student **opens** `_openStudentDmModal()`: set `apstats_nudge_last_seen` = now (or the latest teacher row's `created_at`) → clears the badge.
- If the modal is **already open** when new teacher rows arrive (poll or WS), re-render the thread (`_fetchStudentDmHistory()`).
- Reuse `GET /student/nudge-history` — no new endpoint required. (An optional cheap `GET /student/nudge-unread-count` is a nice-to-have, not required.)

### Phase 2b — instant push (cr WS relay; mirror `candy_gift_received`)
- **cr server** (`curriculum_render/railway-server/server.js`): add `case 'nudge_notify'` → `broadcastToClients({ type:'nudge_notify', toUsernames: <string[]>, fromUsername, timestamp: Date.now() })`. Validate/clamp like the candy case (cap array length, slice usernames to 64, ignore junk). Clients filter by self ∈ `toUsernames`.
- **Sender** (the teacher's **Desk** in Phase 3; the dashboard is poll-only — see note): after a **successful** `POST /teacher/nudge`, send `{ type:'nudge_notify', toUsernames: recipients, fromUsername: <teacher roster username> }` over the Desk's cr presence socket (`DogePresence.ws` / `studyBreak._liveWs()` pattern — reuse the always-on socket; never open a second one).
- **Recipient** (student Desk): in `DogePresence.handleMessage`, add `case 'nudge_notify'` → if `self ∈ toUsernames` (compare on the **lowercase roster username**, see §5) → set the unread badge + (if the modal is open) `_fetchStudentDmHistory()`. **Dedupe** repeated notifies (a `_seenNudgeNotifyIds` set, like `_candySeenGiftIds`) — key on `fromUsername + a coarse timestamp` (there's no id; or add an optional `nudgeId` to the notify payload and dedupe on it).
- **⚠ The dashboard has NO cr WS.** From the dashboard, sending is **persist-only** → the student's 30 s poll catches it (acceptable near-real-time). Instant push happens for **Desk-origin** sends (Phase 3). Do NOT add a WS to the dashboard for Phase 2 (out of scope; the poll covers it).

### Phase 3 — compose from the Desk (teacher)
- Add a **"💬 Message"** action to the teacher's avatar/presence click menu — reuse the existing `_avatarMenu` (the click-a-classmate → name → 🍬 candy / ⚔️ game menu) and/or the 🐶 doge dropdown submenu. **Teacher-only** (gate on `_deskIsTeacher()`).
- It opens a small compose (textarea, ≤280) → `POST /teacher/nudge { nudgeId, recipientUsernames:[<that student>], text }` (same `postJson`/auth the Desk already uses for grade-bearing calls — the Desk has `rosterClient.token()`), then fire the Phase-2b `nudge_notify`.
- Optional: a "Message the whole class" entry (recipients = the section roster, like the dashboard's `_tscClassUsernames`).

---

## 4. Exact contracts (use verbatim)

- **`POST /teacher/nudge`** → body `{ nudgeId, recipientUsernames:string[], text }`; auth teacher Bearer token (or `x-teacher-secret`); `nudgeId` = a unique client string (e.g. `'n_' + Date.now().toString(36) + '_' + rand`); `text` ≤ 280. Response `{ ok, nudgeId, rows }`.
- **`GET /student/nudge-history?limit=20`** → token-auth → `{ ok, studentUsername, teacherUsername, rows[] }`; row `{ direction, text, created_at, sender_username }`.
- **WS `nudge_notify` (NEW)** → `{ type:'nudge_notify', toUsernames:string[], fromUsername:string, timestamp:number[, nudgeId:string] }`. Cosmetic only (the content is fetched from roster-server — the WS is just a "go look" ping).

---

## 5. Guardrails — MUST follow

1. **Username case.** Presence/identity was just canonicalized to the **lowercase roster username** (the Desk + cr now both identify that way). `toUsernames` and the recipient self-check MUST compare on the lowercase roster username so the notify reaches the right person. The dashboard's `/roster/section/PeriodX` already returns lowercase; for a per-student send use the roster username (lowercase).
2. **XSS — WS messages + usernames are UNTRUSTED** (the presence WS is un-authenticated; the server only `.trim()`s). Never interpolate a username/text into `innerHTML` / an `onclick=""`. Render message text via `textContent` (the existing DM modal already does). For any `onclick` that must carry a username, use the existing `_deskEsc(JSON.stringify(name))` pattern.
3. **Auth.** `/teacher/nudge` is teacher-only (token role=teacher or `x-teacher-secret`). A student must NEVER be able to send AS the teacher; the student path is `/student/nudge-reply` (student token). Do not weaken `requireTeacher`.
4. **No real names over WS** (board convention) — `nudge_notify` carries usernames only; the recipient resolves the display from the roster + fetches the text from roster-server.
5. **Do not break:** the existing student DM modal, the Phase-1 dashboard send, the `candy_gift_received` relay, presence/heartbeat/resync, the case-canonicalization, or the modal-escape net. Reuse the **always-on** DogePresence socket (don't open a second WS).
6. The unread badge must be non-blocking and cleared by opening the modal.

---

## 6. Testing — MANDATORY (match the repo conventions; the harness will NOT verify for you)

- **follow-alongs** = vitest + jsdom. Add tests for: (a) the unread computation (teacher row newer than `last_seen` ⇒ unread; cleared on open), (b) the `nudge_notify` handler (self ∈ toUsernames filter, dedupe, badge set, modal-open refetch), (c) the Phase-3 Desk compose wiring (teacher-gated, posts `/teacher/nudge`). Prefer executing the real extracted functions in jsdom; source-pin where execution is impractical. Run **`npm test`** from the `follow-alongs` root. **Baseline = 6 pre-existing onboarding failures** (`desk-gating-fixes`/`desk-self-signup`/`desk-user-role`/`desk-signin-wall`) — your change must add **ZERO** new failures.
- **cr** = vitest, `environment:'node'` (NO jsdom). Source-pin `railway-server/server.js` for the `nudge_notify` case (mirror `tests/guest-log.test.js` / `tests/presence-resync.test.js`). **cr baseline = 8 pre-existing failures** (classroom doorway-vote + redox-chat). Stage ONLY your own paths (cr has unrelated dirty files).
- **After folding, RUN the suites yourself and report the counts.**

---

## 7. Deploy

- cr server (`nudge_notify`) → push cr `main` → auto-deploys to cr Railway.
- Desk + dashboard → push follow-alongs `master` → GH Pages. **Run `node scripts/bump-build.mjs` before pushing the Desk change** so open student tabs get the "new version" nudge and pick it up.
- **roster-server: NO change needed** (nudge endpoints + migration 0008 already live).

---

## 8. Acceptance criteria

- A teacher message (dashboard or Desk) reaches the student's Desk within ≤30 s (poll), or instantly (WS, for Desk-origin sends), with an **unread badge** on "Message teacher…".
- Opening "Message teacher…" clears the badge and shows the thread (`<<` teacher, `>>` student).
- A **whole-class broadcast** reaches every active student.
- The student can **reply**; the teacher sees it in the dashboard thread.
- The **teacher can compose from the Desk** (Phase 3), teacher-gated.
- No new test failures in either repo; no regression to presence/candy/DM/auth.
