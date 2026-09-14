// @ts-check
// types/contracts.js — shared JSDoc type contracts (TYPECHECK_HARDENING_SPEC.md §3).
// TYPES ONLY: this file ships nothing and is never loaded by a page. It is a plain
// script (no import/export), so under the root tsconfig every `@typedef` here is
// AMBIENT — visible to all other allowlisted scripts without imports (the no-build
// analogue of a shared .d.ts).
//
// The load-bearing contract is the RECEIPT DOMAIN TAG: `t` discriminates the signed
// payload union, and the §0.1 domain separation (student-signed submissions can never
// be grades; issuer-signed grades can never be submissions) is a TYPE here, not a
// convention. `SubmissionReceiptPayload` marks `sc`/`g` as `never` — a submission
// payload STRUCTURALLY cannot carry grade fields (verify enforces it at runtime;
// the checker enforces it at every construction site).

/**
 * A score as stored on ledger rows and grade payloads: 0..100.
 * (Blank-level scores inside the grader are `Pct01`.)
 * @typedef {number} Score
 */

/**
 * A per-item auto-score in [0,1] (worksheet blank credit / MC correct).
 * @typedef {number} Pct01
 */

// ── Signed receipt payloads (the bytes under the Ed25519 signature) ────────────

/**
 * Grade-lane receipt payload — issuer-signed (teacher/server key), `t:'ledger'`.
 * Minted by roster-server/receipts.js::issueLedgerReceipt and, on-device, by
 * receipt-sign.js::signLedgerReceipt (byte-identical canonicalization).
 * @typedef {Object} LedgerReceiptPayload
 * @property {1} v
 * @property {'ledger'} t
 * @property {string} sid - student id the grade is FOR
 * @property {string} src - row source ('worksheet' | 'curriculum_quiz' | 'frq' | …)
 * @property {string} i - item id (BL-/WS-/CR-… patterns)
 * @property {number} [a] - attempt; receipts minted before `a` existed omit it (verifiers default 1)
 * @property {string} e - evidence tier ('practice' | 'proctored')
 * @property {string} ah - sha256(stringifyResponse(response)).slice(0,16)
 * @property {number} ts - signed timestamp (ms)
 * @property {string} n - nonce (dedup token)
 * @property {string} [u] - unit
 * @property {Score} [sc] - score; absent = ungraded
 * @property {string} [g] - grade provenance/label ('key' | 'self' | 'E'/'P'/'I' …)
 * @property {string} [sub] - receipt_id of the submission this grade covers (§0.7)
 * @property {string} [kv] - answer-key version scored against (§0.10)
 */

/**
 * Submissions-lane receipt payload — STUDENT-signed raw work, `t:'submission'`.
 * §0.1b: grade fields are structurally impossible — a submission can never be a
 * grade. verifySubmissionRow additionally REJECTS any payload where `sc`/`g` is
 * present at all (even null).
 * @typedef {Object} SubmissionReceiptPayload
 * @property {1} v
 * @property {'submission'} t
 * @property {string} sid - student id, must equal the signing key's REGISTERED sid (§0.2)
 * @property {string} src
 * @property {string} i
 * @property {number} [a] - the student's own attempt claim (display-only; never a supersession input, §0.4)
 * @property {string} ah - binds the response bytes
 * @property {number} ts
 * @property {string} n
 * @property {never} [sc]
 * @property {never} [g]
 */

/**
 * Nightly-review receipt payload — issuer-signed, `t:'review'` (NIGHTLY_REVIEW spec).
 * Minted server-side only; root modules never construct one — it exists in the union
 * so "not a grade, not a submission" is expressible.
 * @typedef {Object} ReviewReceiptPayload
 * @property {1} v
 * @property {'review'} t
 * @property {string} sid
 * @property {number} ts
 * @property {string} n
 */

/**
 * Daily epoch anchor payload — desk/device-signed seal over all commit heads,
 * `t:'epoch'` (ledger-seal.js, byte-compatible with roster-server admin-snapshot.js).
 * @typedef {Object} EpochReceiptPayload
 * @property {1} v
 * @property {'epoch'} t
 * @property {'desk'} iss
 * @property {string} d - NY calendar date sealed
 * @property {number} cnt - number of heads sealed
 * @property {string} root - epochRoot hex
 * @property {number} ts
 * @property {string} n
 * @property {string} [prev] - previous epoch's root (chain link)
 */

/**
 * THE domain-tagged receipt union (§0.1a). Discriminate on `t` — never on which
 * key verified, never on field presence alone.
 * @typedef {LedgerReceiptPayload | SubmissionReceiptPayload | ReviewReceiptPayload | EpochReceiptPayload} Receipt
 */

/**
 * The UNSIGNED inputs for a grade receipt — the shared seam between
 * submission-grader.js::buildGradeFields (which constructs it from a verified
 * submission) and receipt-sign.js::signLedgerReceipt (which signs it into a
 * LedgerReceiptPayload). One shape, enforced at both ends.
 * @typedef {Object} LedgerGradeFields
 * @property {string} sid
 * @property {string} [u]
 * @property {string} src
 * @property {string} i
 * @property {number} [a] - teacher-ASSIGNED attempt (§0.4/§0.9), never the submission's claim
 * @property {string} [e] - defaults to 'practice' at signing
 * @property {*} response - hashed into `ah`; never signed raw
 * @property {number | string | null} [sc]
 * @property {string} [g]
 * @property {number} [ts] - deterministic-from-submission for auto grades (§0.8)
 * @property {string} [n]
 * @property {string | null} [sub] - covered submission's receipt_id (§0.7)
 * @property {string | null} [kv] - answer-key version (§0.10)
 */

// ── Stored rows (G-Set members; server row shape + gossip cargo) ───────────────

/**
 * A grades-lane item_ledger row as stored/gossiped. Loose by design: server rows,
 * /ledger/student rows, and peer-gossiped rows all flow through the same helpers.
 * @typedef {Object} LedgerRow
 * @property {string} [receipt_id] - sha256 hex of the signed payload (content address); pre-0018 rows lack it
 * @property {string} [receipt_compact] - "payloadB64url.sigB64url"
 * @property {string} [student_id]
 * @property {string} [sid] - legacy alias some feeds use for student_id
 * @property {string} [source]
 * @property {string} [item_id]
 * @property {string} [unit]
 * @property {string} [topic]
 * @property {number|string|null} [score]
 * @property {number} [attempt] - verifiers default absent to 1
 * @property {string} [recorded_at] - ISO timestamp
 * @property {number} [ts] - signed payload timestamp (ms), when the feed carries it
 * @property {{state: 'verified'|'unverified'|'tampered', issuer?: string}} [_verify] - additive, set by LedgerStore.verifyAll
 */

/**
 * A submissions-lane row (§2). Always self-signed: a submission only exists with
 * its student-signed receipt attached.
 * @typedef {Object} SubmissionRow
 * @property {string} receipt_id
 * @property {string} receipt_compact
 * @property {string} student_id
 * @property {string} source
 * @property {string} item_id
 * @property {*} response - the raw work (the cargo `ah` binds)
 * @property {number} [attempt]
 * @property {string} [recorded_at]
 * @property {number} [ts]
 */

// ── Feeder contract (gradebook-client.js, spec §2 "record() shape only") ───────

/**
 * The FROZEN record() failure whitelist — callers switch on these strings, so the
 * set is a compatibility contract, not documentation (prop 12 pins it at runtime).
 * @typedef {'no-identity' | 'network' | 'server' | 'auth' | 'bad-args' | 'read-only'} RecordFailReason
 */

/**
 * @typedef {Object} RecordOpts
 * @property {string} source - 'worksheet' | 'curriculum_quiz' | 'frq' | … (required)
 * @property {string} itemId - WS-/BL-/CR-… feeder id (required)
 * @property {*} response - the graded work; null is a valid response, undefined = bad-args
 * @property {number | string} [score]
 * @property {number} [attempt]
 * @property {string} [unit]
 * @property {string} [topic]
 * @property {string} [skill]
 * @property {string} [kind] - offline-queue record kind (defaults to 'record')
 */

/**
 * record()'s result. NEVER a rejection: fire-and-forget callers must be safe to
 * ignore it. `queued` is HONEST — true only when the offline queue actually
 * captured the write (prop 12's honesty property).
 * @typedef {Object} RecordResult
 * @property {boolean} ok
 * @property {RecordFailReason} [reason] - present iff ok === false
 * @property {boolean} [queued] - the write was captured into window.OfflineQueue
 * @property {string | null} [ledgerId]
 * @property {*} [receipt] - the server's signed receipt, when one was issued
 */

// ── Trust registries (receipt-verify.js) ───────────────────────────────────────

/**
 * @typedef {Object} Issuer
 * @property {string} name
 * @property {string} pubkey - base64url raw 32-byte Ed25519 public key
 * @property {string} kind - 'quiz' | 'desk' | 'roster' | …
 * @property {boolean} [test] - test key: only honored behind ?test=1, NEVER on ingest
 */

/**
 * @typedef {Object} StudentKeyEntry
 * @property {string} pubkey
 * @property {string} sid - the ONE student this key is bound to (never re-bound)
 * @property {boolean} revoked - terminal on this registry (never un-revoked by refresh)
 */

/**
 * @typedef {Object} VerifyReceiptResult
 * @property {boolean} ok - a known (production, or opted-in test) issuer signed these exact bytes
 * @property {Issuer|null} issuer
 * @property {Receipt} payload
 * @property {string} receiptId - sha256 hex of the payload bytes
 */

// ── Gossip engine (ledger-gossip.js) ───────────────────────────────────────────

/**
 * Row verifier used at the ingest trust boundary. MUST fail closed.
 * @typedef {(row: LedgerRow | SubmissionRow) => (boolean | Promise<boolean>)} RowVerifier
 */

/**
 * Minimal durable-store surface gossip ingests into (LedgerStore / SubmissionStore).
 * @typedef {Object} GossipStore
 * @property {(row: any) => Promise<any>} put
 */

/**
 * Transport driving a gossip round (Nearby plugin, mock in tests).
 * @typedef {Object} GossipTransport
 * @property {(handlers: {onPeer: (id: string) => void, onMessage: (id: string, msg: string) => void, onLost: (id: string) => void}) => void} start
 * @property {(peerId: string, msg: string) => void} send
 * @property {() => void} stop
 */

// This file intentionally declares no runtime values.
