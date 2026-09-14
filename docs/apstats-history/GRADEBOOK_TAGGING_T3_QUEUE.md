# Gradebook Tagging — Sprint T3 Teacher-Verification Queue

<!-- GENERATED: 2026-05-19T08:58:23.437Z by scripts/disambiguate-skills.mjs --all -->

Produced by the controlled full T2 run. **Sprint T3 (the next tagging 
sprint) acts on this — this run does NOT block on it.** Auto-resolved 
(`ai-constrained`, dual-pass agreement): **2412**. Needs human 
review below: **181**.

Per spec §6: `unresolved` / un-verified tags **never certify** — they are 
excluded from the certifying rollup until a teacher verifies them here.

## 1. CERTIFIER pool first (curriculum.js PC/lesson) — 31 items

These gate Phase-3 READY (decision T-3). Highest priority.

| Unit | classifier-missing | dual-pass-disagreement | no-item-text | total |
|------|----:|----:|----:|------:|
| U1 | 0 | 3 | 0 | 3 |
| U2 | 0 | 1 | 0 | 1 |
| U3 | 0 | 1 | 0 | 1 |
| U4 | 0 | 2 | 0 | 2 |
| U5 | 0 | 1 | 0 | 1 |
| U6 | 0 | 16 | 3 | 19 |
| U7 | 0 | 0 | 1 | 1 |
| U9 | 0 | 2 | 1 | 3 |

## 2. Practice pool (worksheets / FRQ / probes) — 150 items

Capped below mastery anyway; lighter review (spec §T-3).

| Unit | classifier-missing | dual-pass-disagreement | no-item-text | total |
|------|----:|----:|----:|------:|
| U1 | 0 | 7 | 0 | 7 |
| U2 | 0 | 19 | 1 | 20 |
| U3 | 0 | 5 | 0 | 5 |
| U4 | 0 | 25 | 1 | 26 |
| U5 | 0 | 20 | 0 | 20 |
| U6 | 0 | 17 | 0 | 17 |
| U7 | 1 | 31 | 0 | 32 |
| U8 | 0 | 10 | 0 | 10 |
| U9 | 0 | 13 | 0 | 13 |

## 3. How to act on this queue (Sprint T3)

- Source of truth = `data/skill-map.review-queue.json` (full per-item 
  `pass1`/`pass2`/`itemText`/`candidates`).
- For each certifier item: pick the correct skill from `candidates`, add it 
  to `data/skill-map.disambiguated.json` with `provenance:"teacher"`, 
  re-run `node scripts/build-skill-map.mjs`, re-run the audit.
- `dual-pass-disagreement` = the two Codex passes split; `no-item-text` = 
  no extractable prompt (e.g. appeal boxes); `out-of-candidates` = model 
  picked outside the framework set (review the framework topic map).
