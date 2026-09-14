# "Why so low?" — Do Now grade coach (build spec)

A student who sees a low grade prediction in the Desk **Do Now** card can click **"Why so low?"**,
get an **instant deterministic breakdown** of exactly what's dragging the grade down + what to do,
and then **ask a grounded AI coach** follow-up questions inline.

Decided with the teacher (2026-06-01): **hybrid** (instant facts + optional AI) · **mini-chat** (follow-ups).

## Why hybrid

The v3 grade engine is **deterministic** and its output is already cached client-side
(`_gradeLessonsCache` + `quarters[curQ]` + `_donowData.nextTask`). So the *facts* — current grade,
the two tracks, which one is the bottleneck, the next task, the low/missing lessons — are knowable
**with zero round-trip and zero hallucination risk**. The instant panel shows those facts for free and
still works if the AI service is down. The AI layer only *phrases and prioritizes* the handed facts; it
**never invents work**.

## Two halves

### A. cr railway AI server — `POST /api/ai/coach` (new, ~50 lines)
File: `curriculum_render/railway-server/server.js` (after `/api/ai/chat`).

- Mirrors `/api/ai/chat`: `gradingQueue.add(p => callAI(null, p, { systemMessage, messages, skipJsonFormat:true, rawResponse:true }))`
  → DeepSeek-primary / Groq-failover, rate-limited. CORS already open; unauthenticated like the other AI routes.
- Request: `{ context: <client breakdown>, message?: string, history?: [{role,content}] }`.
- The **facts are injected into the system message** (`COACH_SYSTEM_PROMPT` + `buildCoachFacts(context)`),
  so they ground every turn and follow-ups work without re-sending facts.
- `message` defaults to "Why is my grade so low, and what should I do to raise it?" on turn 1.
- Response: `{ response, _provider, _model }`. `503` if `!AI_AVAILABLE`; `400` if no context.
- `COACH_SYSTEM_PROMPT` rules: direct (not Socratic — the student is stuck), use ONLY provided facts,
  NEVER invent assignments/scores, name the biggest bottleneck first, explain the two-track / 40%-gate
  model, give 2-3 concrete actions, ~120-180 words, plain language.
- `buildCoachFacts(ctx)` formats the context defensively (nulls → "not yet attempted").

### B. Desk client — `ap_stats_roadmap_square_mode.html`
- `#donow-helper` div added to `.donow-body` after `#donow-grades` (+ CSS).
- `_gradeQuartersCache` cached alongside `_gradeLessonsCache` in `renderDoNowGrades`.
- `renderWhySoLow(curQ, q)` called at the end of `renderDoNowGrades` (all grade data in scope):
  renders the **"Why so low?"** button when a grade exists.
- `_buildCoachContext(curQ, q)` → `{ quarter, grade, ceiling, pcAvg, workAvg, lessonsGraded, lessonsDue,
  lessonsTotal, nextTask, weakLessons[] }`. `weakLessons` = cached lessons with `lessonGrade < 75`,
  sorted ascending, top 6, each `{ lesson, quiz(Q), worksheet(Cws), work(W), grade }`.
- On click → expand: an **instant facts** block (client-rendered from the context, deterministic) +
  an **"Ask the AI coach"** mini-chat (input pre-filled "Why so low?", Ask button, transcript).
- `_coachAsk(...)` POSTs to `(window.RAILWAY_SERVER_URL || cr-prod) + '/api/ai/coach'` with
  `{ context, message, history }`; shows "thinking…", appends the reply, keeps history for follow-ups.
- Soft-fail (mirrors the tutor-prompt contract): on any AI failure, show
  "AI coach is unavailable right now — the breakdown above still shows what to do." The instant facts
  never depend on the AI.
- XSS-safe: `createElement` + `textContent` only (no innerHTML with data), same as `renderDoNowGrades`.

## Non-goals / guardrails
- No roster-server change, no migration, no Supabase touch (client reads cached `/grade` + `/donow`).
- `curriculum.js` untouched (sacred). Stage own paths only in each repo.
- Scope = the Do Now card. The same `_buildCoachContext` + endpoint can later back a per-day-modal button.

## Tests
- cr `tests/coach.test.js` — static parse of `server.js`: endpoint registered, `COACH_SYSTEM_PROMPT`
  present + non-empty + carries the grounding rules (never-invent, two-track, 40% gate, brevity),
  `buildCoachFacts` defined, `skipJsonFormat`/`rawResponse` used, history sliced.
- follow-alongs `tests/desk-why-so-low.test.js` — static parse of the Desk: `#donow-helper` present,
  `renderWhySoLow` + `_buildCoachContext` + `_coachAsk` defined, context shape, weakLessons `<75` filter,
  posts to `RAILWAY_SERVER_URL` `/api/ai/coach`, soft-fail string present, `_gradeQuartersCache` cached,
  XSS-safe rendering.
