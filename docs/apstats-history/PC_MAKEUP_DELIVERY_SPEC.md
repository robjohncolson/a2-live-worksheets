# PC Makeup / Backup Delivery — Pass 2 Spec

**Goal:** deliver the digitized **CB-secure PC26 banks** (U1/U2/U5) as an **online makeup/backup** for the paper Progress Checks — gated behind teacher-controlled per-student unlock, rendered through cr's existing question renderer, best-wins into the PC grade, retakeable until the quarter closes. **Paper stays the primary, proctored instrument.**

**Status:** SHIPPED — [A]-[F] all landed 2026-07-14/15. roster-server: `283ec51` ([A] unlock + [B] token-gated `/pc/:unit/:part`), `000a02e` (teacher preview bypass), `c9d2885` ([D] gated grade wiring + submit/paper/class endpoints), `b19dda7` ([E1] dashboard makeup-queue card), `7a53368` (D1-a figures: signed private-bucket URLs, **inert until `PC_FIGURES_SUPABASE_URL` + `PC_FIGURES_SUPABASE_SERVICE_KEY` are set**), `19048e0` ([D] quarter-close freeze + post-close bonus deltas). Desk: `5dc2939` ([F] mid-unit MCQ Part A calendar tiles). curriculum_render [C]: `c113c3a`, `f8704ba`, `23adfde`, `259eed4`, `d8b7e79`.
**Still open:** migrations `0029_pc_makeup` + `0030_quarter_grade_snapshot` must be RUN (endpoints 503 until then), the CB-secure `pc_bank` rows must be loaded out-of-band, and **FRQ auto-scoring is not built** — `scorePcItem` returns `null` for free-response, so FRQ falls through to the paper/AI path (§4's subpart policy was never decided).
**Depends on:** Pass 1 (shipped ✅) and the FRQ `lead` harmonization (done ✅).
**Repos:** roster-server (unlock, content, grade, notify), curriculum_render frontend (render adapter), the Desk (scheduling).

---

## 0. Hard constraints

- **The PC26 banks are CB-secure and must never enter a public repo** — not `curriculum_render` (GH Pages) and **not `follow-alongs/roster-server/`** (also a public repo). So the bank lives in a **private Supabase table**, loaded out-of-band, never committed.
- **Paper is primary.** Online is a makeup/booster that only ever *raises* a grade.
- **Grade-integrity:** no uncontrolled shifts to a working student (the Pass-1 lesson). Online PC only adds upward.
- **Inherent exposure (accept, don't "fix"):** once an unlocked student loads a PC item it's in their DOM/localStorage. The token gate controls *who can fetch*, not redistribution — same as any client-rendered secure item. This is why unlock is **post-paper only** (the secret is already spent in class).

---

## 1. Architecture — six pieces

```
Teacher gives paper PC in class
        │
        ▼
[A] Teacher UNLOCK action (roster-server)  ──►  per-student pc_unlock rows (present kids)
        │                                         └─► [E] absentees → makeup queue → teacher dashboard
        ▼
Student (unlocked) opens the online PC in cr
        │
        ▼
[C] cr fetches [B] token-gated /pc/:unit/:part (roster-server) ─► pc26ToCrQuestion adapter ─► renderQuestion
        │
        ▼  (submit → AI/auto grade, existing path)
[D] score → item_ledger source:'pc' ─► best-wins (Math.max) ─► PC mastery track ─► computeQuarterV3
        (honored only while the quarter is open)

[F] Scheduling: Desk pseudo Period-X — MCQ-A mid-unit, MCQ-B/C+FRQ at unit boundary
```

**Host decision (recommended): put [A] unlock, [B] content, and [D] grade all on roster-server.** Reason: unlock + sections + identity + grades already live there in one Supabase; cr's Railway server uses a *different* Supabase, so hosting /pc there would force a cross-service unlock check. roster-server issues the roster token, so it verifies it natively. cr's frontend already talks to roster-server (`roster-client.js`). *(Alternative: /pc on cr's Railway server + a cross-service unlock lookup — more moving parts; not recommended.)*

---

## 2. [A] Unlock — teacher action, section-minus-absentees (roster-server)

**Data:** new Supabase table
```
pc_unlock ( student_id, unit, part, unlocked_at, unlocked_by, revoked_at NULL )
  PK (student_id, unit, part)     part ∈ { 'A', 'REST' }
```
`part` granularity = **per administration**: `'A'` (mid-unit MCQ-A) and `'REST'` (end-of-unit MCQ-B/C + FRQ) unlock independently.

**Endpoints (teacher-gated, `requireTeacher`):**
- `POST /pc/unlock` `{ section, unit, part, presentStudentIds[] }` — for the section's roster: insert `pc_unlock` rows for every **present** student; the roster **minus** present = **absentees** → written to the makeup queue ([E]). Idempotent (upsert). Returns `{ unlocked: n, absent: [...] }`.
- `POST /pc/unlock/student` `{ studentId, unit, part }` — single-student unlock (the after-school makeup case); also clears the student from the makeup queue.
- `GET /pc/unlock/status?studentId=&unit=&part=` — used by [B].

**Present list source:** the teacher marks present at unlock time (the unlock UI shows the section roster, teacher unchecks absentees). No standing attendance system needed — the unlock action *is* the attendance snapshot for that PC.

**Gaps:** the table, the three endpoints, and the teacher unlock UI (a card on `teacher-dashboard.html` or `teacher-classroom.html`).

---

## 3. [B] Token-gated PC content (roster-server)

**Storage:** new **private Supabase table** `pc_bank ( unit, part, payload jsonb )` — the PC26 JSON loaded out-of-band via a one-off admin script (never committed). U1/U2/U5 only.

**Endpoint:**
```
GET /pc/:unit/:part
  sid = verify roster token (Bearer)          → 401 if absent
  if !(await pcUnlocked(sid, unit, part))      → 403      (the gate)
  return QUESTIONS ONLY (no answer key)        (PC26 items, stripped of `answer`)
  // Retakes stay OPEN after quarter close — the grade path freezes the quarter
  // snapshot and records post-close improvement as next-quarter bonus (§5).
```
Reuses the existing roster-token verification (roster-server is the token issuer). CORS already wildcard-open.

**Fetch-once, then work offline (the reliability fix).** The one connection needed is the initial unlocked fetch; the client **caches the questions locally** (IndexedDB, like the offline pack) so a mid-attempt connection drop never blocks the work. **The answer key never ships** — it stays server-side for grading (§5). Two payoffs: (a) reliability — display + work survive going offline; grading queues; (b) it's assessment-correct — a Progress Check should NOT reveal per-question answers instantly the way a practice quiz does, so gating the answers *also* enforces proper assessment behavior (no instant reveal → retake-with-knowledge).

---

## 4. [C] cr rendering adapter (curriculum_render frontend)

cr's `renderQuestion` reads its **native** schema; PC26 field names are read nowhere. So add a **client-side adapter** — zero renderer edits, zero `curriculum.js` edits.

**`pc26ToCrQuestion(item)`** maps:
| PC26 | cr-native |
|---|---|
| `stem` | `prompt` |
| `answer` | **omitted** — the endpoint strips it; nothing to emit. No instant client MCQ reveal (assessment-correct); grading is server-side on sync (§5). |
| `choices[]` | `attachments.choices[{key,value}]` |
| `visual` | `attachments.{chartType|charts|table|image}` (image→`image` URL, grid→`table` 2D array, chart→real Chart.js descriptor) |
| `questionParts[{label,lead,prompt,subparts}]` | `solution.parts[{partId,description}]` |
| `glossary` | append to `prompt` (no native slot) |

**Trigger + offline cache:** a PC "topic" entry / deep-link (e.g. `?pc=U1-A`) →
```
let items = await pcCache.get(unit, part);              // IndexedDB
if (!items) {                                           // first access needs ONE connection
  items = await fetch(ROSTER_SERVICE_URL+'/pc/'+unit+'/'+part,
    { headers:{ Authorization:'Bearer '+rosterClient.token() } }).then(r=>r.json());
  await pcCache.put(unit, part, items);                 // henceforth offline-workable
}
loadLessonWithResources({ questions: items.map(pc26ToCrQuestion), newTopic, newLabel });
```
Pass explicit `newTopic`+`newLabel` (PC ids won't match the crosswalk → blank header otherwise).
Responses are captured to the existing **OfflineQueue** (NOT graded client-side) and sync to roster-server on reconnect (§5) — a mid-attempt connection drop never blocks the work or loses answers.

**FRQ subpart policy (decision needed):** cr's progressive FRQ gives **one textarea per `solution.parts[]` entry**. PC26 has `subparts[]` (multiple sub-questions under one lettered part). Two options:
- **(i) Explode** each `subpart` into its own cr part → one textarea per sub-question (finer grading granularity).
- **(ii) Concatenate** `lead` + `subparts` into one `description` → one textarea per lettered part (matches the paper's part structure).
Lean **(ii)** — mirrors the paper the student already took; simpler grading.

**Gaps:** the adapter, the PC-topic trigger/deep-link, the FRQ policy, glossary handling, visual→chart transforms.

---

## 5. [D] PC grade feed (roster-server)

- **New ledger source `'pc'`, scored server-side on sync** — the client captures raw responses (itemId + choice, or FRQ text) into the **OfflineQueue**; on reconnect they POST to roster-server, which scores them against the **private PC answer key** (§3's `pc_bank`, never client-side) and writes item_ledger rows `source:'pc'`. Reuses the existing quiz-scoring path (MCQ correctness; FRQ via the AI grader / `quiz_review` partial-credit). Grading is server-authoritative — which is exactly why the answer key never ships and why a dropped connection just defers the score, never loses it.
- **Best-wins:** the PC score for `(student, unit, part)` = **`Math.max`** over the paper score + all online attempts — the exact `Math.max` pattern trainer/blooket already use (`lesson-grade.js`). Only raises.
- **PC mastery track:** the combined per-unit PC score feeds the **PC-mastery track** of `computeQuarterV3` (the two-track model; `combineV3` currently short-circuits to Work-only until PCs exist — this is what "turns them on"). The **60%-work floor** already governs: below 60% work → grade = average of PC & work, so a memorized PC can't carry the grade (user-accepted).
- **Quarter close = FREEZE + DELTA (not a cutoff):** retakes never stop. At each quarter boundary (`quarters`/Q1–Q4 in `grade-contexts.js`), **snapshot** the PC grade that counted for that quarter — frozen and immutable (the M2b freeze pattern, applied per-quarter). Post-close `'pc'` rows keep landing (they carry `ts` → bucket by quarter). Any improvement **above the frozen snapshot** is recorded as a **delta** and surfaced to the teacher as **extra-credit/bonus for the NEW quarter** — a bonus MINT (like `candy_bonus`), applied at the teacher's discretion, that **never edits the closed quarter**. Net: a closed quarter's grade is stable; continued mastery is rewarded forward.

**Gaps:** the `'pc'` source + its scoring write, the best-wins reducer for PC, wiring the PC-mastery track live, the quarter-close guard. **⚠ roster-server auto-deploys on push — grade-affecting, flag every change.**

---

## 6. [E] Absentee makeup notification (roster-server + dashboard)

- The `POST /pc/unlock` absentee set → a `pc_makeup_queue ( student_id, unit, part, added_at, cleared_at NULL )` table.
- Surface as a **teacher-dashboard card** ("Makeup queue: 3 students need U1 MCQ-A") computed from the open queue — not a student nudge (`nudge.js` is teacher→student; this is teacher-facing).
- `POST /pc/unlock/student` clears the student from the queue when their makeup is done.
- **Post-close bonus list (§5):** surface each student's PC improvement *above the frozen quarter snapshot* as a teacher-facing extra-credit list for the new quarter — one row per `(student, unit, part)` where current-best > frozen snapshot, with the delta. Teacher applies as bonus at discretion.

**Gaps:** the queue table, the per-quarter PC snapshot + delta computation, the dashboard card(s), the clear-on-unlock.

---

## 7. [F] Scheduling — Desk pseudo Period-X (no real calendar needed)

Per the earlier summer-schedule scout: `injectPcPosterEvents` (`ap_stats_roadmap_square_mode.html:9359`) auto-derives one end-of-unit PC block per unit. Add a **mid-unit MCQ-A** using the pseudo Period-X pacing:
- A split-point lookup `{ unit → after-topic }` (U1 → after `1.6`; U2 → after `2.6` = old `4.5`, verified against the bank).
- In the injection loop, after the split-point cell, insert a distinct-id PC-A pseudo-cell (`U{u}-PCA`, non-dot so the lesson gate ignores it); `prevU` untouched so the end-of-unit block still fires once.
- **Gotchas** (from the scout): extend the `kind`+`admin` forwarding in `generateSchedule` (`:9635`) if adding a field; `htm()` (`:9502`) hardcodes the PC label — add a PC-A branch; each inserted cell +1 meeting day (the pre-existing `desk-year-opener` tail-drop is a *separate* known issue).

---

## 8. Decisions to lock before build

1. **Host** = roster-server for unlock+content+grade (recommended) vs split with cr's server. *(Recommend roster-server.)*
2. **FRQ subparts** = concatenate per lettered part (recommend) vs explode per subpart.
3. **PC bank storage** = private Supabase table, loaded out-of-band; questions served **without answers** and **cached client-side (IndexedDB) for offline work**; grading is server-authoritative on sync. (✅ per user: display survives offline, grade defers to next connection.)
4. **Unlock granularity** = per `(unit, part)` with part ∈ {A, REST} — confirmed by the "MCQ-A then the rest" flow.
5. **Quarter boundary = FREEZE + DELTA** (✅ per user, not a hard cutoff): freeze the quarter's PC snapshot at close, keep retakes open, record post-close improvement above the snapshot as next-quarter **bonus/extra-credit** the teacher applies at discretion. The closed quarter never changes.

## 9. Risks

- **Schema mismatch is the core work** — without the adapter, PC26 renders blank. The adapter *is* the integration.
- **Two-Supabase boundary** — co-locating on roster-server avoids a cross-service unlock check.
- **`ROSTER_TOKEN_SECRET`** must be present on roster-server (it is — it's the issuer); the `/pc` gate 401s if misconfigured.
- **Grade-affecting deploy** — [D] touches the live grade engine; every change flagged, goldens re-checked (the M2b lesson).
- **Inherent DOM exposure** — accepted (post-paper unlock).

## 10. Sequenced task list

1. **Private Supabase:** `pc_bank`, `pc_unlock`, `pc_makeup_queue` tables + a one-off out-of-band loader for the U1/U2/U5 banks (never committed).
2. **roster-server [B]:** `GET /pc/:unit/:part` (token + unlock + quarter-open gated).
3. **roster-server [A]:** `POST /pc/unlock`, `/pc/unlock/student`, `GET /pc/unlock/status` + teacher UI card.
4. **cr [C]:** `pc26ToCrQuestion` adapter + PC-topic trigger; verify render of a real PC26 MCQ + FRQ.
5. **roster-server [D]:** `'pc'` ledger source + scoring write + best-wins reducer + PC-mastery-track wiring + quarter-close guard; re-check M2b goldens.
6. **roster-server + dashboard [E]:** makeup queue + dashboard card.
7. **Desk [F]:** mid-unit MCQ-A placement in Period-X pacing.
8. Verify end-to-end on the public URL: teacher unlocks a section → unlocked student takes the online PC → score raises the PC grade → absentee shows in the makeup queue.
