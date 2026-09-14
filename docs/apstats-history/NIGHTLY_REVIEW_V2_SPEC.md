# NIGHTLY REVIEW v2 — AI-drafted comments + review-by-item

> Builds on `NIGHTLY_REVIEW_SPEC.md` (shipped: `review_marks`, `t:'review'` receipts,
> `/class/review-queue`, `/class/review`, candy, My-Ledger badges). Attacks the two things
> that make nightly review slow: **every comment is typed from scratch**, and **you review
> one student at a time** so you miss class-wide patterns. Adds (1) **AI-drafted comments**
> and (2) a **review-by-item** lens — which compose: AI drafts one comment for the *cluster*
> of kids who made the same mistake, you approve, it goes to all of them.
>
> **Status:** ✅ IMPLEMENTED 2026-07-01 (all 3 phases + §0 corrections; adversarial-reviewed).
> A 2-lens review (privacy + correctness) found real defects — the corrections in **§0 are
> binding** and override the original §§1–10 below. Reuses the shipped review pipeline + the
> existing AI-grading provider chain.
>
> **Implementation deltas (vs §0 as written):**
> - §0.1 the proposed `{'ai','ai-graded'}` allowlist strings have NEVER been written (not in
>   the item_ledger source CHECK, zero writers) — the real AI-graded-at-grade-time set is
>   `aiGradedRow()` in `roster-server/review.js`: `quiz_review` | `quiz_exception` |
>   `pc`+`-SG` suffix | scored `frq` (documented-accepted: rare teacher-app human-graded rows
>   share the scored-frq shape); NEVER proctored.
> - §0.6 by-item reuses the SAME per-student `getLedgerByStudent` loop as the queue (identical
>   row universe BY CONSTRUCTION) with no per-student cap, rather than a parallel DAO; the
>   80-item cap on the by-student queue is now payload-only (counts uncapped, `itemsTruncated`).
> - §0.7 default window = **14 days** for badge + both views; `?days=all` = full history.
> - §0.4 section-scoping of `review-item` = roster-membership validation (single-teacher
>   deployment; the same secret already grants /admin/snapshot). ⚠ set `TEACHER_KEY` on Railway.
> - §0.5 pins carry BOTH `rh` and `score` (a *-DESK_DONE retake changes only the score);
>   `rh:null` is a real pin; the signed receipt binds `rh`.
> - Post-review hardening: the by-item `groups` map is null-prototype (a student-planted
>   `__proto__` item_id would otherwise pollute Object.prototype and crash the server).

---

## 0. Review corrections (binding — folded 2026-07-01)

The original draft (§§1–10) is sound in shape but had these defects; **these corrections govern.**

**Privacy — the big one:**
1. **"No new LLM exposure" is FALSE for most sources.** Only worksheet reflections graded via
   `/api/ai/grade` (ledger `source ∈ {'ai','ai-graded'}`) ever went to Groq/DeepSeek. Self-graded,
   `reflection`, `quiz_review`, `quiz_exception`, `pc`, `blooket`, `trainer`, and **proctored** answers
   were scored WITHOUT the LLM. Drafting on those = a first-time third-party disclosure (FERPA).
   → **`GET /class/review-item/:ledgerId` returns the full response ONLY when `source` is on an
   AI-graded allowlist** (`{'ai','ai-graded'}`; confirm the exact strings against real rows); else it
   returns the item WITHOUT the response and the **✨ Draft button is hidden**. **Never draft proctored.**
   The cluster set (§3) is filtered to the same allowlist. Drop the blanket "no new exposure" line.
2. **"Never send names/sid" is only enforceable on the ENVELOPE.** A free-response answer can contain a
   name ("I asked Maria…"). → guarantee = *"no structured identifiers (name/sid/username) in the request
   envelope"*; the §9 test asserts THAT (it cannot assert the answer text is PII-free). Add a system-prompt
   line telling the model to ignore any names in the answer. Residual answer-text PII is accepted only
   because the source is already on the AI-grading trust boundary (correction 1).
3. **Cluster batching is a distinct exposure** (many students' answers in one request — a shape grade-time
   never produced). → keep N small (≤5), send NO per-answer identifier/ordering that maps to a student,
   prefer a de-identified summary over raw concatenation, allowlist-only, and confirm the provider's
   zero-retention terms before enabling.
4. **Auth:** both new GETs MUST open with the exact shipped `if (!await requireTeacher(req, db)) return 401`
   gate (incl. the `?token=` path). ⚠ `requireTeacher` Path A accepts `x-teacher-secret` whose **default
   `apteacher2627` is published in this public repo** — set `TEACHER_KEY` as a Railway env var before
   shipping the full-response endpoint, and **scope `review-item` to the requesting teacher's section**,
   not any arbitrary `ledgerId`.

**Correctness:**
5. **TOCTOU (real).** Worksheets are revisable — `item_ledger` upserts on `(student_id,source,item_id,attempt)`
   keeping the SAME `ledger_id`, so the response/score can mutate between the Draft fetch (T0) and the mark
   (T1). The `t:'review'` receipt binds only the comment hash, not the response → a comment drafted about the
   old answer gets attached to the new one with no tamper signal. → capture `score` + a `responseHash` at
   fetch, send them with the mark; **server rejects `409 stale` if the row changed.** Also **bind a response
   hash `rh` into the `t:'review'` receipt payload** so drift is detectable like grades.
6. **By-item counts need the FULL row universe.** Do NOT reuse the by-student loop (it has an 80-items/student
   cap, `review.js:23`, that silently truncates) and do NOT reuse `getLedgerByItem` (it lacks `ledger_id`
   and `score`). → **new item-keyed DAO** selecting `ledger_id, student_id, score, response, source,
   recorded_at` for the itemId set over the window, **no per-student cap**, LEFT JOIN `review_marks`.
   By-item and by-student MUST query the identical row universe.
7. **Badge/unseen consistency.** Compute the menu badge + both views from ONE shared unseen definition
   (same window + same cap policy). ⚠ Also a v1 bug surfaced: the "since last reviewed" default window was
   never implemented — `windowFloor` is null (= ALL history) when `days` is absent. Decide the real default
   window and apply it uniformly, or the badge and the by-item list will disagree.
8. **`topic` is unreliable as a label** — `item_ledger.topic` is client-supplied + often null and differs
   per row for the same `item_id`. → derive the item label from the **answer key** (`unitOf(itemId,…)`) or
   the `item_id` prefix; treat `topic` as best-effort display only.
9. **Bulk cap is silent.** `POST /class/review` truncates `ledgerIds` to `MAX_TARGETS=500` and returns
   `ok:true` with no warning. → return `truncated:true` + requested-vs-marked counts so a big "comment to
   many" that exceeds 500 warns the teacher instead of silently dropping the tail.

**Confirmed FINE (no change):** candy is awarded exactly once/student/day even when one `POST /class/review`
spans many students (`awardOnce` keys on `student_id` + `db.reviewAward` is idempotent); the shared comment
binds into each student's receipt; marking is idempotent (upsert on `unique(ledger_id)` + candy guard).

---

## 1. Feature 1 — AI-drafted comments

The friction that kills nightly review is *writing* 30 comments. Turn it into *approving* 30.

**Flow:** in the Nightly Review overlay, each free-response item gets a **✨ Draft** button.
Tap it → the Desk calls the cr server → a warm, specific, actionable one-line teacher comment
lands in the (editable) comment box. The teacher tweaks or accepts → the existing
`POST /class/review` fires unchanged (seen + comment + candy + toast). The teacher is always
the author of record; AI only pre-fills.

**New cr endpoint** — `POST /api/ai/review-comment` (mirrors `/api/ai/grade`, reuses the same
provider chain: Groq `llama-3.3-70b` → DeepSeek `v4-flash`):
```jsonc
// req:  { response: "<student's answer>", score?: 0.5, source?: "frq", topic?: "U5 sampling dist",
//         question?: "<optional prompt text>", tone?: "encouraging" }
// resp: { comment: "Good start — you named the parameter; now say WHY n≥30 matters here.",
//         _provider, _model }
```
System prompt: *"You are the student's teacher writing a ONE-LINE (≤180 char) comment on their
free response. Warm, specific to THIS answer, and actionable (one concrete next step). Second
person. No grade, no score, no preamble."* Deterministic-ish (low temp). Empty/failed → the box
stays empty (teacher types normally); never blocks the review.

**Data the draft needs.** A good draft needs the **full** response (the queue returns only a
truncated `responseSnippet`) and ideally the question text. Cheapest correct path:
- Add `GET /class/review-item/:ledgerId` (teacher) → `{ response, source, itemId, score, topic }`
  fetched on-demand when **✨ Draft** is tapped (keeps the queue lean; only FRQ items get drafted).
- `question` is optional in v1 — the AI drafts well from *answer + score + topic*. v2 can pass the
  real prompt via an `itemId → questionText` map (from the per-worksheet `ai-grading-prompts*.js`).

## 2. Feature 2 — review-by-item lens

Today the queue is student-keyed, so you never see that 8 kids botched the same FRQ the same way.
Add the **transpose**: group recent work by `itemId`, all students side-by-side.

**New roster endpoint** — `GET /class/review-by-item?section=&days=` (teacher):
```jsonc
{ ok:true, asOf, items:[
  { itemId, source, topic, priority, unseen: 9, count: 26, meanScore: 0.42,
    answers:[ { ledgerId, studentId, realName, score, responseSnippet, seen, comment } ] } ],
  ... sorted by priority (FRQ/low-mean first) then unseen desc }
```
Same joins as `/class/review-queue` (`item_ledger` ⨝ `review_marks`), just grouped by `itemId`
instead of `student_id`. Reuses `itemPriority`, `responseSnippet`, the section/window logic.

**Bulk "comment to many"** reuses the shipped `POST /class/review` (it already takes `ledgerIds[]`
+ a shared `comment`): select the rows that made the same mistake → one comment → all get it,
each candy-guarded once/student/day (already handled). No new mark endpoint.

## 3. The combo (why 1 + 2 together)

In the by-item view, one **✨ Draft for cluster** button: the Desk sends the AI the *item* + a few
representative low-score answers → gets one comment addressing the shared misconception → the
teacher approves → `POST /class/review` with the selected `ledgerIds[]`. Thirty comments becomes
"review one FRQ, approve one draft, done." This is the transformative path; features 1 and 2 are
each useful alone but this is the point.

## 4. Desk UI (in the existing 🌙 overlay)

- A **`By student ▾ / By item ▾`** toggle at the top of the overlay.
- **By item:** priority-sorted item cards → expand → the answer table (name · score · snippet ·
  `[Seen]` · comment) with **select-all-below-X** + a shared comment box + **✨ Draft for cluster**.
- **By student (existing):** per FRQ item, add the **✨ Draft** button next to its comment box.
- Drafts are always editable; a tiny "✨ AI draft — edit me" hint distinguishes drafted from typed.
- All marking still routes through the shipped `POST /class/review` (seen/comment/candy/toast/receipt).

## 5. Endpoints summary

| Endpoint | Repo | New/changed |
|---|---|---|
| `POST /api/ai/review-comment` | cr (`railway-server/server.js`) | NEW — draft a comment via the provider chain |
| `GET /class/review-item/:ledgerId` | roster (`review.js`) | NEW — full response + context for a Draft |
| `GET /class/review-by-item` | roster (`review.js`) | NEW — item-keyed queue |
| `POST /class/review` | roster | UNCHANGED — bulk `ledgerIds[]` already supported |

## 6. Security & privacy

- **Teacher-gated:** the new roster endpoints use the same `requireTeacher` / `resolveTeacherUsername`
  as the shipped ones. Students never see the queue or draft path.
- **LLM exposure:** `/api/ai/review-comment` sends a student's free-response answer to the same
  third-party LLM (Groq/DeepSeek) that `/api/ai/grade` **already** sends it to at grade time — so
  there is **no new data exposure**; it's the existing AI-grading trust boundary. Send only the
  answer + score + topic; **never** send names/`student_id`/PII to the LLM (the teacher pairs the
  draft with the student locally). Note this explicitly in the endpoint.
- **No grade change:** unchanged from v1 — a review/comment never alters a score. AI drafts a
  *comment*, not a grade.
- **Rate/DoS:** the Draft button is teacher-only + one call per tap; reuse the cr server's existing
  AI rate limiting.

## 7. Open decisions (defaults chosen)

1. **Draft data fetch** — on-demand `GET /class/review-item/:ledgerId` per Draft tap [default], vs
   fatten the queue with full FRQ responses. *Rec: on-demand — keeps the queue small.*
2. **Question text in v1** — omit (draft from answer+score+topic) [default], vs build the
   `itemId → questionText` map now. *Rec: omit in v1; add the map in v2 for sharper drafts.*
3. **Cluster draft input** — send the AI up to N (e.g. 5) representative low-score answers [default 5],
   balancing prompt size vs. representativeness.
4. **Model** — reuse the grading chain (Groq→DeepSeek) [default]; a comment is lighter than grading,
   so the fast tier is fine.

## 8. Phasing

| Phase | Work |
|---|---|
| **1 — AI comment** | cr `POST /api/ai/review-comment` + tests; roster `GET /class/review-item/:ledgerId`; Desk **✨ Draft** button in the by-student view |
| **2 — by-item** | roster `GET /class/review-by-item` + tests; Desk `By item` mode + answer table + select-below-X + shared comment |
| **3 — combo** | **✨ Draft for cluster** in the by-item view (AI over representative answers) |

## 9. Tests

- **cr `/api/ai/review-comment`:** returns a ≤180-char comment; empty/garbage response → graceful
  empty; no PII in the outbound prompt (assert the request body carries no name/sid); provider
  fallback path.
- **roster `/class/review-by-item`:** item grouping + priority order (FRQ/low-mean first), unseen
  count, meanScore, section/window; teacher-gated (student → 403).
- **`/class/review-item/:ledgerId`:** returns full response for the owner-teacher; 403 for a student.
- **Bulk `POST /class/review` with `ledgerIds[]` + shared comment:** each student candy-guarded once/day,
  one receipt per item, idempotent (already covered — extend for the multi-student shared-comment case).

## 10. Files touched (estimate)

**cr repo:** `railway-server/server.js` (+`/api/ai/review-comment`), a test.
**roster:** `review.js` (+`review-by-item`, +`review-item/:id`), `ledger-db.js` (item-grouped DAO if
needed), `tests/review.test.js`.
**Desk:** `ap_stats_roadmap_square_mode.html` (overlay `By item` mode + ✨ Draft buttons + cluster draft).
**Unchanged:** grading math, the signer, `POST /class/review`, candy/receipt flow, My-Ledger badges.
