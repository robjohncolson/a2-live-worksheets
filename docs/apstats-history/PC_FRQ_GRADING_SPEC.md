# PC FRQ Grading — Design Spec

**Status: DRAFT — teacher decisions pending**
**Scope:** how an ONLINE Progress-Check free-response item gets a score.
**Repos:** `roster-server/` (primary), `curriculum_render/` (AI provider today), `teacher-dashboard.html` (teacher UI).
**Written:** 2026-08-07. No code changed by this document.

---

## 0. TL;DR

Online PC FRQ answers are **captured but never graded**. The text is safely in
`item_ledger` with `score = null`; nothing on any path turns that null into a number.

The **single biggest finding of this investigation** is not the missing grader — it is
that **no scoring rubric exists anywhere in this repo for any PC26 FRQ item.**
Whatever architecture is chosen, **rubric authoring is part of the work**, it is
teacher-owned, and it must happen before the first REST administration (~late Sept).

The second finding is a live correctness hazard: because `scorePcRows` averages
per-item credit and **drops null-score rows from the denominator**, grading an FRQ
*later* can **lower** a unit's PC percentage. That breaks the documented
"post-close deltas are always positive" guarantee in migration `0030`.

---

## 1. Verified current state

| Fact | Where |
|---|---|
| MCQ auto-scores server-side vs the CB-secure `pc_bank`; FRQ returns `null` | `roster-server/pc.js:81-87` (`scorePcItem`) |
| The FRQ **response text IS persisted** — row written with `score: null` | `roster-server/pc.js:214-235` |
| A retake never lowers a stored score, and an ungraded FRQ never wipes a prior score | `roster-server/pc.js:218-223` |
| Null-score rows are **skipped**, i.e. dropped from the PC denominator | `roster-server/scoring.js:229` |
| A finite `row.score` is honored verbatim — this is the FRQ partial-credit hook the Phase-2 spec left open | `roster-server/scoring.js:220-222` |
| The PC track is env-gated and inert today | `roster-server/grade-config.js:124` (`PC_TRACK_ENABLED`) |
| AI-drafted teacher comments are released only for `pc` rows ending `-SG` | `roster-server/review.js:108-116` |
| A `pc` row's signed receipt claims provenance `'key'` (answer-key graded) | `roster-server/receipts.js:71-78` |
| roster-server makes **no outbound LLM call today**; deps are `@supabase/supabase-js`, `bcryptjs`, `cors`, `express` | `roster-server/package.json` |
| The AI grader lives in the OTHER repo: `POST /api/ai/grade` | `curriculum_render/railway-server/server.js:668` |

### The cr AI grader, measured

| Property | Value |
|---|---|
| Primary model | DeepSeek `deepseek-v4-flash` (pinned `primary: true`), thinking OFF |
| Failover | Groq `llama-3.3-70b-versatile` |
| Request shape | `{ scenario:{questionId, prompt, questionType, correctAnswer, choices}, answers:{answer}, prompt, aiPromptTemplate }` |
| Response shape | `{ score: "E"|"P"|"I", feedback, matched[], missing[], _provider, _model }` |
| Throughput | one **serialized** `GradingQueue`, `minDelayMs: 2500`, `maxRPM: 25` per provider ⇒ **≈24 gradings/minute ceiling, class-wide** |
| Timeout | 30 s per call, then failover |
| Cost | $0 marginal (free tiers) |
| Data posture | third-party (Groq / DeepSeek); zero-retention terms **unconfirmed** — already flagged in `NIGHTLY_REVIEW_V2_SPEC.md` §0 correction 3 |

### The closest working precedent — copy this, don't reinvent it

`study_guide_diagnostic.html:5578` already AI-grades a Progress-Check FRQ and writes
the result to the ledger:

```
gradebookClient.record({ source:'pc', itemId: gateId(unit)+'-SG', unit,
                         response: answer, score: {E:1,P:0.5,I:0}[result.score] })
```

Its prompt builder — `ai-grading-prompts-study-guide.js:117` `buildReflectionPromptSG` —
injects `solution.scoring` (the **official CB scoring guide**) plus `solution.parts[]`
checkpoints and asks for E/P/I with `matched`/`missing`. It degrades gracefully to
`(official scoring guide unavailable for this question)` when the rubric is absent.
**This is a working, calibrated PC-FRQ grader. The PC26 path should reuse its prompt
shape and its rubric format.**

> ⚠️ **Pre-existing hazard, independent of this work.** Those `-SG` rows are
> `source:'pc'` with a `U#-` prefix, so `unitOf()` buckets them into the unit and
> `scorePcRows` averages them into the **online PC mean**. The moment
> `PC_TRACK_ENABLED` flips, unproctored study-guide self-practice starts counting as
> PC mastery evidence. Decide this deliberately (see **D10**) — it is not caused by
> FRQ grading but it lands in the same aggregate.

---

## 2. CRITICAL: do PC26 FRQ rubrics exist? — **No, not in this repo.**

Exhaustive search results:

| Candidate source | Result |
|---|---|
| `data/answer-key.json` (public key) | **0** keys matching `/PC/i`. No PC26 entries at all. |
| `ai-grading-prompts*.js` (73 files) | Keyed by worksheet textarea ID. **Zero** PC26 rubrics. |
| `data/study-guide-frq-bank.js` | **9 rubrics — but for the LEGACY `U#-PC-FRQ-Q##` items**, not PC26. Correct *format*, wrong *items*. |
| `roster-server/data/*` | `pc-figures-manifest.json` only — image slots, no rubrics. |
| `curriculum_render` `curriculum.js` | Old PCs were **deleted** by `CR_SY2627_ATTENUATION_SPEC.md` §A (364 items, 17 FRQ). Gone. |
| `pc_bank` Supabase rows | **UNVERIFIABLE from this machine.** See below. |

### The one open question — and the exact command to close it

`roster-server/pc.js:20-24` whitelists client fields and names `rubric` as a field
"omitted by construction", which implies bank items *may* carry one. But the only
evidence is that comment plus a synthetic test fixture (`tests/pc.test.js:45`).
The real banks live outside every repo, on the teacher's machine:

```
school/apstatsy2627u{1,2,5}pc/extracted/unit{u}-pc-bank.v2.json
```

**Teacher, run this and paste the output — it decides §3 and the whole schedule:**

```bash
node -e "
for (const u of [1,2,5]) {
  const p = 'apstatsy2627u'+u+'pc/extracted/unit'+u+'-pc-bank.v2.json';
  const parts = JSON.parse(require('fs').readFileSync(p,'utf8')).parts || {};
  for (const f of (parts.FRQ?.items || []))
    console.log('U'+u, f.id, 'rubric:', !!f.rubric, 'scoring:', !!(f.solution&&f.solution.scoring), 'parts:', (f.questionParts||[]).length);
}"
```

- **If `rubric` / `solution.scoring` is present** → the rubric already ships inside
  `pc_bank`; it just has to reach the grader. Authoring cost ≈ 0. Best case.
- **If absent** (the likely case — the loader at `scripts/load-pc-bank.mjs:37-56`
  copies items verbatim and nothing in this repo ever wrote a PC26 rubric) →
  **rubric authoring becomes a hard prerequisite**, see below.

### If rubrics must be authored

- **Who:** the teacher. These are College Board official scoring guides transcribed
  from the PC26 answer keys; nobody else has them and they are CB-secure.
- **How many:** ~6 known FRQ items carry figures (`U1/U2/U5 × FRQ-Q01/Q02`); the bank
  may contain more without figures. Assume **6–10 rubrics**, ~2–4 lettered parts each.
- **Format:** exactly the shape `data/study-guide-frq-bank.js` already uses, so
  `buildReflectionPromptSG` consumes it unchanged:

```jsonc
"solution": {
  "parts": [ { "partId": "a", "description": "...", "response": "...", "calculations": ["..."] } ],
  "scoring": {
    "totalPoints": 4,
    "rubric": [
      { "part": "a", "maxPoints": 2,
        "criteria": ["The correct z-scores are listed with supporting calculations"],
        "scoringNotes": "Essentially correct (E) if ... Partially correct (P) if ... Incorrect (I) if ..." }
    ]
  }
}
```

- **Where it lives:** **never in a public repo.** Add the `solution` object to the
  out-of-band bank JSON and re-run `roster-server/scripts/load-pc-bank.mjs`. The
  loader needs no change — it upserts whatever the file contains. The `/pc/:unit/:part`
  read endpoint already strips `rubric` and `answer` by whitelist
  (`pc.js:24`), so authoring a rubric into the bank leaks nothing to students,
  **provided `solution` is added to the strip list** (see blast radius §8).
- **Fallback if rubrics never get authored:** the study-guide prompt degrades to
  "(official scoring guide unavailable)" and asks a strong model to grade against
  general AP conventions. This works — it is what the diagnostic does for units
  whose record wasn't lifted — but it is **not defensible to a parent** and appeals
  become un-adjudicable. Not recommended for a graded instrument.

---

## 3. Architecture options

All three share the same write contract, chosen deliberately so the grade engine
never changes:

> **The grade lands in the `score` column of the EXISTING `source:'pc'` row.**
> `scoring.js:220-222` already honors a finite `row.score` verbatim.
> No new ledger source, no new migration, no `grade.js` / `lesson-grade.js` edit,
> **M2b goldens stay byte-identical.** A new source (`pc_frq`) would fall outside
> `bySource('pc')` and force a grade-engine change — reject that.

### Option A — roster-server calls cr's `/api/ai/grade`

roster-server adds `POST /pc/grade-frq` (teacher-gated). It loads the bank item +
rubric, loads the ungraded `pc` FRQ rows, and POSTs one request per row to
`https://curriculumrender-production.up.railway.app/api/ai/grade`, then writes
`score` back onto the row.

| | |
|---|---|
| ✅ | Zero new dependencies, zero new API keys, zero new billing. Reuses a grader that has been calibrated against this course for a year. |
| ✅ | Same provider chain the appeal path already uses ⇒ `quiz_review` partial credit and `/api/ai/appeal` are reachable for free. |
| ❌ | **Cross-service, cross-Supabase call.** roster-server currently makes no outbound HTTP; adds a failure mode where a cr outage blocks PC grading. |
| ❌ | **Throughput.** One serialized queue at 2.5 s/call ⇒ 30 students × 2 FRQ = 60 calls ≈ **2.5 minutes minimum**, competing with live worksheet grading during class. |
| ❌ | **CB-secure content to Groq/DeepSeek** with unconfirmed retention terms. |
| ⚠️ | cr grades identity-free (`applyWrongMcqCap` depends only on scenario+answers; `sidFromRequest` is optional and receipt issuance is simply skipped without a sid — verified `railway-server/server.js:671-700`). No cr-side change is needed for grading; identity work arises ONLY if a signed cr receipt is wanted as provenance. *(Corrected per adversarial review 2026-08-07 — do NOT build a bypass or impersonation mechanism for this.)* |

### Option B — roster-server makes its own Anthropic call

A new `roster-server/pc-frq-grader.js` using `@anthropic-ai/sdk`, keyed by a new
`ANTHROPIC_API_KEY` Railway env var. Model `claude-opus-5` (or `claude-haiku-4-5`
for cost), structured output pinned with `output_config.format` so the E/P/I or
0–4 verdict is schema-guaranteed rather than regex-scraped.

| | |
|---|---|
| ✅ | **Self-contained.** The service that owns the bank, the rubric, the ledger, and the grade also owns the grading call. No cross-service dependency, no cross-Supabase hop. |
| ✅ | **Structured outputs** eliminate the `extractAndParseJSON` repair heuristics cr needs (`server.js:1000+`). A malformed verdict becomes impossible rather than "normalized to I". |
| ✅ | **Throughput.** No 2.5 s serialization; a whole administration grades in seconds. The **Batch API** (50% off, ≤24 h) fits the overnight-grading cadence perfectly. |
| ✅ | **Data posture is a deliberate choice**, not an inherited one — zero-data-retention is available on the Anthropic API for orgs that configure it. |
| ✅ | Rubric-grounded AP FRQ scoring is exactly the task frontier models are strongest at; a 0–4 AP score with per-part E/P/I is realistic. |
| ❌ | New dependency, new secret to manage, new billing surface. |
| ❌ | Two AI graders in the course with different calibration — a student could see an FRQ graded one way on a worksheet and another way on a PC. |
| ❌ | Cost, though trivially small: ~180 gradings/administration × (~3K in + ~500 out) ≈ **$5 on `claude-opus-5`**, ~$1 on `claude-haiku-4-5`, halved again with the Batch API. |

### Option C — teacher-manual only for the first release

No AI. `POST /pc/grade-frq` accepts a teacher-entered score. A new
teacher-dashboard card lists ungraded PC FRQ rows (student, item, response text)
with an E/P/I or 0–4 selector; submitting writes `score` onto the row.

| | |
|---|---|
| ✅ | **Ships fastest and is unimpeachable.** No rubric-authoring blocker (the teacher grades from the paper key in hand), no third-party exposure, no calibration risk. |
| ✅ | The teacher-facing UI is **required by every option anyway** (see D4) — Option C is a strict subset of A and B, so it is never wasted work. |
| ✅ | Volume is genuinely small: ~6 FRQ items × ~30 students, at most twice a quarter. |
| ❌ | Manual labor. The paper FRQ still has to be graded too; this doubles it for any student who takes the online makeup. |
| ❌ | Doesn't scale to "retakeable until quarter close" — every retake needs a human pass. |

---

## 4. TEACHER DECISION POINTS

> These are the decisions that block implementation. Each has a recommendation but
> **none should be made by an agent.**

**D1 — Do PC26 FRQ rubrics exist in the bank?**
Run the one-liner in §2. If no: **who authors the ~6–10 rubrics, in what format, by
when?** *Rec: teacher authors, in `data/study-guide-frq-bank.js`'s
`solution.scoring` shape, added to the out-of-band bank JSON, before the late-Sept
REST administration.* **This is the schedule-critical item.**

**D2 — Grading engine: A (call cr), B (own Anthropic call), or C (manual first)?**
*Rec: **C now, B next.** See §9.*

**D3 — May CB-secure PC26 FRQ stems and official scoring guides be sent to a
third-party LLM?**
Distinct from D2. Grading a student's answer without the stem/rubric is weak;
grading with them means the secure item text leaves our infrastructure. Options:
(a) yes, current chain (Groq/DeepSeek, retention unconfirmed); (b) yes, but only to
a provider with contractual zero-retention; (c) no — send the **student answer +
rubric criteria only**, never the verbatim stem; (d) no AI at all (Option C).
*Rec: (b) or (c).*

**D4 — Auto-release AI scores, or teacher-gated release?**
The Nightly Review surface already implements verify-then-act
(`/class/review-queue` → `/class/review-item/:id` → `POST /class/review`), and
`itemPriority` already floats FRQ to the top (`review.js:64`). Options:
(a) AI writes `score` immediately, teacher may override; (b) **AI writes a
*proposed* score the teacher approves before it reaches `score`** — proposal lives
in a `pc_frq_proposal` table or a `#draft`-suffixed shadow row, never in the graded
column; (c) manual only. *Rec: (b) for the first graded administration, (a) once
the AI's agreement rate with the teacher is measured over one real administration.*

**D5 — Partial-credit scale onto the 0..1 `score` row.**
Three incompatible scales already exist in this codebase:

| Scale | Used by | E / P / I |
|---|---|---|
| `quiz_review` credit | migration `0015` | 1.0 / 0.667 / 0.333 |
| `frqBand` | `grade-config.js:23` | 100 / 70 / 35 |
| Study-guide `-SG` | `study_guide_diagnostic.html:5578` | 1 / 0.5 / 0 |

A fourth is more faithful to the instrument: **AP points ÷ total** — score each
lettered part E/P/I, apply the AP combination rule, divide by `totalPoints` (4).
That makes an online FRQ commensurate with the paper FRQ, which is the whole point
of best-wins. *Rec: **AP points ÷ totalPoints**, with per-part E/P/I recorded in the
response payload for audit. If that's too heavy, `quiz_review`'s 1/0.667/0.333 is
the closest existing precedent.* **Whatever is chosen must be written down here —
it is a grade-affecting constant and belongs in `grade-config.js`, not inline.**

**D6 — Appeal policy for PC FRQ.**
Worksheet reflections get 3 appeals via `/api/ai/appeal`; the appeal path can only
*raise* a score. A Progress Check is a proctored-adjacent instrument. Options:
(a) no appeals — teacher override only; (b) 1 appeal, AI-adjudicated, never lowers;
(c) full 3-appeal parity with worksheets. *Rec: (a). The paper PC is the primary
instrument and already best-wins; an appeal loop on the makeup is a farming
surface.*

**D7 — Quarter-freeze with an FRQ still ungraded.**
Today: an ungraded FRQ is silently **excluded from the denominator**, so the unit's
PC% is the MCQ-only mean and the freeze snapshots that. Options: (a) keep the
exclusion (silent, forgiving, current); (b) count an ungraded-but-submitted FRQ as
0 at freeze (harsh — punishes the student for the teacher's queue); (c) **block
`/class/quarter/close` with a 409 listing the ungraded FRQ rows**, forcing the queue
to be drained first. *Rec: (c) — the freeze is immutable and first-close-wins
(`migrations/0030`), so closing over an ungraded FRQ bakes in a number nobody
intended.*

**D8 — A late-graded FRQ that LOWERS a unit's PC mean.** *(see §5 — this is real)*
Options: (a) allow it, honest; (b) **never-lowers at the unit level** — clamp the
recomputed unit PC% to its highest previously-observed value; (c) never-lowers only
after a quarter has closed. *Rec: (b). "Online only ever raises" is the promise made
to students in `PC_MAKEUP_DELIVERY_SPEC.md` §0; (a) breaks it and (c) breaks it
mid-quarter.*

**D9 — Scope of the first graded REST administration (~late Sept).**
U1 only, or U1+U2? Fewer rubrics to author, one calibration cycle to observe.
*Rec: U1 only. Grade U1's FRQs by hand (Option C), measure how a proposed AI score
would have compared, then enable the automated path for U2/U5.*

**D10 — Should study-guide `-SG` rows count toward PC mastery at all?**
Pre-existing, activates the moment `PC_TRACK_ENABLED` flips. These are unproctored,
untimed, retakeable self-practice. Options: (a) leave as-is (they count);
(b) exclude `-SG` from `scorePcRows` so the PC track means "Progress Check" only.
*Rec: (b), and do it in the same change as the FRQ work since both touch
`scorePcRows`.*

---

## 5. Best-wins reducer interaction — the mean-dilution hazard

**Best-wins is enforced per ITEM at write time. The unit grade is a MEAN over
graded items. Adding a newly-graded item to a mean can lower it.**

Worked example, U1 REST, 20 MCQ + 1 FRQ:

| Moment | Graded items | Unit PC% |
|---|---|---|
| Submission (FRQ `score = null`) | 20 MCQ, 16 correct | `16/20 = 80.0%` |
| FRQ graded at 0.4 | 21 items, sum 16.4 | `16.4/21 = 78.1%` ← **dropped 1.9 pts** |

Downstream consequences:

1. **`migrations/0030`'s stated invariant is false.** Its header asserts
   "Best-wins-at-write (Phase 2 /pc submit) guarantees the live grade only ever
   RISES post-close, so a delta is always a positive extra-credit candidate, never a
   drop the freeze has to shield against." A post-close FRQ grade can make
   `current < frozen`. The freeze itself still protects the closed quarter, and
   `class.js:450` filters to `delta > 0` so the drop is invisible rather than
   harmful — **but the comment must be corrected and the invariant re-derived.**
2. **The live in-quarter grade visibly drops** for a student who already saw their
   post-MCQ number. That is the exact "uncontrolled shift to a working student"
   failure `PC_MAKEUP_DELIVERY_SPEC.md` §0 forbids.
3. **The paper row shields most students but not all.** `-PAPER` is a unit-level
   pct that best-wins against the online mean (`scoring.js:231-247`), so anyone
   whose paper ≥ diluted online is unaffected. The exposed cohort is exactly the
   students the makeup was built for: those whose online run beat their paper.
4. **A retake overwrites the response but keeps the max score.** `pc.js:224-228`
   upserts on `(student, source, item, attempt=1)`, so a retake replaces
   `response` while `finalScore` stays at the prior max. **A re-grade therefore
   evaluates NEW text and may produce a LOWER number than the stored score.**
   Any grader must apply `Math.max(newScore, existingScore)` at write — same
   only-raises rule as `pc.js:218-223`.

**Design requirement (regardless of option):** the FRQ write path must be
`score = Math.max(computed, existing ?? 0)`, and — per **D8** — the unit aggregate
should carry a never-lowers floor.

---

## 6. Offline-queued submissions

An offline PC sitting is captured by `curriculum_render/offline-queue.js` and
drained by `gradebookClient.syncOfflineQueue()`, which replays each record through
`_postRecord` → `_postPc` → `POST /pc/:unit/:part/submit`
(`curriculum_render/gradebook-client.js:92-113`). The queued record carries `part`
explicitly because U5's MCQ-A lives in its REST bank.

**Nothing special is required.** An offline FRQ drains into exactly the same
`score: null` row as an online one. Consequences to record:

- The grading trigger should be **queue-driven** ("grade every `source:'pc'` row
  whose `item_id` matches the bank's FRQ set and whose `score` is null", run on
  demand by the teacher and/or nightly) — for teacher control and batch
  efficiency, NOT because submit hooks miss replays. *(Corrected 2026-08-07: the
  offline drain replays through `_postRecord` → `_postPc` → `POST
  /pc/:unit/:part/submit`, so a submit-path hook WOULD see late-synced attempts;
  a queue-driven pass is simply the better design.)*
- **Idempotency:** a drain can replay the same record (the queue deletes only what
  lands). Re-grading an already-graded row must be a no-op or an only-raises
  update — never a duplicate ledger row (the upsert key already prevents that).
- **Latency is unbounded.** A student can sync days later. Two distinct states
  matter at quarter close (adversarial review 2026-08-07):
  1. **Synced but ungraded** — a `score: null` row exists server-side; D7's
     option (c) 409-guard on `/class/quarter/close` can and should catch this.
  2. **Not yet synced** — the attempt lives only in the client's IndexedDB
     queue; NO server signal exists, so no close-guard can detect it. If close
     must wait for these, it needs a server-visible sitting/completion
     acknowledgement (e.g. the unlock row records "sitting started") or an
     explicit teacher reconciliation step ("all makeup students synced?") before
     close. D7's rec (c) covers state 1 only — decide state 2 separately.
- The `#draft`/proposal path (D4 option b) inherits all of this unchanged.

---

## 7. Test plan

### 7.1 Unit — the scoring math (`roster-server/tests/`)

New `pc-frq-grade.test.js`, no network, mirroring `pc-grade-wiring.test.js`:

1. **E/P/I → credit mapping** for whichever scale D5 picks; assert exact constants.
2. **AP-points variant** (if D5 chooses it): per-part E/P/I → combination rule →
   points → `points/totalPoints`, with the 4-point and 2-part cases pinned.
3. **Only-raises at write:** existing `score: 0.75`, new computed `0.4` ⇒ stored
   stays `0.75`; new computed `0.9` ⇒ stored `0.9`.
4. **Mean-dilution guard (D8):** 20 MCQ at 0.8 + FRQ graded 0.4 ⇒ assert the unit
   pct is floored at 80.0, not 78.1.
5. **Ungraded FRQ stays excluded:** `scorePcRows` with a null-score FRQ row ⇒
   denominator unchanged (pins today's `scoring.js:229` behavior).
6. **`-SG` exclusion (D10, if chosen):** a `U1-PC-FRQ-Q02-SG` row does not enter
   `units.U1.pct`.
7. **Idempotent re-grade:** grading the same row twice produces one row, same score.

### 7.2 Endpoint (`pc-frq-endpoints.test.js`, fake `pcDb`/`ledgerDb`)

8. `POST /pc/grade-frq` is teacher-gated — student token ⇒ 401/403.
9. Bank absent ⇒ 503 `run migration 0029` (matches the existing 42P01 pattern).
10. Unknown `itemId` (not in the bank's FRQ set) ⇒ ignored, never written.
11. **No answer/rubric leaks in the response body** — extend the existing
    `tests/pc.test.js:195-198` blob assertion to the new endpoint: the serialized
    response must not contain `answer`, `rationaleCorrect`, `rubric`, or `solution`.
12. Teacher-gated release (D4b): a proposal never lands in `score` until approved.

### 7.3 M2b golden re-check — **mandatory, grade-affecting**

```bash
cd roster-server && npx vitest run tests/m2b-grade-invariance.test.js
```

- **Expected result: PASS UNCHANGED, no golden regeneration.** The whole point of
  writing the FRQ score into the existing `pc` row's `score` column is that
  `computeGrade` / `computeQuarterV3` see no new code path. All five fixtures
  (`sy2627-{empty,quiz_partial,frq_work,mixed}.json`, `sy2526-pc.json`,
  `sy2526-pc-v3.json`, `art-hashes.json`) must be byte-identical.
- **If a golden moves, the design has been violated** — something touched
  `scoring.js`/`grade.js`/`lesson-grade.js` shared math. Stop and re-read §3.
- **Exception:** choosing D8(b) never-lowers or D10(b) `-SG` exclusion *does* edit
  `scorePcRows`. Those are real grade changes. Re-run the goldens, **diff them by
  hand**, confirm the only movement is on PC-bearing scenarios, and regenerate with
  `UPDATE_M2B_GOLDEN=1` in the same commit that documents why.
- Also re-run the inertness proof: `npx vitest run tests/pc-grade-wiring.test.js`
  — with `pcTrack.enabled:false` the FRQ score must remain grade-inert.
- Full guard: `cd roster-server && npm test` and `npm test` at root.

### 7.4 Manual, on the public URL (the teacher's only valid surface)

13. Teacher unlocks one student for U1 REST → student submits MCQ + FRQ →
    dashboard shows exactly one ungraded FRQ → grade it → `GET /grade` for that
    student shows the unit PC% move in the expected direction.
14. Offline: airplane-mode the submission, re-connect, confirm the row drains and
    then appears in the ungraded queue.
15. `POST /class/quarter/close` with an ungraded FRQ present ⇒ behaves per D7.

---

## 8. Blast radius

### Files that change

| File | Change | Risk |
|---|---|---|
| `roster-server/pc.js` | new `POST /pc/grade-frq` (+ `GET /pc/frq/ungraded` for the queue). `scorePcItem` unchanged. Add `solution` to the `CLIENT_FIELDS` **exclusion** reasoning — the whitelist already blocks it, but the comment at `:20-24` must name it. | **Medium — live endpoint file** |
| `roster-server/scoring.js` | **only if D8(b) or D10(b)**. `scorePcRows` is on the grade path. | **HIGH — grade-affecting** |
| `roster-server/grade-config.js` | new `pcFrqBand` constant for D5's scale | **HIGH — grade-affecting** |
| `roster-server/receipts.js:71-78` | `gradingProvenance` returns `'key'` for every `pc` row. An AI-graded FRQ receipt would **lie about its provenance.** Must branch on the FRQ item-id shape. | **Medium — signed-receipt semantics; snapshot/verify reads this** |
| `roster-server/review.js:108-116` | `aiGradedRow` releases full responses only for `pc`+`-SG`. AI-graded PC26 FRQ rows must be added, or the teacher can't ✨ Draft on the rows that need comments most. **FERPA-relevant — do not widen casually.** | **Medium — privacy boundary** |
| `roster-server/pc-frq-grader.js` | **new**, Option B only | Low (new file) |
| `roster-server/package.json` | `@anthropic-ai/sdk`, Option B only | Low |
| `teacher-dashboard.html` | new "Ungraded PC FRQ" card next to the existing `#pc-makeup-section` (`:698`). **Note there is currently NO UI for `POST /pc/grade`** either — paper scores are curl-only today. | Low (static page) |
| `roster-server/scripts/load-pc-bank.mjs` | no change — it upserts whatever the bank file holds | None |
| `curriculum_render/railway-server/server.js` | Option A only: accept a rubric-bearing prompt from roster-server | Medium (other repo) |

### Live endpoints affected

- **New:** `POST /pc/grade-frq`, `GET /pc/frq/ungraded` (both `requireTeacher`).
- **Behavior-changed:** `GET /grade`, `GET /class/grades`, `POST /class/quarter/close`,
  `GET /class/quarter/deltas` — all read `scorePcRows` output. **Every one of these
  is a live grade surface.**
- **Unchanged:** `GET /pc/:unit/:part`, `POST /pc/:unit/:part/submit`,
  `POST /pc/grade`, all `/pc/unlock*`, `/class/review*`.

### Deployment posture

- **`roster-server/` auto-deploys to Railway on push to master.** Every item above
  is grade-affecting or grade-adjacent. Flag it in the commit message, land it
  while `PC_TRACK_ENABLED` is still off if possible, and re-run the M2b goldens
  before pushing.
- **Secrets:** Option B needs `ANTHROPIC_API_KEY` on Railway. Option A needs none.
  Independently, `TEACHER_KEY` is still on its published default per
  `SY2627_ACTIVATION_RUNBOOK.md` Step 7 — **rotate it before any endpoint that
  returns student FRQ text goes live.**
- **Migrations:** none required if the score lands in the existing row. A `#draft`
  proposal table (D4b) would need `0031`.

---

## 9. Recommendation

**Ship Option C for the first REST administration (~late Sept), designed as
Phase 1 of Option B.**

Reasoning:

1. **D1 gates everything.** If PC26 rubrics don't exist, no AI option can ship
   defensibly before late Sept. Option C needs no rubric file — the teacher grades
   from the paper key already in hand.
2. **The teacher UI is required by every option.** A queue of ungraded FRQ rows
   with the response text and a score control is needed for manual grading, for
   overriding an AI score, and for approving a proposal. It is never throwaway.
3. **It generates the calibration data.** Grade U1 by hand while a shadow AI call
   (once rubrics exist) records what it *would* have said. One administration of
   agreement data is what turns D4 from a guess into a decision.
4. **Option B over Option A for the automated phase.** roster-server owns the bank,
   the rubric, the ledger, and the grade; it should own the grading call. Structured
   outputs remove cr's JSON-repair fragility, the 2.5 s serialized queue disappears,
   the Batch API fits overnight grading, and the data-retention posture becomes a
   decision rather than an inheritance. Cost is ~$1–5 per administration.
5. **Land the two grade-hygiene fixes with Phase 1**, while `PC_TRACK_ENABLED` is
   still off and the goldens are cheap to re-baseline: the never-lowers unit floor
   (D8) and the `-SG` exclusion (D10).

**Sequenced:**

| Phase | Work | Blocks on |
|---|---|---|
| **0** | Run the §2 one-liner. Answer D1. | — |
| **1** | `GET /pc/frq/ungraded` + `POST /pc/grade-frq` (manual score) + dashboard card. Only-raises write. D5 scale into `grade-config.js`. D8 + D10 in `scorePcRows`. `receipts.js` provenance fix. M2b goldens re-checked. | D5, D8, D10 |
| **2** | Rubrics authored into the bank; re-run `load-pc-bank.mjs`. Shadow AI scoring recorded but not released. | D1, D3 |
| **3** | `pc-frq-grader.js` (Option B), teacher-gated release per D4. Appeal policy per D6. Quarter-close guard per D7. | D2, D4, D6, D7 |

---

## 10. Open items this spec does NOT resolve

- The exact FRQ item count in each PC26 bank (only the 6 figure-bearing ids are
  visible from this repo, via `roster-server/data/pc-figures-manifest.json`).
- Whether cr's progressive FRQ UI submits one response per lettered part or one
  concatenated blob. `pc-delivery.js:54-65` builds one `solution.parts[]` entry per
  lettered part (decision #2 in `PC_MAKEUP_DELIVERY_SPEC.md` §4), but
  `recordToGradebookLedger` (`index.html:11408`) records a single `answer` per
  `questionId` — **verify against a real submission before writing the per-part
  rubric prompt.**
- Whether `migrations/0030`'s "deltas are always positive" comment should be
  corrected in this change or a follow-up (§5.1).
