# TI-84 Trainer ↔ Desk — Lesson Map + Deep Links

The Desk becomes the trainer's front door: a lesson tile says "today's
calculator skill" and opens exactly the relevant trainer item. Students stop
navigating the trainer's internal queue (the actual UX complaint). Design-only
until reviewed. Grades stay OUT of scope (visible-first policy, separately).

## 1. `data/ti84-lesson-map.json` — the curated contract

Hand-curated repo file (Codex: curated, then AUDITED against framework/
worksheet/Blooket data — never auto-generated). Keys are the repo's canonical
topic keys (`"1.1"`…`"9.x"`, same 77-topic vocabulary as `lesson-schedule.json`
and `lesson_urls`). Values are trainer procedure ids.

```json
{
  "schemaVersion": 1,
  "lessons": {
    "1.5": ["histogram"],
    "1.7": ["one-var-stats", "modified-boxplot"],
    "1.10": ["normalcdf", "invnorm"],
    "2.4": ["scatterplot"],
    "2.7": ["residual-plot"],
    "2.8": ["linreg-a-plus-bx"],
    "4.10": ["binompdf", "binomcdf"],
    "4.12": ["geometpdf", "geometcdf"],
    "5.7": ["normalcdf-sampling", "invnorm-sampling"],
    "6.2": ["one-propzint"],
    "6.4": ["one-propztest"],
    "6.8": ["two-propzint"],
    "6.10": ["two-propztest"],
    "7.2": ["t-interval-stats", "t-interval-data"],
    "7.4": ["t-test-stats", "t-test-data"],
    "7.6": ["two-samp-tint"],
    "7.8": ["two-samp-ttest"],
    "8.2": ["chi-square-gof-test"],
    "8.5": ["matrix-entry", "chi-square-test"],
    "9.2": ["linreg-tint"],
    "9.5": ["linreg-ttest"]
  },
  "planned": {
    "3.3": ["randint-sampling", "seed-rand"],
    "3.6": ["randint-assignment"]
  }
}
```

Topic assignments follow the AP CED ordering per Codex's curation pass
(intervals precede their tests within each inference unit; scatterplot,
residuals, and LinReg land on their own CED topics). Where Codex gave a range
(2.6/2.8, 7.8/7.9, 9.4/9.5, 3.5/3.6) one value is picked here; the teacher
veto pass settles final placement. Unit congruence in CI is a floor, not the
curation — CED-correct topic placement is a human review responsibility.

- The starter `lessons` block above is a DRAFT — final curation happens at
  implementation with the audit test as referee, and the teacher gets a veto
  pass over the topic assignments.
- **`planned`** holds mappings whose procedures don't exist yet (Unit 3
  randomization — see §5). Consumers only ever read `lessons`; `planned` is
  documentation plus a to-do the audit test tracks.
- Not every lesson gets an entry. No fake calculator exercises (Codex §3):
  unmapped lessons simply show nothing.
- Stays a baked repo file. No Supabase table until someone needs live edits.

### Audit (CI test, `tests/ti84-lesson-map.test.js`)

1. Every procedure id in `lessons` exists in `data-procedures.js`; every id in
   `planned` does NOT (when it starts existing, the entry must be promoted).
2. Every topic key exists in `lesson-schedule.json`.
3. Unit congruence: each mapped procedure's `unit` equals the lesson's `unit`
   (hard failure — a cross-unit mapping is a typo until proven intentional).
4. Every trainer procedure appears in at most... no ceiling, but every unit
   that HAS procedures must have at least one mapped lesson (coverage floor).

## 2. Trainer deep links (extends the shipped `#unit=N` handling)

| Hash | Behavior |
|---|---|
| `#unit=N` | unchanged (unit filter) |
| `#topic=6.4` | resolve via the map → scoped practice session over that lesson's procedures, in listed order |
| `#procedure=one-propztest` | scoped practice session of exactly that procedure |
| `&source=desk` | tags the session origin (analytics + completion signal) |

Unknown topic/procedure/empty mapping → fall through to the plain trainer
home with a banner ("No calculator skill mapped for this lesson yet") — never
a dead end.

### Lesson practice is NOT spaced review (Codex §4)

A deep-linked session runs the same recognition → walkthrough → handheld flow
but with **SM-2 scheduling untouched**: no `sm2()` updates, no
`applyTrack2Outcome` interval changes, no due-date movement. What it DOES
still do:

- The handheld check serves generated problems and, on a verified pass,
  advances `gen.handheld.attempt` + commits seed metadata exactly as today —
  a trustworthy mastery event is a mastery event regardless of entry path, so
  `track2.handheldPassed` may still flip true.
- Records a trainer-local completion:
  `app.persisted.lessonPractice[topicKey] = { completedAt, procedures: [...] }`.
- Ledger row for the completion (`source: 'trainer'`,
  `item_id: 'TI84-LESSON-<topic>'`) is **deferred until migration 0016 is
  verified** — until then the completion is local-only, visible in the
  trainer's own UI only (the Desk shows no completion state until the ledger
  row exists, per §3).

## 3. Desk side (`ap_stats_roadmap_square_mode.html` — surgical hunks only)

- Desk fetches `data/ti84-lesson-map.json` (same origin, alongside its other
  baked data loads) once, cached in memory.
- A lesson tile / Do-Now card shows a **"🖩 Calculator skill"** button ONLY
  when the map's `lessons` has that topic key. Unmapped → nothing.
- Button opens the ti84 app via the existing `openApp`/`appLaunchUrl` path
  with `#topic=<key>&source=desk` (replacing the current bare `#unit=N` when
  a topic is known; `#unit=N` stays the fallback).
- Completion display: v1 = the trainer's own UI shows the practice-complete
  state; the Desk button does NOT track completion yet (that arrives with the
  ledger row post-0016, so cross-device works from day one rather than
  shipping a localStorage-only checkmark that later "loses" state).

## 4. Tests

- Map audit (§1) — pure JSON checks, no app boot.
- Trainer routing (app-boot pattern): `#topic=` → first mapped procedure's
  question renders; `#procedure=` → that procedure; unknown → banner + home;
  SRS fields byte-identical before/after a completed desk-sourced session
  except `gen.*`, `handheldPassed`, `lessonPractice`.
- Desk (desk-*.test.js pattern): button present exactly for mapped topics;
  launch URL carries `#topic=…&source=desk`.

## 5. Unit 3 (placeholders now, procedures next)

Per Codex: first wave validates PROCEDURE, not exact random sequences — no
TI RNG reimplementation. Planned procedures (own follow-up spec):

- `randint-sampling` — seed → `randInt(` to draw a sample; checked on steps +
  plausibility (count, range, integer-ness), not exact values.
- `randint-assignment` — `randIntNoRep(` for assignment without repeats +
  converting numbers into treatment groups.
- `seed-rand` — storing a seed (`42→rand`) and explaining why seeds make
  simulations reproducible.

Exact-RNG matching (L'Ecuyer) is a LATER mini-spike only if procedural
validation proves insufficient. The `planned` map block ships now so the
audit test tracks promotion.

## 6. Rollout

| Step | Content | Risk |
|---|---|---|
| 1 | map + audit test | none (new files) |
| 2 | trainer hash routing + practice mode + tests | trainer-only |
| 3 | Desk button (surgical hunks; user edits the file in parallel) | Desk render path |

Out of scope: grade slices, 0016 migration itself, Unit 3 implementation,
walkthrough-phase generated serving, exact RNG.
