# Desk "Do Now" — Sprint DN1 Build Plan & Frozen Contracts (the completion engine)

**Status:** Build in progress (session 99, 2026-05-18). Freezes interfaces so 2 workstreams build in parallel.
**Authority (law):** these FROZEN CONTRACTS + `DESK_DONOW_SPEC.md` (SIGNED OFF `5f4a7a0`; D1–D7). DN1 = the **completion engine** only — the spec's manifest + `/donow`. **DN2 (feeder/roster adoption) and DN3 (Desk single-calendar render) are DEFERRED** (riskier, contended files, separate checkpoint).

> Rule: contracts are law — no renamed field/route/path, no schema drift. Flag, don't silently "fix." A result file is **not** evidence — planner re-runs everything under vitest (s88b; and a recent Codex node-only "pass" regressed vitest — re-verify in the real harness).

## 0. Scope & engine-first rationale

`DESK_DONOW_SPEC.md` §4 lists adoption first, but adoption is the highest-risk/most-collision-prone work (touches 69 worksheets + the contended Desk + the separate curriculum_render repo, with a concurrent AI-tutor session live). The **engine** (manifest + `/donow`) is new/additive, fixture-testable, zero-collision — build & prove it now against synthetic data; wire real data in DN2. This does not violate D2 (D2 = the *feature* can't *ship to students* without a populated ledger; the engine can be *built & tested* first).

**IN (DN1):** WS-A `data/work-manifest.json` builder; WS-B `GET /donow` on roster-server (manifest − ledger).
**DEFERRED:** DN2 = wire `rosterClient` into the Desk + `gradebookClient.record` into worksheets & the curriculum_render quiz (populates the ledger). DN3 = collapse the roadmap to one fall calendar + 4-color cells + Do Now card + soft speed-bump + project `/donow` onto dates (incl. the "ahead" celebratory state). Then full T2 disambiguation → Phase 2/3/4.

## FROZEN CONTRACT 1 — item-id vocabulary (T1-established; do NOT invent)

The canonical item ids = **the keys of `data/skill-map.json`** (T1; the feeders in DN2 will record these exact ids). Classification for the manifest:

| skill-map key shape | source | manifest grouping |
|---|---|---|
| `WS-U{u}L{l}-Q{n}`, `WS-U{u}L{l}-{n}`, `WS-U{u}L{l}-reflect{n}`, `WS-U{u}L{l}-exitTicket{n}` | `worksheet` | unit U{u} → lesson "{u}.{l}" → activity **worksheet** |
| `U{u}-L{l}-Q{n}`, `U{u}-L{l}-MCQ-Q{n}`, `U{u}-L{l}-FRQ-Q{n}` | `curriculum_quiz` | unit U{u} → lesson "{u}.{l}" → activity **quiz** |
| `U{u}-PC-MCQ-{A..D}-Q{n}`, `U{u}-PC-FRQ-Q{n}` | `pc` | unit U{u} → (no lesson) → activity **progress-check** |
| `WS-U{u}L{l}-appeal`, `U{u}-L{l}-QS{n}`, `u{u}-frq-*` | — | **EXCLUDED** (appeal = a grading action not "work"; `QS`/`u#-frq-` = diagnostic pool, not student feeder work) |

A lesson id is `"{unit}.{lesson}"` (e.g. `1.2`). Multi-lesson combined worksheets (U4/U5) keep whatever `U{u}L{l}` the skill-map key carries — group by that key's literal U/L; do not re-derive.

## FROZEN CONTRACT 2 — `data/work-manifest.json` (WS-A; via `scripts/build-work-manifest.mjs`)

Deterministic, generated **only** from `data/skill-map.json` keys (read-only) per CONTRACT 1. CLI `node scripts/build-work-manifest.mjs` writes the file; two runs byte-identical (aside from one clearly-marked generated/timestamp line a test ignores). Schema (FROZEN):

```json
{
  "generatedFrom": "data/skill-map.json",
  "units": [
    { "unit": "U1",
      "lessons": [
        { "lesson": "1.2",
          "activities": [
            { "activity": "worksheet", "source": "worksheet", "itemIds": ["WS-U1L2-Q1", …], "count": 12 },
            { "activity": "quiz",      "source": "curriculum_quiz", "itemIds": ["U1-L2-Q01", …], "count": 8 }
          ] } ],
      "pc": { "activity": "progress-check", "source": "pc", "itemIds": ["U1-PC-MCQ-A-Q01", …], "count": 60 } }
  ],
  "index": { "WS-U1L2-Q1": { "unit":"U1", "lesson":"1.2", "activity":"worksheet" }, … }
}
```

`index` is a flat `itemId → {unit,lesson|null,activity}` map for O(1) ledger diff. Unit/lesson/activity ordering MUST be deterministic & natural (U1<U2…; 1.1<1.2…<1.10; worksheet before quiz; pc last within a unit). Every classified skill-map key appears exactly once in both the nested tree and `index`; excluded shapes appear in neither (a test asserts counts reconcile to the skill-map minus exclusions).

## FROZEN CONTRACT 3 — `GET /donow` (WS-B; additive on roster-server)

Mounted in the existing `createApp(...)` factory; `/health`, all `/roster/*`, all `/ledger/*` stay byte-behavior-unchanged. Auth: the **roster session token** (same `verifyToken` from `./token.js` used by `/ledger`); token via `Authorization: Bearer <t>` or `?token=`. Resolve → studentId; 401 if absent/invalid. Reads `item_ledger` for that studentId (reuse Sprint-1 ledger-db, injectable) + the work-manifest (injectable loader; live path from `WORK_MANIFEST_PATH` env, default the repo `data/work-manifest.json`; tests inject a fixture).

**`GET /donow`** → `200`:
```json
{ "ok": true,
  "nextTask": { "unit":"U1","lesson":"1.2","activity":"worksheet","source":"worksheet",
                "progress": { "done": 4, "total": 12 }, "reason": "earliest-incomplete" } | null,
  "lessons": [ { "unit":"U1","lesson":"1.2",
                 "activities":[ {"activity":"worksheet","source":"worksheet","done":4,"total":12,"state":"partial"} ],
                 "lessonState":"none|partial|done" } … ],
  "units": [ { "unit":"U1","pc": {"done":0,"total":60,"state":"none"} } … ],
  "earlierGapFlag": true }
```
- "done" for an item = a row exists in `item_ledger` for `(student_id, item_id)` (attempted; per spec D3 — **not** score-gated).
- `state`: none (0 done) / partial (0<done<total) / done (done==total). `lessonState` = roll-up across its activities.
- `nextTask` = the **earliest** incomplete activity in CONTRACT-2 order (unit→lesson→activity; a unit's `pc` after its lessons). `null` iff everything complete.
- `earlierGapFlag` = true iff any incomplete activity exists *before* the student's most-advanced touched activity (drives DN3's D1 speed-bump; computed here, rendered later).
- **No calendar dates** — DN1 returns the completion structure; DN3 projects lessons → fall-calendar cells + the "ahead" state.

Env append (`roster-server/.env.example`, placeholder): `WORK_MANIFEST_PATH=   # path to data/work-manifest.json (default: repo data dir)`.

## 1. Owned paths (FROZEN — non-overlapping)

- **WS-A:** `scripts/build-work-manifest.mjs`, `data/work-manifest.json`, `tests/work-manifest.test.js`.
- **WS-B:** `roster-server/donow.js` (router, `mountDonow(app,{db,verifyToken,loadManifest})`), `roster-server/server.js` (mount it — **WS-B sole owner this sprint**), `roster-server/tests/donow.test.js`, `roster-server/.env.example` (append one line), `roster-server/README.md` (append a "Do Now (DN1)" section). WS-B may reuse `roster-server/ledger-db.js` read-only (don't modify it) for ledger reads, or add a tiny read helper in `donow.js`.

No file dual-owned. WS-B builds against a **fixture manifest** matching CONTRACT 2 (don't depend on WS-A's output existing); planner integration-verifies WS-A's real manifest through `/donow`. Neither WS edits `data/skill-map.json`, `curriculum_render/**` (skill-map keys are read-only via the json), worksheets, the Desk/roadmap, the study guide, or anything the concurrent AI-tutor session owns (`ai-tutor/**`, `start-here.html`).

## 2. Tests (each WS green; planner re-runs all under vitest + integration)

- **WS-A** `tests/work-manifest.test.js`: deterministic (two builds identical); every classified skill-map key appears once in tree & `index`; excluded shapes absent; counts reconcile (tree total + excluded == skill-map total); ordering is the CONTRACT-2 natural order.
- **WS-B** `roster-server/tests/donow.test.js` (vitest, injected fake ledger-db + fixture manifest, **no network**): token required (401 without); `nextTask` = earliest incomplete in frozen order; partial/done/none states correct; `earlierGapFlag` logic; everything-done → `nextTask:null`; **the 28 roster + the ledger tests still pass (additive, no regression)** — run `cd roster-server && npm test`.
- Root `npm test` stays green except the **known unrelated** `study-guide.test.js` (do not touch it).

## 3. Result files

`.batch-dn1-A.result.md` / `.batch-dn1-B.result.md` at repo root: files, contract adherence (quote the frozen bits), EXACT vitest command + REAL pasted output, counts, anything flagged. No fabrication — planner re-runs under vitest + wires WS-A's real manifest into WS-B's `/donow` for an integration check.
