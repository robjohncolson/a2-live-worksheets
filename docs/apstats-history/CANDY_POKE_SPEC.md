# CANDY POKE — spec (avatar-tap candy gifting, "Facebook poke" style)

> Status: SPEC (awaiting review). Author session 2026-06-17. Decisions confirmed by the teacher in-chat.
> Goal: a student taps a peer's avatar in the Live Classroom scene → sends **1 candy** → the peer gets a
> "🍬 Papaya Fox sent you 1 candy!" toast. Lightweight, playful, low-friction — a candy *poke*.

## Confirmed decisions (teacher)
1. **Tap behavior = instant + 3s Undo.** One tap fires optimistically with a brief "Sent 1 🍬 · Undo"; the
   actual `POST /wallet/gift` only commits after 3s (so Undo needs **no backend reversal** — we just cancel the
   pending POST).
2. **Per-recipient cooldown ~10 min.** After you poke someone, their avatar shows a "✓ sent 🍬" state and
   re-poking *that person* is disabled for ~10 min. The backend's **20 candy/day total** cap still applies on top.
3. **Fixed 1 candy per poke** (the poke unit). Multi-candy gifts stay in the existing My-Ledger dropdown form.

## What already exists (reused as-is — this is mostly plumbing)
| Piece | Location | Notes |
|---|---|---|
| `POST /wallet/gift` | `roster-server/doge-wallet.js:242` | body `{toUsername, candy}`; atomic `doge_gift()`; **no change** |
| Validations | same + `doge-econ.js` | daily cap **20/24h**, same-section, active-only, not-self, whole candy, `GIFTING_ENABLED` kill-switch |
| Candy balance | `GET /wallet` → `candyBalance`, `candyGiftedIn/Out` | server-authoritative |
| Avatar **click→username** hit-test | `classroom-board.js:3956` (20px zone) → `onAvatarClick({username,selectMode})` | already used by teacher select-mode |
| Toast + chime | `ap_stats_roadmap_square_mode.html:5048` `_showNudgeToast` | reuse; strip the reply box for the candy variant |
| Student board mount seam | `ap_stats_roadmap_square_mode.html:17320` `ClassroomBoard.mount(…, {onClassroomMessage, onStateChange, …})` | already routes `classroom_teacher_nudge` → toast; just add `onAvatarClick` + a `candy_gift_received` case |

## The architectural fork (NEEDS YOUR NOD)
The `gift_in` ledger row carries **no sender identity** (`doge_gift` logs only `student_id, kind, candy_delta` —
`migrations/0021_doge_gifting.sql:88`). So showing the **sender's name** requires the name to travel through a
channel. Two viable Phase-1 options:

- **A — Real-time over the classroom WS (RECOMMENDED for Phase 1).** The sender's client emits
  `{type:'candy_gift_received', fromUsername, toUsername, candy, giftId}` over the board WS (username only — real
  names are teacher-only on the board, so they are NEVER broadcast to the section); the
  recipient's client shows the toast when `toUsername === me`. **Requires a small additive relay `case` in the cr
  railway-server** (`curriculum_render/railway-server/server.js`) → a **second repo + a Railway redeploy**. The
  toast is **cosmetic only** — the real candy transfer is server-authoritative via `/wallet/gift`, so a spoofed WS
  message can't mint candy (worst case: a fake "you got candy" toast with no balance change). Real-time when both
  are on the board (the common case). Offline recipients miss the toast but still see their balance rise.

- **B — Durable attributed catch-up (Phase 2 / heavier).** A migration `0022` adds a counterparty column to
  `doge_ledger`, `doge_gift` populates it, `/wallet` history exposes it, and the recipient renders missed-gift
  toasts on load from the ledger. Server-authoritative attribution + offline-safe, but it's a **USER-RUN
  migration** + roster-server change + redeploy.

**Recommendation:** ship **A** as Phase 1 (light, real-time, delightful), keep **B** as the Phase-2 durability
upgrade if offline-attributed catch-up is wanted. (A pure no-server-change v1 is possible only if we drop the
sender's name — "you received 1 candy" anonymously — which loses the headline of your idea, so not recommended.)

## Phase 1 flows (assuming option A)

### Sender — `_candyPoke(hit)` wired as `onAvatarClick` in the student `_mountClassroomBoard`
1. **Guards (bail quietly / gentle toast):** must be a signed-in **real** student (not a guest — guests have no
   wallet); recipient must not be self, not a guest alias, not the teacher (backend enforces active+same-section
   anyway); candy balance ≥ 1 (lazy `GET /wallet`; else "no candy yet — earn some first").
2. **Per-recipient cooldown:** if `_candyPokeCooldown[recipient]` is within ~10 min → show "already sent 🍬" and
   bail; the avatar carries a dimmed "✓ sent" state for the window.
3. **Optimistic:** show sender toast "Sent 1 🍬 to {username-derived name} · **Undo**"; start a 3s timer.
   - **Undo within 3s** → cancel timer, no POST, revert toast, no cooldown set.
   - **After 3s** → `POST /wallet/gift {toUsername, candy:1}`.
     - success → set cooldown, refresh wallet balance, emit `candy_gift_received` over the board WS.
     - failure (cap hit / offline / 4xx) → error toast ("couldn't send — {reason}"), clear cooldown.

### Recipient — `onClassroomMessage` adds a `candy_gift_received` case
- `if (msg.type === 'candy_gift_received' && msg.toUsername === myUsername)` → `_showCandyToast(msg)` (toast
  variant: "🍬 {username-derived name} sent you 1 candy!", soft chime, **no reply box**, dedupe by `giftId`),
  then refresh the wallet so My Ledger reflects the new balance.

### Server (cr railway-server) — additive relay
- New `case 'candy_gift_received'` → `broadcastToClients({...})` (re-broadcast to the whole `wsClients` pool,
  exactly like the existing `user_online` presence message); each client shows it only when `toUsername` matches.
  Cosmetic passthrough; no reducer, no persistence. **As-built note (accepted):** this fans out to ALL sections,
  not just the sender's — but the payload is pseudonymous **username-only** (no real names), the in-app behavior is
  still correct (clients filter by `toUsername`, which is globally unique), and bare usernames already broadcast
  globally over this same pool via `user_online`. Only the pseudonymous "X poked Y" edge crosses the section
  boundary on the wire. Section-scoping would mean routing through the classroom registry; deferred as not worth
  the complexity for a cosmetic toast. The client also caps the visible candy-toast stack (anti-flood).

## Files touched (Phase 1)
- `follow-alongs/ap_stats_roadmap_square_mode.html` — `onAvatarClick`/`_candyPoke`, cooldown map, `_showCandyToast`,
  `candy_gift_received` case in `onClassroomMessage`. (GH Pages republish.)
- `curriculum_render/railway-server/server.js` — `candy_gift_received` relay case. (**cr Railway redeploy.**)
- `roster-server/**` — **none** (`/wallet/gift` already does the work).

## Guards / edge cases
- **Guests:** no wallet → can't send; can't receive server-side (gift 400s) → poke disabled on guest avatars.
- **Self / teacher / cross-section / inactive:** backend rejects; client also pre-filters to avoid dead taps.
- **Daily cap (20):** surfaced as a friendly toast on the 429/NULL path; cooldown is the per-recipient layer.
- **Spoofed WS toast:** cosmetic only; balance is always `GET /wallet` truth.
- **Offline recipient:** misses the toast in Phase 1 (sees balance later); Phase 2 (option B) fixes attributed catch-up.
- **Casing:** sprite map keys vs roster usernames — normalize before the `/wallet/gift` lookup (the gift resolves by username).

## Test plan
- `roster-server`: gift endpoint already covered; no change.
- New `tests/candy-poke.test.js` (jsdom against the Desk): `_candyPoke` guard matrix (guest/self/teacher/cooldown/
  no-balance), the 3s-undo cancels the POST, success sets cooldown + emits WS, failure clears cooldown; `_showCandyToast`
  dedupe-by-giftId + no-reply-box; `onClassroomMessage` routes `candy_gift_received` only to the matching `toUsername`.
- cr railway-server: a unit test that the `candy_gift_received` case broadcasts to the section.

## Phasing
- **Phase 1 (this spec):** option A — real-time attributed poke + cooldown + undo. 2 repos, 2 deploys.
- **Phase 2 (optional):** option B durable attributed catch-up (migration `0022`), offline-received summary in My Ledger.
