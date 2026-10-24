# Algebra 2 roster server

Express service for roster identity, sign-in and self-signup, sessions, signed
receipts, the unified ledger, lesson grades, teacher gradebook views, Do Now,
worksheet diagnostics, misconceptions and remediation, Blooket imports,
flashcard commits, review, and snapshot/restore.

## Deployment

Create separate Algebra 2 Railway and Supabase projects. Do not reuse the Algebra 2
service URL, database, tables, or secrets. Apply the surviving migrations in
numeric order to the new database. Table RLS is enabled with service-role access;
student isolation and teacher authorization are enforced by the server.

Set Railway's Root Directory to `roster-server`, install dependencies with
`npm ci`, and start with `npm start` (`node server.js`). Railway supplies
`PORT`; local development defaults to 8090. Bundle the server's `data/` directory.
The sibling shared modules used by this snapshot must also be available to the
build; Phase 2b owns their packaging and removal of obsolete client features.

Configure server-only variables:

| Variable | Purpose |
|---|---|
| ROSTER_SUPABASE_URL | New Algebra 2 Supabase project URL |
| ROSTER_SUPABASE_SERVICE_KEY | Service-role database credential |
| ROSTER_TOKEN_SECRET | Session signing secret |
| TEACHER_KEY / ROSTER_TEACHER_SECRET | Teacher authorization |
| ROSTER_PROCTOR_SECRET | Authorization for retained proctored evidence |
| RECEIPT_ISSUER_PRIVATE_KEY | Optional signed receipt issuer key |
| USE_V3_GRADING | Set to true to select the retained two-track engine |

Keep credentials server-side. After deployment, check `GET /health`, teacher
enrollment, student sign-in, ledger writes, grades, and teacher class views.
Update the client service URL during the deployment phase.

## Transitional grading data

Phase 2a preserves the SY26-27 quarter dates and the `useV3` flag. The AP-specific
tracks are removed. The remaining work blend is transitional; Phase 3 introduces
Assessments 50 / Assignments 40 / Engagement 10. The mastery input currently stays
absent, while the pure two-track combiner and its gates remain tested.

Answer keys, skill mappings, lesson schedules, and Blooket topic lists are empty
valid fixtures awaiting A2 content. Retained diagnostic and worksheet authoring
bundles still need curriculum replacement in a later phase.

## CORS

CORS is currently broad through `app.use(cors())`. Protected endpoints still
require authentication. See [the CORS deployment note](docs/cors.md) before
restricting origins; verify every retained browser client after a change.

## Class Log observer cards

The Class Log phone app (`school/class-log`, contract in its
`OBSERVER_CARD_DB_SPEC.md`) reads each block's observer card from this server.

1. Migrations: in the Supabase SQL editor run `SET search_path TO a2;`, then
   `migrations/0041_observer_cards.sql` (tables `observer_cards` and
   `observer_card_outcomes`) and `migrations/0042_observer_cards_unique.sql`
   (one card per day/course/section even when section is null, and an
   `updated_at` bump trigger), then `NOTIFY pgrst, 'reload schema';`.
   `deploy/supabase_a2_bootstrap.sql` includes both for fresh projects.
2. Env: set `CLASS_LOG_TOKEN` on Railway (`openssl rand -hex 32`) and paste the
   same value into the phone's Settings as the Cards token. Unset, the phone
   routes answer 503.

| Route | Auth | Does |
|---|---|---|
| `GET /class-log/cards?date=YYYY-MM-DD` | `Authorization: Bearer <CLASS_LOG_TOKEN>` | `{date, cards}` with every row for the day. Strong `ETag`: `"empty"` for no cards, otherwise `"<count>-<16 hex>"`, a sha256 of every column of every row (sorted by id), so any edit, including a hand edit in the SQL editor, an insert or a delete changes it. Only an exact `If-None-Match` gives 304; a `W/` prefix is ignored because the compression layer weakens the tag on the wire (`*` and list forms get the 200). `Cache-Control: no-cache`. |
| `POST /class-log/cards/:id/outcome` | same bearer | Body `{section, ran, at, device}` (`at` null or `HH:MM`, `device` defaults to `s24`); upserts on (card, section, device); `{ok: true}`. 400 bad body, 404 unknown card. |
| `PUT /teacher/cards` | teacher (`x-teacher-secret` or teacher token) | Array of cards without `id`; upserts by (date, course, section), writing only rows whose content changed, so unchanged pushes keep `updated_at` and the ETag. `{ok, written, unchanged}`. |

Wrong or missing bearer token: 401 with no body. The phone routes are mounted
before the app-wide JSON parser: auth runs first, then a 64 KB route parser, so
bad JSON gives `400 {ok:false,error:"bad_json"}` and an oversize body
`413 {ok:false,error:"too_large"}` (no stack). `PUT /teacher/cards` sits behind
the password gate like the other teacher routes, so the app-wide parser applies there.

Limits (characters, not bytes; 400 before storage): section 16, device 32,
title 200, lesson 32, frame 500, body 4000; minutes an integer 1-180; course
`algebra2`/`apstats`; at most 500 cards per PUT. The rules live in
`observer-card-rules.js`, shared with the push script.

Authoring: a `content/a2/day-log.json` entry may carry an `observerCard`
(date, section and lesson come from the entry; section `all` or none means every
section that day):

```json
{ "date": "2026-10-21", "section": "G", "lesson": "1-3", "plan": "...",
  "observerCard": { "title": "Which graph matches the table?", "mode": "whiteboards",
    "minutes": 8, "frame": "I chose ___ because ___.",
    "body": "## Prompt\n\nShow the table; boards up on 3." } }
```

Modes: `whiteboards`, `ipad`, `poster`, `pairs`, `jam`, `other`. Then run
`node scripts/push-observer-cards.mjs [--from YYYY-MM-DD | --date YYYY-MM-DD] [--dry-run] [--server URL] [--secret S]`
(`--from`: that date and later; `--date`: exactly that date) from the repo root (teacher secret resolved like the other Desk scripts; server
error text is redacted and truncated before printing). It is idempotent and safe
in a cron.

The session JSON the phone publishes (`sessions/<date>/<section>.json` in the
data repo) now carries `observerCard.id` (the `observer_cards` row id), not a
`cards/...` file path.

## Class Log summaries

After the phone publishes a lesson summary (`school/class-log/POLISH2_SPEC.md`,
WP-C) it posts it here so the Desk can read what landed, what students asked,
what was promised and what to prep next.

1. Migration: in the Supabase SQL editor run
   `migrations/0043_class_summaries.sql` (table `a2.class_summaries`, primary key
   (date, course, section), RLS on, service role only; every name is
   schema-qualified, so no `SET search_path` is needed), then
   `NOTIFY pgrst, 'reload schema';`. Until it runs, both routes answer 503 and
   the phone retries. `deploy/supabase_a2_bootstrap.sql` includes it.
2. Env: none new. The phone uses the same `CLASS_LOG_TOKEN` as the observer
   cards (its Cards URL and token settings).

| Route | Auth | Does |
|---|---|---|
| `POST /class-log/summaries` | `Authorization: Bearer <CLASS_LOG_TOKEN>` | Body `{date, course, section, model, markdown, landed, studentQuestions, promises, nextPrep, transcriptPath, summaryPath}`; upserts on (date, course, section), replacing the whole row and stamping `recorded_at`; `{ok: true}`. 400 bad body. |
| `GET /teacher/summaries?from=YYYY-MM-DD&to=YYYY-MM-DD[&course=algebra2 or apstats]` | teacher (`x-teacher-secret` or teacher token) | `{from, to, summaries}`: rows with `from <= date <= to` (both required, at most 62 days inclusive), ordered by date, section, course, in the POST body's camelCase shape plus `recordedAt`. Without `course` every course is returned; with it (one of `algebra2`, `apstats`, else 400) only that course's rows, filtered in the query, and the response echoes `course`. The AP Stats Desk reads the shared table with `course=apstats`. |

Wrong or missing bearer token: 401 with no body; `CLASS_LOG_TOKEN` unset: 503.
The phone route is mounted before the app-wide JSON parser with a 1 MB route
parser (enough for every field at its limit in 4-byte characters), so bad JSON
gives `400 {ok:false,error:"bad_json"}` and an oversize body
`413 {ok:false,error:"too_large"}`. Storage errors, including the missing table,
give 503 with no details.

Limits (characters, not bytes): course `algebra2`/`apstats`; section 1-16
(trimmed); model up to 64 (optional); markdown required, up to 40 000; each of
`landed`, `studentQuestions`, `promises`, `nextPrep` an array of up to 40
strings of up to 400 (trimmed, blank items dropped, missing means `[]`);
`transcriptPath`/`summaryPath` up to 200 (optional).

## Class Log schedule overrides

The Desk tells the phone about one-off bell changes (`school/class-log/POLISH3_SPEC.md`,
WP-S): a section cancelled for a day, different bell times, or a day off.

1. Migration: in the Supabase SQL editor run
   `migrations/0044_schedule_overrides.sql` (tables `a2.schedule_overrides`,
   primary key (date, section), and `a2.schedule_days_off`, primary key date; RLS
   on, service role only, `updated_at` bump triggers; every name schema-qualified),
   then `NOTIFY pgrst, 'reload schema';`. Until it runs, every route answers 503
   and the phone keeps its local schedule. `deploy/supabase_a2_bootstrap.sql`
   includes it.
2. Env: none new (the phone's `CLASS_LOG_TOKEN`).

| Route | Auth | Does |
|---|---|---|
| `GET /class-log/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD` | `Authorization: Bearer <CLASS_LOG_TOKEN>` | `{from, to, overrides: [{date, section, start, end, cancelled, note}], daysOff: [date]}` for `from <= date <= to` (both required, at most 31 days inclusive). `start`/`end` are `HH:MM`, null on a cancelled row. Strong `ETag` over `from`, `to` and every column of every row in the range (`"empty-<hash>"` when there are none), so a different window never matches another window's tag, even with identical or no rows; `If-None-Match` gives 304 on an exact match, ignoring a `W/` prefix. `Cache-Control: no-cache`. |
| `GET /teacher/schedule-overrides?from=&to=` | teacher (`x-teacher-secret` or teacher token) | The same payload, for the Desk health strip. |
| `PUT /teacher/schedule-overrides` | teacher | Body `{overrides: [...], daysOff: ["YYYY-MM-DD" or {date, note}]}`; upserts by (date, section) and by date, writing only rows whose content changed (so unchanged pushes keep `updated_at` and the ETag). `{ok, written, unchanged}`. |
| `DELETE /teacher/schedule-overrides?date=YYYY-MM-DD[&section=S]` | teacher | Removes that override, or the day off when `section` is omitted. `{ok, deleted}` (0 or 1). |

Rules (400 before storage, shared with the seed script in `schedule-rules.js`):
real dates; section 1-16 characters (trimmed); a row that is not `cancelled`
needs `start` and `end` as `HH:MM` with start before end, a cancelled row has
neither; note up to 200; source `desk`/`manual`; at most 200 rows (overrides
plus days off) per PUT, no duplicate keys; DELETE's `section` 1-16 characters
without U+0000. A day-off row cancels every section that day. Storage errors give
503 without details.

Body parsing: like `PUT /teacher/cards`, the teacher routes are mounted after the
app-wide 8 MB JSON parser because the password gate needs the parsed body, so in
`createApp` that parser (not the 256 KB route parser) bounds the body and runs
before `requireTeacher`. A malformed or oversize body on any route behind it gets
the app-level sanitized error, `400 {ok:false,error:"bad_json"}` or
`413 {ok:false,error:"too_large"}`, never Express's HTML page or a stack.

Seeding: from the repo root,
`node scripts/push-schedule.mjs [--dry-run] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--days-off YYYY-MM-DD,...]`
sends the built-in seed (the 2026-10-21 SAT day: D 11:20-12:00, B/C/E/G
cancelled), day-log entries carrying `bell: {start, end}` (optional `bellNote`)
or `cancelled: true`, and the days off from `data/a2-school-year.json` (the Desk
calendar's closures), the Class Log schedule file
(`../class-log/schedule.lehs-sy2627.json`, or `--schedule PATH`) and
`--days-off`, from today (New York) on. It warns about early-release days that
have no bell times (one line per section that meets that weekday in the Class
Log weekly table and has no override) and about days off that the day log still
plans a class on.
Teacher secret, server and redaction work like `push-observer-cards.mjs`; it is
idempotent.

## Class Log health

The phone posts a health ping (`school/class-log/POLISH3_SPEC.md`, WP-H) at arm,
disarm and after each published block; the Desk shows it as one line under the
menu bar.

1. Migration: run `migrations/0045_device_health.sql` (tables
   `a2.device_health`, one current row per device, and `a2.device_health_log`;
   RLS on, service role only), then `NOTIFY pgrst, 'reload schema';`. Until it
   runs both routes answer 503. `deploy/supabase_a2_bootstrap.sql` includes it.
2. Env: none new.

| Route | Auth | Does |
|---|---|---|
| `POST /class-log/health` | `Authorization: Bearer <CLASS_LOG_TOKEN>` | Body up to 8 KB: `{device, at, appVersion, battery, mode, nextBlock, alarmAt, serviceForeground, queues, lastRecording, lastFetch, failures24h, events24h?, recordingWarnings24h?}`. Only `device` (default `s24`, up to 32 characters) and `at` (ISO 8601 or null) are checked; the whole body is stored as `payload`, plus `recordingWarnings24h`: the phone's own count when it sends a non-negative integer, else the number of `events24h` lines (event-log lines from the last 24 hours, `HH:MM:SS text`) that say `transcript poor` or `Mic:` anything but `ok` (the lines `failures24h` never counts, since they do not contain "failed"), else 0. Upserts the current row, appends a log row, and deletes log rows received more than 30 days ago. `{ok: true}`. |
| `GET /teacher/health` | teacher | `{devices: [{device, at, receivedAt, ageMinutes, payload}]}`; `ageMinutes` counts from the server's receive time. |

Same middleware order as the cards: the phone route is mounted before the
app-wide parser with an 8 KB route parser (`413 too_large`, `400 bad_json`).

The Desk strip (`lib/class-log-health.js`, `#class-log-health` in `desk.html`)
appears only for a signed-in teacher, refreshes every 5 minutes, and hides
itself on any error (including the 503 before the migration). It turns amber
when `recordingWarnings24h > 0` (a poor transcript or a covered/silent mic;
red always wins over amber) and red when
the last ping is more than 90 minutes old between an hour before today's first
block and 30 minutes after the last, when `failures24h > 0`, or when the latest
block that ended (15-minute grace) has no `lastRecording` from today for that
same section ending after the block started, judged only from a ping sent after
that block ended. Today's blocks are the weekly bell table in the module (copied
from the phone's schedule file) adjusted by `GET /teacher/schedule-overrides`; if
that GET fails the strip hides rather than falling back to the weekly table.

## Drafting cards from summaries

`scripts/draft-observer-cards.mjs` closes the loop (`POLISH3_SPEC.md`, WP-L):
for each Algebra 2 section meeting on the target date it reads the latest
summary before that date (`GET /teacher/summaries`), the day-log entry (plan,
lesson) and the previous card (`GET /teacher/cards?date=<summary date>`, a
teacher route returning the same `{date, cards}` rows as the phone GET; falling
back to the section's latest earlier day-log `observerCard`), builds one prompt,
and asks an OpenAI-compatible chat endpoint for `{title, mode, minutes, frame,
body, rationale}`. Drafts must pass `observer-card-rules.js` and have
`## Preparing`, `## Interacting` and `## Extending` sections.

Env (read from `roster-server/.env`, then the environment): `DRAFT_API_KEY`
(required to call the model), `DRAFT_API_BASE` (default
`https://api.deepseek.com`), `DRAFT_MODEL` (default `deepseek-chat`). The key is
never printed; error text is redacted.

Daily, after the afternoon summaries have posted:

```
node scripts/draft-observer-cards.mjs --dry-run            # next class day: prompts and drafts, writes nothing
node scripts/draft-observer-cards.mjs                      # writes content/a2/card-drafts/<date>.json
node scripts/draft-observer-cards.mjs --apply              # drafts sections without a card, inserts them, pushes that date
```

`--date YYYY-MM-DD` and `--section C|D|G` narrow it; `--summaries FILE` uses a
saved `/teacher/summaries` response instead of the server. Without a key the
prompt bundle is written to the drafts file with `"needsModel": true` (with
`--dry-run`, only printed) and the exit code is 2, so the Desk agent can finish
the drafts by hand. A rejected draft exits 1; `--apply` never overwrites a card.

`--apply` is two steps. Local insertion: only sections whose day-log entry has
no card are drafted; before writing, the day log is re-read and the run aborts
(exit 1, nothing applied) if it changed since the run started; only the missing
`observerCard` fields are inserted, and the file is written through a
same-directory temp file and an atomic rename in its existing indentation, line
endings and key order (a file not in plain `JSON.stringify` layout is refused).
Remote sync: `push-observer-cards.mjs --date <date>` runs every time, even when
nothing new was inserted, and the exit code stays non-zero until it succeeds, so
a failed push is retried by rerunning (no new model calls). The drafts file is
written atomically too.

## Card decks

Each observer card gets a rehearsal deck of 8 to 14 flashcards
(`school/class-log/REHEARSAL_SPEC.md`, WP-1). The Desk drafts it, pushes it
beside the card, and the phone spaces short rehearsal sessions down to the bell,
posting every grade back.

1. Migration: run `migrations/0046_card_decks.sql` (tables `a2.card_decks`, one
   deck per card, `card_id` references `a2.observer_cards(id) on delete cascade`,
   and `a2.deck_results`, one row per grade, unique on `(card_id, device,
   session, item_id, at)`; RLS on, service role only; `updated_at` touch
   trigger; function `a2.put_card_decks(jsonb)`, service role only), then `NOTIFY pgrst, 'reload schema';`. Until it runs every route
   answers 503 and the phone logs `Decks: fetch failed (HTTP 503)` at most
   hourly. `deploy/supabase_a2_bootstrap.sql` includes it.
2. Env: none new (`CLASS_LOG_TOKEN` for the phone, the teacher secret for the Desk).

An item (validated by `deck-rules.js`, shared with the script and mirrored on the
phone): `{id, type, front, back, order, after, minute}`. `id` is 8 to 40
characters of `A-Z a-z 0-9 _ -` (the script uses the first 12 hex of SHA-256 of
`type + front`), `type` is `frame | anchor | trap | step | cue`, `front` at most
240 characters, `back` at most 320, `order` an integer 0-999, `after` the ids of
prerequisite items in the same deck (no cycles), `minute` an integer for a step
and null otherwise. Ids are unique within a deck. A deck built from a lesson
tree (below) adds `node` (the tree node id, 12 lowercase hex; the item id is the
same value) and `lesson` (at most 16 characters) to every item: a deck is all or
none on `node`. A nodeless item drops any `lesson`, and the content hash covers
`node` and `lesson` only on an item with a node, so every nodeless deck keeps its
old hash.

| Route | Auth | Does |
|---|---|---|
| `GET /class-log/decks?date=YYYY-MM-DD` | `Authorization: Bearer <CLASS_LOG_TOKEN>` | `{date, decks: [{cardId, course, section, items, model, generatedAt, updatedAt}]}` for every deck whose card is on that date (section cards and the course-wide card; the phone resolves like cards). Strong `ETag` over the date and every column of every deck row (content hash and `updated_at` included; `"empty-<hash>"` with no decks); `If-None-Match` gives 304 on an exact match, ignoring a `W/` prefix. `Cache-Control: no-cache`. |
| `POST /class-log/deck-results` | same bearer | Body `{device, cardId, section, date, results: [{session, itemId, grade, at, latencyMs}]}`, at most 200 results, `grade` `again` or `got_it`, `at` ISO 8601, `device` defaults to `s24`. Inserts ignoring duplicates on the unique key; `{ok: true, inserted}`. The row's `date` and `section` are the card's own: a body whose `section` differs from a section card's is refused with `409 {error: 'section_mismatch', cardSection, section}` and nothing is written; a course-wide card (section null) keeps the body's `section`, which then says where the deck was rehearsed. 400 bad body, 404 unknown card. 128 KB route parser. |
| `PUT /teacher/decks` | teacher | Body `{decks: [{cardId, items, model?, generatedAt?}]}`, at most 20 decks, one per card. Validates every deck with `deck-rules.js`, then calls `a2.put_card_decks` once: in one transaction it checks every card exists (a missing card is a 404 and nothing is written), copies `date`, `course` and `section` from the card, and writes a deck only when its content hash (items and model; `generatedAt` is left out) or those copied fields differ. Any failure leaves every deck as it was (503, no details). `{ok: true, written, unchanged}`. |
| `GET /teacher/decks?date=YYYY-MM-DD[&device=s24]` | teacher | The same decks plus, per deck, `results: {sessions, asked, again}` (sessions counted per device), `missed`: the three items with the most `again` grades, `[{itemId, type, front, again}]`, and `ready`: how many items have a node known (p >= 0.90) on `device` (default `s24`) in `a2.node_mastery`; 0 for a deck without nodes, `null` when the mastery table is missing or failing (the decks still load). The body also echoes `device`. |
| `DELETE /teacher/decks?cardId=UUID` | teacher | Deletes the deck (results stay); `{ok: true, deleted}`. |

Same middleware order as the cards: the phone routes are mounted before the
app-wide parser (auth first, then the bounded parser: `413 too_large`,
`400 bad_json`); storage errors are a 503 without details.

The Desk shows one Rehearsal line under the Recording fold of the teacher day
panel (`lib/class-log-deck.js`): `Deck: 11 items · 3 sessions · 4 again (trap:
"2f(x) is horizontal")`, `No deck`, or `Deck unavailable` (including the 503
before the migration).

### Drafting decks

`scripts/draft-card-decks.mjs` writes one deck per card of the target date. The
cards come from the day log (`observerCard`), falling back to
`GET /teacher/cards?date=`; the card ids always come from that GET, and every
other Algebra 2 card the server has for the date gets its own deck (with
`--section`, only the card that section resolves to). Each prompt
holds the card, the lesson-prep entry (`content/a2/lesson-prep.json`) and the
deck rules from the spec, and the chat endpoint (same `DRAFT_API_*` env as the
card drafter) answers 10 to 12 items. Ids are assigned from `type + front`,
`after` is remapped to them, and the deck must pass `deck-rules.js` and a roster
first-name check (`roster-local/roster-view-*.csv`, when present). The result goes
to `content/a2/card-decks/<date>.json` (tracked: no student data), written
atomically.

Daily, after the cards are pushed:

```
node scripts/draft-card-decks.mjs --date 2026-10-22 --dry-run   # prompts and decks, writes and sends nothing
node scripts/draft-card-decks.mjs --date 2026-10-22 --apply     # drafts, writes the file, PUTs /teacher/decks
node scripts/draft-card-decks.mjs --from-file content/a2/card-decks/2026-10-22.json --apply   # hand-written or edited decks
```

`--section C|D|G` narrows it. Without a key (and without `--from-file`) the
prompt bundle is written with `"needsModel": true` and the exit code is 2; write
the items into that file by hand and push it with `--from-file --apply`.
`--from-file` recomputes the ids (an edited front is a new item for the phone),
checks the whole file with the server's own `validateDeckPut` (card ids, one deck
per card, at most 20 decks, `model`, `generatedAt`), writes the normalized file and, with `--apply`, sends it; re-sending the same file
changes nothing on the server. A rejected deck (bad shape, a cycle, a roster name)
exits 1 and nothing is sent. The key and the teacher secret are never printed;
server and model errors are redacted.

## Lesson trees

`school/class-log/KNOWLEDGE_TREE_SPEC.md`, WP-1. Every rehearsable thing the
Teacher's Edition says for one lesson, as nodes with stable ids and `after` edges,
built without a model from `content/a2/lesson-prep.json` (plus the day log's cards
for traps and minutes) into `content/a2/lesson-trees/<lesson>.json` (tracked: no
student data).

```
node scripts/build-lesson-tree.mjs --all --check     # every lesson; then validate every tree file in the folder
node scripts/build-lesson-tree.mjs --lesson 1-3       # one lesson
```

A node is `{id, type, front, back, order, after, minute, source}` (traps from a card
add `card: {date, section}`). `id` is the first 12 hex of SHA-256 of
`lesson + '|' + source`, where `source` names the prep field by key
(`quizFocus.needs[0]`, `examples[n=3]`, `ixl.W67`), so a wording edit keeps the id.
Fronts and backs are clipped to 240 / 320 at a sentence boundary with ` …`; an
empty field makes no node; a repeated front gets ` (2)`. A tree must have 6 to 60
nodes, unique ids, and an acyclic in-tree `after`; a failing tree is never written
(exit 1), and a file is rewritten only when it changed. Mapping, in order (the
order also sets `order`):

| prep field | type | front | back | after |
|---|---|---|---|---|
| `objectives.essentialQuestion` | frame | Essential question? | the question | none |
| each word after "using the words" in `objectives.language` | anchor | Define: piece | the first `quizFocus.needs` entry naming the word, else the language objective | frame |
| `quizFocus.what`, `quizFocus.answer` | anchor | Quiz item N asks? / answer? | the text | the vocabulary anchors |
| `quizFocus.needs[i]` | anchor | Before quiz item N students need? | the need | the asks anchor |
| `quizFocus.items[k]` | anchor | Quiz item k is covered by? | the text | the asks anchor |
| `examples[i]` with `keep: true` | step | Example n: ? | title · DOK · practice · why | the previous kept example; the first after the quiz anchors |
| `dok3` | anchor | DOK 3 task? / DOK 3 key? | task / key + why | the last step |
| `modelDiscuss.situation` | cue | Opener situation? | the situation | frame |
| `modelDiscuss.studentPrompts[i]` | cue | Opener prompt i? | the prompt | the situation |
| `modelDiscuss.teQuestions[i]` | cue | `when`: ask? | q → a | the previous TE question; the first after the situation |
| `modelDiscuss.caution` | trap | Opener caution? | the caution | the situation |
| `ixl[i]` with `role` starting `core` and an `example` | anchor | IXL for example n? | code + name | that example's step (the frame when it is not kept) |
| card lines `Trap: <words> -> <response>` or lines under `## Traps` | trap | the student's words | the response | the vocabulary anchors whose words appear, else the frame |

Step minutes split the first card's minutes for the lesson evenly over the kept
examples, cumulative (null without a card); a deck recomputes them from its own
card's minutes.

`scripts/draft-card-decks.mjs` uses a card's tree by default (the model path stays
for cards without one); `--from-tree` uses trees only and skips, with a message, a
card whose lesson has none. Selection, capped at 14: the newest lesson's frame; the
card's own traps; the quiz anchors (what, answer, needs), newest lesson first; TE
questions whose `when` starts with the card's phase (Before for an opener, After
for an exit card, During otherwise); steps for the examples the card body names,
else all kept; vocabulary anchors not yet known on `--device` (from
`GET /teacher/mastery`; all of them without the server). Only when that gives fewer
than 8 items is the deck padded from DOK 3, IXL and then the rest of the tree in
order. A card that names another lesson ("Lesson 1-3") uses that tree too. Kept
`after` edges stay; an edge to an unchosen node is lifted to its nearest chosen
ancestors. Items carry `node` and `lesson`, the deck's model is `lesson-tree`, and
the same trees and card give the same hash, so an unchanged PUT writes nothing.

Nightly (`tools/nightly_tomorrow.ps1`, after the Tomorrow draft): step 3
`node scripts/push-observer-cards.mjs`, step 4
`node scripts/build-lesson-tree.mjs --all --check` then
`node scripts/draft-card-decks.mjs --from-tree --per-section --apply`: each section
(or `-Section`) drafts for its own next class day from the school calendar
(`data/a2-school-year.json`), resolved exactly as step 2 does (the first meeting day
on or after `-Date`, default tomorrow), one run per (date, section); runs for the
same date share that date's deck file and keep the other sections' decks in it.
Both are logged to `roster-local/tomorrow/log.txt`; their failures are logged only
(the exit code stays step 2's), and the Desk Rehearsal line then says `No deck`.

## Mastery

Per device, per course, per tree node, the phone's BKT probability `p` that the
teacher has the node ready (the phone owns it; this mirror is for the Desk).

1. Migration: run `migrations/0047_node_mastery.sql` (table `a2.node_mastery
   (device, course, node_id, lesson, p real, asked, again, known_at, updated_at)`,
   primary key `(device, course, node_id)`, RLS on, service role only; function
   `a2.put_node_mastery(text, text, jsonb)`, service role only), then
   `NOTIFY pgrst, 'reload schema';`. Until it runs both routes answer 503 and
   `GET /teacher/decks` reports `ready: null`. `deploy/supabase_a2_bootstrap.sql`
   includes it.
2. Env: none new.

| Route | Auth | Does |
|---|---|---|
| `PUT /class-log/mastery` | `Authorization: Bearer <CLASS_LOG_TOKEN>` | Body `{device, course, nodes: [{nodeId, lesson, p, asked, again, knownAt, updatedAt}]}`, at most 200 nodes; `device` defaults to `s24`, `course` `algebra2` or `apstats`, `nodeId` 12 lowercase hex, `lesson` a string of at most 16 characters (`''` allowed), `p` 0-1, `asked`/`again` non-negative integers, `knownAt` null or ISO 8601, `updatedAt` ISO 8601 (the phone's clock). A node repeated in one body keeps its newest entry. Upserts in one statement, replacing a row only when the incoming `updatedAt` is newer, so a late retry never rolls `p` back. `{ok: true, written}`. 64 KB route parser, mounted before the app-wide one like the decks. |
| `GET /teacher/mastery?course=algebra2[&lesson=1-3]` | teacher | `{course, lesson, rows: [{device, course, nodeId, lesson, p, asked, again, knownAt, updatedAt}], lessons: {"1-3": {nodes, known, weakest: [{nodeId, device, p}]}}}`: per lesson the rows counted, how many are known (p >= 0.90, allowing for float4 rounding) and the three lowest `p`. Lesson keys are the phone's, so `lessons` is built without a prototype (`__proto__` is just a key) and any failure building the body is a 503. |

The Desk Rehearsal line for a tree deck (`lib/class-log-tree.js`) reads
`Deck: 12 items · 9 ready · 2 sessions · weakest: "After, whole class: ask?"`
(`ready` and the weakest asked-but-not-known node are scoped to the deck's items and
counted from `GET /teacher/mastery`, fetched on every panel open; the deck's
server `ready` is the fallback), with one line per node of the lesson under it
(every node of `content/a2/lesson-trees/<lesson>.json`, fetched live; the service
worker passes those files through and never precaches them), least ready first,
each with a thin bar for `p` (`new` for a node never asked). A deck without nodes
keeps the old line.

## Verification

Run `npx vitest run` from this directory. Tests use injected databases; PostgreSQL
migration tests use PGlite. A DB-free import is supported with NODE_ENV=test.
Production startup requires the configured Supabase project.

See [golden-master.md](docs/golden-master.md) for fixture regeneration commands.
