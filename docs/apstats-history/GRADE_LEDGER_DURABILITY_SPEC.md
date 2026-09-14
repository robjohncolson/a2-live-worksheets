# GRADE LEDGER DURABILITY SPEC

Make the grade ledger survive the loss of Supabase — by **replicating and anchoring
off-Supabase** the signed receipt chain you already build.

> **Status:** proposed. **Owner:** teacher. **Scope:** `roster-server/` + one new
> GitHub Action + one CLI tool. **No new Supabase table. No PoW. No consensus.**

---

## 0. Context — what already exists (do not rebuild)

You already have a real, signed, hash-chained ledger. The certainty/tamper-evidence
work is **done**. The relevant pieces:

| Concept | Where | What it is |
|---|---|---|
| **blob** | `roster-server/receipts.js` → `issueLedgerReceipt` | one Ed25519-signed receipt per answered item; stored on `item_ledger.receipt_compact` / `receipt_id` (migration `0018`) |
| **commit** | `roster-server/commits.js` → `buildCommits` | a signed manifest over a session-chunk of receipts + an order-independent `root`; **chained via `prev` (previous commit's root)**, with a `head` |
| **session** | `commits.js` `SESSION_GAP_MS = 25min`, `MAX_PER_COMMIT = 8` | "divided by sessions": idle gap starts a new session; each session is chunked QR-sized |
| **transcript** | `roster-server/transcript.js` → `issueTranscriptReceipt` | a signed snapshot binding the receipt `root` + `gradeHash`/`cfgHash`/`artHash`/`codeHash` |
| **rebuild path** | `roster-server/ledger-import.js` → `POST /ledger/import` | teacher-gated, idempotent upsert on `(student_id, source, item_id, attempt)`; re-issues receipts |
| **export bundle** | `offline-queue.js` schema `apstats-offline-export/v1` | `{ schema, student, appBuild, generatedAt, records:[] }` — already the import-accepted shape |
| **client cache** | `gradebook-client.js` localStorage `desk_receipts_v1` (cap 500) | partial per-student replication, today capped |

**The gap.** `commits.js` header says it plainly: *"the chain is recomputed from the
same input each call."* The input is `item_ledger`, which lives **only in Supabase**.
So the chain proves nobody **tampered**, but it does **not** protect against Supabase
**vanishing** — lose the rows and there is nothing to recompute from.

**This spec closes exactly that gap:** keep the chain you have; add off-Supabase
**replication** (durability), an off-Supabase **anchor** (certainty across restores),
and a **verify + rebuild** tool (recovery + "see the whole class, verified").

---

## 1. Goals / Non-goals

**Goals**
1. If Supabase is wiped, the full gradebook can be **rebuilt** from an independent,
   self-verifying mirror, with **zero trust** in the mirror (every record is signed).
2. A **stale or tampered** Supabase restore is **detectable** (anchored chain heads).
3. A single command produces a **"class state as of date X, every student, fully
   verified"** report.

**Non-goals**
- No Proof-of-Work, no mining, no distributed consensus. There is one trusted issuer
  (the server's `RECEIPT_ISSUER_PRIVATE_KEY`); PoW would buy nothing here.
- No new Supabase table for the chain (it stays recomputed-on-demand).
- No change to grading math (`grade.js`), the signing payloads, or write paths.

**Threat model (what each piece defends against)**
- *Accidental loss* (Supabase outage / project deletion / bad migration) → **§3 mirror**.
- *Silent restore from a stale/edited backup* → **§4 anchor**.
- *Post-hoc edit of a grade* → already covered: receipt signatures + commit `prev`-chain.
- *Student forging their own grade* → already covered: writes are service-role-only,
  server-side; receipts are issuer-signed. This spec does not weaken that.

---

## 2. Architecture (one diagram)

```
                 (existing)                         (new in this spec)
  item_ledger ──► buildCommits / transcript ──►  GET /admin/snapshot  ──► GitHub Action
  (Supabase)      signed receipts + heads        (teacher-gated)          (daily cron)
                                                        │                      │
                                                        │                      ▼
                                                        │             private mirror repo
                                                        │             snapshots/<date>.json
                                                        │             latest.json + ANCHORS.md
                                                        ▼                      │
                                                 issueEpochReceipt        (git hash+time
                                                 (class-level anchor,      = external anchor;
                                                  prev-chained per day)    optional OpenTimestamps)
                                                                               │
                              tools/verify-ledger.mjs  ◄─────────────────────┘
                              verify signatures + chains; rebuild via POST /ledger/import
```

Three deliverables: **(A)** snapshot endpoint, **(B)** mirror Action, **(C)** verify/rebuild CLI.
Plus **(D)** optional student-cache replication.

---

## 3. Deliverable A — `GET /admin/snapshot` (teacher-gated)

A single endpoint that emits the **entire** signed ledger plus per-student chain heads,
in the existing bundle shape so `/ledger/import` can replay it verbatim.

**File:** `roster-server/admin-snapshot.js` (new). Mount in `server.js` next to
`mountCommits` / `mountTranscript` (≈ line 905). Auth: `requireTeacher` (reuse
`teacher-auth.js`, the `X-Teacher-Secret` path).

**Behavior**
1. List all roster students (reuse the `/class/grades` fan-out in `class.js`).
2. For each student: `ledgerDb.getLedgerByStudent(sid)` → map rows to the
   `apstats-offline-export/v1` bundle; run `buildCommits(rows, {sid,u})` → `head`;
   run `receiptRoot(members)` (from `transcript.js`) → `transcriptRoot`.
3. Compute the **epoch anchor** over the sorted per-student heads (see §4).

**Response shape** (`apstats-ledger-snapshot/v1`):
```jsonc
{
  "schema": "apstats-ledger-snapshot/v1",
  "generatedAt": 1735500000000,
  "asOfDateNY": "2026-06-29",
  "issuer": { "alg": "Ed25519", "pubkey": "<base64url x>" },   // from getReceiptIssuer()
  "students": [
    {
      "studentId": "uuid", "username": "fruit_animal", "section": "PeriodB",
      "commitsHead": "<root hex|null>",
      "transcriptRoot": "<root hex|null>",
      "bundle": {                                  // <-- exact /ledger/import input
        "schema": "apstats-offline-export/v1",
        "student": { "studentId": "uuid", "username": "fruit_animal" },
        "records": [
          { "source":"worksheet","itemId":"WS-U4L1-2-Q3","unit":"U4","topic":"...",
            "skill":"...","response": {/*jsonb*/}, "score":1, "attempt":1,
            "recorded_at":"...", "receipt_compact":"<payload.sig>" }
          /* every row, including receipt_compact so the mirror is self-verifying */
        ]
      }
    }
  ],
  "epoch": {                                       // the daily class-level anchor (§4)
    "asOfDateNY": "2026-06-29",
    "heads": { "uuid": "<head>", "...": "..." },   // sorted by sid
    "root": "<sha256 over sorted sid:head lines>",
    "prev": "<yesterday's epoch root|null>",
    "receipt_compact": "<issueEpochReceipt(...)>"
  }
}
```

**Notes**
- Include `receipt_compact` per record — that is what makes the mirror self-verifying
  and lets `/ledger/import` re-attach a verifiable chain on rebuild.
- This is **read-only** and teacher-gated; it never writes. Large but bounded
  (~7.5k rows/class/term); paginate by section if a class ever exceeds a few MB.
- PII: response carries `real_name`/`response` (student answers). The mirror repo MUST
  be **private** (§3.1). Consider `?section=` and `?omitRealName=1` query params.

### 3.1 Deliverable B — the mirror (GitHub Action)

A scheduled job that pulls the snapshot and commits it to a **private** repo. Git itself
provides the redundancy (every clone is a full copy), versioning, and a trustworthy
timestamp — all independent of Supabase and Railway.

**Where:** new private repo `apstats-grade-mirror` (NOT the public `follow-alongs`,
which is GH-Pages-published). The Action can live in either repo; recommend in the
mirror repo so its secrets are isolated.

**File:** `.github/workflows/mirror-ledger.yml` (new, in the mirror repo).
```yaml
name: mirror-ledger
on:
  schedule: [{ cron: "0 23 * * *" }]   # ~daily; also after each school day
  workflow_dispatch: {}                 # manual "back it up now"
jobs:
  snapshot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Pull snapshot
        env:
          ROSTER_URL: ${{ secrets.ROSTER_URL }}              # https://roster-...up.railway.app
          TEACHER_SECRET: ${{ secrets.ROSTER_TEACHER_SECRET }}
        run: |
          DATE=$(date -u +%F)
          curl -fsS -H "X-Teacher-Secret: $TEACHER_SECRET" \
            "$ROSTER_URL/admin/snapshot" -o "snapshots/$DATE.json"
          cp "snapshots/$DATE.json" latest.json
          node tools/append-anchor.mjs "snapshots/$DATE.json" >> ANCHORS.md
      - name: Commit
        run: |
          git config user.name "grade-mirror"; git config user.email "noreply@local"
          git add -A && git commit -m "mirror $(date -u +%F)" || echo "no change"
          git push
```

**Result:** `snapshots/<date>.json` (full self-verifying ledger), `latest.json`, and
`ANCHORS.md` (one line per day: `date  epoch.root  prev  studentCount  recordCount`).
The git commit SHA + push time are the external anchor. Losing Supabase now loses
**nothing** — replay `latest.json` via the CLI (§5).

---

## 4. Deliverable A (cont.) — the anchor: `issueEpochReceipt`

Today each student has a per-student commit chain. Add a **class-level chain of daily
anchors** so the *whole class state* is committed once per snapshot and chained
day-over-day. This is the "stale restore is detectable" guarantee.

**Add to `receipts.js`** (mirrors `issueCommitReceipt` exactly):
```js
export function issueEpochReceipt({ asOf, asOfDateNY, cnt, root, prev }) {
  if (!issuer.enabled) return null;
  if (!asOfDateNY || !root) return null;
  const payload = {
    v: 1, t: 'epoch', iss: 'desk',
    d: asOfDateNY, cnt, root,
    prev: prev || undefined,
    ts: asOf, n: crypto.randomBytes(4).toString('hex')
  };
  return signPayload(issuer.privateKey, payload);   // { receiptId, compact }
}
```
- `root = sha256( sortedByStudent( "<sid>:<head>" ).join("\n") )` — order-independent,
  same convention as `commitRoot` / `receiptRoot`.
- `prev` = the previous snapshot's epoch `root`, read from the mirror's `ANCHORS.md`
  (the Action passes `--prev` from the last line; genesis omits it). The chain of epoch
  roots is the class's daily-sealed history — a tiny blockchain of "the whole class, this day".
- **Optional Bitcoin anchor:** add an OpenTimestamps step on the epoch `root`
  (`ots stamp`), commit the `.ots` proof. Free; upgrades "git says so" to "Bitcoin says
  this state existed on this date," surviving even total loss of your own infra.

---

## 5. Deliverable C — `tools/verify-ledger.mjs` (verify + rebuild + report)

The payoff piece: one CLI that verifies the mirror end-to-end, rebuilds Supabase, and
prints the class state. Pure Node, reuses `receiptInternals` from `receipts.js`.

**`node tools/verify-ledger.mjs <snapshot.json> [--pubkey <x> | --issuer-url <url>]`**
1. **Verify every blob:** for each record, decode `receipt_compact` → check canonical
   payload matches → `crypto.verify(null, bytes, issuerPub, sig)`. Count pass/fail.
2. **Verify every chain:** re-run `buildCommits` on each student's records; assert the
   recomputed `head` equals the snapshot's `commitsHead`; assert each commit's `prev`
   links. Re-run `receiptRoot`; assert `transcriptRoot`.
3. **Verify the anchor:** recompute `epoch.root` over the sorted heads; verify
   `epoch.receipt_compact`; if `--prev`/`ANCHORS.md` given, assert `epoch.prev` matches
   yesterday's root (no gap, no rewrite).
4. **Report:** print `students=N records=M verified=✓/✗ breaks=[...]`, plus per-student
   `lastActivity, recordCount, head[:8]` — i.e. **"verify all student work and know where
   everyone is."**

**`node tools/verify-ledger.mjs <snapshot.json> --rebuild --roster-url <url> --teacher-secret <s>`**
- After verification passes, POST `{ bundles: [...] }` to **`POST /admin/restore`** (NOT
  `/ledger/import`). Idempotent — safe to run against a half-restored DB.

> **Faithful restore vs. offline import (a recovery-drill finding, now fixed).** The
> first drill against production showed `/ledger/import` would silently DROP 6/421 rows:
> the `*-DESK_DONE` lesson-completion rows carry a **0..100** percentage, but
> `/ledger/import` clamps worksheet scores to **0..1** (correct for *student-submitted
> offline* bundles, where an unsigned score must not be trusted). Disaster recovery is a
> different trust model, so `admin-restore.js` (`POST /admin/restore`, teacher-gated)
> replays **only records bearing a valid signature from this server's issuer key**, and
> for those writes them **byte-for-byte**: score AS-IS (no clamp — safe, the signature
> binds it), `evidence_tier` from the signed payload (proctored stays proctored),
> original `recorded_at` (so recomputed commit heads match the anchor), and the **original
> receipt preserved** (not re-issued). A tampered or unsigned row is refused, not written.
> Proven against the live mirror: `/ledger/import` accepts 415/421, `/admin/restore`
> accepts **421/421** (incl. all 6 out-of-range).

**`--report-only --csv`** → emit a gradebook CSV (quote fields per repo CSV rule) as a
human-readable secondary backup.

---

## 6. Deliverable D (optional) — students as replicas

Today each device caches `desk_receipts_v1` (cap 500). Make students a *second*
independent replication tier:
1. Raise/lift the 500 cap (or shard by unit) in `gradebook-client.js`.
2. Add a student-facing **"export my receipts"** → the `apstats-offline-export/v1`
   bundle they already understand (reuse `offline-queue.js` `toBundle`).
3. Teacher **"collect"** = drop those bundles through the existing `/ledger/import`.
The union of all student bundles + the teacher mirror = belt-and-suspenders durability,
each piece self-verifying. (Nice-to-have; the mirror in §3 is sufficient alone.)

---

## 7. Optional flavor — PoW where it belongs (the doge game)

Integrity must **not** depend on PoW. But you already have `doge_wallet`
(`0019_doge_wallet.sql`, `DOGE_WALLET_SPEC.md`). If you want the *feel*: a student-facing
"mine doge by doing practice" loop where the **work is the proof** (completing problems),
or a featherweight hashcash on submissions for anti-spam — fully decoupled from grades.
Out of scope here; noted so it doesn't leak into the integrity path.

---

## 8. Rollout

| Phase | Work | Risk |
|---|---|---|
| **1** | `GET /admin/snapshot` + `issueEpochReceipt` + unit tests | low — read-only, new endpoint |
| **2** | `tools/verify-ledger.mjs` (verify + report) | none — offline tool |
| **3** | private mirror repo + `mirror-ledger.yml` + secrets | low — read-only pull |
| **4** | `--rebuild` path; dry-run restore into a throwaway Supabase | medium — exercises import |
| **5** | (opt) OpenTimestamps anchor; (opt) student export tier | low |

**"Done" = the recovery drill passes:** snapshot today → wipe a *staging* Supabase →
`verify-ledger --rebuild` → `/class/grades` matches the pre-wipe report byte-for-byte.

---

## 9. Tests (Vitest, mirrors existing `roster-server` suite)

- `admin-snapshot`: fan-out shape; bundle round-trips through `normalizeImportBody`;
  teacher-gate rejects without secret.
- `issueEpochReceipt`: deterministic `root` over heads; `prev` chaining; signature
  verifies with `receiptInternals`.
- `verify-ledger`: (a) clean snapshot → all-pass; (b) flip one `score` → blob fail +
  chain break; (c) drop one record → head mismatch; (d) wrong `epoch.prev` → gap flagged.
- `rebuild`: import a snapshot into pglite (`@electric-sql/pglite`, already a dev dep);
  re-`getLedgerByStudent` equals source; idempotent on second import.

---

## 10. Files touched

**New:** `roster-server/admin-snapshot.js`, `tools/verify-ledger.mjs`,
`tools/append-anchor.mjs`, `mirror-ledger.yml` (mirror repo),
`roster-server/admin-snapshot.test.js`, `tools/verify-ledger.test.js`.
**Edited (additive only):** `roster-server/receipts.js` (`+issueEpochReceipt`, export
it + via `receiptInternals` if needed), `roster-server/server.js` (`+mountAdminSnapshot`).
**Unchanged:** `grade.js`, `ledger.js`, `commits.js`, `transcript.js`, every signing
payload, every write path, the Supabase schema.

---

### TL;DR
You already built the blockchain (signed blobs → session commits chained by `prev` →
transcript roots). It guarantees **integrity** but not **durability**, because it is
recomputed from a Supabase-only `item_ledger`. This spec adds a teacher-gated
**snapshot** of the self-verifying ledger, a daily **git mirror** + chained **epoch
anchor** (off Supabase, optionally Bitcoin-timestamped), and a **verify/rebuild CLI**.
Result: Supabase can disappear and you still hold a provable, complete, reconstructable
gradebook — and a one-command "whole class, verified, as of today" view.
