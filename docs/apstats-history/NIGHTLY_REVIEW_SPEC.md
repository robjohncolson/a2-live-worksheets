# NIGHTLY REVIEW SPEC

A teacher surface on the Desk to review each student's recent work, mark it **seen**,
leave a **comment**, and drop **1 candy** — the student sees "👁 seen + 💬 comment" in
their wallet and gets a toast. Reviews are **signed receipts**, so they ride the same
durability rails as grades (in the nightly backup, verifiable, restorable).

> **Status:** proposed. **Owner:** teacher. **Workflow:** brainstorm → spec → implement.
> Builds directly on `GRADE_LEDGER_DURABILITY_SPEC.md` (snapshot diff, signed receipts,
> `/admin/snapshot`, `tools/nightly-backup.mjs`). **Money/grade-adjacent + a new mutable
> table + a new signed receipt type — review carefully.**

---

## 0. What already exists (reused, not rebuilt)

| Piece | Where | Reuse for |
|---|---|---|
| 24h "what changed" diff | `tools/nightly-backup.mjs` (receipt-id diff) | the review queue = the live, interactive version of this |
| Signed receipts (Ed25519, canonical) | `roster-server/receipts.js` (`issue*Receipt`, `receiptInternals`) | a new `t:'review'` receipt |
| Per-student grade | `computeGrade` via `GET /class/grades` (`class.js`) | "current grade" column |
| Work rows | `item_ledger` (`ledger_id` PK, `0002`; `receipt_id/compact`, `0018`) | what gets reviewed; key on `ledger_id` |
| Candy economy | `doge-econ.js` (`computeEffort`, 36 pts = 1 candy), `doge_account.candy_given`, `doge_ledger` (`0019`), `doge_spend()` | award 1 candy (candy is otherwise effort-only — no grant path today) |
| Notify/toast | `POST /teacher/nudge` (`nudge.js:22`) → WS `nudge_notify` → `_showNudgeToast` (`ap_stats_roadmap_square_mode.html:5418`) | comment → student toast |
| Student "My Ledger" | menu `:1911`, window `:2477`, fetch `GET /ledger/student/:id` (`ledger.js:227`) | render "seen + comment" badges |
| Teacher menu + badge | `_TEACHER_TOOLS` (`:13749`), `.menu-nudge-badge` (`:1866`, update `:5663`) | "🌙 Nightly Review" item + unseen count badge |
| Snapshot/backup/restore | `/admin/snapshot`, `/admin/verify`, `/admin/restore`, `verify-ledger.mjs` | include + verify + restore reviews |

---

## 1. Goals / Non-goals

**Goals**
1. One Desk surface to review recent student work fast: **prioritized**, with the
   student's **current grade**, and **mark-seen** (per item, per session, or whole day).
2. The student **sees** their work was seen (wallet badge), gets **1 candy**, and a
   **toast** when the teacher comments.
3. Reviews are **signed + durable**: they appear in the nightly backup, verify, and
   restore like grades.
4. Nobody falls through: **unseen counter** + **"not reviewed in N days"** flag.

**Non-goals (v1)**
- Not a re-grading tool (scores are unchanged; a review never alters a grade).
- No threaded back-and-forth (a comment can fire a one-way toast; replies stay in the
  existing teacher-chat/nudge system).
- No per-item candy inflation — candy is **1 per student per review-day**, idempotent.

---

## 2. UX

**Teacher — Desk → Teacher menu → 🌙 Nightly Review** (badge shows total unseen):
- A list of students with recent unreviewed work, **sorted by priority** (see §5), each
  row: name · current grade · unseen count · "⚠ N days" if stale.
- Expand a student → their recent items (since you last reviewed them): source · item ·
  score · answer snippet · a **[Seen]** toggle · a **comment box** with editable
  **template chips** (one-tap insert).
- Bulk: **[Mark session seen]** (the 25-min activity bursts from `commits.js`) and
  **[Mark all seen]** for the student. Marking seen awards candy + (if commented) toasts.

**Student — Desk → My Ledger:** each reviewed receipt shows **"👁 Seen <date>"** and, if
present, **"💬 <comment>"**. A comment also pops a toast live (reused nudge path). Candy
balance ticks up (existing wallet).

---

## 3. Data model

### 3.1 New table — `review_marks` (migration `00NN_review_marks.sql`)
```sql
create table if not exists review_marks (
  review_id        uuid primary key default gen_random_uuid(),
  ledger_id        uuid not null references item_ledger(ledger_id) on delete cascade,
  student_id       uuid not null,
  teacher_username text not null,
  seen_at          timestamptz not null default now(),
  comment          text,                      -- nullable; <= 500 chars
  candy_awarded    numeric not null default 0,
  receipt_id       text,                       -- signed review receipt (best-effort)
  receipt_compact  text,
  updated_at       timestamptz not null default now(),
  unique (ledger_id)                           -- one review per work item; re-mark = update
);
create index if not exists review_marks_student_idx on review_marks (student_id);
create index if not exists review_marks_seen_idx     on review_marks (seen_at);
```
Keyed on **`ledger_id`** (stable PK, survives re-attempts). Re-marking upserts.

### 3.2 New signed receipt — `t:'review'` (add to `receipts.js`)
Mirrors `issueLedgerReceipt` exactly; binds the comment by hash (like `ah`) so a tampered
stored comment is detectable, while keeping the payload small:
```js
export function issueReviewReceipt({ ledgerId, studentId, teacher, seenAt = Date.now(), comment }) {
  if (!issuer.enabled || !ledgerId || !studentId) return null;
  const payload = {
    v: 1, t: 'review', iss: 'desk',
    lid: ledgerId, sid: studentId, by: teacher, ts: seenAt,
    ch: comment ? sha256hex(stringifyResponse(comment)).slice(0, 16) : undefined,
    n: crypto.randomBytes(4).toString('hex')
  };
  return signPayload(issuer.privateKey, payload);   // { receiptId, compact }
}
```
Stored on `review_marks.receipt_compact`. (v2: `verifySnapshot` learns to check `t:'review'`.)

### 3.3 Candy award (1 candy / student / review-day, idempotent)
Candy today is effort-only; add a **grant** path without inflating it:
- On the **first** seen-mark for a student on a given NY date, insert one `doge_ledger`
  row `kind='review_award', candy_delta=1` and bump `doge_account.candy_given += 1`.
- Idempotency: a deterministic guard key `review:<student_id>:<date>` (a unique partial
  index on `doge_ledger`, or a pre-check) so re-marking / marking more items the same day
  never re-awards. Re-using the existing `candy_given` field keeps the wallet math
  (`earned + given − eaten − cost_basis`) correct with zero changes to `doge-econ.js`.

---

## 4. Server endpoints (all teacher-gated except the student read)

**`GET /class/review-queue?section=&days=`** (teacher) → the review surface data:
```jsonc
{ ok:true, asOf, unseenTotal: 37,
  students:[ { studentId, username, realName, section,
    currentGrade,                       // from computeGrade (reuse class.js)
    lastReviewedAt, daysSinceReview,    // for the "N days" flag
    unseen: 12, priority: 84,           // sort key (see §5)
    items:[ { ledgerId, source, itemId, score, recordedAt, responseSnippet,
              sessionId, priority, seen:false, seenAt:null, comment:null } ] } ] }
```
Window = "since you last reviewed each student" by default (so skipped nights don't lose
work); `days=` overrides with a fixed lookback. Joins `item_ledger` + `review_marks`.

**`POST /class/review`** (teacher) → mark seen / comment / award / notify:
```jsonc
// body: { ledgerIds:[...] | { studentId, scope:"session", sessionId } | { studentId, scope:"day", date },
//         comment?: "...", notify?: true }
```
For each target row: upsert `review_marks` (seen_at, teacher, comment), `issueReviewReceipt`
→ persist, award candy (§3.3, once/student/day), and if `comment && notify` send ONE
`POST /teacher/nudge`-style message (the comment, ≤280) so the student toasts. Idempotent.
Returns updated marks + `candyAwarded` + `unseenTotal`.

**`GET /ledger/student/:id`** (existing; augment) → each row gains `review: { seenAt,
teacher, comment } | null` (LEFT JOIN `review_marks`). Powers the wallet badges. Student
reads own; teacher read-as already supported.

**`/admin/snapshot`** (augment) → include each student's `review_marks` (with the signed
`receipt_compact`) so reviews are backed up + restorable. `/admin/restore` replays them
faithfully (signed-only, like grades); `verifySnapshot` checks `t:'review'` in v2.

---

## 5. Prioritized queue (the sort)

`priority` per item, high → low, so human-eyes-needed work floats up:
1. **FRQ / free-response** (`source==='frq'`, self/AI-graded) — needs real review.
2. **Low scores** (e.g. `score < 0.5`) and **appeals/exceptions** (`quiz_review`, `quiz_exception`).
3. **Proctored** (`evidence_tier==='proctored'`) over practice.
4. Everything else (auto-graded MC/worksheet) — fine to **bulk "mark all seen."**
Per-student `priority` = max item priority + a nudge for `daysSinceReview`. Students sort
by that, so "FRQs from a kid I haven't seen in 4 days" is at the top.

---

## 6. Teacher Desk UI

- **Menu item** in `_TEACHER_TOOLS` (`:13749`): `🌙 Nightly Review` + a `-badge` span
  (clone the `menu-nudge-badge` pattern at `:1866`/`:5663`) showing `unseenTotal`, polled
  from `/class/review-queue` on Desk load + after each mark.
- **Overlay** (a System-7 window like My Ledger): student list (priority-sorted) →
  expandable per-student work list → `[Seen]` toggles, comment box, `[Mark session seen]`,
  `[Mark all seen]`, the `⚠ N days` flag.
- **Editable comment templates** (your call: editable, future one-tap): stored in
  `localStorage` `desk_review_templates_v1` (teacher-device; v2 could sync server-side).
  Rendered as quick-insert chips above the comment box with an "✎ edit templates" affordance.
  Seeded with a few defaults ("Nice work!", "Show your steps", "See me", "Great improvement").

## 7. Student Desk UI

- **My Ledger** rows: render `👁 Seen <date>` + `💬 <comment>` from the augmented
  `/ledger/student`. Live comment toast already arrives via the nudge WS path — no new
  client transport.

---

## 8. Durability integration (the through-line)

- Reviews are **signed** → they land in `/admin/snapshot`, survive Supabase loss, restore
  via `/admin/restore`, and (v2) verify in `verify-ledger.mjs`.
- **`tools/nightly-backup.mjs`** review digest gains a "reviewed: X / unseen: Y" line and
  can flag "students not reviewed in N days" — the offline mirror of the Desk surface.

## 9. Accountability trail

`review_marks` (seen_at + teacher) IS the trail. Optionally a nightly signed
`t:'review-session'` summary ("reviewed 18 students / 60 items, 3:01–3:42pm") for an
at-a-glance, tamper-evident record you could show an admin/parent.

## 10. Idempotency & safety

- Re-marking an item: upsert (no dup rows, no dup receipts, **no second candy**).
- Candy guarded to **once per student per NY date** (§3.3).
- Notify fires **only on a comment** (silent "seen" → wallet badge + candy, no toast spam).
- A review **never** changes a score/grade. Student sees only their own reviews; the queue
  + marking are teacher-gated (`requireTeacher`).

## 11. Phases

| Phase | Work |
|---|---|
| **1 — server** | migration `review_marks`; `issueReviewReceipt`; `GET /class/review-queue`; `POST /class/review` (seen + comment + signed receipt + candy + notify); augment `/ledger/student`; tests |
| **2 — teacher Desk** | 🌙 Nightly Review overlay + menu item + unseen badge + priority sort + bulk session/day + editable templates + N-days flag |
| **3 — student Desk** | My Ledger "👁 seen / 💬 comment" badges (toast already works) |
| **4 — durability** | reviews in `/admin/snapshot` + `/admin/restore`; `verifySnapshot` checks `t:'review'`; nightly digest review line |

## 12. Tests (Vitest, mirrors existing suites)

- `issueReviewReceipt` deterministic + verifies; comment-hash binds.
- `POST /class/review`: marks seen, persists signed receipt, awards candy **once/day**
  (second mark = 0), fires nudge only with a comment, idempotent re-mark.
- `GET /class/review-queue`: priority order (FRQ/low-score first), unseen count,
  since-last-reviewed window, `daysSinceReview`.
- `/ledger/student` carries `review`; student sees only own.
- Restore replays `review_marks`; (v2) verify flags a tampered review comment via `ch`.

## 13. Open decisions (defaults chosen; change if you want)

- **Candy:** 1 / student / review-day (not per item). [default]
- **Window:** "since last reviewed per student" (vs fixed `days=`). [default since-last]
- **Notify trigger:** comment only (silent seen = no toast). [default]
- **Templates storage:** teacher-local `localStorage` v1 (server-synced v2). [default local]
- **N-days flag:** N = 5 school days. [default 5]

## 14. Files touched (estimate)

**New:** `roster-server/migrations/00NN_review_marks.sql`, `roster-server/review.js`
(queue + mark endpoints), `roster-server/tests/review.test.js`.
**Edited:** `roster-server/receipts.js` (+`issueReviewReceipt`), `roster-server/server.js`
(mount + wire), `roster-server/ledger.js` (join review into `/ledger/student`),
`roster-server/admin-snapshot.js` + `snapshot-verify.js` + `admin-restore.js` (carry/verify
reviews), `roster-server/ledger-db.js` (review DAO), `tools/nightly-backup.mjs` (digest line),
`ap_stats_roadmap_square_mode.html` (teacher overlay + menu badge + My Ledger badges +
templates). **Unchanged:** grading math, the signer, existing receipts.

---

### TL;DR
A `review_marks` table keyed on `ledger_id`, each review a **signed `t:'review'` receipt**.
`GET /class/review-queue` (priority-sorted, since-last-reviewed, unseen count) feeds a
**🌙 Nightly Review** Desk overlay with mark-seen (item/session/day), editable comment
templates, and a menu badge. `POST /class/review` marks seen, signs the receipt, awards
**1 candy/student/day**, and (on a comment) toasts via the existing nudge path. The student
sees **👁 seen + 💬 comment** in My Ledger. Reviews flow through the snapshot/verify/restore +
nightly digest so they're as durable and tamper-evident as the grades themselves.
