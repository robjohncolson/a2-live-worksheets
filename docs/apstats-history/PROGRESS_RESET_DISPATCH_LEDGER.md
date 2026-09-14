# PROGRESS_RESET_DISPATCH_LEDGER.md — Incident 2026-07-20 role/dispatch record

Hierarchy held throughout: **Fable** (incident commander — architecture, dispatch, gates, synthesis,
documents; zero source-file implementation) → **Opus** (lane managers, planners, independent verifiers)
→ **Sonnet** (implementation + test-writing) → **Codex** (adversarial reviewer only, read-only).
Disjoint owned paths per agent; no namespace collisions.

## Model verification

| Role | Model (verified) | Evidence |
|---|---|---|
| Fable (commander) | `claude-fable-5` | session environment |
| Opus (all manager/verifier agents) | `claude-opus-4-8[1m]` | workflow progress records, all 12 Opus agents |
| Sonnet (all implementers) | `claude-sonnet-5` | workflow progress records, all 5 Sonnet agents |
| Codex (adversarial reviewer) | **`gpt-5.6-sol`** (OpenAI Codex v0.144.6, reasoning effort xhigh) | runner result envelopes (`state/cross-agent/*.result.json` notes, e.g. call `3697e992fba5`) AND `~/.codex/sessions/2026/07/21/rollout-…019f862e….jsonl` (`"model":"gpt-5.6-sol"`, content markers match the lane prompts) |

## Phase 1 — Investigation (workflow `wf_7ab1fc52-70f`, 7 agents, ~735k tokens)

| Agent | Model | Scope (read-only except I5b) | Outcome |
|---|---|---|---|
| I1 identity | Opus | identity keys, marks buckets, fork vectors | fork = amplifier, not cause; gate-math pins lock at 1.3 |
| I2 boot-timeline | Opus | init order, failure-mode surfaces | silent HTTP-swallow confirmed; "0 of N" surface identified; mobile-home ruled out |
| I3 server | Opus | auth/token, /grade, /donow, deploy delta, Railway (read-only) | backend healthy + unchanged for the incident; /donow = DESK_DONE-only; delete path ruled out |
| I4 provenance | Opus | GH Pages/Railway SHAs, artifact parity, worktree | live = HEAD `cb8ffd4` byte-identical; no deploy Jul 17–21 |
| I5a design / I5b impl / I5c verify | Opus/Sonnet/Opus | repro fixtures + tests (owned: `tests/incident-progress-reset-*`, `tests/fixtures/incident-progress-reset/`) | 20/20 repro of the full mechanism, PII-clean, real extracted code |

## Phase 2 — Implementation (workflow `wf_96e567b8-83d`, 4 agents, ~692k tokens)

| Agent | Model | Owned paths | Outcome |
|---|---|---|---|
| plan | Opus | none (plan only) | D1–D8 edit plan, binding contracts |
| impl-A | Sonnet | `ap_stats_roadmap_square_mode.html`, incident-test inversion, `oracles.js`, `desk-offline-grade-cache.test.js` (disclosed adaptation) | fix landed; 8349/8349 root green |
| impl-B | Sonnet | `tests/progress-reset-matrix-{latch,loadstate,identity}.test.js`, `matrix-harness.js` (new only) | 44 matrix tests green |
| verify r1 | Opus | none (verification) | **pass**, 0 blocker/high; suites 70/70, 8393/8393, roster-server 1321/1321 |

## Phase 3 — Adversarial gate (workflow `wf_70562ce6-e99`, 6 agents, ~657k tokens; Codex runs sequential — the runner's `state/cross-agent-log.json` append is not concurrency-safe)

| Lane | Manager | Codex verdict → adjudicated | Confirmed MEDIUM+ |
|---|---|---|---|
| A root-cause/timeline | Opus | clear | 1 (doc: token-expiry overclaim) |
| B identity/cache (D2/D3/D6/D7) | Opus | blocking | 4 (B1 stale-token retry × identity, B2 caches not reset on switch, B3 boot legacy/roster divergence, H1 pre-roster email bucket stranded) |
| C load/gate (D1/D2/D4/D5) | Opus | clear | 1 (retry-timer identity, = B1) |
| D matrix/deploy/rollback | Opus | clear | 4 (rollback wording, matrix row 4 overclaim, commit-isolation enforcement, Retry wiring) |

Fix round (Sonnet, owned: Desk file + `tests/progress-reset-matrix-identity{,-switch}.test.js`):
`_resetGradeStateForIdentitySwitch()` in all three sign-in tails; prior-legacy-key capture → migration;
boot legacy-key reconcile; Retry → `renderDoNowGrades` direct. Re-verify (Opus): **PASS** — 83/83
target, full root 8406/8406 (232 files). Doc findings fixed by Fable in the three incident documents.

## Final state

- Suites: incident+matrix **83/83**; full root **8406/8406**; roster-server **1321/1321** (`BCRYPT_COST=4`).
- File delta (incident-owned, exact): `ap_stats_roadmap_square_mode.html` (+453/−25),
  `tests/desk-offline-grade-cache.test.js` (adapted pins), 8 new test files, 3 fixture files, 5 docs
  (spec, incident report, matrix, runbook, this ledger). Pre-existing dirty worktree untouched except
  `state/cross-agent-log.json` (Codex runner's own designed append).
- GitNexus: index refreshed to `cb8ffd4` pre-work; impact analysis run on every target symbol (the
  indexer holds no symbols for the Desk monolith's inline script → formal risk UNKNOWN; manual
  blast-radius assessment HIGH, surfaced to RC before edits).
- STOP honored: no commit, push, deploy, DB write, roster edit, or production config change.
