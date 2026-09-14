# CONTINUATION PROMPT — **s36 (2026-09-03) IS CURRENT: read the SESSION 36 block below — its USER-ACTION CHECKLIST is the live to-do (migrations 0032/0033 + TEACHER_KEY rotation).** Historic s35 header follows: FRQ grade tickets are LIVE in `authoritative` canary; cr `AI_GRADE_AUTH=log` flipped 2026-08-27; the rest of Stage 4 (`FRQ_CANARY_STUDENTS=*`, then `enforce`) is deliberately held — `*` waits for the first real worksheet day, `enforce` is blocked on four unauthenticated grader callers. The SY2627 calendar intake is still blank with the real schedule expected ~2026-09-01, and that is the top blocker. ‖ PRIOR (s33 title, historical): NIGHTLY REVIEW v2 SHIPPED + OFFLINE-GRADING MESH Phases 1-2 SHIPPED (s33): NIGHTLY REVIEW v2 (fa `dbd7c0c` + cr `6313293`) — the 🌙 teacher surface gains ✨ AI-drafted comments (single OR a ≤5-answer same-mistake cluster, via a NEW cr `POST /api/ai/review-comment`; the full student response is released to the drafter ONLY for rows already AI-graded at grade time — `aiGradedRow()`: quiz_review|quiz_exception|pc+'-SG'|scored frq, NEVER proctored — the spec's `{'ai','ai-graded'}` allowlist strings turned out to be DEAD/never-written) + a By-student / By-item toggle (the by-item lens groups the class under each itemId) + rh+score 409-stale pins (worksheets revise in place → a mark 409s instead of landing a comment on work a student revised mid-review, `rh` bound into the signed `t:'review'` receipt) + a 14-day default window (badge count visibly drops — intended; `?days=all` = full history) + truncation reporting. 20-agent adversarial review caught + fixed a `__proto__` item_id server-crash + a score-pin coverage hole. ⏭ USER: set `TEACHER_KEY` Railway env to something NOT the published default before the full-response endpoint sees real use (currently set to the default `apteacher2627` = zero secrecy). ; OFFLINE-GRADING MESH Phases 1-2 (fa `3a446dc`+`acf03aa`, the raw-work lane so a fully-OFFLINE classroom turns work into grades with no server): P1 = student PKI + DOMAIN SEPARATION — `verifyLedgerRow` (client) + `verifyRecord` (server) now REQUIRE `payload.t==='ledger'` (every real grade IS t:'ledger'; a teacher FRQ grade = t:'ledger'+src:'frq'; 3 test fixtures hand-built grade payloads w/o `t` → made representative), a 2nd DISJOINT `ReceiptVerify.STUDENT_KEYS` trust set + `verifySubmissionRow` (t:'submission', no sc/g, ah bind, impersonation gate row.sid===payload.sid===signing-key's REGISTERED sid), migration `0027_student_keys` (**USER-RAN ✅**; pubkey PK, FK roster, TERMINAL revoked) + `/student-keys` register(sid-from-TOKEN)/get/revoke, client `student-key.js` (APK-only device key). P2 = the SUBMISSIONS lane — `submission-store.js` 2nd content-addressed G-Set (`apstats_submissions_v1`, SEPARATE from grades) w/ grade-gated SUPPRESSION (§0.7: `coveredKeys` reads a `sub` ref from a grade's payload, covers that submission if same student, monotone → converges; `rowsForGossip` drops covered from the offer, `suppressingVerify` rejects on ingest, row NEVER deleted; nothing suppressed until Phase 3 mints `sub`), `submission-capture.js` self-sign raw work (forced self-attribution), `ledger-gossip.js` lane tags + `runLanes` (both lanes over ONE Nearby discovery; `frame`/`runRound` BYTE-IDENTICAL when no lane → grades path untouched). Reviews: P1 4/4 refuted 0 confirmed, P2 3/3 refuted (2 drove fixes: a Promise-vs-array that'd silently disable suppression, + the missing reject-on-ingest). ⚠⚠ **RUNTIME-UNTESTED — Phases 1-2 need a 2-PHONE + teacher-device test (only the user, via adb) BEFORE building Phases 3-4.** ⏭ Phase 3 = teacher offline grade loop (deterministic receipts §0.8, the `sub` ref that activates suppression, anti-farming §0.4 + per-student flood cap deferred from P2), Phase 4 = hub reconcile (server archives subs, never re-grades §0.10). ; ‖ PRIOR (s31): ANDROID Phase 2 (on-device ledger merge) + Phase 3 (P2P gossip) SHIPPED + APK rebuilt: PHASE 2 — the student device re-derives its OWN grade OFFLINE from local signed ledger rows using the EXACT server engine (item-level re-derivation, user-chosen), made divergence-proof by SHARING the engine: `scripts/build-grade-engine.mjs` bundles the 3 pure server modules (grade-config+scoring+lesson-grade+gradebook-grid+grade) into `window.GradeEngine` (`grade-engine.bundle.js`); a PARITY test pins client `computeGrade`/`buildGradebook` ≡ server across all sim-world archetypes + a no-drift check. The answer key NEVER ships: new read-only token-gated `roster-server/grade-offline-inputs.js` `GET /grade/offline-inputs` returns a REDACTED per-student key (same item-ids + gradability so denominators match, every answer a sentinel EXCEPT the student's OWN correctly-answered items; proctored PC redacted by default, `?includePc=1` restores PC parity when PCs open). `ledger-store.js` = content-addressed (receipt_id) IndexedDB G-Set w/ `.pull()` from /ledger/student + `.verifyAll()` (Ed25519 via receipt-verify.js); Desk offline branch re-derives via GradeEngine over LedgerStore ∪ unsynced OfflineQueue (REPLACES the unverified `apstats_grade_cache_v1` restore), strictly additive — online /grade still wins, never-downgrade, OFF in view-as; 🔐 verification chip in My Ledger (roster issuer pubkey fetched from `/receipts/issuer` + registered into ReceiptVerify). PHASE 3 — phones epidemically gossip the signed-ledger G-Set so a student's work reaches the teacher via classmates with no internet/no direct contact: `ledger-gossip.js` anti-entropy (HELLO→SYNC→SEND, both peers converge to the union; merge=union so conflicts impossible), VERIFY-ON-INGEST is the SECURITY BOUNDARY (a row is stored/relayed only if its receipt verifies → a peer CANNOT inject a fake grade; replay harmless). Committable local Capacitor plugin `android-app/plugins/gossip-nearby/` wraps Google Nearby Connections (P2P_CLUSTER: BT/BLE/Wi-Fi-Direct, auto-discover, no pairing); `nearby-transport.js` registers `window.GossipTransport` ONLY in the APK (web Desk inert, "Sync Nearby" menu item stays hidden); Desk `_phase3SyncNearby` runs one session per peer. APK REBUILT with the plugin (cap sync detects `gossip-nearby@1.0.0`, gradle compiles it + resolves play-services-nearby + packages it; 1514 MB). Tests root **7613/7613**, roster-server **1134/1134**. ⏭ NEXT = PHASE 4 (teacher app: move the issuer signing key on-device into Android Keystore+PIN, backup = Railway warm-spare of the EXISTING `RECEIPT_ISSUER_PRIVATE_KEY` — NOT the apteacher2627 login key — + issuer-key history; the import→grade-FRQ→sign→seal-epoch→push loop). ⚠ runtime P2P needs a **2-PHONE test** (only the user can do this; drive via adb). ; NIGHTLY REVIEW shipped + ANDROID offline-course app + cr quiz mobile pass (s30): NIGHTLY REVIEW all 4 phases LIVE — a 🌙 teacher Desk surface to review recent student work (mark SEEN per item/session/day + comment + editable templates + "not reviewed in N days" flag), each review a signed `t:'review'` receipt that mints **1 bonus candy/student/day** (new additive `candy_bonus` MINT — spec §3.3's "bump candy_given" was BACKWARDS) and toasts the student via the existing nudge path; student sees 👁seen/💬comment in My Ledger; reviews ride snapshot/verify/restore + the nightly digest; **migration 0025 USER-RUN + DONE**. ANDROID PACKET APP — the whole AP Stats course as a SIDELOADABLE offline Capacitor APK (~1.5 GB: 144 videos re-encoded H.264-CRF23 24.96GB→1.49GB visually-identical, all worksheets, the quiz app, a mobile-first lessons launcher `mobile-home.html`); grades capture offline → existing ledger; ANDROID_PACKET_APP_SPEC.md brainstormed the durable model (single-writer signed-CRDT grade ledger gossiped P2P over Nearby/BT across phones+teacher-app+Supabase, latest-ts wins, clear-text/UI-level-privacy, teacher key on-device w/ Railway warm-spare). cr quiz given a mobile-responsive `@media ≤600px` pass (desktop untouched), verified on-device via adb screenshots. ; GRADE-LEDGER DURABILITY + nightly backup/review (s29): survive a Supabase loss — signed off-Supabase snapshot / verify / FAITHFUL restore, teacher dashboard "Grade Backup & Recovery" card, Desk 1-click 💾 Download Grade Backup, a LOCAL nightly backup Task Scheduler job that also writes a per-student REVIEW digest, and the default teacher key changed apstats2627→**apteacher2627** (it collided with the student password). NIGHTLY REVIEW feature (mark-seen + comment + candy + toast, signed) is SPEC'D (NIGHTLY_REVIEW_SPEC.md), not yet built. ; GUESTS RETIRED everywhere + teacher-trust fixes (s28): guests fully disabled on every student surface (Desk/worksheets/study-guide/quiz + cr presence-server `Guest_` reject), off-roster students self-sign-up with a REAL NAME; worksheet "revise anytime" hint on all 69; VIEW-AS grade-cache bug fixed (it was showing the teacher's OWN grades under the student's banner); "Why so low?" AI COACH fixed (stops pushing not-yet-open Progress Checks + surfaces the flashcard completion/unlock gate). ; OFFLINE MODE shipped end-to-end + FEATURE AUDIT closed (s27): every student surface (worksheets/Desk/study-guide/quiz) captures grades offline → export → teacher import (`/ledger/import`); one-click USB pack (build + launcher, 24 GB video pulled local); installable PWA on BOTH repos. Distribution machinery (per-unit/torrent/USB) deliberately NOT built (YAGNI). ; TEACHER CHAT: guests can now READ + get notified of teacher messages (s26) ; cr typed sign-in roster dropdown (Codex s26) ; REPO HYGIENE + PRESENCE FIX: edgar/MIT removal + roadmap resilience + greyed-ghost-avatar ⇄ "Online Now" agreement; grade behavior clarified (s25) ; TETRIS HARDENING: Study Break 1v1 multiplayer + stakes robustness pass (s24) ; MODAL ESCAPE: every Desk content modal now closes with Esc (s21) ; AVATAR MENU: click classmate → name → 🍬 candy / ⚔️ game, click self → 🎉 happy bounce (s20/s22) ; STUDY BREAK STAKES LIVE: bet candy on best-of-3 Tetris (s19, backend+client) ; DOGE PRESENCE chips+submenu (s18) ; candy↔DOGE CONSERVATION AUDIT + F1 race FIXED (s17) ; DOGE ⇄ candy BIDIRECTIONAL (s16) ; candy economy REVIVED (s15) ; grade-integrity + calendar COMPLETE

> ⚠ **STALE (s33-era, 2026-07-02). The authoritative block is `## ⏭ SESSION 35` further down.** This
> blockquote is kept for history only — its Windows `C:/Users/rober/...` paths are dead (the host moved
> to Linux in s34) and its "supersedes everything below" claim no longer holds.
>
> Last updated 2026-07-02 (session 33 — NIGHTLY REVIEW v2 SHIPPED; **OFFLINE-GRADING MESH ALL 4 PHASES + 2.5 SHIPPED (feature-complete)**; APK Phase-2.5 hardware-smoked; GitNexus refreshed). Prior s32 = grade-integrity §0 binding + mobile launcher parity + QR engine shelved. s31 = ANDROID Phases 2-5.
> follow-alongs HEAD (pushed) = `7fc297a` (s33 tip). s33 fa arc: **`dbd7c0c` Nightly Review v2** (roster `/class/review-item/:ledgerId` + `/class/review-by-item` + 409-stale rh/score pins + 14-day window; Desk By-item lens + ✨ Draft + cluster draft) → **OFFLINE-GRADING MESH `3a446dc` P1** (student PKI + domain separation: `verifyLedgerRow` needs `t:'ledger'`, disjoint `STUDENT_KEYS` + `verifySubmissionRow`, migration 0027, `student-key.js`) → **`acf03aa` P2** (submissions lane: `submission-store.js` grade-gated suppression + `submission-capture.js` self-sign + `ledger-gossip.js` lane tags/runLanes) → **`7e71ff0` P2.5** (silent non-biometric student key + native mobile signup; 3-device HW smoke PASSED) → **`b0c6347` P3** (teacher offline grade loop: `submission-grader.js` — teacher-ASSIGNED attempt is the anti-farm fix — + `/grade/answer-key` full-key + flood cap + teacher-app card; **fixed a real APK answer-key leak**) → **`7fc297a` P4** (hub reconcile: migration 0028 submission_archive + `verifySubmissionRecord` + `/submissions/archive`, decoupled from grading §0.10). cr HEAD = `6313293` (`POST /api/ai/review-comment`, the NRv2 drafter; user's `max_tokens` WIP kept out + re-applied). **GH Pages auto-publishes `master`**; **roster-server/ + cr `railway-server/**` auto-deploy** (both live-verified this session).
> **⚠ s33 USER-ACTION ITEMS:** (1) **RUN migration `0028_submission_archive`** — `/submissions/archive` 503s until then (0027 already RUN ✅; `/grade/answer-key` LIVE). (2) **REBUILD THE APK** to pick up mesh P3-4 (`node scripts/build-android.mjs --play --media-base "https://pub-c41e030062804d678d5f79d5440fdd45.r2.dev"` then gradle assembleDebug). (3) ⚠⚠ **the offline P2P grade loop (P3-4) is RUNTIME-UNTESTED end-to-end** — needs a teacher device + ≥1 student phone (adb) to validate student-submits→teacher-grades-offline→grade-gossips-back→suppression. P1-2 were hardware-smoked (Nearby convergence ✅); the teacher grade loop was NOT. (4) `TEACHER_KEY` Railway env = the PUBLISHED default `apteacher2627` (zero secrecy — change if the full-key/full-response endpoints must be genuinely gated; low-stakes → optional). (5) known-flaky root tests (untouched by s33, pass in isolation): `teacher-student-console-dashboard-deeplink` + `gradebook-feeder-wiring` "empty blank" — s33 final root was 7789/7791 with those two as the only failures; roster-server 1209/1209 clean.
> **⚠ THE BIG SHIPPED ITEM — §0 signature binding (`5cea79b`, grade-affecting, LIVE):** the signed ledger's Ed25519 signatures were DECORATIVE — `ledger-gossip.js ingest` only checked `verifyReceipt().ok` while `computeGrade` grades off the UNSIGNED top-level `row.score/item_id/source`, so a harvested signature could be re-stapled onto a forged score (over Bluetooth OR the future QR path). Fixed by `ReceiptVerify.verifyLedgerRow(row)` (binds `row.receipt_id===SHA-256(payload)` + graded fields must equal the signed payload + `includeTestKeys:false`); both gossip adapters (`mobile-home.html verifyRow`, Desk `_phase3VerifyRow`) delegate to it; `ingest` fails CLOSED. 12 binding tests + full suite 7670. Brought the client to parity with the server's existing `verifyRecord`.
> **MOBILE LAUNCHER (`mobile-home.html`) → Desk parity, all SHIPPED + on-device verified (tablet `47251HFH807FLS`):** diamond-dial name-finder sign-in + "👤 Signed in as <name>" (`6acf267`); "📊 Current grade: NN% · Qn" pill (fetches `GET /grade`, cached offline) + per-lesson "✓ NN%" badges (keyed on `/grade` `lessons[].lessonKey`) + 🎯 Blooket button (baked from `roadmap-data.json` via `build-lessons-index.mjs`) (`fb6ab10`); 🃏 Flashcards button → deep-links `ap_stats_roadmap_square_mode.html?flashcards=<topic>` which reuses the Desk's tested deck/scoring/recording (`3ba6c6a`). Devices: tablet `47251HFH807FLS`, Pixel 3 `89VX0HPX1`, S24 `RFCX81GNBRE` — all on the s32 build. Rebuild APK: `node scripts/build-android.mjs --play --media-base "https://pub-c41e030062804d678d5f79d5440fdd45.r2.dev"` then `cd android-app/android && rm -f app/build/outputs/apk/debug/app-debug.apk && ./gradlew.bat assembleDebug --no-daemon` (AAB can't adb-install). MSYS: prefix adb screencap/pull with `MSYS_NO_PATHCONV=1`.
> **SPEC-STATUS (updated s33):** (1) **QR ledger-sync** `ANDROID_PHASE6_QR_SYNC_SPEC.md` — STILL SHELVED: §0 SHIPPED; fountain+DUMP ENGINE built+tested but INERT (no render/camera/UI); RFCOMM alternative REJECTED (`ANDROID_PHASE6B_QR_BT_SPEC.md §0`). Don't re-propose RFCOMM. (2) **Nightly Review v2** `NIGHTLY_REVIEW_V2_SPEC.md` — ✅ **SHIPPED s33** (see title; spec header marked implemented). (3) **Offline-grading mesh** `OFFLINE_GRADING_MESH_SPEC.md` — ✅ **ALL 4 PHASES + 2.5 SHIPPED s33 (feature-complete).** ⚠ USER: run migration 0028 + rebuild APK + a teacher-device+student-phone adb test validates the P3-4 grade loop end-to-end (P1-2 hardware-smoked; the teacher loop NOT). Transport DECISION unchanged: **Nearby** (`GossipNearby`, tested) + roster server (online hub); the animated-QR floor engine stays shelved.
> and **`roster-server/` auto-deploys to Railway on push** (`roster-production-12c1.up.railway.app`). Sibling repo
> **curriculum_render** (HEAD `1f446c7`, branch `main`) ALSO auto-deploys: GH Pages (the quiz app) + the cr Railway
> classroom/AI server (`curriculumrender-production.up.railway.app`) when `railway-server/**` changes. cr is local at
> `C:/Users/rober/Downloads/Projects/school/curriculum_render`; ⚠ stage only own paths (it has many unrelated dirty files).
> Teacher tests on the **public GH Pages URL** — commit+push promptly; `file://` is not a valid surface. Style:
> brainstorm → spec → implement (user reviews). ultracode ON = workflow-investigate + adversarial-review before pushing.
> `browser-harness` can't run on this Windows host (no AF_UNIX). Memory dir:
> `C:/Users/rober/.claude/projects/C--Users-rober-Downloads-Projects-school-follow-alongs/memory/`.
> A real **Dogecoin Core node runs on this box with ~10,273 DOGE** (RPC LIVE; cli at `C:/Program Files/Dogecoin/daemon/dogecoin-cli.exe`,
> not on PATH). **NEVER broadcast a real send without explicit per-send confirmation.**

---

## ⏭ SESSION 40 (2026-09-04, Athena laptop) — **CURRENT. Supersedes s39 below. DOK LADDERS COMPLETE — 66/66.**

**HEAD = `6706332` + this commit** (origin/master). Codex ran the chained rounds 3–9 to completion **twice, on two machines
from the same base `d97cbe0`**: one run on Athena (32 local commits, never pushed) and one elsewhere (37 commits, pushed to
origin, incl. a "final round" + `fix(dok): show five-unit CED topic labels`). Orchestrator reconciliation 2026-09-04: adopted
**origin's lineage** (equal coverage, more hardening — repaired clipped board tables, unicode notation, index shows NEW-CED
unit/topic, pytest 471 vs 404 — and it was already live); the Athena run is preserved as branch **`codex-athena-rounds`**
(delete when nobody wants to mine it). Verified on Athena: `--validate` 70 rows / 66 lessons, vitest 271, pytest 471,
**all 198 PDFs at student 2 / board 1 / teacher 3**, GH Pages serving all 66 (`dok/index.html` → today's row).
**LESSON: never launch the same Codex prompt on two machines — the hand-off should name the executor host.**

### What is left on the DOK ladders (no Codex round needed)
- Teacher pilot: print `dok/pdf/aps_1.1_student.pdf` + 1.2 (B 09-08 / 09-10), run the flow once, note what to change in
  `dok/README.md` under a "Pilot feedback" heading. Space/wording tweaks are per-YAML edits + `bash dok/compile.sh <topic>`.
- Optional Phase 5(a) only (spec §8): `dok_url` column on Supabase `lesson_urls` + a 🪜 chip in the Desk resource panel.
  **No AI grading of the DOK-3 — ever.** Teacher decision 2026-09-04: the sheet is the one guaranteed human channel in a
  largely AI-graded course; part (c) is teacher-scored by hand with the E/P/I key. Do not propose it again.
- Housekeeping when convenient: `git branch -D codex-athena-rounds`; `node .gitnexus/run.cjs analyze` (index stale).

### Teacher decisions + actions, 2026-09-04 (evening)
- ✅ Railway `TEACHER_KEY` ROTATED and `PAYOUT_AGENT_KEY` SET (a long random secret, separate from the teacher key).
  ⏭ still owed by the teacher: paste the agent key into `~/.config/apstats/.payout-agent.json` on Athena (skeleton
  written by the orchestrator, owner-only ACL, `walletName: ""` = the treasury, `batchCap: 500`); put the NEW teacher key
  into `~/grade-backups/config.json` (`teacherKey`) and the dashboard secret box. THEN the orchestrator registers the
  agent: `powershell -NoProfile -File tools/register_payout_agent_task.ps1` (one `--once` smoke first).
- ✅ Payout float = **the treasury wallet** (single node wallet, ~10.2k DOGE), guarded by `batchCap` 500 Ɖ per batch.
- ✅ Q4 grading RESOLVED: nothing new — post-AP-exam free days, seniors leave early, everyone gets an A (SCHEDULE_HANDOFF).
- ✅ Desk DOK-3 links are **teacher-only** (built; `tests/desk-dok-ladder-row.test.js`). Students never see them — the
  paper sheet must not compete with the AI-graded work for their attention.
- ✅ **Schoology rig SIGNED IN (2026-09-04)** and the SY26-27 cutover done: the old course ids were last year's mock
  sections (still holding 10 SY25-26 students). NEW: `PeriodB → 8537033028` ("AP Statistics · Section 1", 13) and
  `PeriodE → 8537033042` ("Section 2", 15) in `tools/schoology-sync.py` + `tools/schoology_sync_section.py` (PeriodY follows B).
  Every prior `schoology_uid` was a stale 6-digit id from another id space → **all remapped by name via
  `scripts/teacher-roster.mjs --set-schoology-uids`: PeriodB 12/13, PeriodE 15/16** (3 uids first landed on PeriodX
  duplicate accounts and were moved; `schoology_uid` is UNIQUE, so clear the dupe before setting). ROSTER ANOMALIES RESOLVED (teacher, 2026-09-04 late): Savannah Robinson ARCHIVED (dropped);
  the empty "Derrick Jimenez" dupe (`pomelo_eagle`) ARCHIVED — the account with work already had Schoology's spelling
  "Dereck Jimenez" (`avocado_koala`, uid set); Wedgina Tranchant MOVED PeriodE → PeriodB (Schoology Section 1);
  Andrew Barrios ENROLLED in PeriodE (`guava_fox`, uid 120126061; credentials sheet left in the teacher's %TEMP%).
  **Roster == Schoology: PeriodB 13/13 mapped, PeriodE 15/15 mapped.** DRY RUNS DONE 2026-09-04 (both sections, new course ids): B 185 scope items / 174 grade targets deferred, E 286
  deferred, 0 errors — nothing is due before 09-08. Categories: **PeriodE has all five** (named "Quiz", so
  `_resolve_category_id` is now case/plural-tolerant — `TestCategoryNameTolerance`); **PeriodB has NONE yet** (teacher
  thought she had done B; it was E). Syllabus: `syllabus/apstats-syllabus-sy2627.{tex,pdf}` (2 pages; grading rule, calendar,
  daily flow, tools; district-policy addendum deliberately omitted for now). Next Schoology steps: configure the
  weighted categories on BOTH new sections (Lesson 15 / Quizzes 15 / Posters 15 / Blooket 5 / PC 50 — the old Sec 1
  setup does not carry over), verify SY26-27 marking periods exist, then
  `powershell -File tools/daily_schoology_sync.ps1 -Section PeriodB` (dry-run) → review → `-Live` → register the daily task.
- ✅ **DOGE payout agent REGISTERED + RUNNING on Athena** (task "APStats DOGE Payout Agent", at-logon, config
  `~/.config/apstats/.payout-agent.json` with the real key, `--once` smoke exit 0, `/payout/status` 200 with the rotated
  teacher key → migrations 0032/0033 confirmed live). It polls every 60 s; the dashboard ⚡ "Deposit all ready" button is
  now armed. `~/grade-backups/config.json` carries the new teacher key.
- ✅ DECIDED: **`STUDENT_WALLET_OPTIN` stays OFF.** The teacher generates paper wallets on the node (`tools/doge-wallet-gen.mjs`
  "dogecoin bills", one address each) unless the browser self-custody path is ever proven bullet-proof; "play pretend,
  not trustless" is fine — the teacher is the custodian. Do not re-propose flipping it.
- Schoology categories: teacher is creating them 2026-09-04; recommended **calculate by PERCENT** (each assignment counts
  equally inside its category, matching the v3 engine's mean-of-recorded slices; "by points" would let a 40-pt PC or a big
  poster swamp the category). Then the orchestrator verifies both sections via `schoology_ops.list_categories` and dry-runs.
- ✅ 2026-09-05 GRADE-BAND FIX (roster-server, auto-deployed): `deriveQuarterBands` places a unit in the quarter holding
  MOST of its lessons (was: latest lesson) — old Unit 1 no longer sinks into Q2 because 1.10 (Normal → CED 2.11) is in
  November; Q1 gradebook shows the first month again. m2b goldens regenerated; bundle regenerated. Dashboard quarter
  buttons now read "Q1 · CED U1" (from `pcUnits`; Q4 → "after the exam") instead of "Q4 · U9".
- ❌ **SCHEDULE PACKING REVERTED 2026-09-05 (same day).** Teacher: the 30-min cap counted video runtime only; real class
  time with pauses/follow-along/questions is far longer; "the current pace is better than shoving all the videos next to
  each other." **One topic per day stays. Do not re-propose packing.** Codex had already made 4 local commits (wallet
  loading `330efe6`; packing Parts 1–2 `740a60a` `dc61af2` `a15dfd5`) + a working-tree archive move of 35 DOK sheets — ALL
  parked on local branch **`codex-packing-paused`** (never push it: it also swept `tools/.schoology-sync-logs/` fixtures with
  student data). master was reset to origin (`824bcb6`). Specs marked REVERTED/PARKED; prompt marked WITHDRAWN.
- ✅ **WALLET LOADING SHIPPED 2026-09-05** (teacher OK'd the spec; Codex's `330efe6` cherry-picked, reviewed, pushed):
  dashboard "📥 Load wallets" (paste the generator's KEYS CSV → assign → submit), 📷 Scan (vendored jsQR — cdnjs 404s),
  🔑 held/reveal (typed confirm, audited under row lock), `POST/GET/DELETE /wallet/custody`, `GET /class/wallet-custody`,
  `roster-server/wallet-custody.js`, public wallet reads use an explicit column list (never `doge_wif_enc`),
  `tools/doge-wallet-gen.mjs --reprint`. Build notes: `WALLET_LOADING_BUILD.md`. ✅ Migration 0035 RUN + `WALLET_KEY_SECRET` (≥32 chars — the
  first attempt was too short; the server silently reports 'not configured' below 32 bytes) SET 2026-09-05; live-verified:
  `/class/wallet-custody` 200 (13 B students, 0 held), no-key 401, junk WIF → 400 'invalid Dogecoin mainnet WIF'.
  **Wallet loading is LIVE** — next: the teacher pastes the KEYS CSV in the dashboard's 📥 Load wallets.
- ✅ **WALLET GENERATE + EXPORT SHIPPED 2026-09-05/06** (Codex `f3829e2` `992db61` `85a815b` `ed0ee24`, reviewed): "✨ Generate
  wallets" (browser `generateWallet`: Web Crypto only, in-range redraw, self-check, buffer wipe; keep-keys forced), audited
  `GET /class/wallet-custody/export?confirm=1` (live-verified: no-key 401, no-confirm 400, 0 held → `{wallets:[],skipped:[]}`),
  "🖨 Print wallet sheets" + per-student Reprint (`js/wallet-print-sheets.js`, vendored `qrcode-generator` 2.0.4, browser
  Save-as-PDF). ⚠ PROCESS SLIP: phases 1–3 reached origin inside the orchestrator's 3e2cda3 push BEFORE review (Codex was
  committing in the same tree concurrently) — reviewed after the fact, all invariants hold. **Rule: read `git log
  origin/master..HEAD` before every push; if Codex is running in this tree, push nothing until its round is reviewed.**
- (was) SPEC + PROMPT: `WALLET_GENERATE_EXPORT_SPEC.md` + `state/wallet-generate-export-codex-prompt.md`
  — generate wallets in the dashboard (browser-side via the vendored `doge-keys.js`, keep-keys forced on, saved through the
  shipped custody path) + "🖨 Print wallet sheets" (audited bulk reveal `GET /class/wallet-custody/export?confirm=1`, one
  page per student with address/WIF text + QR, browser Save-as-PDF; vendored `qrcode-generator`). No migration. Codex builds.
- ✅ SCHOOLOGY READY 2026-09-05 (late): SY26-27 marking periods exist (MP1 9/02–11/06 … MP4 4/15–6/30); **both sections
  now carry all five categories** (B verified after the teacher's third save; the trap was last year's identically named
  "Section 1"). Daily sync REGISTERED on Athena as Task Scheduler jobs **`ApStatsSchoologySync-B` 16:30** and
  **`ApStatsSchoologySync-E` 16:45**, DRY-RUN by default; `ROSTER_TEACHER_SECRET` set in the user environment (the new key).
  **⏭ Go-live = after the first meaningful dry run (nothing is due before 09-08): read `tools/.schoology-sync-logs/sync-*.log`
  for 09-08/09-09, confirm the created columns look right, then re-register each task with `-Live`:**
  `powershell -NoProfile -File tools/register_schoology_sync_task.ps1 -Section PeriodB -Time 16:30 -TaskName ApStatsSchoologySync-B -Live`
  (and `-Section PeriodE -Time 16:45 -TaskName ApStatsSchoologySync-E -Live`). The rig Edge session must stay signed in.
- ⏭ SPEC + PROMPT (teacher, 2026-09-05 late): **`CALENDAR_CED2026_RELABEL_SPEC.md`** + `state/calendar-ced2026-relabel-codex-prompt.md`
  — display-only: one `cedLabel()` helper, cells/progress/tooltips/resource header in the NEW five-unit numbering + ★ tier,
  folded topics carry an `(old)` bridge, OLD keys stay under the hood; byte-identical schedule-JSON test proves no date moved.
  Codex builds after the wallet generate/export run finishes. (2) **wallet loading** — Codex's `330efe6` on
  the parked branch implements `WALLET_LOADING_SPEC.md` (custody endpoints, migration 0035, dashboard loader, QR scanner,
  tests); cherry-pick + review + push ONLY after the teacher OKs the spec.
- (withdrawn) `state/schedule-packing-and-day-sheets-codex-prompt.md` —
  Part 1 packing rule A + calendar relabel to NEW CED (pacing GROUPS, `generateSchedule`, generator flattening + `dayGroups`,
  goldens/bundle regen); Part 2 `build_ladder.py` for day-groups; Part 3 author the 15 group DOK sheets (first one
  `1.1+1.2+1.3` is taught 09-08) and archive the 35 absorbed per-topic sheets. Specs: `SCHEDULE_PACKING_SPEC.md` (decided),
  `DOK_DAY_SHEETS_SPEC.md` (new). Orchestrator reviews per part and pushes.
- (background) `SCHEDULE_PACKING_SPEC.md` (teacher's ask 2026-09-05): measured all 147 videos (1,167 min,
  `data/video-minutes.json`); packing consecutive same-NEW-unit topics under ≤3 videos + ≤30 min turns 87 lesson days into
  67 → Q1 banks Units 1 AND 2 for both periods, core done Jan 7 (B) / Feb 12 (E). Build = pacing groups in the Desk def +
  generator flattening + calendar relabel to NEW CED codes/colours. Teacher decisions in §3 (rule A vs B; DOK sheet on a
  doubled day = the last topic's; freed days = slack). Sim script pattern: extract `d()`/pacing/SCHEDULE_DEFS from the Desk
  into a `vm` context with R/OFF/EX/PO/NC stubbed.
- ⏭ SPEC written, not built: `WALLET_LOADING_SPEC.md` — paste the generator's KEYS CSV into a dashboard modal, assign
  wallets in one click, addresses via the existing write, **private keys kept AES-encrypted (teacher custody — P8
  relaxed by the teacher's decision)** with a teacher-only reveal for reprints; camera QR scan for one-offs; migration 0035
  + `WALLET_KEY_SECRET`. Awaiting the teacher's OK, then implement (orchestrator or Codex).
- ✅ Codex DOK audit + posters REVIEWED and pushed 2026-09-05 (scope confined to dok/ + concept-posters/; 271 vitest /
  471 pytest; 198 PDFs 2/1/3; 15/15 posters). Codex has ALSO started the AP Classroom video-link task on Athena
  (`state/ap-classroom-video-links-PLAN.md`, waiting for the teacher's College Board sign-in in the rig window).
- ⏭ Codex NEXT (teacher's request, plan-then-implement): `state/ap-classroom-video-links-codex-prompt.md` — scrape the
  Fall-2026 AP Classroom course (`apclassroom.collegeboard.org/33/home?unit=0`, teacher signs into the rig window),
  diff every `RESOURCES[...].videos[].url` in the Desk against the new topics via `2026-crosswalk.json`, repoint `url`
  ONLY; **`altUrl` (Google Drive, old recordings) is sacred until the teacher re-records.** Report + tests. No push.
- ✅ Codex DONE (unpushed, awaiting orchestrator review): DOK audit — 65/66 corrected, `dok/AUDIT_2026-09.md`, 8 unit
  commits (7f05d12 d90c01f d5f4306 90ecd6b 7cff7a1 9b2c0ca b47991e d53198e); posters 15/15 rendered (d35f6a4, 92ed5d1).
- (was) Codex: `state/dok-audit-and-posters-codex-prompt.md` — (A) pedagogical audit of all 66
  DOK-3s against the day's worksheet/flashcards/tether (alignment, ~10-min load, reading level, first-take, callout/visual
  leaks, key correctness) with in-place fixes + `dok/AUDIT_2026-09.md`; (B) render the 12 missing concept posters
  (P01,P03–P08,P10–P14) in `concept-posters/` so all 15 PDFs exist. No push. Pilot feedback on the DOK sheets waits for Tuesday (first class 09-08 B is
  a shortened/late-start day per the teacher). Unit 1 starts **09-08 B**.

---

## ⏭ SESSION 39 (2026-09-04, Athena laptop) — superseded by s40 above.

**HEAD = `6c36ff6` + this commit** (pushed). **Codex round 2 DONE and reviewed: OLD 3.1–3.6 (`52567b3`, `aa879bc`, `6c36ff6`)** —
every edition 2/1/3 pages, 71 vitest + 104 pytest, real `ced2026` (1.10–1.13), 3.1 tethered to VAR-1.E. Orchestrator fix on top:
3.4's student table had a "Flaw" column naming the biases part (a) asks for → column removed, recompiled (2/1/3). **Coverage 16/66.**

### ⏭ NEXT (Codex, chained — no orchestrator needed between rounds): `state/dok-ladder-rounds3plus-codex-prompt.md`
- **Round 3** (seeded): OLD 2.1–2.3 + 4.1–4.5 — B 10-13 → 10-26, **land by 09-29**; write `dok/calibration/unit2.json` before 4.1.
- **Round 4** (seeded): OLD 4.6–4.8, 4.10, 4.11, 5.2, 5.1, 5.3 — B 10-29 → 11-13, **land by 10-15**.
- **Rounds 5+** (self-seeded per §C of the prompt): the rest of `dok/PENDING.md` in date order, 6–8 per round, a
  `dok/calibration/unit{n}.json` before each NEW unit's first topic; append a report per round to `dok/ROUNDS.md`.
- Codex commits per topic, **never pushes**. The orchestrator reviews a round the same way each time (scope outside `dok/`,
  `--validate`, both DOK suites, `pdfinfo` page counts, one student PDF eyeballed for leaks/cropping, a Python recompute of
  any arithmetic in the seed) and pushes with the sentinel.

### User-action checklist — unchanged (Railway `TEACHER_KEY` / `PAYOUT_AGENT_KEY` / `STUDENT_WALLET_OPTIN`; Schoology rig
sign-in + UID map; print `dok/pdf/aps_1.6_student.pdf` once). Unit 1 starts **09-08 B**; the DOK sheets for it are all on GH Pages
(`dok/index.html` → today's row).

---

## ⏭ SESSION 38 (2026-09-04, Athena laptop) — superseded by s39 above.

**HEAD = `d6ceaba` + this commit** (pushed). **Unit 1 DOK ladders are COMPLETE — 10/10** (Codex round 1: `d7bae86`
1.1+1.4 · `2770358` 1.5+1.7 · `459db6a` 1.8 + 1.3 trim · `d6ceaba` 1.10; orchestrator-reviewed 2026-09-04: every edition
student 2pp / board 1pp / teacher 3pp, 47 vitest + 68 pytest green, no leakage, seed arithmetic corrected by Codex —
1.4 truncated-axis ratio is 12×, 1.7 sample SD 7.5). Orchestrator fix on top: 1.10's `ced2026` is **2.11** (the NEW CED
moves the Normal distribution to Unit 2; header now prints "CED 2.11"). Coverage **10/66**, `dok/PENDING.md` 56.

### ⏭ NEXT (Codex round 2): `state/dok-ladder-unit3-codex-prompt.md` — OLD 3.1–3.6 (Collecting Data; NEW CED 1.10–1.13)
Period B starts 3.1 on **2026-09-25** → land by **09-11**. Seeds, the real `ced2026` mapping, worksheets (`u3_lesson1..5`,
`u3_lesson6-7`), tutor availability (3.1 has none → `tether:` from `apstat_3_framework.md`) are all in the prompt.
Same gates; commit per topic; **no push** (orchestrator gate). 3.7 is undated (bonus). Nice-to-have if time: the
`raw_tikz` two-graph figures (1.4, 1.5, 1.8) render small in the board slide's 40\%-width column — a `board_scale`
or a full-width figure row on the board edition would help projection (generator change + test). After that: OLD 2.1–2.3
(B 10-13..16) and OLD 4.1–4.3 (B 10-19..22) — orchestrator writes those seeds next.

### User-action checklist — unchanged from s37 (TEACHER_KEY / PAYOUT_AGENT_KEY / STUDENT_WALLET_OPTIN on Railway;
Schoology rig sign-in + UID map; print `dok/pdf/aps_1.6_student.pdf` once; Unit 1 starts **09-08 B**).

---

## ⏭ SESSION 37 (2026-09-03, Athena laptop) — superseded by s38 above.

**HEAD = `1d0a0d7`** (pushed). Host = the Windows laptop **Athena** (`C:/Users/rober/Downloads/Projects/school/follow-alongs`;
MiKTeX, Dogecoin node, Schoology Edge rig all live here — see memory `athena-laptop-capabilities`). Session ended on the
Fable session limit with 7 authoring agents killed mid-flight; **the hand-off for Codex is `state/dok-ladder-unit1-codex-prompt.md`.**

**s37 arc (all pushed):** cr `b80e070` quiz PWA assets network-first + build bump (ends the students' Ctrl+Shift+R ritual;
`tests/build-stamp-fresh.test.js` + cr pre-push gate) · fa `d8ef68b` Windows Task-Scheduler wrapper for the DOGE payout agent
(`tools/register_payout_agent_task.ps1`, config template; INERT until `PAYOUT_AGENT_KEY`) · fa `c32caa0` Schoology
`build_scope` PC/Poster keys unified on `PC:U{n}` (the SCHEDULE_HANDOFF OPEN item) · **`APS_DOK_LADDER_SPEC.md`** (brainstorm →
spec → revised to the teacher's flow: board slide at the bell → *first take* → video follow-along → finish (a)(b)(c) →
turn in; a DOK-3 for EVERY lesson, 1.1 included, no deserts) · **`dok/` Phase 1+2 BUILT:** `build_ladder.py` (YAML +
`dok/registry/{topic}.jsonl` → student 2pp / board 1pp landscape+QR / teacher ≤3pp with CED tether + E/P/I),
`compile.ps1|.sh`, `index.html` (today's row → board + key), tests (`tests/dok-registry.test.js`, `tests/dok-coverage.test.js`,
`tests/test_dok_build.py`). **Built topics: 1.2, 1.6, 1.9** (hand) **+ 1.3** (agent draft; teacher key 4pp → trim).
Drafts: `dok/registry/1.1.jsonl` (valid, no YAML), `dok/_drafts/1.4.jsonl.draft` (bad `\` escape). Coverage 4/66.

### ⚠ s37 USER-ACTION CHECKLIST (carry-forward + new)
1. ✅ Migrations 0032 + 0033 RUN (teacher, 2026-09-03). 0034 was already run.
2. ☐ Railway `TEACHER_KEY` → strong non-default (verified STILL `apteacher2627` on 2026-09-03 — `/payout/*` and
   `/class/wallet-proposals` 401 by design until rotated); then `~/grade-backups/config.json` + dashboard box.
3. ☐ Railway `PAYOUT_AGENT_KEY` (separate); then on Athena: fill `~/.config/apstats/.payout-agent.json` from
   `tools/payout-agent.config.example.json` and run `tools/register_payout_agent_task.ps1`. Decide float wallet vs treasury
   (node has ONE wallet, ~10,232 DOGE; spec wants a separate float, `batchCap` 500).
4. ☐ `STUDENT_WALLET_OPTIN=true` when ready (kids CAN self-generate BIP-39 wallets, address-only, teacher approves).
5. ☐ Schoology rig: `%TEMP%/edge-claude-cdp` profile was wiped → sign in (MS SSO) in the rig Edge window; then map the
   9 students missing `schoology_uid` (B 9/13, E 11/16 mapped), verify SY26-27 marking periods, decide Period E weights,
   dry-run `tools/daily_schoology_sync.ps1` (no task registered on Athena).
6. ☐ **Print `dok/pdf/aps_1.6_student.pdf` once** (the Phase-1 paper gate). Unit 1 starts **2026-09-08 (B)**.

### ⏭ NEXT (Codex): finish Unit 1 DOK ladders — `state/dok-ladder-unit1-codex-prompt.md`
Order 1.1 → 1.4 → 1.5 → 1.7 → 1.8 → 1.3 teacher trim → 1.10. Commit per topic, **do not push** (orchestrator gate).
Then Phase 4: one NEW-CED unit per batch, ≥ 2 weeks ahead of `data/lesson-schedule.json` dates; `dok/PENDING.md` counts down.

**Windows test gotchas (Athena):** root `npm test` shows ~6 environmental failures (doge-payout-agent path, doge-send-core
chmod, lineage `../Agent`) + flaky journey timeouts; the FRQ-bundle digest tests fail only when `ai-grading-prompts*.js` sit
on disk with mixed EOLs — fix by `rm` + `git checkout` those files, never by regenerating the bundle. Memory
`windows-root-test-failures`.

---

## ⏭ SESSION 36 (2026-09-01 → 09-03) — superseded by s37 above.

**HEAD = `e668351`** (pushed; Railway live-verified on it). s36 arc, all CC-reviewed Codex builds
unless noted: **SY2627 schedule step 1** (`e04166e` — real calendar intake COMPLETE, topic schedule
generated: B Mon/Tue/Thu/Fri, E Mon/Wed/Fri, AP exam 2027-05-11 hard end; handoff §3 steps 2-6 still
owed) · **roster archive LIVE** (`3abc6c8`+`ce8f7f1` — Manage Students card, status='archived'
filters every surface, unscoped wallet views included) · **DOGE payout rail** (`16959c4` — ⚡ batch
sendmany via teacher-machine agent; INERT) · **student BIP-39 wallet opt-in** (`fff0d3d` — browser-only
ceremony, address-only proposals; INERT) · **partial candy give** (`8593c20` 'some…', CC-direct, LIVE)
· **candy returns** (`e668351` — '↩ took back…', candy_returned counter, I5 intact; migration 0034
**RUN ✅**) · Derrick Jimenez enrolled PeriodE (`pomelo_eagle`). Specs live at repo root
(ROSTER_ARCHIVE / DOGE_PAYOUT_RAIL / STUDENT_WALLET_ONBOARDING / CANDY_RETURN), prompts in `state/`.

### ⚠ s36 USER-ACTION CHECKLIST (the activation ladder — verified live 2026-09-03)

**Supabase — the `curriculum_render` project IS the roster DB (`.env.example` confirms; 0034 landing
there proves it). SQL editor, in this order:**
1. ✅ `0034_candy_return.sql` — **RUN + live-verified** (`/wallet/mark-returned` 200s; ↩ took back… works NOW).
2. ☐ `roster-server/migrations/0032_payout_batch.sql` — payout tables/RPCs/reservation trigger. Run FIRST.
3. ☐ `roster-server/migrations/0033_wallet_address_proposals.sql` — REQUIRES 0032 already run (its
   approve path fences on `payout_batch`). Nothing else is outstanding: 0001–0031 all ran previously.

**Railway env (roster-server service):**
4. ☐ **`TEACHER_KEY` → strong non-default** (still the published `apteacher2627`). This single change
   ARMS the payout rail's fail-closed auth AND un-403s `/class/wallet-proposals` + approve/reject
   (they use `requirePayoutTeacher`, dead on the default key by design). Afterwards update:
   `~/grade-backups/config.json` teacherKey (nightly backup timer) and what you type into the
   dashboard's teacher-secret box.
5. ☐ `PAYOUT_AGENT_KEY` → a SEPARATE strong value (payout endpoints only).
6. ☐ `STUDENT_WALLET_OPTIN=true` — ONLY when you're ready to offer self-custody (one-time school-policy
   comfort check first; until then the ceremony button simply doesn't render).
7. ☐ `PC_TRACK_ENABLED=true` — unrelated to DOGE; ONLY after the first paper PC is scored
   (SY2627_ACTIVATION_RUNBOOK Step 5). Flipping early caps unscored students at 70% of Work.
   Already set ✓ (verified s34/35): `PC_FIGURES_SUPABASE_*`, `TRAINER_DECK_ALLOWLIST`, `USE_V3_GRADING`.

**Dogecoin Core machine (only when you want one-button payouts):**
8. ☐ `~/.config/apstats/.payout-agent.json` (mode 0600) with the two keys + roster URL + cli path;
   install/enable `tools/doge-payout-agent.service` as a systemd user unit; fund the SENDING wallet
   from cold storage (float only — never the 10k treasury). Audit student addresses in the dashboard
   before sealing the first batch. NEVER delete/retry an armed or ambiguous payout journal.

**Suggested minimal path if short on time:** #4 (key rotation — it's been owed since s33 and now
gates three features), then #2. Everything else can wait; candy give/some…/took-back already work.

---

## ⏭ SESSION 35 (2026-08-18 → 08-27) — superseded by s36 above.

**HEAD = `11adae1`** (pushed, `master`, working tree clean). Baseline for this block = `1cc59af`
(s34 tip, 2026-08-07) — **58 commits**. **curriculum_render HEAD = `3f54c45`** (branch `main`, pushed).
Host unchanged from s34: Linux, `/home/mrcolson/repos/apstats-live-worksheet`, sibling
`/home/mrcolson/repos/curriculum_render`. **The box clock is JST** (timer times below are JST).
Last green gates: **root 8849, roster-server 1465, cr 1593, pytest 165.**

### ⏭ START HERE — the one live decision (as of 2026-08-27)

The only open thread is the **FRQ grade-tickets Stage 4 rollout** (`FRQ_GRADE_TICKETS_RUNBOOK.md`).
Everything else is either shipped or waiting on an external date. The decision reached 2026-08-27:

**Stage 4 was split in half.**

1. ✅ **`AI_GRADE_AUTH=log` on curriculum render — DONE by the teacher 2026-08-27.** `log` mode is
   purely observational: every branch in `railway-server/ai-grade-auth.js` logs and calls `next()`;
   only `enforce` ever returns 401/429. Its log is now accumulating the evidence needed for step 3.
2. ⛔ **`FRQ_CANARY_STUDENTS=*` is deliberately HELD.** Flipping it during summer proves nothing —
   `/health` `frq.worker` counters are all zero because there is no student traffic — and it would
   skip the only load test that matters. **Plan: first real worksheet day → put ONE PERIOD's
   studentIds in `FRQ_CANARY_STUDENTS` → watch `frq.worker` for a day → then `*`.** Everyone else
   stays on the known-good client path meanwhile.
3. ⛔ **`AI_GRADE_AUTH=enforce` MUST NOT be flipped yet** — it would 401 four legitimate callers.
   See "Enforce blockers" below. This is the gating code work.

Rollback for any of it stays `FRQ_GRADE_MODE=off` (≤60 s via config cache; every write is raise-only,
so nothing can be lost).

### A. Production state, verified live 2026-08-27

| Surface | Verified value |
|---|---|
| roster `/health` → `frq.mode` | **`authoritative`** (Stage 3 canary) |
| roster `/health` → `frq.storage.degraded` | `false` |
| roster `/health` → `frq.worker` | ticks ~165 878, **every grade counter 0** (no traffic yet), `tickErrors: 1` |
| cr `/health` → `aiGradeAuth` | `off` at time of check — **teacher flipped it to `log` right after** |
| cr `/health` → `graderSecret` | `true` (so `ROSTER_GRADER_SECRET` is already set on BOTH services) |
| GH Actions `frq-regrade.yml` | **running hourly, succeeding** (secret `APSTATS_TEACHER_KEY` is set) |
| systemd user timers (JST) | `apstats-frq-regrade.timer` hourly ✅, `apstats-backup.timer` 22:00 daily ✅ |

⚠ **Shadow-gate evidence is gone.** The runbook's Stage 2 gate (≥100 compared, 0 `shadowTwoBand`)
cannot be re-checked: shadow counters are in-process and `mode` is now `authoritative`, so
`shadowCompared` reads 0. If that gate's numbers ever matter, they were not persisted anywhere.

### B. Enforce blockers — the exact code work before `AI_GRADE_AUTH=enforce`

`enforce` requires either the grader secret (`x-roster-grader-secret`) or a roster token (Bearer
header, or `rosterToken` in the body — `railway-server/server.js:208` `sidFromRequest`). These four
callers send **neither** and would start 401ing:

| # | Caller | File:line | Blast radius |
|---|---|---|---|
| 1 | Hourly regrade sweep (GH Actions **and** the systemd timer) | `tools/regrade-ungraded-frqs.mjs:371` | The standing no-lost-grades safety net dies; the workflow goes red hourly |
| 2 | Study-guide AI gates + Focus Synthesis | `study_guide_diagnostic.html:5636` and `:5684` | Linked from the Desk **and** the landing page; students see "roster sign-in required" |
| 3 | Quiz app "Turbo mode (or fallback)" grade path | `curriculum_render/index.html:10112` | Silent grading failure. **Note the sibling path at `:9822` DOES send the token** — only the fallback is bare |
| 4 | Quiz FRQ grading engine | `curriculum_render/js/grading/grading-engine.js:290` | Silent grading failure. Its *appeal* call at `:456` already sends the token; the *grade* call does not |

**Fix for #1 is trivial** — `ROSTER_GRADER_SECRET` already exists on both Railway services, so the
sweep just needs to send `x-roster-grader-secret` with it, plus the value added as a GH Actions
secret and to the systemd unit's environment.

**NOT blockers** (already authenticated): the 69 worksheets wrap `window.fetch` to stamp the roster
bearer onto grader calls (`_aiInstallGraderBearer`, e.g. `u1_lesson1_live.html:2020`); the ticket
worker sends the grader secret (`roster-server/frq-worker.js:323`); `test_escalation.html` is a dev
harness.

🕳 **Residual that survives Stage 4:** `POST /api/ai/appeal` is **not wrapped at all**
(`railway-server/server.js:1473` — no `aiGradeAuthFor`), so anonymous appeals still reach the model
even under `enforce`. Wrap it or the quota hole stays half-open.

**Why this work matters** (the payoff, since it was asked): `enforce` is the only thing that closes
the hole `FRQ_GRADE_TICKETS_SPEC.md:467` calls out — `/api/ai/grade` currently accepts anonymous
POSTs and its URL sits in the page source of 69 public worksheets, so anyone can script it and burn
the DeepSeek/Groq quota, which would leave real students' reflections queued during class. Caps
today: 30 items/min per sid, 600/min per IP (`ai-grade-auth.js` `RATE_DEFAULTS`). Until the four
callers above are fixed, `enforce` can never be flipped and that hole stays open indefinitely.

### C. Untested-at-load residual — the concurrency smoke

The four canary rounds (§D) were all **single-user**; every bug they found was a single-user bug.
`FRQ_GRADE_TICKETS_SPEC.md:657` lists a rollout smoke whose concurrency items were **never run**:
**Railway restart after claim**, **two worker instances**, **GitHub sweep collision**. None of them
need students — a redeploy plus the teacher account is enough — so they are the right thing to run
before the first class day rather than discovering them in front of one.

Known and **benign**: the sweep selects candidates from `/admin/snapshot` by null score
(`tools/regrade-ungraded-frqs.mjs:60,269`) with **no ticket/claim awareness**, so at `*` it and the
worker can both grade a row that is in flight. Cost is a duplicate model call, not a wrong grade —
the apply is raise-only and response-hash checked, and the sweep does send `responseHash` +
`rubricVersion` so it satisfies the authoritative branch (`roster-server/ledger.js:738`).

### D. What landed after s34 — 2026-08-18 → 08-23

- **Flashcards V2, all phases + flags ON** — `521ac70` P0 (closes the quick-check resume/timer
  loophole, SRS foundations) → `6cd14ae` P1 (per-card logging, misses recap, Desk⇄mobile parity
  harness) → `6b3f3b8` P2a (Review mode, "Review due (n)" deck, choice-position permutation) →
  `8abfd25` P2b (readiness badge, two-action stage flow, quick-retry redraw, progress passport) →
  **`02b2673` flags enabled** (teacher decision 2026-08-18) → `65ab535` T3.4 (mobile timed deck no
  longer reveals on a miss) → `50ae02e` **Supabase practice sync** (`trainer_state` row via
  roster-server; passport row hidden from students). Blooket deck content review applied alongside:
  `34046fc` sheet → `0646fb4` two wrong answer keys → `0064c39` 32 rewrites / 25 drops across 23 decks.
- **Reliability build, phases 1–4** — `a0e81f7` P1 (grade golden master: synthetic committed +
  local real-data oracle; Desk journey harness J1–J3) → `2d530a8` P2 (**answer-key frozen per school
  year at roster-server RUNTIME** — the s34 architectural-debt item; J4–J6) → `1d15756` P3 (J7–J9:
  incident offline behaviors, view-as zero-writes, two-device flashcard sync) → `a6301f5` P4
  (`RELIABILITY_PIN_CONVERSION.md`: 16 source-regex pins converted to executed journeys) +
  `99fca75`. `d924177` captures/announces production grade flags (`USE_V3_GRADING`).
- **Worksheet FRQ grading coverage — 44% ungraded → 0%** (`GRADEBOOK_TAGGING_AUDIT.md` found it).
  `09a695d` client auto-grade (blur / 20 s idle / pagehide / on-load, first-ever I persisted) →
  `bd3c692` Codex hardening (**server-side durable FRQ floor**, stale-verdict rejection, bounded
  retry, auto budget) → `b1a33db` `POST /ledger/frq-regrade` (teacher-gated, existing rows only) →
  `7a9ec14`/`6d43f5d` rubric audit (212 rubrics sheeted; all 62 proposals applied) → `28dd609`
  server-independent sweep + manifest + systemd timer → `4519de8` honest wait pill under each
  reflection → `7b57b49` **one grader call per worksheet** via `/api/ai/grade-batch` → `64a1848`
  the same sweep hourly on GitHub Actions so grades never depend on the teacher's box being on.
  cr side: `8a1978a` (grader queue → concurrent pool, DeepSeek 4 in flight / 120 rpm, Groq demoted
  to failover-only, per-provider 429 backoff, `estimatedWaitMs`), `b7ff22e` (callAI retries once
  without `json_object` on empty DeepSeek completions), `5e5d1fa` (`/api/ai/grade-batch`, ≤8 items).
- **FRQ grade tickets Phase 2 — the current thread.** `108241b` Stage 0 (server-owned rubric
  bundle; the hourly sweep stops trusting page-shipped prompts) → `4e135f5` Phase 2 (migration
  `0031_frq_tickets.sql`: atomic plpgsql `record_frq_draft` / `claim_frq_tickets` SKIP LOCKED /
  `apply_frq_verdict` / `fail_frq_claim` / `queue_frq_appeal`; `frq-ledger-db.js`, `frq-worker.js`,
  `frq-verdict.js`; client codemod across all 69 pages — shipped **dormant** behind
  `FRQ_GRADE_MODE=off`) → `9b23b9d` runbook fix (**migration 0031 runs in the curriculum_render
  Supabase project `<AP_SUPABASE_PROJECT_REF>`** — that is where `item_ledger` lives; `<AP_SUPABASE_PROJECT_REF>`
  is only roadmap/driller/`lesson_urls`) → `fb24226` shadow paging fix (the sampler kept refetching
  the top-4 rows, so `shadowCompared` stalled at ~4 and the ≥100 gate was unreachable).
  cr `7aeffff`: the `AI_GRADE_AUTH=off|log|enforce` wrapper (factory-bound per route — `req.path`
  sniffing was a **bypass**; timing-safe secret digests).
- **Four canary fix rounds, all teacher-driven on the live site** — `a78167d` R1 (stale precached
  gradebook-client falls back to LEGACY, not "Not saved"; Appeal control rendered with already-graded
  states; build bumped so the SW refreshes its precache) → `5fe533e` R2 (legacy graded rows show
  their E/P/I again; Appeal actually posts; "individuals" accepts the singular) → `dcabd8b` R3 (the
  Appeal control works for **legacy graded rows with `frq_result` null** — the exact edit-then-appeal
  path the teacher hit) → `55daf0e` R4 (honest appeal counts everywhere; **appeals now review the
  student's REVISED answer**) → `11adae1` (appeal history survives the apply: `frq_last_appeal` keeps
  `{text, revisedText, at, outcome}`, `/ledger/frq-status` exposes self-scoped `lastAppeal`).
  Live context recorded in `55daf0e`: the teacher's first UI appeal succeeded end-to-end (raised
  reflect1 I→P); the `limit` was correct, only the 0/3 display lied.
- **Desk UI pass** — `7c1fefc` explicit overlay stacking, `48e5748` screen-size breakpoints
  (1280w/820h/760h, decoration hides first), `dd3472a` **boot splash + startup chime removed** (the
  sign-in wall runs directly on load), `a679baa` stop the rampant sosumi, `8a0a56e` copy pass,
  `764a620` sticky core (Do Now / calendar nav / day header pin under the menu bar), `fbc8e0f` menus
  polish (every File/Edit/View item now does something).
- **Tango theme** — `2512552` Desk (Platinum `#E5E3D2` chrome, Charcoal `#161616` ink, Tangerine
  `#FF5B19` as the single accent) → `45ecdcf` one generated override block on all 69 worksheets
  (`scripts/wire-tango-theme.mjs`) → `9dc521e` study guide + TI-84 trainer chrome.
- **TI-84 trainer** — `e231462` phase 1 (hashchange navigation; Desk deep links no longer serve the
  previous topic), `a445fbf` phase 2 (practice sessions record a ledger row, `mode:'practice'`, SRS
  untouched), `9fcc64e` matrix-entry cell loop (`TI84_MATRIX_ENTRY_LOOP_SPEC.md` Option B) — this
  closes s34 open item #5's first half.
- **Quarters follow the schedule dates** — `ff20ee1` (`deriveQuarterBands`; dashboard labels +
  CED-2026 tiles). `80ab9e9` added `SCHEDULE_HANDOFF.md`, the teacher intake checklist.
- **GitNexus HTML shadows** — `282e3b9`/`3ca5eb4`/`b07b964` (line-preserving JS shadows in a
  non-hidden `gitnexus-shadow/` so Desk symbols resolve; dot-dirs are skipped by the analyzer),
  `f961e8c` re-index to 18 568 symbols.
- **cr `3f54c45`** — quiz review explanations persisted and shown **privately** (companion to the
  appeal-history work; was held there for a privacy fix round).

### ⏭ CURRENT OPEN — verified against the tree, top first

1. **The SY2627 calendar intake is STILL BLANK and now has a hard date.** `sy2627-calendar-intake.md`
   is untouched since 2026-07-08 — first instructional day and AP exam date are literally still
   `YYYY-MM-DD`. **The teacher expects the real schedule ~2026-09-01.** Until then
   `roster-server/data/lesson-schedule.json` is *last year's sequence on this year's dates*, so once
   Q1 opens the engine mis-attributes grades by date. `SCHEDULE_HANDOFF.md` §1 is the exact 7-item
   intake; §2–§4 are the sequence and gates. **This is the top blocker and it is teacher-owned.**
2. **FRQ Stage 4** — see START HERE. Code work = the four enforce blockers + wrapping
   `/api/ai/appeal`; ops work = the three concurrency smoke items; then one-period canary → `*` →
   `log`→`enforce`.
3. **Railway env flips owed ~Sept** (carried from s34, unchanged): `PC_TRACK_ENABLED=true`,
   `PC_FIGURES_SUPABASE_URL` + `PC_FIGURES_SUPABASE_SERVICE_KEY` (= copy the `ROSTER_SUPABASE_*`
   values, same project), and a non-default `TEACHER_KEY` (still the published `apteacher2627`).
4. **PC FRQ auto-scoring is still not built.** `1be8b27` added `PC_FRQ_GRADING_SPEC.md` as a **DRAFT
   with 10 teacher decisions pending**; `roster-server/pc.js` `scorePcItem` still returns `null` for
   free-response. Blocked on the bank rubric check + those decisions.
5. **TI-84 `.8xm` matrix transfer** still not built (`autoFillMatrix` remains keystroke-only) — but
   the matrix-entry *cell loop* half of s34 item #5 is now closed by `9fcc64e`.

Carried forward and still true: the offline-mesh P3–P4 grade loop is **runtime-untested** end-to-end
(needs a teacher device + ≥1 student phone over adb), and the APK needs a rebuild to pick up mesh P3–4.

### 🔑 Gotchas that will bite the next instance

- **Any edit to the worksheet AI block must be re-applied**:
  `node scripts/wire-ai-worksheet-grade.mjs --rewire --apply` **then**
  `node scripts/wire-tango-theme.mjs --apply` (rewire strips the theme block ordering), then
  `npm run gitnexus:analyze` for the shadows. Keep `tests/ai-worksheet-grade.test.js` green.
- **Any rubric edit requires regenerating the server bundle** or tests fail:
  `node scripts/build-frq-rubrics.mjs --check`.
- **Migration 0031 lives in the cr Supabase project `<AP_SUPABASE_PROJECT_REF>`**, not the roadmap project.
- **A file-only URL fix is insufficient** — the Supabase `lesson_urls` table overrides
  `roadmap-data.json` at runtime.
- `node tools/regrade-ungraded-frqs.mjs --dry-run` shows the current null-score backlog.
- Teacher-role accounts (`date_tiger`, `plum_lion`) are excluded from `/admin/snapshot` by design.
- The teacher tests on the **public URL** — commit and push promptly; `file://` is not a valid surface.

---

## ⏭ SESSION 34 (2026-08-07) — superseded by s35 above.

**HEAD = `f98be89`** (pushed, `master`). Baseline for this block = `7fc297a` (s33 tip, 2026-07-02).
curriculum_render HEAD = `d8b7e79` (branch `main`).

> **⚠ HOST MOVED.** Everything now runs on a **Linux box**, not the old Windows machine. The s33
> header and older sections still cite `C:/Users/rober/...` paths — those are dead. Current reality:
> repo `/home/mrcolson/repos/apstats-live-worksheet`, cross-agent runner
> `python3 /home/mrcolson/repos/Agent/runner/cross-agent.py`, sibling repos
> `/home/mrcolson/repos/curriculum_render` and `/home/mrcolson/repos/ti84-transpile`. The Equation
> Trainer (`tmux-trainer`) source is **NOT cloned here** — only its deployed URL is reachable.
> `python` is not on PATH; use `python3`. CLAUDE.md has been corrected to match.

### A. What landed after s33 — July

- **Typecheck hardening, P1-P4 complete** (`80e3c81` P1 grade engine → `00e9b59` CI advisory →
  `f641e32`/`7ea7168`/`cf87cf0`/`6c6b0cc`/`24a65cf` P2 mesh+receipts, hardened by `021e0dc`+`8e070c3`
  → `037c555` P3 content validators → `060d147` P4 feeder contract + **BLOCKING** gate).
  `npm run typecheck` at root and in `roster-server`; `.github/workflows/ci.yml` runs both blocking.
  No build step added — `@ts-check` + JSDoc only. `TYPECHECK_HARDENING_SPEC.md` marked SHIPPED.
- **Nightly Review v2 fixes** (`01c1669`) — view-as can now load the VIEWED student's review marks
  (teacher can verify the seen/comment render without a student login), and "Mark all seen" reaches
  the >80 tail via server-side `scope:'all'` instead of the DOM-capped 80-item payload.
  ⚠ **NRv2 itself shipped in s33** (`dbd7c0c`), not here — only the fixes are s34.
- **Fall-2026 CED reframe / SY2627 Pass 1** — the 9-unit course relabelled to the 5-unit CED across
  lessons-index, roadmap-data, Desk calendar and mobile launcher (`5500df0` → `6de797e`), a schedule
  generator on a **SYNTHETIC** fixture (`2a5c261`), Do-Now manifest deploy + pipeline freeze
  (`669f088`, `3d35034`), Blooket core/bonus split (`01b2cac`, `bb5cc6a`, `0252536`), and
  **Pass 1 attenuation** (`1b88efa`: answer-key 782→354 MCQ, skill-map regenerated to 367 curriculum
  ids / 0 PC ids, Desk bonus-quiz suppression; cr side `2c74015`).
- **PC makeup delivery, [A]-[F] all shipped** — `283ec51` ([A] unlock + [B] token-gated
  `/pc/:unit/:part`), `000a02e` (teacher preview bypass), `c9d2885` ([D] gated grade wiring +
  submit/paper/class endpoints), `b19dda7` ([E1] dashboard makeup-queue card), `5dc2939` ([F] mid-unit
  MCQ Part A calendar tiles), `19048e0` ([D] quarter-close freeze + post-close bonus deltas).
  cr [C] adapter: `c113c3a`, `f8704ba`, `23adfde`, `259eed4`.
- **PC26 figures (D1-a)** — `7a53368` (roster-server signs short-lived private-bucket URLs, attached
  AFTER `stripForClient`) + cr `d8b7e79` (client renders them). **INERT and env-gated**: nothing
  renders until `PC_FIGURES_SUPABASE_URL` + `PC_FIGURES_SUPABASE_SERVICE_KEY` are set; items ship
  figure-less with a `[Figure]` fallback.
- **Desk Grade Check-in** (`cb8ffd4`) — teacher-only monthly reminder, browser-local ack state, invisible
  and inert for students/view-as/Preview-as-Student. 47 tests. `DESK_GRADE_CHECKIN_SPEC.md` marked SHIPPED.
- **Incident 2026-07-20 fixed** (`772a26a`, grade-affecting) — the Desk could render an *unknown* grade
  state as 0%/locked. Fix: tri-state `/grade` load, truthful saved-work banner + retry, evidence restore
  on every failure kind, durable per-student server-completion latch, gate **fails open** without
  affirmative server evidence, marks-bucket alias migration, identity-switch state reset. 84 tests.
  See `INCIDENT_2026-07-20_PROGRESS_RESET.md` + `PROGRESS_RESET_DEPLOYMENT_RUNBOOK.md`.
- **Test hardening** — `637face` (bcrypt cost env-gated: `BCRYPT_COST=4` in vitest only, prod
  byte-identical at 12; killed the CPU-starvation flakes), `a79cff8` (fixed a **real** stale
  `grade-engine.bundle.js` missing `scorePcRows`, plus two jsdom flakies converted from fixed sleeps to
  condition polls; 0 failures across 3 clean full root runs, 8276 assertions each).

### B. What landed after s33 — August

- **TI-84 guided walkthroughs now match the real ROM** (`edad89f`). Two compounding defects made guided
  procedures unfollowable: `repeatable: true` was authored on 41 steps but implemented nowhere (so
  "press RIGHT until…" hard-blocked the 2nd press), and choice rows never pressed ENTER. **Verified
  empirically on the booted ROM** (OS 5.8.2.0029, headless CEmu + framebuffer diffs): plot-type icons
  and all wizard choice rows (Inpt/alternative/Tail/Pooled) commit **only on ENTER** — cursor movement
  commits nothing, so the old histogram flow silently drew a scatterplot. Also closes fix-plan item **A9**.
- **Vercel mirror activated** (`f98be89`) — `https://apstats-live-worksheet.vercel.app` is now a live
  fallback rail after a GitHub Actions/Pages outage wedged a trainer fix. **Manual deploy**:
  `npx vercel deploy --prod --yes` from the repo root. Same tree; `vercel.json` 308-redirects `/` to
  `mobile-home.html`; `.vercelignore` excludes backend source, tests, tooling. The prepared CORS
  allowlist patch (`roster-server/docs/cors-allowlist.patch`) now carries the Vercel origin.
- **Test infra** (`7bbbefb`) — `remaining-feature-contracts` un-excluded from CI; only its F034 block
  needs the untracked `wsx.js`, and that block now self-skips when the file is absent.

### ⏭ CURRENT OPEN — verified against the tree, top first

1. **SY2627 calendar intake is still BLANK — this is the top blocker.** `sy2627-calendar-intake.md`
   has every field unfilled (term boundaries, breaks, period model, pacing, review days, SY2526
   archive decision). Until the user fills it, `topic-schedule.json` stays a **synthetic fixture** and
   the whole SY2627 schedule → Desk → live-sync chain cannot go to production.
2. **Migrations `0028_submission_archive`, `0029_pc_makeup`, `0030_quarter_grade_snapshot` have no
   run-record, and the `pc_bank` rows are not loaded.** (`0027` is recorded USER-RAN ✅; nothing in the
   repo records 0028-0030 as applied — hit the endpoints to confirm.) `/submissions/archive` 503s without 0028;
   `/pc/:unit/:part` returns `pc_bank not provisioned — run migration 0029`; `/class/quarter/*` 503s
   without 0030. The CB-secure PC26 bank must be loaded **out-of-band into private Supabase** — it
   must never enter this public repo.
3. **The Windows-box automations are not registered on the Linux host.** `tools/nightly-backup.mjs`
   ran as Windows Task Scheduler job "APStats Grade Nightly Backup"; the Schoology sync registers via
   `tools/register_schoology_sync_task.ps1` (`schtasks /Create /TN ApStatsSchoologySync`). PowerShell +
   `schtasks` do not exist here — both need cron/systemd equivalents or they are silently not running.
4. **PC FRQ auto-scoring is not built.** `roster-server/pc.js` `scorePcItem` returns `null` for
   free-response (`type === 'free-response' || 'frq' || item.answer == null`), so FRQ defers to the
   paper/AI path and a null never wipes a prior score. `PC_MAKEUP_DELIVERY_SPEC.md` §4's FRQ subpart
   policy (concatenate per lettered part vs explode per subpart) was **never decided**.
5. **TI-84 matrix entry is still keystroke-only.** `autoFillMatrix` fills `[A]` by simulated keystrokes;
   `.8xm` matrix transfer was never built (`TI84_TRAINER_SPIKE_RESULT.md`: type 0x02 dimension header
   never sent). `chi-square-test` is the sole `[A]` target and stays fully keystroke until a separate
   `.8xm` spike passes the same harness pattern.

Carried forward from s33 and still open: the offline-mesh P3-P4 grade loop is **runtime-untested**
end-to-end (needs a teacher device + ≥1 student phone over adb; P1-2 were hardware-smoked), the APK
needs a rebuild to pick up mesh P3-4, and `TEACHER_KEY` on Railway is still the published default
`apteacher2627`.

---

## ⏭ SESSION 31 (2026-06-30) — ANDROID Phase 2 (on-device ledger merge) + Phase 3 (P2P gossip) SHIPPED

Continuing the ANDROID_PACKET_APP_SPEC phase ladder (0 video✓ 1 shell✓). All SHIPPED + PUSHED to
follow-alongs `master`. Tests **root 7613/7613, roster-server 1134/1134**. cr UNTOUCHED. fa
`7119dcc`→`4bb5810` (Phase 2)→`2873da3` (Phase 3). Specs: `ANDROID_PHASE2_LEDGER_MERGE_SPEC.md`,
`ANDROID_PHASE3_GOSSIP_SPEC.md`.

### A. PHASE 2 — on-device ledger merge (fa `4bb5810`)
The student device re-derives its OWN grade OFFLINE from local signed ledger rows. **User chose
item-level re-derivation** (the device computes lesson/quarter grades from items, not by caching the
/grade summary). Divergence made impossible by SHARING the engine, not re-implementing it:
- **`grade-engine.bundle.js`** (generated by `scripts/build-grade-engine.mjs`): bundles the 3 pure
  server modules — `grade-config.js` → `scoring.js` → `lesson-grade.js` → `gradebook-grid.js` →
  `grade.js` — into `window.GradeEngine` (computeGrade/buildGradebook/…). The generator does targeted
  surgery on grade.js only (neutralizes the fs-based BLOOKET_LESSONS read → `[]`; drops the express
  `mountGrade` route); **grade.js on the server stays byte-identical**.
- **Parity guarantee** (`tests/grade-engine-bundle-parity.test.js`): (1) drift check — committed
  bundle === a fresh generation; (2) `GradeEngine.computeGrade`/`buildGradebook` deep-equal the server
  functions across every `sim-world` archetype. Regenerate after any engine edit: `node
  scripts/build-grade-engine.mjs` (parity test fails loudly otherwise).
- **Answer key NEVER ships** (cheating surface): new `roster-server/grade-offline-inputs.js` mounts
  read-only token-gated **`GET /grade/offline-inputs`** → a REDACTED per-student key: same item-id set
  + gradability as the real key (so computeQuizTotals denominators match), every answer replaced by a
  sentinel EXCEPT the items THIS student answered correctly (reproduces their grade, reveals only their
  own correct answers). Built as `{...realEntry, answerKey: redacted}` so non-answer fields/gradability
  are preserved → `computeGrade(redacted) === computeGrade(real)` (pinned in
  `roster-server/tests/grade-offline-inputs.test.js`). **Proctored PC answers redacted by default**
  (parity-neutral today, no PC rows); `?includePc=1` restores PC parity when PCs open ~fall.
- **`ledger-store.js`** (`window.LedgerStore`): durable IndexedDB **G-Set keyed by `receipt_id`** (union/
  dedup/idempotent — the structure Phase 3 gossips). `.pull(rosterClient)` from /ledger/student;
  `.verifyAll()` Ed25519-verifies each `receipt_compact` via `receipt-verify.js` (copied to repo root).
- **Desk wiring** (`ap_stats_roadmap_square_mode.html`): loads receipt-verify + grade-engine.bundle +
  ledger-store. OFFLINE branch of `renderDoNowGrades` now `data = (await _phase2ReDeriveGrade()) ||
  _loadGradeCache()` — re-derives via GradeEngine over `LedgerStore.all()` ∪ unsynced OfflineQueue,
  using inputs cached from `/grade/offline-inputs` (`apstats_grade_inputs_v1:<sid>`). **Strictly
  additive: online /grade still wins, never downgrades, OFF in view-as.** 🔐 verification chip in My
  Ledger (`_walletPaint`) from a cached `_phase2VerifySummary`; roster issuer pubkey fetched from
  `GET /receipts/issuer` + registered into `ReceiptVerify.ISSUERS` at boot.
- Tests: `tests/{grade-engine-bundle-parity,ledger-store,desk-ledger-reconcile}.test.js` +
  `roster-server/tests/grade-offline-inputs.test.js`. **APK rebuilt** (scripts bundled into www).

### B. PHASE 3 — P2P gossip (fa `2873da3`)
Phones epidemically merge their signed-ledger G-Sets → a student's work reaches the teacher via
classmates with no internet + no direct contact. Built on Phase 2's receipt_id G-Set (merge = union →
conflicts impossible).
- **`ledger-gossip.js`** (`window.LedgerGossip`): transport-agnostic anti-entropy. One round =
  `HELLO{digest}` → `SYNC{rows-you-lack, ids-I-lack}` → `SEND{requested}`, after which both peers hold
  the union. **VERIFY-ON-INGEST is the security boundary**: `ingest()` stores/relays a row ONLY if its
  receipt verifies → a malicious peer **cannot inject a fake grade** (forgery needs the teacher key);
  replay is harmless (idempotent). Privacy is UI-level (clear-text class rows, per the packet spec).
- **`android-app/plugins/gossip-nearby/`** — a **committable local Capacitor plugin** (NOT under the
  gitignored `android-app/android/`; discovered by `cap sync` via its package.json `capacitor.android.src`,
  wired as a gradle subproject). Java `GossipNearbyPlugin` wraps **Google Nearby Connections**
  (`Strategy.P2P_CLUSTER`: BT + BLE + Wi-Fi Direct, auto-discovery, no pairing; auto-accepts connections
  — trust is at the receipt layer). Manifest declares the BT/Wi-Fi/location perms; build.gradle pulls
  `play-services-nearby:18.7.0`. `android-app/package.json` depends on it via `file:plugins/gossip-nearby`.
- **`nearby-transport.js`** registers `window.GossipTransport` (the `start/send/stop` contract) **ONLY
  inside the APK** (Capacitor native + plugin present). On the GH-Pages web Desk there's no transport →
  the gossip layer is inert + the Apps-menu "📡 Sync Nearby" item stays hidden. No backend change, no
  web behavior change.
- **Desk**: `_phase3SyncNearby` time-boxes a round, one `LedgerGossip` session per discovered peer over
  the transport, ingesting verified rows into LedgerStore (not view-as). `_phase3SyncNearbyClick` toasts
  the result; `_phase3RevealSyncMenu` unhides the menu item when a transport exists.
- **Validated**: cap sync detects `gossip-nearby@1.0.0`; **gradle assembleDebug compiles the plugin +
  resolves play-services-nearby + packages it into the APK** (1514 MB). Tests:
  `tests/{ledger-gossip,nearby-transport,desk-phase3-gossip}.test.js` (convergence, tampered-row
  rejection, multi-hop delivery, the bridge, the Desk round).

### ⚠ s31 — what only the USER can do / next
- **2-PHONE runtime test of gossip**: sideload the APK on two phones, sign in on each, do work, then
  Apps→📡 Sync Nearby on both (grant BT/Nearby perms). Should report "Synced with 1 device · +N records".
  Drive via adb (`adb -s <serial> shell input tap …`). Android 12/13 permission UX is the likely
  rough edge → report symptoms to tune `GossipNearbyPlugin`.
- **PHASE 4 — FOUNDATION SHIPPED (`3a0be9b`)**: the **issuer-key history/rotation** is built + tested
  (roster-server 1142/1142). Verification trusts a SET of pubkeys (current + retired via env
  `RETIRED_ISSUER_PUBKEYS`); inert until configured. `receipts.js::getTrustedIssuerPubkeys()`,
  `getReceiptIssuer().pubkeys[]`; `snapshot-verify.js::verifyCompact` takes a key LIST,
  `verifySnapshot({pubkey,pubkeys})`; `/admin/restore` honors the set; Desk `_phase2RegisterIssuer`
  registers all pubkeys from `/receipts/issuer`. Spec: `ANDROID_PHASE4_TEACHER_KEY_SPEC.md`.
  - **DECISIONS MADE (user, s31):** §3 custody = **(B) device-GENERATED key, pubkey added to the trust
    set** (NOT the copied Railway key; Railway co-signs + durable fallback; key loss = non-event).
    Sub-fork (Android Keystore canNOT hardware-sign Ed25519 — only P-256 ECDSA): chose **Ed25519,
    hardware-WRAPPED at rest** (device generates a fresh Ed25519 key, stored Keystore-AES-wrapped +
    biometric-gated, signs in-app) over P-256-true-hardware — because it reuses the ENTIRE existing
    Ed25519 verify/gossip/snapshot/trust stack UNCHANGED, and the threat model (low-stakes pedagogy,
    tamper-evidence) doesn't justify a mixed-alg verifier.
  - **SIGNING CORE SHIPPED + PROVEN (`e0fbbf7`)**: `receipt-sign.js` (`window.ReceiptSign`) = the
    issuing side matching receipt-verify.js — WebCrypto Ed25519 keygen + `signPayload` reproducing
    `roster-server/receipts.js::signPayload` byte-for-byte (canonicalize → Ed25519 → b64url(bytes).
    b64url(sig) + sha256 receiptId). Cross-stack PROVEN in `tests/receipt-sign-interop.test.js` (6/6):
    a JS device key signs a receipt that the Node server `verifyCompact`/`verifyRecord` ACCEPTS; tamper
    breaks the binding; wrong key rejected; JWK round-trips deterministically. So a device-signed
    receipt is trusted everywhere once its pubkey is in the trust set — **no verifier change**.
  - **PHASE 4 FULLY SHIPPED (`0f4f16e`)** — the on-device TEACHER APP, built understand→design→
    implement→adversarial-review (20-agent: 15 raised, 12 refuted, 0 confirmed). Pieces:
    - **Server (auto-deployed):** migration `0026_trusted_issuers` (USER-RUN) + db DAOs
      (add/list/**revoke**); `receipts.js` merges a persisted boot-seeded trust-set cache into
      getTrustedIssuerPubkeys; teacher-gated `POST /receipts/trusted-issuers` (register) +
      `.../revoke` (live-evict, the review fix). 503-guarded until 0026 run.
    - **Browser (proven vs server, NO verifier change):** `receipt-sign.js` +`answerHash`/
      `signLedgerReceipt` (an FRQ grade = a device-signed `frq` ledger receipt, attempt+1 supersedes,
      byte-matches issueLedgerReceipt); `ledger-seal.js` = browser `buildHead`+`epochRoot`+`sealEpoch`
      ported from commits.js/admin-snapshot.js, a device-sealed epoch PASSES verifySnapshot
      (`tests/ledger-seal-parity.test.js`); `secure-key.js` bridge.
    - **Native:** `android-app/plugins/secure-key-store/` Capacitor plugin — AES-256-GCM AndroidKeyStore
      key (`setUserAuthenticationRequired`) + `BiometricPrompt.CryptoObject`; stores/returns the wrapped
      Ed25519 JWK only after a biometric/credential unlock (signing stays in JS). Compiles + APK-packaged.
    - **`teacher-app.html`** (mobile-first, bundled, linked from mobile-home): dual-auth; generate→store→
      register key (unlock once); import `/admin/snapshot`→grade pending FRQs (E/P/I)→sign→push
      `/admin/restore`; seal+verify the epoch.
    - **Decisions/accepted:** §3B Ed25519 hardware-WRAPPED; device key added to trust set (Railway
      co-signs/fallback, key loss=rotate). Documented-accepted findings: teacher secret in localStorage
      (shared public password by design, matches teacher-dashboard); object-response `ah` bind is a
      PRE-EXISTING s29 item (FRQ path uses strings = bound).
    - ✅ **migration 0026 RUN** (register/revoke live). ⚠ **on-device runtime test pending** (biometric
      keygen/unlock + the grade→push→seal loop — only the user can do this; the APK is installed on the
      Pixel `89VX0HPX1`). Tests: root 7642 + (ledger-seal 9, secure-key 7, teacher-app 7), rs 1153/1153.
  - **PHASE 5 SHIPPED (`1dd2204`) — Google Play build (on-demand video). THE ANDROID PHASE LADDER 0-5
    IS COMPLETE.** Play caps the AAB at 150 MB so video isn't bundled — it downloads per-unit on demand
    + evicts. "Play is a flag, not a fork."
    - `video-ondemand.js` (window.VideoOnDemand): catalog + INJECTABLE storage; resolve(bundled|
      downloaded|remote), download (progress), downloadUnit, evictUnit, evictionPlan, + a download
      integrity guard. `video-store.js` = @capacitor/filesystem adapter with ATOMIC writes (.part→rename).
      `scripts/build-video-catalog.mjs` → video-catalog.json from media-manifest (144 videos, units 1-9).
    - Build: `build-offline-pack --play` (strips bundled media, injects PLAY_BUILD + MEDIA_BASE_URL,
      bundles the manager+catalog); `build-android --play` → an **AAB** via bundle* (execFileSync).
      Validated: **AAB 24 MB** (vs 1514 MB sideload), 3 plugins. mobile-home: PLAY_BUILD → download-on-tap.
    - Review: 3-lens (11 raised, 9 refuted; 2 PLAUSIBLE — non-atomic write + shell-arg — both FIXED).
    - ✅ **VIDEO HOST RESOLVED + VALIDATED ON-DEVICE (s31):** Cloudflare **R2** bucket `apstats`, public
      URL `https://pub-c41e030062804d678d5f79d5440fdd45.r2.dev`, CORS set (GET/HEAD `*`), all **144
      videos uploaded** (`scripts/upload-r2.mjs` via aws4fetch, resumable; creds in local gitignored
      `.r2.env`). **Verified on a phone**: tap ▶ Video → downloads from R2 → stores (atomic) → PLAYS
      (Topic 1.1, 6:41, real content). ⚠ The on-device test CAUGHT a bug (`86f1f26`): mobile-home.html
      wasn't loading `offline-config.js` (it's not in ROOT_FILES) → PLAY_BUILD/MEDIA_BASE_URL unset →
      video tap fell to the nonexistent bundled path; FIXED by loading offline-config.js in mobile-home.
      ⚠ the r2.dev URL is rate-limited (fine for testing; connect a custom domain for a real rollout).
      ⚠ **rotate the R2 API token** (it went through chat). To rebuild: `node scripts/build-android.mjs
      --play --media-base "https://pub-c41e030062804d678d5f79d5440fdd45.r2.dev"` (AAB); or the same with
      an `assembleDebug` for an installable test APK.
    - ⏭ REMAINING (non-code): Play Console listing / privacy policy / Data Safety; upload keystore for a
      signed release AAB.
    - Tests: root **7656/7656** (+14 video-ondemand/catalog). Spec: `ANDROID_PHASE5_PLAY_SPEC.md`.
  - ⏭ **REMAINING on-device tests (only the user can do; APK on Pixel `89VX0HPX1`):** (1) **2-phone
    gossip** (Phase 3 — Apps→📡 Sync Nearby on two phones, grant BT/Nearby perms, expect "Synced with 1
    device · +N records"); (2) **teacher-key flow** (Phase 4 — 🔑 Teacher → Generate→Register→Import→
    grade→Sign&push→Seal). Drive via adb (`adb -s 89VX0HPX1 shell input tap …`).
  - Then Phase 5 = Play Store (split video to per-unit on-demand download; same applicationId).
- **toolchain (machine-specific, carried from s30)**: JDK 17 pinned in `android/gradle.properties`,
  SDK/build-tools 35, Gradle 8.2.1; full build `node scripts/build-android.mjs` (`--no-media` = fast
  app-shell smoke). `android-app/{node_modules,www,android,plugins/**/node_modules,plugins/**/build}`
  gitignored; the plugin SOURCE under `android-app/plugins/gossip-nearby/` IS committed.

## ⏭ SESSION 30 (2026-06-29/30) — NIGHTLY REVIEW shipped (all 4 phases) + ANDROID offline-course app + cr quiz mobile pass

Three threads, all SHIPPED + PUSHED. fa `5bdd60c`→`7119dcc`; cr `dd165b3`→`1f446c7`. Tests green:
**roster-server 1101→1121, root 7529→7537**. On-device iteration via adb (screencap/tap/swipe) was the
unlock for the mobile work.

### A. NIGHTLY REVIEW — all 4 phases LIVE (fa `44b13e2`; migration 0025 USER-RUN + DONE)
Built `NIGHTLY_REVIEW_SPEC.md` end-to-end. Teacher reviews recent student work, marks SEEN, comments, the
review mints 1 candy + toasts the student; signed → durable.
- **⚠ CANDY DECISION (user-approved, the one real fork):** spec §3.3's "bump `candy_given`" was BACKWARDS —
  `candy_given` (Materialized) SUBTRACTS from the wallet, so it'd DOCK a candy per review. The reward is a
  **MINT** → new additive `candy_bonus` column. 9-number identity: `Earned+Received+Realized+Bonus =
  Gifted+Converted+Materialized+Escrowed+Owed`. Spendability handled IN the SQL guards (migration 0025
  re-creates `doge_spend`/`doge_gift`/`doge_mark`/`tetris_bet_open` adding `+ candy_bonus`, byte-identical at
  0); JS spend paths UNCHANGED, only `deriveBalances`+`/class/wallets` display add `+bonus`. Conservation
  fuzz (`wallet-world.js`/pg-wallet Layer B) LEFT UNTOUCHED (pins 0019-0024); validated the new SQL with a
  focused **pglite** test in `roster-server/tests/review.test.js` (mint atomic + idempotent/day + spendable).
- **Phase 1 server:** migration `0025_review_marks.sql` (`review_marks` keyed on `ledger_id`,
  `review_candy_grants` once/student/NY-date, `candy_bonus`, atomic `review_award()` fn);
  `receipts.js::issueReviewReceipt` (`t:'review'`, comment bound by hash `ch`); `GET /class/review-queue`
  (priority-sorted FRQ>low-score>proctored>auto, unseen counts, daysSinceReview, N-days flag);
  `POST /class/review` (mark by ledgerIds or {studentId,scope:all|day|session}; comment≤500; signed receipt;
  candy; notify-on-comment via nudgesDb); `/ledger/student` gains `review:{seenAt,teacher,comment}`. New
  `roster-server/review.js`; DAO in `db.js`; `ledger-db.js::getRowsByLedgerIds`.
- **Phase 2 teacher Desk** (`ap_stats_roadmap_square_mode.html`): Teacher-menu **🌙 Nightly Review** item +
  `#menu-review-badge` unseen badge + `#app-nightlyreview-overlay` System-7 window (priority `<details>` per
  student, per-item [Seen], comment box + localStorage templates `desk_review_templates_v1`, Mark-all +
  per-session bulk); `_reviewBadgePoll()` from `updateUserRoleUI`; tile in `_TEACHER_TOOLS`.
- **Phase 3 student Desk:** My Ledger rows render "👁 Seen by teacher · 💬 comment" (`_loadReviewMarksForSelf`
  → `_reviewByItem` → `_walletReceiptRow`; students only, not view-as). Toast already works via nudge poll.
- **Phase 4 durability:** `admin-snapshot.js` carries `bundle.reviews`; `snapshot-verify.js::verifyReviewMark`
  (`t:'review'` + `ch` tamper-detect); `admin-restore.js::normalizeReviews` best-effort replay (⚠ ledger_id
  REGENERATES on a full restore → reviews orphan on a total wipe; signed receipt still verifies);
  `tools/nightly-backup.mjs` review-coverage + "not reviewed in N days" digest.
- Tests: `roster-server/tests/review.test.js` (20), `tests/desk-nightly-review.test.js` (8),
  `tests/phase4-structure.test.js` allow-list `/admin/` (fixed a PRE-EXISTING s29 dashboard-card failure).

### B. ANDROID PACKET APP — whole course offline, sideloaded to a phone (fa `dd1ba24`,`9f1d00d`,`7119dcc`)
Brainstormed → `ANDROID_PACKET_APP_SPEC.md` → built Phase 0+1. The course as a **Capacitor** Android app.
- **Video (Phase 0):** `scripts/compress-videos.mjs` transcoded all 144 to **H.264 CRF23** (max-compat;
  beats H.265 for near-static slide screencasts). **24.96 GB → 1.49 GB (−94.0%)**, visually identical (a
  9-min lesson 187.6MB→10.3MB, pixel-identical frame). `media-compressed/` (gitignored).
- **App (Phase 1):** `android-app/` Capacitor project (`com.robcolson.apstats`). `mobile-home.html` = a
  mobile-first lessons launcher (units→lessons→▶video ✍worksheet ❓quiz, fullscreen local `<video>`); data
  from `scripts/build-lessons-index.mjs` (worksheet/quiz URLs relativized to bundled paths). The **Desk is
  desktop-only** (System-7 metaphor) → NOT the phone home. `scripts/build-android.mjs` = one-command pipeline
  (offline pack → launcher as index.html → cap sync → gradle). **Full 1.5 GB APK built + sideloaded; video,
  worksheets, quiz + a injected "‹ Lessons" back pill all work offline.**
- **⚠ Toolchain (machine-specific):** SDK has only platform/build-tools **35** → bumped
  `android/variables.gradle` to 35. Machine `JAVA_HOME`=**JDK 22** which Gradle 8.2.1 rejects ("major version
  66") → pinned `org.gradle.java.home` to **JDK 17** in `android/gradle.properties`. Windows build calls
  `.\gradlew.bat`. Heavy artifacts (`android-app/{node_modules,www,android}`, `media-compressed/`) gitignored.
  `--keep-media` → ~35s rebuilds.
- **OFFLINE reality:** content + grade CAPTURE work offline (offline-config.js → OfflineQueue → syncs on
  reconnect). ONE caveat: FIRST sign-in needs internet once (roster auth); after that the session persists.
  AI grading + live aggregates need internet (degrade gracefully). `--identity` per-student baked session
  (zero-internet-ever) deliberately NOT wired (teacher declined). iOS DEFERRED to the existing PWA.
- **Durable model (spec, brainstormed not built):** grades = single-writer (teacher-signed) content-addressed
  **CRDT** (merge=union). Multi-master replicas: phones + teacher app + Supabase (fast preview) + git mirror;
  truth=union, sealed by the daily epoch anchor. **No encryption** (UI-level privacy, teacher-accepted).
  P2P gossip over **Nearby Connections** (BT/BLE/WiFi-Direct). Authority ladder: auto-grade(f(response,signed
  key)) → AI(only-raises) → teacher-override; changes are APPENDS. Teacher signing key → on-device (Keystore+
  PIN) with **Railway warm-spare = copy the EXISTING `RECEIPT_ISSUER_PRIVATE_KEY`** (NOT the `apteacher2627`
  login key). Phases: 0 video✓ 1 shell✓ → 2 on-device merge, 3 P2P gossip, 4 teacher app+key, 5 Play (video
  download-on-demand since 1.5GB > Play's 150MB cap; reuses the delete-old-unit-videos eviction idea).

### C. cr QUIZ MOBILE PASS (cr `1f446c7` → GH Pages; fa `7119dcc` install-hide)
cr quiz was desktop-only on a phone. Fixed via an ADDITIVE `@media (max-width:600px)` block appended to
`css/styles.css` (**desktop byte-identical**). Real culprits found by adb screenshots: (1) two-column question
layout kept a FIXED `flex:0 0 450px` peer sidebar → overflow → forced column + sidebar full-width `!important`;
(2) wide data tables → `display:block;width:100%;overflow-x:auto`; (3) FAB rail (8× 56px) shrunk to 44-46px;
(4) `#spriteCanvas width:100vw`→`100%` (100vw incl. scrollbar gutter = sideways scroll on a fixed el);
(5) padding/16px-inputs/tap-targets. App-only: `#pwa-install-fab` install button hidden via follow-alongs
`injectAppNav`. ⚠ a faint top-right status widget ("100/Connected") still peeks (cosmetic; needs DOM-inspect).

### s30 remaining / next
- **Nightly Review:** live now that 0025 is run — teacher should exercise the 🌙 surface.
- **Android:** teacher testing on-device; next = Phase 2 on-device ledger merge → 3 P2P gossip → 4 teacher app
  (+ on-device key warm-spare) → 5 Play. Also optional: chase the cr quiz cosmetic sliver (chrome://inspect).
- **⭐ ON-DEVICE WORKFLOW (reusable):** drive the connected phone over adb — `adb -s <serial> exec-out
  screencap -p > x.png` (binary-safe), `adb shell input tap X Y` / `input swipe …`, `monkey -p
  com.robcolson.apstats -c android.intent.category.LAUNCHER 1`. Screenshots 1080×2340 shown at 923×2000 (×1.17).

### s30 artifacts
`NIGHTLY_REVIEW_SPEC.md`(impl), `ANDROID_PACKET_APP_SPEC.md`; `roster-server/{review.js,migrations/0025_review_marks.sql,
tests/review.test.js}` + edits to `{receipts,db,ledger-db,ledger,doge-wallet,server,admin-snapshot,snapshot-verify,
admin-restore}.js` + `tools/nightly-backup.mjs`; `mobile-home.html`, `scripts/{compress-videos,build-lessons-index,
build-android}.mjs` + `build-offline-pack.mjs`(media-compressed/--no-media/--app-nav/--keep-media); `android-app/`
(Capacitor: package.json/capacitor.config.json/lockfile committed, rest gitignored); cr `css/styles.css`.

## ⏭ SESSION 29 (2026-06-29) — GRADE-LEDGER DURABILITY (survive a Supabase loss) + nightly backup/review; NIGHTLY REVIEW spec'd

Teacher fear: "Supabase goes offline and takes all the kids' grades." **Key realization:** the
system ALREADY had the integrity layer (per-answer Ed25519 receipts on `item_ledger` + the
`/commits` session-chunked, prev-chained commit chain + transcript Merkle roots). What was
missing was **durability** — the chain is recomputed from a Supabase-only `item_ledger`. So s29
added off-Supabase **replication + a signed anchor + verify + faithful restore + teacher UI**.
All SHIPPED + PUSHED + deployed; **roster-server tests 1101/1101**. fa `0fa51b1`→`5bdd60c`.

**⚠ THE TEACHER KEY IS NOW `apteacher2627`** (was `apstats2627`, which collided with the default
student/enroll password). Use it for the dashboard "Teacher secret" field + teacher-account
creation. Verified live (apteacher2627→200, apstats2627→401, so `TEACHER_KEY` env is unset = the
code default applies). Repo is PUBLIC so the default is visible — for real secrecy set `TEACHER_KEY`
env on Railway (user declined for now). `getTeacherKey()` in `roster-server/teacher-auth.js`.

### A. Server — snapshot + epoch anchor + verify + faithful restore (`ab9679d`, `0aac8dd`, `d6873cf`)
- **`GET /admin/snapshot`** (teacher-gated, read-only; `admin-snapshot.js`): the WHOLE signed ledger
  + per-student commit `head` + transcript root, in the `apstats-offline-export/v1` bundle shape
  (so `/ledger/import`-compatible), + a signed **epoch anchor** (`issueEpochReceipt`, new in
  `receipts.js`; prev-chained daily class seal).
- **`POST /admin/verify`** (read-only) + **`snapshot-verify.js`**: zero-trust `verifySnapshot` —
  every receipt signature, each record's binding (sid/item/source/score + answer-hash), recomputed
  heads + transcript root, epoch root over re-derived heads. Shared exported `verifyRecord`.
- **`POST /admin/restore`** (`admin-restore.js`): **FAITHFUL** recovery — replays ONLY records
  bearing a valid signature from this server's issuer, byte-for-byte (score AS-IS / NO 0..1 clamp,
  `evidence_tier` from the signed payload, original `recorded_at`, original receipt preserved).
  Tampered/unsigned refused. `ledger-db.insertLedgerRow` gained optional `recordedAt` (additive).
  `express.json` 600kb→8mb (full-year snapshots).
- **Recovery-drill finding (no DB wiped):** `/ledger/import` would DROP 6/421 rows — the
  `*-DESK_DONE` completion rows carry **0..100** percentages but import clamps worksheet scores to
  0..1. That's WHY restore is a separate faithful path. Proven: import 415/421, **restore 421/421**.

### B. CLI + off-Supabase git mirror (`ab9679d`)
- `tools/verify-ledger.mjs` (verify + class report + `--rebuild`→`/admin/restore`),
  `tools/append-anchor.mjs`, `tools/mirror-ledger.yml` (template).
- Private mirror repo **`robjohncolson/apstats-grade-mirror`** created; daily Action + secrets
  (`ROSTER_URL`, `ROSTER_TEACHER_SECRET=apteacher2627`) set; seeded with today's snapshot + ANCHORS.md.
  **⚠ the scheduled Action WON'T REGISTER on GitHub yet** (new-repo Actions indexing lag; dispatch
  404s — needs a one-time visit to the repo's **Actions tab** in a browser). The local nightly task
  (D) is the reliable automation; the manual backfill proved the pull→store→anchor loop.

### C. Teacher UI — Dashboard card + Desk 1-click (`d6873cf`, `5a2044f`)
- `teacher-dashboard.html` **"Grade Backup & Recovery"** card: Download backup (saves + auto-verifies),
  Verify a file, Restore (behind a typed `RESTORE` + confirm). Reuses teacher-secret + fetchJson/postJson.
- Desk **Teacher menu → 💾 Download Grade Backup** tile (`_TEACHER_TOOLS`): one click, NO key typing
  (uses the teacher's session Bearer token — `requireTeacher` accepts it). Saves + verifies.

### D. Local nightly backup + REVIEW digest (`5bdd60c`)
- `tools/nightly-backup.mjs` + Windows Task Scheduler job **"APStats Grade Nightly Backup"** (daily
  10pm; proven `LastTaskResult=0`). Each night: pull → save (`C:\Users\rober\grade-backups\snapshots\<date>.json`
  + `latest.json`) → verify → **DIFF vs last night** → write `review-<date>.txt` (per-student "what the
  kids did since the last backup") → append `ANCHORS.md`. Config (rosterUrl/teacherKey/backupDir) is in
  LOCAL `grade-backups\config.json` (NOT committed). Proven: caught +4 new items / 1 student vs the AM snapshot.

### Proven live
`/admin/snapshot` (with `apteacher2627`): **31 students / 425 records / all signed / epoch OK / VERIFIED**.
The teacher's downloaded `grade-backup-2026-06-29.json` re-verifies. Spec: `GRADE_LEDGER_DURABILITY_SPEC.md`.

### E. NIGHTLY REVIEW — **SPEC'D, NOT BUILT** (`NIGHTLY_REVIEW_SPEC.md`)
Teacher Desk surface to review recent work, mark **SEEN** (item/session/day), **comment**, award **1 candy**
(1/student/day, idempotent), **toast** the student; student sees **👁 seen + 💬 comment** in *My Ledger*.
Reviews are **signed** (`t:'review'`) → flow through snapshot/verify/restore + nightly digest. Grounded hooks:
candy is effort-only today → grant via a `doge_ledger` `review_award` + `candy_given`; notify reuses
`POST /teacher/nudge`→`_showNudgeToast`; student work shows in *My Ledger* via `/ledger/student`; menu badge
reuses `menu-nudge-badge`; **key on `ledger_id`**. Includes prioritized queue (FRQ/low-score/appeals first),
editable comment templates, unseen-count menu badge, "not reviewed in N days" flag, accountability trail.
**4 phases** (server → teacher Desk → student wallet → durability). **NEXT: Phase 1** = migration `review_marks`
+ `issueReviewReceipt` + `GET /class/review-queue` + `POST /class/review` (seen+comment+signed+candy+notify) +
augment `/ledger/student` + tests.

### s29 remaining / next
- **Build NIGHTLY REVIEW** (Phase 1 server first — self-contained, testable).
- **Destructive recovery drill** against a STAGING Supabase (the durability spec's "done bar"; never run —
  needs the user to provision staging; the dashboard/CLI make every step one action).
- **Mirror Action registration** (one-time GitHub Actions-tab visit) OR just rely on the local nightly task (working).

### s29 artifacts
`GRADE_LEDGER_DURABILITY_SPEC.md`, `NIGHTLY_REVIEW_SPEC.md`; `roster-server/{admin-snapshot,admin-restore,
snapshot-verify}.js`, `receipts.js`(+`issueEpochReceipt`,+`stringifyResponse` export), `ledger-db.js`(+`recordedAt`),
`server.js`(+mounts,8mb); `tools/{verify-ledger,append-anchor,nightly-backup,mirror-ledger}`; mirror repo
`apstats-grade-mirror`; local `C:\Users\rober\grade-backups\` + scheduled task "APStats Grade Nightly Backup".

## ⏭ SESSION 28 (2026-06-25/26) — GUESTS RETIRED everywhere + teacher-trust fixes (view-as, worksheet revise, AI coach)

Five threads, all SHIPPED + PUSHED. Tests green throughout: **root 7529/7529, roster-server 1076/1076, cr 1515/1515**. fa `5f19f54`→`ce0eeeb`; cr `788b04d`→`dd165b3`. The user's unrelated `max_tokens` key-rename WIP in cr `server.js` was kept OUT of every cr commit (isolated each time: revert the 2 hunks → commit own paths → re-apply) and remains uncommitted.

### A. GUESTS RETIRED — no one reaches a student surface without a login (fa `2e79244`, cr `1d31f14`)
Teacher: "every time I see a guest I get uncomfortable… disable guests period." Decisions: **KEEP self-signup** (off-roster students self-create a REAL-NAME account), and **LOCK the study guide too**. Mapped every guest door (9-agent audit) then closed them. **Root cause of "I keep seeing a guest" was NOT just the wall** — the Desk BOOT auto-connects presence (`DogePresence.connect()` ~L19347) and, signed-out, announced itself as `Guest_…` to everyone. So the fix touched the PRESENCE layer, not only the wall:
- Desk: `_deskAccessGranted` → `return live || teacher` (guest term dropped); `_nfGuestSignIn` + the dial "I'm not on the list" link route to SELF-SIGNUP (`_nfCreate`); `DogePresence.getUsername` has NO guest fallback (roster or null); `connect()` early-returns without a real identity; `_mountClassroomBoard` no longer mounts a guest avatar; boot evicts a stale `apstats_guest_active`; new `_deskPresenceResync()` rejoins presence on each sign-in (3 paths) so REAL students still appear.
- 69 worksheets: removed the wall off-ramp line via `scripts/wire-remove-guest-offramp.mjs` (EOL-preserving; the line was NOT in the old wire-signin-wall script — edit live files).
- `railway_client.js`: evict the stale flag on load + `_apGuestActive()`→false (kills the "Working as guest" banner that else painted z-index 100000 OVER the new wall); no guest peer-sync attribution.
- study guide: NEW sign-in wall (`#sg-signin-wall`, was wide open).
- cr `js/auth.js`: removed "Continue as guest" link/handler; `acceptUsername` never re-sets the flag. cr `server.js`: WS `identify`/`classroom_join` reject `/^Guest_/i` (belt-and-suspenders vs stale tabs).
Contract: `tests/no-guest-mode.test.js` (BOTH repos). Adversarial review fix-first → the one real finding (stale banner over the wall) fixed. **Dead-but-inert guest leftovers KEPT** (flag permanently evicted so they never fire): Desk `_deskGuestOk`/`getGuestIdentity`/"Guest:" chip/`openGuestPass`+"My Guest Pass"/`_studentNudgeGuestAlias` (guest teacher-chat now dead); worksheet `restoreSavedUser`/`getUsername` guest branches; roster-server `/student/nudge-history-guest`; cr `logGuestSession`/`/api/guest-log`/`/api/guest/reconcile` (KEEP reconcile until any legacy guest work is migrated). Memory: `project_guest_mode_retired.md`.

### B. Worksheet "you can revise anytime" hint — all 69 (fa `5254128`)
A student asked how to "redo" the 1.2 worksheet. Worksheets are FULLY revisable (inputs never lock; visible ↺ Reset; reopening restores prior answers) — but a completed lesson greys out on the Desk and READS as locked. Added a calm yellow hint under the action buttons of all 69 via `scripts/wire-revise-hint.mjs` (idempotent, EOL-preserving): "Already did this one? … change any answer + Check again (no need to Reset); ✨ Grade with AI only RAISES; sign in so changes save." `tests/worksheet-revise-hint.test.js`. **Grade semantics (durable):** plain Check = LATEST-answer-wins per blank (engine pre-dedups to latest-per-item); "Grade with AI" = ONLY-ever-raises. **Worksheet view-as is teacher-gated** (`_viewAs = !!(_sid && rosterClient.current().role==='teacher')`) so a student CANNOT enter read-only mode. Memory: `project_worksheet_revision_semantics.md`.

### C. VIEW-AS grade-cache bug — it was showing the TEACHER's own grades (fa `8e76195`)
Teacher viewing a student (`?viewAsUserId=`, dashboard → "view as student") saw their own 77% quiz flicker under the student's banner ("no answers but 6%"). ROOT: the offline grade cache (`apstats_grade_cache_v1`, OFFLINE_MODE) is documented "live-only in view-as" but `_gradeCacheKey()` only guarded the WORKSHEET global `__VIEW_AS_STUDENT_ID__`, not the Desk's `_viewAsContext()` — so on a slow/offline `/teacher/student/:id/grade` fetch the Desk restored the TEACHER's cached grades (and the write-through polluted the teacher's cache with the student's data). FIX: `_gradeCacheKey()` also returns null when `_viewAsContext()` is active → live-only; grade numbers stay blank ("—") until the student's LIVE data loads. `tests/desk-viewas-grade-cache.test.js`. Memory: `project_viewas_grade_integrity.md` — also documents: `_deskIsTeacher()` returns FALSE in view-as so gates evaluate as the STUDENT; the AUTHORITATIVE per-student grade is the teacher DASHBOARD class gradebook (`/class/grades`, server-side, no impersonation), not view-as; the quiz is a SEPARATE track from the lesson tile's "X% done" Cws.

### D. "Why so low?" AI COACH — no PC-pushing before fall + surfaces the flashcard gate (fa `ce0eeeb`, cr `dd165b3`)
Teacher, viewing as a student who did worksheets but no flashcards: the coach said "your biggest bottleneck is the PC track at 0% — get it above 40%" (Progress Checks aren't open until ~fall = impossible) and never mentioned the flashcards (the actual progression gate). 3-agent end-to-end map → 3-layer fix, all in the DATA fed to the model (not model-wrangling): (1) `roster-server/lesson-grade.js` computeQuarterV3 returns **`pcDue`** (additive; disambiguates pcAvg=null "not open" vs "scored 0"). (2) Desk `_buildCoachContext` forwards `pcDue` + builds **`ctx.flashcardGate`** (worksheet-done-but-flashcards-owed lessons, same signals as `_isLessonComplete`) + `_renderCoachPanel` renders a "pass flashcards to 80% to complete + unlock" line. (3) cr `server.js` `buildCoachFacts`+`COACH_SYSTEM_PROMPT`: when `pcDue===false && pcAvg null` → "PC NOT OPEN YET" + drop PC-deficit framing; emit a "NEXT-STEP GATE" line; rules (never push PC when not open; flashcards = completion/unlock gate framed NOT as a grade jump; affirm a strong grade vs inventing a bottleneck; don't tell students to re-submit undone work). **Cross-version-safe:** cr `_pcNotOpenYet` only fires on EXPLICIT `pcDue===false` so an old cached Desk falls back to prior framing (can't wrongly suppress real PC advice in the fall). Adversarial review: SHIP, 0 must-fix. Tests: `roster-server/tests/lesson-grade-v3.test.js` (+pcDue), `tests/desk-why-so-low.test.js` (+flashcardGate), cr `tests/coach.test.js` (+behavioral `buildCoachFacts` run). Memory: `project_ai_coach_pc_flashcard_fix.md`.

### ⚠ s28 gotchas / corrections
- **⚠ CORRECTION to s25's "blooket grade-INERT":** Blooket IS a 10% **mean-of-recorded** slice of the Work track (`lesson-grade.js` ~L1018 passes `blooketAvg` into `workAvgV3`); a MISSING blooket is renormalized away (NOT counted as 0), which is why a no-flashcard student's Work can still be 100%. Its real teeth are the completion/unlock GATE; the coach frames it as the gate, not a grade lever (an 80% flashcard could even slightly LOWER a 100%-Work student — accepted, per `project_blooket_necessity_decision.md`).
- **GRADE vs PACING vs the gate (all internally consistent):** the dashboard Pacing Overview (`teacher-dashboard.html` `_pacingDoneCount`) counts a lesson done only when worksheet>=60 AND blooket>=80 (server `/class/grades`) — so a kid who does worksheets but skips flashcards shows "Behind" while his GRADE (which renormalizes the missing blooket away) is fine. Both correct by their own definition. Quarter grade counts lessons DUE-BY-TODAY (a future-due lesson's low worksheet doesn't pull it down yet).
- **cr `max_tokens` WIP:** the user has an uncommitted `maxTokens`→`max_tokens` key-rename in cr `server.js` (a functional no-op per review). ISOLATE it out of every cr commit.
- Optional coach follow-ups (review shouldConsider, NONE blocking): gate the "Work below 40% penalizes" prompt NOTE behind `pcAvg!=null`; flashcardGate hardcodes 60/80 + has no due-by-today filter (a worked-ahead lesson can appear); flashcardGate reads only synced scores + can overlap `ctx.blooket.todo` (optional dedupe).
- Worksheet `#aggregateDrawer` STILL has no Esc (carry-over from s21); CLAUDE.md "Esc closes drawer" remains STALE.

## ⏭ SESSION 27 (2026-06-22) — OFFLINE MODE end-to-end (both repos) + feature-audit tracker closed

Two big threads, both SHIPPED + PUSHED (fa `d1ab9a6`→`5f19f54`, cr `2d3d6f3`→`788b04d`). Tests green: **root 7506/7506, roster-server 1076/1076, cr 1499→1501**. The 6 long-standing "pre-existing onboarding failures" are now FIXED.

### A. FEATURE AUDIT closed (`d1ab9a6`)
Continued the in-flight `docs/feature_user_story_status.tsv` audit (62 → **72 rows**, F001–F072). Ran a 9-slice gap-scan workflow (per-candidate adversarial verify) → **10 confirmed coverage gaps added F063–F072** (AI reflection grading + enriched pass, appeal system, class answer-distribution drawer, stale-tab update nudge, sound toggle, avatar popover + self-emote, candy poke, sealed-transcript export, proto-git commit chain, study-guide scoreboard). New tests for the 3 that had none: `roster-server/tests/commits.test.js` (real `buildCommits` unit test), `tests/remaining-feature-contracts.test.js` (F070/F072 source pins). **Durable flake fix:** roster-server had NO vitest config → 2 bcrypt tests timed out at the 5s default under parallel load → added `roster-server/vitest.config.js` (`testTimeout:15000`, lockstep test) → robust **1076/1076**. **Evidence-integrity fixes in the TSV:** 17 rows cited the dead `wsx.js` → repointed to `ap_stats_roadmap_square_mode.html`; F060 wrong path; dropped 5 brittle generated-`state/*.json` refs. The 6 onboarding fails were fixed by the in-flight Desk edits (create-account link + first-time fallback + `updateUserRoleUI` adjacency) which I verified sound + committed.

### B. OFFLINE MODE — full initiative, all phases (spec `OFFLINE_MODE_SPEC.md`)
Teacher decisions locked: **both** delivery modes (USB pack + PWA), **everything** offline (worksheets+Desk+study-guide+trainer+quiz), **video bundled** full-quality. The whole loop: do work offline → it's captured → export one JSON → teacher imports → grades land.
- **Phase 0 spine** (`dc06782`/`e7fe032`): `offline-queue.js` (`window.OfflineQueue` — IndexedDB w/ in-memory fallback, dedup/latest-wins, `toBundle`, `isOffline`); wired into `gradebook-client.js` (`record()` captures to the queue on a baked `OFFLINE_MODE` OR an UNREACHABLE fetch — NOT on 401/server; `reason` whitelist preserved + additive `queued:true`; read-only/view-as hard-guarded; `syncOfflineQueue()` + an `online` auto-drain); `scripts/wire-offline-queue.mjs` codemod loaded it across all **69 worksheets** (+ Desk + study guide, EOL-preserving, idempotent); **`POST /ledger/import`** (`roster-server/ledger-import.js`, teacher-gated, idempotent on student+source+item+attempt, evidence_tier `practice`, no migration); `offline.html` (student "Export my work" → JSON download + "Sync now"); `teacher-offline-import.html` (drag-drop bundle → import; LOCAL-ONLY, never linked publicly).
- **Phase 1 pack** (`1738e5c`/`52925b0`): `scripts/build-offline-pack.mjs` assembles `offline-pack/` (everything + transcripts + quiz app + trainer + `offline-config.js` injected first into every HTML) behind a **one-click launcher** (`Start-Offline.cmd` → `py/python -m http.server` → serves from **localhost** = single origin, dodging the `file://` per-file-storage trap; `serve.mjs` Node fallback). `--identity '{…}'` bakes a ready `apstats_roster.v1` session (synthesized `offline-<sid>` token) so the pack opens already signed in. **Desk progress cache** (§4.B): `renderDoNowGrades` write-throughs `/grade` to `localStorage apstats_grade_cache_v1:<sid>` and restores it ONLY on a thrown (offline) fetch — so the offline Desk shows grade pills/calendar greying; never in view-as.
- **Phase 1b video** (`4d1de30`/`a61c4af`): `scripts/fetch-offline-videos.mjs` downloads the lesson videos from each lesson's **Google-Drive `altUrl`** in **PURE NODE (no yt-dlp)** — handles the large-file confirm-form flow (`drive.google.com/uc` → parse `drive.usercontent.google.com` form → stream), resumable via `media/.downloaded.json`. Desk RESOURCES ∪ cr `data/units.js` = the SAME 144 Drive ids. `offline-video.js` resolves a lesson URL → the local file via `media-manifest.json` and plays it in an Esc-closable `<video>` overlay; the Desk render prefers the local copy in `OFFLINE_MODE`. **✅ FULL PULL COMPLETE: 144/144, ~25 GB in `media/` (gitignored), 1 gap = topic 2-5 (YouTube-only → transcript fallback).** Live-validated end-to-end (manifest → resolver → file).
- **Quiz app** (cr `2d3d6f3`): the quiz feeder records via `gradebookClient.record`, so cr's `gradebook-client.js` got the same offline wiring + `offline-queue.js`. The pack serves the quiz under the SAME localhost origin → its records land in the SAME shared queue → exported/imported with everything else (`335c4c4` bundles the quiz with `OFFLINE_MODE`).
- **Phase 2 PWA — LIVE on both repos** (fa `9f9ec0c`/`c4e9cbe`/`5f19f54`; cr `9326b7c`/`6c93942`/`788b04d`): `sw.js` (NETWORK-FIRST navigations = always fresh online / cached offline; cache-first same-origin assets; PASSTHROUGH for cross-origin/APIs/non-GET/`version.json`; versioned cache purged on activate; background-sync drain; documented KILL SWITCH). cr uses a DISTINCT cache prefix `apstats-quiz-pwa-` (shared github.io origin). `pwa-register.js` registers the SW + exposes `window.PWAInstall` (`canInstall`/`install`). `manifest.webmanifest` + `icon.svg` + **`icon-192.png`/`icon-512.png`** (Chrome installability needs a ≥192px PNG — generated by `scripts/gen-icon.mjs` via pngjs, no rasterizer on this host). **Explicit in-app install:** Desk File-menu "Install App..." (replaced the "Save to Floppy..." joke item) → `_pwaInstall()`; cr a bottom-left "Install app" button — both trigger the browser prompt or show manual instructions (iOS Safari / already-installed). `bump-build.mjs` now stamps `sw.js`'s BUILD in lockstep with `APP_BUILD`/`version.json`.

### C. DECISION — distribution machinery NOT built (YAGNI, teacher-confirmed)
The 24 GB-pack / USB-handout / per-unit / BitTorrent question → **decided not to build it.** The student-with-zero-internet-for-days probably doesn't exist; the REAL case (a connection that blips mid-worksheet/quiz) is fully handled by the queue + auto-sync + PWA (all live). The `fetch-offline-videos.mjs` + `build-offline-pack.mjs` tools **sit dormant** in the repo (zero ongoing cost) if a truly-offline kid ever appears. The 25 GB `media/` doubles as a **backup of the teacher's Drive videos** (those `drive_link` URLs can expire).

### ⚠ s27 gotchas / notes
- **`media/` + `offline-pack/` are gitignored** — the 25 GB never enters git.
- **SW staleness:** the SW serves assets cache-first, so a Desk/quiz deploy you want the ACTIVE SW + open tabs to pick up MUST run `node scripts/bump-build.mjs` first (now stamps `sw.js` too → new cache → activate purges the old) — otherwise returning visitors get stale `pwa-register.js`/`manifest`. (This bit us once on the install-fix deploy; fixed with a bump.)
- **PWA install ≠ the 24 GB.** The PWA caches only the app shell (a few MB); video is separate (streamed online, or in the USB pack). Don't conflate.
- **Topic 2-5** has no Drive copy (YouTube only) → no offline video; drop an `.mp4` in `media/` + one `media-manifest.json` entry if ever wanted.
- Cross-repo: cr changes staged **own-paths-only** (it has ~56 unrelated dirty files); cr's prior "8 pre-existing failures" are gone (1501/1501).

## ⏭ WORKING-TREE SNAPSHOT (2026-06-21, post-s26 — SUPERSEDED by s27 above; s27 committed extensively) — uncommitted GitNexus tooling churn + inert scratch

Examined the uncommitted diff (HEAD still `5f3a69a`; **none of this is AP-Stats feature work**):
- **REAL change — `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`:** a GitNexus package upgrade changed two behaviors. (1) The PostToolUse hook is now **notify-only** — it DETECTS index staleness after `git commit`/`git merge` and tells the agent to run `analyze`, but **no longer runs `analyze` itself** (avoids a ≤120s block + KuzuDB-corruption-on-timeout risk). (2) `analyze` now **PRESERVES embeddings by default**; new `--drop-embeddings` flag to opt out — **inverts** the old "a bare `analyze` deletes embeddings" gotcha. **⚠ STALE-DOC: the workspace `Projects/CLAUDE.md` still says "a PostToolUse hook handles re-indexing automatically after git commit" — it does NOT anymore. Run `npx gitnexus analyze` yourself when a GitNexus tool warns the index is stale** (the project `CLAUDE.md`/`AGENTS.md` no longer carry that claim — the auto-regen below dropped the section it lived in).
- **Auto-regen churn (safe to commit OR discard):** the gitnexus-managed blocks in `CLAUDE.md` + `AGENTS.md` re-identified the project `follow-alongs (2228 sym)` → **`apstats-live-worksheet` (22021 sym / 30660 rels / 300 flows)** and dropped the boilerplate sub-sections (When Debugging/Refactoring, Tools Quick Ref, Risk Levels, Self-Check, Keeping-Fresh). `GRADEBOOK_TAGGING_AUDIT.md` + `data/skill-map.js` are **timestamp-only** regens (no content delta).
- **Untracked scratch (inert, NOT wired into any shipped surface):** Schoology **fine-grained per-lesson component-column** exploration — `tools/_periody_*.py`/`.json` (create FA/Quiz/Blooket weighted columns for 1.1/1.2 in MP4 + grade 3 mapped students for layout review), `_delete_coarse.py`/`_verify_periody.py`, `_probe_periodb.py` (READ-ONLY Period B UID probe), `_rig_diag.py` (CDP delete-by-nid rig test) — all throwaway ("deleted after use"); `state/grade-*-prompt.txt` (s13 grade-sim agent prompts); `blooket-build/` (bank/pool JSON + `assemble.mjs` for topics 4.7-4.12/5.1/5.2 — the Blooket-backfill build artifacts); `pico_sprite1.txt` (pico-park sprite-atlas regions); `u1/attach-failure-u1l3-v1.png`, `volicon.webp`; `wsx.js` (stale 4888-line Desk JS extraction, loaded by NO HTML — deliberately left per s25). Cleanup is optional; nothing here blocks a deploy.

## ⏭ SESSION 26 (2026-06-21) — TEACHER CHAT reaches guests; cr typed-sign-in roster dropdown

**✅ GUESTS CAN READ + GET NOTIFIED OF TEACHER MESSAGES (fa `6f4db3c` Desk+endpoint, `8d03905` case-fix → roster-server auto-deploys + GH Pages).** Teacher: "I sent a message to a guest, logged back in as that guest, saw NO notification — and don't know where the messages are." ROOT: the chat is built on the roster TOKEN; a guest has no token, so `/student/nudge-history` 401'd. The teacher's message WAS stored in `nudges_log` (the `/teacher/nudge` recipient list has no roster-membership check) but was unreadable. Teacher chose **"let guests receive messages too"** (reply stays roster-only). Built:
- **roster-server `GET /student/nudge-history-guest?guestUsername=Guest_X`** (NO auth; `Guest_*` aliases only — a real student MUST use the token endpoint). New `nudge-db.js::listConversationGuest` returns just the teacher→guest rows (guests can't reply). 42P01→503, no-teacher→`{ok:true,rows:[]}`.
- **Desk:** `_studentNudgeGuestAlias()` (gates on `apstats_guest_active==='1'` + a `Guest_` alias from `getGuestIdentity`) + `_studentNudgeFetch(limit)` (token endpoint OR the guest-alias endpoint). `_studentNudgeCanPoll()` now allows an active guest (never a teacher), so the EXISTING always-on poller + unread-badge + "Message teacher…" inbox all light up for guests with **zero new wiring** (badge = `direction:'teacher'` rows newer than the `lastSeen` localStorage stamp). A guest who tries to REPLY is steered: "Sign in with your name to reply so your teacher knows who you are."
- **⚠ CASE TRAP (fixed in `8d03905`):** the guest avatar mounts **Title-case** (`getGuestIdentity` → `Guest_Berry_Sloth`, Desk L19173) and flows verbatim into the cockpit recipient; the server **never lowercases** recipients, so `nudges_log` stores the recipient Title-case. The first cut lowercased the alias + matched with case-sensitive `.eq.` → **never matched, guest saw nothing.** FIX: `listConversationGuest` now matches BOTH the verbatim alias AND its lowercase form (de-duped), so either storage case is found and a future presence canonicalization can't orphan the thread. (The summary's "teacher stores guest recipients lowercased" assumption was WRONG — verified against the board-mount path.)
- Tests: roster-server `student-dm.test.js` +5 guest tests (variant-match + de-dup + reject-non-guest + reject-missing + no-teacher); new `tests/desk-guest-chat.test.js` (4 source pins); `desk-student-dm.test.js` harness updated to inject the new helpers (the inbox now routes through `_studentNudgeFetch`). Bumped the Desk build stamp (`2026-06-21-xk2r`) so open tabs pick up the change. Suites: roster-server green modulo the known `signup-claim` brute-force-lockout timing flake (passes in isolation 43/43); root = the SAME 6 pre-existing onboarding failures + the flaky `gradebook-feeder-wiring` "empty blank" (passes in isolation 98/98).
- **⏭ NOT built:** instant push for guests (they rely on the ≤poll-interval badge; fine). guest→real-student message migration on sign-in (a guest who later signs in won't carry the teacher's guest-addressed messages into their roster thread — separate from the Guest Pass `?claimGuest=` reconcile).

**✅ cr TYPED SIGN-IN ROSTER DROPDOWN (Codex `/goal`, cr `ea985cc`+`58430cd` → cr GH Pages; ~23m runtime).** Teacher: the cr typed-username box had no roster dropdown like the Desk. Codex built `curriculum_render/roster-dropdown.js` (`window.RosterDropdown.attach(input,{onPick})` — fetches `/roster/section/PeriodX` no-store, filters by realName||username, mousedown-pick fills the username) + wired it onto the cr "Type my username instead" form. Spec was `TEACHER_CHAT_BUILD.md` companion / dispatched as a `/goal`. **Verify live + that nothing regressed** (it's Codex's; cr suite baseline = 8 pre-existing failures).

## ⏭ SESSION 25 (2026-06-20) — repo hygiene + presence-disagreement FIX SHIPPED; grade behavior clarified

**Two frontend-only commits pushed to `master` (GH Pages republishes; no backend deploy):**
- **`9a9ae93` — removed edgar U6 + MIT OCW worksheets** (separate tracks, not AP Stats; already rollout-excluded by `^u\d+_lesson.+_live\.html$`). Deleted the 3 worksheets + 3 grading-prompt JS + 2 Blooket CSVs; scrubbed refs in TOC.html / index.html / roadmap-data.json (`6.review`→edgar) / CLAUDE.md; regenerated `data/skill-map.js` + `GRADEBOOK_TAGGING_AUDIT.md` (now 69 worksheets). Remaining edgar/MIT mentions are benign (orchestration logs, spec-doc examples, a `railway_client.js` presence-surface mapping that now simply never matches).
- **`0555871` — Desk roadmap network resilience.** `loadRegistry()` rewritten: 14-day localStorage cache of the registry + Supabase overlay (`apstats_roadmap_*_v2`), 5.5s fetch timeout, `#roadmap-status` offline/cached/degraded banner + online/offline refetch, `.lesson-coach` block. New `tests/roadmap-resilience.test.js` (7, green). **Presence/avatar/grade code UNTOUCHED** (verified by diff grep — highest Desk hunk ends ~L18203; presence/init code is far below). Also drops the baked edgar `6.review` registry entry.

**Cleanup:** deleted the accumulated dotted agent-orchestration scratch (`.session*`/`.batch-*`/`.codex-*`/`.verify-*`/`.ai-tutor-*.result.md`/preview PNGs/`__pycache__`) and gitignored those families so `git status` stays clean. `wsx.js` (stale Desk extraction) deliberately LEFT.

**Tests:** root **7389 pass / the SAME 6 pre-existing onboarding failures** (desk-gating-fixes / desk-self-signup / desk-user-role / desk-signin-wall — the user's parallel onboarding refactor, UNCHANGED). NOTE: the `desk-user-role.test.js:72` failure pins a `loadRegistry();…updateUserRoleUI` ≤200-char adjacency that the cross-tab `storage`-listener block (init site ~L18740) breaks — it is NOT caused by the resilience refactor (which doesn't touch the init site).

**✅ RESOLVED (teacher's actual concern — and it was NOT a Codex regression):**
1. **PRESENCE DISAGREEMENT (Desk) — ROOT-CAUSED + FIXED.** A slightly-greyed avatar was clickable (name + actions) but absent from the top-right 🐶 "Online Now" list. A 7-agent investigation (4 readers → synthesize → adversarial verify) found **two presence registries with mismatched eviction clocks**: the global doge feed drops a departed kid after `PRESENCE_TTL_MS=45s`, but the avatar room kept them as a greyed `online:false` ghost for `IDLE_GC_MS=45min` (and the hit-test ignored `online`, so the ghost stayed clickable). **The avatar was the stale ghost; the doge list was right.** Confirmed NOT a recent refactor — `5d7fcfd` (sprite-hue) doesn't touch presence; the 45min-vs-45s split predates it. **FIX (both shipped):** cr `3ba6401` — `classroom.js` `sweep()` now GCs a true-disconnect (zero-socket) member after a new `OFFLINE_GC_MS=60s`, keeping the 45min `IDLE_GC_MS` only as the zombie-socket backstop + the heartbeat-revive path untouched (+2 regression tests). fa `5c230c3` — `DogePresence.connect()` now sends a 20s `heartbeat` (server just bumps `lastSeen`, no re-broadcast) so a backgrounded Desk tab doesn't age out of Online Now while its avatar stays (the inverse case) (+2 source pins). cr classroom suite: 7 PRE-EXISTING doorway-vote failures only (unrelated); root suite 7389/6-pre-existing.
2. **GRADES — 100% despite no Blooket — CLARIFIED, no change.** Traced the live `roster-server/lesson-grade.js`. Key facts surfaced to the teacher: (a) **until PCs exist (~September), `combineV3` SHORT-CIRCUITS on null PC and the grade IS just the Work track** (`if (pcAvg == null) return workAvg`) — so Blooket (10% of Work) already counts + is visible TODAY. (b) The `max(PC, Work)` masking is purely a Sept+ concern; the floor is **40%** (`V3_GATES.floor=0.40`, NOT 60%) — a great-PC kid with Work <40% gets `max(0.7·pc,0.7·work,mean)` (~capped 70), so the floor punishes coasting. (c) The grade is computed LIVE but the denominator is **due-by-today**, so it DOES drop as deadlines pass for un-done due quizzes/PCs (teacher's "100% now, lower at the deadline" intuition is correct — for the quiz/PC tracks; Blooket stays masked once PCs arrive). (d) The Desk flashcard records a real **accuracy** score (best-wins, `_blooketCommit`), ≥80 opens the gate — the gate already has teeth. **Teacher decided: leave the grade as-is** (Work=grade now + the 40% floor motivate); honors `project_blooket_necessity_decision.md`. Optional un-built follow-on the teacher may want: per-lesson Blooket **visibility** surfacing in the gradebook/Do-Now (display-only, no grade-math change).

**✅ cr QUIZ-APP SIGN-IN now matches the Desk (cr `b2a25cd` → GH Pages).** The cr "Gradebook Sign-In" was a weak raw username+password box. Replaced as PRIMARY with a roster-aligned **name-finder dial** identical to the Desk's (↑ ← → ↓ binary-narrow to your name, then a password step). New self-contained `curriculum_render/name-finder.js` (`window.RosterNameFinder.open({rosterUrl, signIn, onSuccess, onTypeUsername})`, brings its own CSS — no System-7 dep). **Key enabler:** all students are in the universal **`PeriodX`** section + `/roster/section/PeriodX` is public/no-auth, so cr (no period context when signed out) fetches that roster. **BOTH cr sign-in surfaces now open the dial:** the ON-LOAD identity screen `js/auth.js::showRosterSignIn` (the one students hit when cr loads without a session — the `#questionsContainer` welcome form; this was the teacher's actual complaint, fixed in cr `38fa4d8`) AND the FAB "🎓 Gradebook Sign-In" modal `index.html::showRosterSignInModal` (cr `b2a25cd`). On the on-load screen the dial opens ON TOP of the existing typed form (kept as fallback + its guest off-ramp); onSuccess = `acceptUsername`. The typed form is KEPT on both (reached via "Type my username instead", used when already signed in / roster-fetch fails). ⚠ `showRosterSignInModal` (FAB) ≠ `showRosterSignIn` (js/auth.js on-load) — two separate functions; the user's pain was the latter. Shared `applyRosterSignInResult` (identity mirror + sprite-hue + status) so the form + dial can't drift. **Desk's own `_nf*` UNTOUCHED** (its onboarding refactor is in-flight) — could adopt the shared `name-finder.js` later to kill the duplication. Tests: `tests/name-finder.test.js` (13, vm + source pins; cr is `environment:'node'`, no jsdom); cr frontend suite back to its **8 pre-existing failures** (classroom doorway-vote + redox-chat, unrelated). **Teacher: verify live** — on the quiz app, the 🎓 Gradebook sign-in should now show the name dial. **Two follow-on fixes:** (a) **include EVERYONE** incl. the teacher — removed a `role!=='teacher'` filter so the dial is 1:1 with the Desk (cr `0793fa3`; "Robert Colson"/`date_tiger` is in PeriodX); (b) **FRESH fetch** — a just-enrolled student (e.g. Rubiat Rahman) didn't appear because the roster was CACHED (endpoint `Cache-Control: max-age=300`; the **Desk** also has a **1-hour** `ROSTER_CACHE_TTL_MS` localStorage cache). FIX: cr `defaultFetchRoster` uses `{cache:'no-store'}` (cr `9aa47bb`); the Desk's `openNameFinder` calls `_fetchPeriodRoster(period,{fresh:true})` → `_fetchSectionRoster(section,opts)` skips the localStorage cache + uses `no-store` (other callers keep the 1-hr cache — additive `opts` param, backward-compat). **The dial's narrowing was NEVER the bug** — a traversal sim over the real 31-name roster reaches all 31 incl. Rubiat (index 22, "Rubiat R."). Two `desk-roster-signin` pins relaxed for the new optional param + a fresh-fetch pin added. ⚠ name display is abbreviated "First L." (Desk behavior, teacher kept it) so multi-surname names look unfamiliar ("Angie Karina Gamez Oseguera"→"Angie O.") — NOT missing.

**✅ GUEST-LOGIN LOGGING (cr `4a80ee9` → cr Railway auto-deploys; ⚠ migration USER-RUN).** Teacher noticed a guest and asked "who is that / is Supabase capturing all guests reliably?" Forensics: the cr `answers` table only catches guests who SUBMIT an answer (found 3: `Guest_Date_Gecko`/`Kiwi_Heron`/`Mango_Turtle`, all the teacher's own testing — "dsfasd" gibberish + empties); a guest who logs on but never answers leaves **NO trace** because **cr presence (doge feed + Live Classroom registry) is IN-MEMORY only** (grep-confirmed: no persistence). So the answer was "no, not reliable." Teacher chose **log every guest login**. Built: `railway-server/server.js::logGuestSession(username,loc,event,section)` writes a `guest_log` row on a `Guest_*` `identify`/`classroom_join` (debounced 5 min/guest, fire-and-forget so a failure never breaks presence) + `GET /api/guest-log` (recent sessions, 503 until migrated). **Migration `railway-server/migrations/0001_guest_log.sql` = USER-RUN on Supabase** (`<AP_SUPABASE_PROJECT_REF>`): table + anon insert/select RLS (cr writes with the ANON key, same as `answers`). Until it runs, inserts no-op + the endpoint 503s (safe). `tests/guest-log.test.js` (6). **✅ MIGRATION RUN + LIVE-PROVEN 2026-06-21** — a WS probe + the live `Guest_Berry_Sloth`/`Guest_Mango_Turtle` (teacher) captured on the Desk. **Debounce fix `c015360`:** debounce was set BEFORE the insert → a guest who identified in the deploy-before-migration window got debounced without a row (42P01 fail); now `_guestLogSeen.delete(username)` on failure. A redeploy reconnects all clients → re-logs them. ⚠ left a `Guest_Probe_Verify` test row (anon has no DELETE policy; teacher: `delete from guest_log where username='Guest_Probe_Verify';`). ⚠ guest alias = random `Guest_<Fruit>_<Animal>` (localStorage `apstats_guest_identity`) — anonymous by design; guest→real-student mapping still needs the Guest Pass reconcile (`?claimGuest=` → `/api/guest/reconcile`).

**✅ DESK⇄cr "ONLINE NOW" AGREEMENT (fa Desk + cr `43c3468`).** Teacher: cr shows a user the Desk doesn't (`Guest_Mango_Turtle`). ROOT: both read the SAME global `presence_snapshot` but each **self-filters its own identity**; the teacher was logged in TWICE (Mango_Turtle on Desk + `Date_Tiger` on quiz) so each app showed the OTHER, hid self — **single-identity students already agree, NOT a student bug.** Teacher chose BOTH fixes: (1) **Desk shows self** — `DogePresence.renderDropdown` adds a display-only `.doge-dd-self` "(you)" row (distinct class so it stays OUT of `.doge-dd-item`, which drives candy/challenge + tests; `this.players` stays self-filtered), count `+1` → Desk is the complete superset. (2) **Periodic full resync** — cr `server.js` re-broadcasts the COMPLETE `presence_snapshot` to all clients every `PRESENCE_RESYNC_MS` (30s) so a client that missed an incremental `user_online/offline` self-heals (no stale-ghost/missing drift); both clients REPLACE their set on a snapshot → converge, no client change. Tests: fa `doge-presence-submenu` +2, cr `presence-resync.test.js` (2). ⚠ a diagnostic WS identify briefly flashes a phantom user in the feed (gone on the next 30s resync).

**✅ PRESENCE USERNAME CASE-DUP FIX (cr `946cd3c` → cr GH Pages, client-only).** Teacher saw "two Robert Colson" in the dropdown (`date_tiger` + `Date_Tiger`) + `olive_sloth` as an avatar but not in the dropdown. A 6-agent workflow + live WS capture: (1) **case dup** — cr identified to presence with the Title-cased `currentUsername` (`acceptUsername` Title-cases) while the Desk uses the lowercase roster username; the server keys presence by the RAW string → 2 entries for the same person. FIX (cr-client-only, low-risk; the workflow's server lockstep-canonicalization was "safe-with-tweaks" but risky on the live grade-adjacent server, so DEFERRED): `railway_client.js` `_presenceUsername()` prefers `rosterClient.current().username` (canonical lowercase, matches the Desk) for identify + heartbeat. Safe — cr self-filters are case-insensitive, Desk's getUsername is already lowercase, real-name lookup case-insensitive. `tests/presence-username.test.js` (2). (2) **`olive_sloth` avatar-but-no-dropdown** = a STALE pre-s18 cached Desk (auto-identify+heartbeat added s18 `6eb8b7c`) that joins the room but never identifies to doge → **self-heals on reload**, no code fix.

**✅ STALE-TAB UPDATE NUDGE (fa `a11fb6f`).** Durable fix for the stale-cached-client class (the olive_sloth root). Desk: `var APP_BUILD` + `_wireUpdateNudge()` polls `version.json` (no-store, every 5min + on tab refocus); when the deployed build ≠ the running `APP_BUILD`, a dismissible "🔄 new version available — Reload" banner shows. `scripts/bump-build.mjs` writes the SAME stamp to BOTH the Desk's `APP_BUILD` + `version.json` — **run `node scripts/bump-build.mjs` before a Desk deploy you want open tabs to pick up** (a test pins `version.json.build === APP_BUILD` = the no-loop invariant). `tests/desk-update-nudge.test.js` (3). **✅ cr QUIZ APP now has the same nudge** (cr `df936ab`): `version-check.js` (loaded by index.html) + `version.json` + `scripts/bump-build.mjs` + `tests/version-check.test.js` — same poll/compare/dismissible-banner + the `build===APP_BUILD` invariant. So BOTH surfaces self-update; **run each repo's `node scripts/bump-build.mjs` before a deploy you want open tabs to pick up.** (worksheets still don't have it — minor.)

**✅ TEACHER CHAT — Phase 1 SHIPPED (fa `3c295d3`); Phases 2-3 PENDING.** Teacher wanted "a persistent chat to reach out to students." **The whole backend ALREADY existed** — `roster-server/nudge.js`: `POST /teacher/nudge` (one student OR a list/section = broadcast, persisted, 280-char, delivery-tracked), `/student/nudge`+`/student/nudge-reply`, `/teacher/nudge-history`; the student sees it in the Desk "Message teacher…" modal (`_fetchStudentDmHistory` → `/student/nudge-history`, rows tagged `direction:'teacher'|'student'`). The teacher's Send button was just DISABLED. **Phase 1** un-disabled it: `teacher-dashboard.html` drawer "Send message" → a compose box (`#tsc-nudge-compose`) → `POST /teacher/nudge` for the open student OR (checkbox "whole class") every active PeriodX student (`_tscClassUsernames` via the public `/roster/section/PeriodX`); `_tscSendNudge` reuses `postJson`+teacher-auth, refreshes the thread. Teacher decisions: **per-student + whole-class broadcast; real-time + unread badge; surfaces = dashboard + Desk.** **⏭ Phase 2 (real-time + badge):** student Desk polls (or a cr-WS `nudge_notify` relay like `candy_gift_received`) → unread badge on "Message teacher" + refetch. ⚠ CROSS-SERVER: nudge data is on **roster-server**, the WS is on the **cr server** — instant push needs the teacher's client (the Desk has a cr WS; the dashboard doesn't) to send a lightweight `nudge_notify` over the cr presence socket after the roster POST; the content is fetched from roster-server (source of truth). Pull-poll for unread is the simpler near-real-time path. **⏭ Phase 3:** a "Message" compose action on the Desk's classroom/roster teacher view. Tests: `teacher-student-console-drawer` (nudge now enabled + send pins), `phase4-structure` allow-lists the additive `/teacher/nudge` POST.

## ⏭ SESSION 24 SHIPPED (2026-06-18) — Study Break 1v1 Tetris + stakes ROBUSTNESS pass (from a 5-lens audit)

**fa HEAD `8d9550f`. Specs `TETRIS_HARDENING_SPEC.md` (fixes) + the audit (`tetris-audit` workflow).** Teacher
asked "is the Tetris game solid?" → ran a 5-lens adversarial audit (23 agents): **single-player solid, money
SAFE (no theft, escrow always refunds), but the staked 1v1 multiplayer hung/desynced in imperfect networks.**
15 confirmed findings; hardened 13 (1 deferred). A 3-lens re-review of the fix diff = **0 blockers**.
- **MP-1/MP-4 (major):** `studyBreak._liveWs()` resolves the LIVE socket on demand (studyBreak reuses the
  Desk's DogePresence socket, which auto-reconnects as a NEW object → the cached `mpWs` went stale → outbound
  game traffic silently died, hanging the match one-sidedly). Used by `sendGameMessage` / `close()`'s
  `game_leave` / `showChallengeDialog` replies. The HTTP candy-resolve was never affected (money was safe).
- **SB-1 (major):** a garbage-burial topout set `gameover` with no `flashText`, so the 1v1 game-over CARD (the
  single scoring choke point `_studyBreakScoreGameOnce`) never rendered → the game wasn't counted, the series
  desynced, escrow stranded. FIX: `insertGarbage` now `this.flash('Buried!')` AND the draw branch keys on
  `mpState` not `flashText`.
- **SB-2/SB-3/F3:** `startMatch` early-returns over a live match (no orphaned escrow); `showChallengeDialog`
  auto-declines over a live match; `close()` ALWAYS nulls `mpState` + clears `this.countdownTimer`.
- **SB-4:** `sendGameMessage` stamps `msg.roomId`; `receiveGarbage`/`opponentKO`/`updateOpponentState` drop a
  mismatched roomId — guarded "present AND mismatched" so it can't break a relay that strips the field.
- **MP-3:** `_addIce` buffers ICE until `setRemoteDescription`, `_flushIce` drains on offer+answer, `.catch`
  on every `addIceCandidate`.
- **SB-1(core):** `LOCK_RESET_CAP=15` via `_resetLockTimer` — kills the classic infinite-spin stall.
- **z-order:** `launchMatch` closes the `_avatarMenu` popover (z400 over game z250).
- **F2 (roster-server → Railway auto-deploys):** a periodic unref'd `sweepStaleBets` timer (skipped under
  `NODE_ENV==='test'`) + a sweep on `bet/resolve` so abandoned escrow refunds even if betting stops.
- **MP-5 (now SHIPPED, `1ad4d4e`):** opponent-freeze watchdog + heartbeat. `_startHeartbeat` sends a periodic
  `sendGameState()` keep-alive (a relay-forwarded msg, not a bespoke ping a whitelisting relay might drop) and,
  while running, forfeits via `opponentLeft('timeout')` after 18s of opponent silence (`lastOpponentMs` stamped
  on all inbound). Money-safe: forfeit only ever REFUNDS (vanished peer never confirms / partition → disagree →
  refund). 1-agent adversarial review = SOLID, no theft path. `study-break-hardening` now 18 tests.
  **NO open Tetris task** — only the live two-student smoke test remains (the teacher's, when rested).
- **Tests:** `tests/study-break-hardening.test.js` (13, real `_liveWs`/`_resetLockTimer` + wiring pins),
  `study-break-stakes` pin updated. Root **7377 pass / the 6 pre-existing onboarding failures**; roster-server
  green (the lone `signup-claim` brute-force-lockout flake passes in isolation). **Teacher: still smoke-test a
  live staked 1v1** — the audit was static; nothing replaces two real students playing a best-of-3.

## ⏭ SESSION 23 SHIPPED (2026-06-18) — 1-bit black Mac speaker icon for the menu-bar sound toggle

**fa HEAD `8c28c05`.** Teacher: the upper menu-bar sound toggle was a colored 🔊/🔇 emoji — make it a 1-bit
black classic-Mac speaker so it stands out on the white System-7 bar. `#mac-mute` (line ~1846) now renders an
inline **black speaker SVG** via `_soundIconSVG(muted)` / `_renderSoundIcon()` / `_toggleSound()` (defined right
after the `MacSFX` object, ~13714). Two states: **on** = filled cone polygon + two right-opening wave arcs;
**muted** = cone + an ✕. Keyboard-accessible (role=button, tabindex, Enter/Space) + `aria-pressed`. `MacSFX` is
still a boolean mute (per-call volumes), so **volume LEVELS are NOT wired** — adding them needs a global volume
multiplier on `MacSFX` + `SFX` (the synth system) applied to every `play()`, then cycle high/mid/low/mute via
the wave-count (the artwork already supports it). `tests/desk-sound-icon.test.js` (6). Root **7364 pass / the 6
pre-existing onboarding failures**. **OPEN (offered):** (a) the Study Break in-game `#mute-btn` (line ~2259, SFX
system) still uses the 🔊/🔇 emoji — give it the same icon for consistency; (b) volume levels; (c) a truer pixel-art
1-bit speaker (the current SVG curves anti-alias slightly at 16px). NOTE: SVG can't be rasterized on this host
(no rsvg/magick/headless) — visual check is on the live URL.

## ⏭ SESSION 22 SHIPPED (2026-06-18) — self-click avatar → happy BOUNCE emote (replaces the s20 "open My Ledger")

**fa HEAD `1afff24`. Spec `AVATAR_MENU_SPEC.md` (AVATAR_SELF_EMOTE section).** Teacher: auto-opening My Ledger
on a self-tap (s20 `95d6e75`) felt "intense." Replaced with a light delight; My Ledger stays in the Apps menu +
desktop icon. **Picked a bounce, NOT a wave** — the mascot (`sprite.png`, 80×96 frames, 11 cols × 2 rows;
top row = right-facing, bottom = left mirror) is an **armless pink cat-blob**, so a wave is unnatural and would
need new art; a hop reads happy with ZERO new frames.
- **Board (`classroom-board.js`):** `PlayerSprite.playEmote()` sets a one-shot `_emoteMs` timer; `update()` ticks
  it; `render()` adds a render-space hop (`-|sin|·EMOTE_HOP_PX`) + decaying sway (pure cosmetic offsets, never
  touches vx/vy/physics). The mount handle exposes `selfEmote()` → bounces `spriteEntities[username]`.
- **Nano-banana hook:** `var EMOTE_FRAME = null` (top of the IIFE). Leave null → bounce the normal idle frame.
  To add a custom "cheer" pose later: draw it 80×96 / transparent / pixel-art / salmon-pink / feet on the existing
  baseline / right-facing, drop it into an UNUSED sheet column (e.g. 6) + its left mirror at col 6+11=17, then set
  `EMOTE_FRAME = 6`. The emote auto-poses on it mid-hop. (Teacher is experimenting with nano banana for this.)
- **Desk (`ap_stats_roadmap_square_mode.html`):** `_avatarSelfEmote(hit)` calls the board hop (SKIPPED under
  `prefers-reduced-motion`), plays `MacSFX` `wildEep`, and puffs a 🍬 (enriched with the live candy balance via the
  cached wallet fetch) + two ✨ DOM particles (`.avatar-emote-particle`, CSS float-up + reduced-motion fade) from the
  click coords. 600 ms debounce vs click-spam. `onAvatarClick` `isSelf` now routes here (was `openWallet()`).
- **Tests:** `tests/desk-self-emote.test.js` (6, real fns in jsdom), `classroom-board` +3 (playEmote/update timer +
  render/handle source pins), `candy-poke` pin updated (isSelf → `_avatarSelfEmote`). Root **7356 pass / the 6
  pre-existing onboarding failures** (+ the usual ~1–2 rotating flaky suites that pass in isolation — not this change).
  Frontend-only.

## ⏭ SESSION 21 SHIPPED (2026-06-18) — keyboard MODAL ESCAPE audit: every Desk content modal closes with Esc

**Spec `MODAL_ESCAPE_AUDIT.md`. fa HEAD `618317b`.** From the teacher: "make sure all modals can be escaped
with the keyboard — the day-material modal can't be." The Desk had a global Escape handler for the 6
`.app-overlay` System-7 windows + most other modals self-registered an Escape handler, but several CONTENT
modals had none. Added `_escCloseTopModal()` into the existing global Escape handler.
- **Now Escape-closable (were not):** `resource-overlay` (THE "material for the day" panel — clicking a
  lesson day), `donow-bump-overlay`, `dialog-overlay` (generic `showDialog`: lesson-locked / baseline /
  alerts), `bf-overlay` (Blooket flashcards — had nav keys, no Esc), `override-gate-modal` (teacher view-as),
  + the 4 QR/guest overlays (`guest-pass` / `reconcile-qr` / `verify-qr` / `big-qr`).
- **Design:** the net closes the TOPMOST visible gap modal via its OWN cleanup-aware close fn (a blanket
  `display:none` would leak, e.g. the Blooket nav keydown); the QR overlays have no cleanup → a direct hide.
  `_escVisible()` treats any non-`none` inline display as open (the QR overlays open as **`display:flex`**, not
  block). A **defer guard** returns early if a self-handled modal (day-grade / grade-help / my-gradebook /
  my-receipts / student-dm / Study Break) is visible, so a gap modal stacked UNDER one (dblclick a calendar
  cell → resource panel under the day-grade modal) isn't also closed on the same Esc.
- **DELIBERATELY left non-dismissable:** the sign-in WALL (`signin`/`signup`/`pwchange` — `closeSignInModal`
  already refuses while the wall holds; also part of the in-progress onboarding refactor). Do NOT add Esc there.
- **3-agent completeness audit (workflow):** caught **4 modals the first pass missed** (the flex QR overlays)
  + the stacking regression — both folded before commit. Confirmed the wall isn't broken + no double-fire.
- **Tests:** `tests/desk-modal-escape.test.js` (17, runs the real extracted fns). Root **7349 pass / the SAME
  6 pre-existing onboarding failures**, UNCHANGED. Frontend-only.
- **⏭ OPEN FOLLOW-UP (offered, not done):** the **worksheet aggregate drawer** (`#aggregateDrawer`) in ALL
  ~69 `u*_lesson*_live.html` has NO Escape (only its X button / tabbing). **CLAUDE.md's "Escape key closes
  drawer" claim is STALE.** Fix = a `scripts/wire-*.mjs` codemod scoped to `^u\d+_lesson.+_live\.html$`
  (exclude `edgar_u6_conceptual_driller_live.html`) adding one Esc listener that removes the drawer's `open` class.

## ⏭ SESSION 20 SHIPPED (2026-06-18) — Live Classroom AVATAR MENU: click → name → 🍬 candy / ⚔️ game (Desk only)

**Spec `AVATAR_MENU_SPEC.md`. fa HEAD `1d6ee87`.** From the teacher: the always-on floating
usernames over avatars are hard to read; make it click-to-reveal AND let a click send candy or
start a game — "loop it all together." Teacher locked two decisions via the design question: a
**two-stage reveal** (tap 1 → name chip; tap 2 / tapping the chip → the action menu) and **scope
= student Desk ONLY** (the teacher cockpit already has its own richer click-popup + Select-Students
and its floating real names help monitoring, so it's UNTOUCHED).
- **No floating names on the Desk.** `canvas_engine.js` paints `entity.getLabelSpec().text` every
  frame; `BoardSprite.hideLabel` (from the new `hideNameLabels` mount opt) makes `getLabelSpec()`
  return null. Desk mount passes `hideNameLabels:true`; `teacher-classroom.html` omits it → cockpit
  names still float. PlayerSprite inherits it (your own name is hidden too; you can't click yourself).
- **`_avatarMenu`** (Desk object literal near `_candyPoke`): the board hit-test now forwards
  `{username, selectMode, clientX, clientY}`; first tap opens a `position:fixed` `.avatar-pop` name
  chip, a 2nd tap (or tapping the chip) advances to 🍬 **Send candy** (→ `_candyPoke`, all guards) +
  ⚔️ **Start a game** (→ `DogePresence.sendChallenge`, auto-opens the match on accept; disabled only
  if presence says the peer is off-Desk). Dismiss: outside-click (bubble-phase doc handler with a
  `_handlingClick` guard so the opening click doesn't self-close) or Esc; switching avatars resets to
  the name stage; `_reposition()` nudges the popover into the viewport (flips below the head near the top).
- **Tap your OWN avatar → My Ledger** (same-session follow-on, `95d6e75`): the hit-test no longer skips
  self when the new `selfClickable` mount opt is set (Desk passes it; cockpit omits → self stays
  unclickable, no self-nudge); the payload carries `isSelf` and the Desk's `onAvatarClick` routes it to
  `openWallet()`. Classmate = social menu, self = wallet. (Clicking self while a classmate popover is open
  closes the popover via its outside-click handler and opens the wallet.)
- **SUPERSEDES** the old instant candy-poke-on-tap (CANDY_POKE_SPEC.md) — tapping an avatar now opens
  the menu instead of immediately sending 1 candy.
- **XSS-safe:** classroom-WS usernames are UN-authenticated/untrusted; the name renders via
  `textContent` and actions wire via `addEventListener` — no `onclick=""` interpolation sink (the s18
  doge-submenu bug class). Confirmed by review.
- **3-lens adversarial review (interaction/security/integration) + per-finding verify:** all voted
  **ship**; 5 raw → **3 confirmed minor**, 0 uncertain — one root cause (edge-of-viewport clamp) folded
  via `_reposition()`. No correctness/security/regression issues.
- **Tests:** new `tests/desk-avatar-menu.test.js` (15, runs the real controller), `classroom-board` +5
  (hideLabel scope + hit-test coords + self-click), `candy-poke` rewired + self→wallet pin. Root **7331+
  pass / the SAME 6 pre-existing onboarding failures** (desk-gating-fixes / desk-self-signup /
  desk-user-role / desk-signin-wall), UNCHANGED — PLUS, since this session, ~1 ADDITIONAL unrelated suite
  flakes under the full PARALLEL run (rotates: gradebook-feeder-wiring / teacher-student-console-deeplink;
  both pass 108/108 in isolation — pre-existing jsdom test-isolation fragility, NOT a product regression;
  the avatar suites are deterministic). Frontend-only (no roster-server change). **Teacher: verify live on
  the public Desk** — tap a classmate's avatar → name → tap again → Send candy / Start a game; tap your OWN
  avatar → My Ledger opens.

## ⏭ SESSION 19 SHIPPED (2026-06-18) — STUDY BREAK STAKES: bet 1 candy on a Tetris match (BACKEND + conservation audit, Phase 1)

**Spec `STUDY_BREAK_STAKES_SPEC.md`. Teacher decisions: real candy ALWAYS (consent = accepting the challenge; both
need ≥1 candy; solo free), NO ante (just the zero-sum bet), best-of-3, Casino Stats lab.** Prereq DONE: the s18
follow-on (`c8c88f0`) made Study Break use the real roster identity on one socket — the server needs both players'
real usernames to move candy. fa HEAD `2e12390`.
- **A bet is a conditional gift in ESCROW** — adds ONE term to the audited candy identity:
  `Earned + Received + Realized = Gifted + Converted + Materialized + Escrowed + Owed`. open: both Escrow+=stake;
  settle: winner Escrow−=stake + gifted_in+=stake, loser Escrow−=stake + gifted_out+=stake (winner +1 / loser −1,
  zero-sum); refund: both Escrow−=stake. Only NEW column is `candy_escrowed`.
- **Migration `0024_tetris_stakes.sql` USER-RUN** — `candy_escrowed` col + `tetris_bet` table + atomic plpgsql:
  `tetris_bet_open` (CONSENT JOIN handshake — escrows only when BOTH players POST; each player's earned captured
  from THEIR OWN authenticated request so neither can forge the other's balance), `tetris_bet_settle`/`refund`,
  `tetris_bet_resolve` (both-confirm → settle, disagree → refund, atomic under the row lock), **`doge_mark`** (atomic
  teacher disbursement clamp), + the spendable-guard re-base (subtract `candy_escrowed` in spend/gift/sell/mark). Until
  it runs, the bet endpoints 503 and `candy_escrowed` reads 0 (rest of the wallet byte-identical).
- **Endpoints (behind `STAKES_ENABLED` kill-switch, default ON):** `POST /wallet/bet/open` (resolve opponent by
  username, same-section, active-student) `/bet/resolve` (winner by username), `GET /wallet/casino` + `/class/casino`
  (win/loss/net), + a 30-min timeout sweep. **roster-server AUTO-DEPLOYS on push** — but no client calls these yet, so
  nothing is live until 0024 runs AND Phase 2 lands.
- **Anti-cheat:** the Tetris match is P2P — the server has NO game truth → **both-confirm-or-refund** (a lone "I won"
  never pays; disconnect = refund, teacher-accepted rage-quit-voids). Idempotent resolution.
- **Conservation audit (REQUIRED — candy = real money):** `tests/wallet-stakes-conservation.test.js` — Layer A
  **600** reducer fast-check runs (I1/I3/I8/I9) + Layer B **120 REAL-plpgsql pglite differential** runs (the SQL
  conserves identically to the reducer — closes the "fake copies the SQL" gap) + lifecycle pins. Reducer/harness
  extended in `tests/fixtures/wallet-world.js` + `pg-wallet.js`. `tests/wallet-stakes-routes.test.js` (15).
- **18-agent adversarial review (12 confirmed) folded before push:** ⚠ **MAJOR — mark-given × escrow MINT race**
  (the JS materialize clamp could miss a concurrent escrow → negative Owed → mint on a loss-settle) → FIXED with the
  atomic **`doge_mark`** (also closes the prior accepted F1 mark residual); **matchId hijack** (a 3rd party could
  occupy `player_a`) → FIXED (each joiner must name the recorded opponent); **delete-mid-bet stuck escrow** → FIXED
  (refund logs only existing players); sweep 10→**30 min**; **opaque 404** info-leak. Nits DEFERRED to Phase 2
  (matchId fresh-nonce derivation, caller-role guard, gross-pot ledger leg cosmetics) — spec §9.
- **Tests:** roster-server **1042/1042**.
- **✅ PHASE 2 (client) SHIPPED + LIVE (`abd6392`):** 1v1 Tetris is now **best-of-3** with a candy bet. **matchId = the
  SERVER-MINTED `roomId`** from `match_start` (shared + unguessable on both clients — this RESOLVED the deferred
  matchId-nonce concern with no client derivation). Escrow on match start (both POST `bet/open` via `_dogeWalletAction`,
  FULLY GRACEFUL — guest/off/insufficient → free; existing Tetris never breaks); best-of-3 tracked at the single
  game-over choke point (`drawGameOverCard → _studyBreakScoreGameOnce`, once-per-game guard) with auto-advance; resolve
  at series end (`_studyBreakResolveStakes` → `/wallet/bet/resolve`); the game-over card shows the series score + candy
  outcome; **Casino Stats lab** in the lobby (W-L / net / **EV-per-game** from `/wallet/casino` — the probability
  lesson). 2-lens review: **NO money-theft/mint path** (candy server-safe). Fixed: forfeit-in-auto-advance-window (now
  ends the series in `opponentLeft`), post-series phantom restart (`startNewGame` early-returns on `seriesOver`),
  `close()` timer cleanup. Accepted candy-safe: simultaneous double-topout → refund (rare); rage-quit → refund (agreed).
  `tests/study-break-stakes.test.js` (18); root **7306 pass** / the same 6 pre-existing onboarding failures.
- **THE FULL FEATURE IS LIVE:** a staked best-of-3 fires whenever two signed-in classmates with ≥1 candy play 1v1;
  everyone else plays free. Kill-switch = `STAKES_ENABLED=false` on Railway. **Teacher should smoke-test live:** two
  students (or two browsers) challenge each other in Study Break → play best-of-3 → the winner's My Ledger candy +1,
  the loser −1; the lobby shows the Casino Stats line.

## ⏭ SESSION 18 SHIPPED (2026-06-18) — DOGE "Online Now" presence: location chips + click→submenu (no auto-challenge)

**Spec `DOGE_PRESENCE_SUBMENU_SPEC.md`.** From the teacher noticing the 🐶 doge "Online Now" list and the Live
Classroom avatars DISAGREE (a kid shows in the doge list but not as an avatar). Root cause investigated (3 parallel
readers): there are TWO presence systems on the **cr server** — the avatar scene (`classroom_join`, room-scoped, only
the Desk mounts it) vs the global doge feed (`identify`→`user_online`, broadcast to ALL, fed by ANY page with
`railway_client.js` — worksheets + the quiz app + the Desk). So a kid on a worksheet/quiz shows "online" globally but
has no avatar. Working as designed; the teacher wanted (a) a LABEL of where each online kid is, and (b) the doge
dropdown to stop INSTANTLY challenging to Tetris (it made no sense for non-Desk kids, who can't even receive it).
- **Built (two repos, both pushed + live):** the doge dropdown now shows a per-peer **location chip** (students see a
  COARSE bucket Desk/Worksheet/Quiz/Study-guide; the **teacher** sees the exact lesson, gated on `_deskIsTeacher()`),
  and clicking a name opens an **inline submenu** instead of an instant challenge: **⚔ Challenge to Study Break**
  (enabled ONLY when the peer is `onDesk` — the game + challenge-receiver live in the Desk) + **🍬 Send candy**
  (anywhere; reuses the `_candyPoke` pipeline). Desk students now **auto-connect** presence at boot (`_autoPresence`)
  so they reliably appear + are challengeable (fixes the old inverted asymmetry where only kids who'd clicked the icon
  showed up). The Study Break in-game **lobby** was brought to parity (onDesk-gated + escaped).
- **Protocol (additive/backward-compatible):** `identify` gains optional `location:{surface,lesson}`; `user_online`
  echoes it; `presence_snapshot` gains a parallel `locations` map (`users` stays a flat string[]). cr server
  (`railway-server/server.js`): `wsLocation` per-connection Map + `sanitizeLocation` (whitelisted surface, lesson
  clamped 40 chars) + `aggregateLocation` (**onDesk wins** — the challengeable surface). Surface derived purely from
  the URL by a `_presenceSurface()` helper in BOTH `railway_client.js` copies (fa = worksheet `U#L#`/edgar/mit/study-guide;
  cr = quiz `?u=&l=`/worksheet) + the Desk's two inline sockets hardcode `desk`.
- **Adversarial review (3-lens, per-finding verify; 10 raised → 6 confirmed, 4 refuted):** caught + FIXED a **BLOCKER
  stored-XSS** — the untrusted peer username (the presence WS is UN-auth'd; the server only `.trim()`s it) was
  interpolated into a double-quoted `onclick` with only single-quote escaping → a crafted client `"><img onerror=…>`
  fired in every viewer's Desk origin (incl. the teacher). Fixed across ALL sinks (toggleRow/challenge/candy + the
  lobby) via `_deskEsc(JSON.stringify(name))` (entities can't break out of the attr; JSON keeps the JS string valid).
  Also self-caught a **bubbling blocker** (the dropdown is nested in the toggling `#doge-presence` span → a row click
  bubbled to `toggle()` and closed the menu before the submenu showed; fixed with `stopPropagation`, verified with a
  jsdom probe). 3 nits documented as accepted gaps in spec §8 (pre-existing dual-socket `Player###` ghost while in
  Study Break MP; redundant close re-broadcast; reconnect jitter).
- **Files:** cr `railway-server/server.js` + `railway_client.js` (`80dedc2`); fa `ap_stats_roadmap_square_mode.html` +
  `railway_client.js` + `DOGE_PRESENCE_SUBMENU_SPEC.md` + new `tests/doge-presence-submenu.test.js` (`6eb8b7c`). Tests:
  new suite **33/33** (runs the real clients, server location logic, the live DogePresence render/submenu, + XSS
  no-injection); root **7288 pass / the SAME 6 pre-existing onboarding failures** (desk-gating-fixes / desk-self-signup /
  desk-user-role / desk-signin-wall), UNCHANGED; cr websocket suite **32/32**. No migration. **⚠ The teacher should
  verify live on the public URL:** open the Desk, click the 🐶 icon → each online kid shows a where-chip; clicking a
  name opens the submenu (challenge only for on-Desk kids). ⚠ `wsx.js` (4888 lines, NOT loaded by any HTML) is a stale
  Desk JS extraction — left untouched; do not treat it as live.
- **s18 follow-on — Study Break username/ghost FIXED:** opening Tetris used to `identify` under a random `Player###`
  (the Desk never writes the `student-name`/`username` localStorage keys studyBreak read) → a ghost in classmates'
  doge lists. `studyBreak.connectMultiplayerWS` now uses `DogePresence.getUsername()` (roster identity) and **REUSES
  the Desk's always-on DogePresence socket** instead of opening a 2nd one (ONE connection, real identity, no ghost,
  no double challenge-prompt). `DogePresence.handleMessage` now routes a `challenge_received` to the in-game modal
  when Study Break is open (else the doge wiggle) and mirrors `user_online`/`user_offline` into the lobby via new
  `_syncStudyBreakLobby()`. The ghost was in the doge dropdown (global presence), NOT a Live Classroom avatar
  (classroom-board.js reads a separate `classroom_join` feed). Tests +4 (37 in the doge suite). **Prerequisite for
  the proposed STUDY BREAK STAKES feature — the server needs both players' real roster usernames to move candy.**

## ⏭ SESSION 17 SHIPPED (2026-06-18) — candy↔DOGE CONSERVATION AUDIT DONE (3 layers) + F1 lost-update race FIXED

**Spec `WALLET_CONSERVATION_AUDIT_SPEC.md` → DONE; findings `WALLET_CONSERVATION_FINDINGS.md`.** Applied the s13 grade-integrity
playbook to the now-BIDIRECTIONAL wallet. Built the shared foundation then all three layers; ran a 19-agent / 5-lens adversarial
review of the harness itself (14 raw findings → **4 real, 10 refuted**). **Core conservation (buy/sell/gift, the 7-number identity
`Earned+Received+Realized=Gifted+Converted+Materialized+Owed`, invariants I1–I9) is SOUND** — but the review caught **one real
major bug the 3 oracles structurally couldn't reach (F1), now FIXED.**
- **Foundation `roster-server/tests/fixtures/wallet-world.js`** — canonical JS reducer (mirrors the SQL guards) + I1–I8 checks +
  the shared `fast-check` trajectory generator. Conversion peg imported from `doge-econ.js` (no third copy).
- **Layer A `tests/wallet-conservation.test.js`** — 600-run fuzz of I1–I8 + deterministic I4 guards + I6/I8 round-trip + the s16
  objections pinned as empirical disproofs + a live buy→sell through the REAL routes.
- **Layer B `tests/wallet-conservation-pg.test.js` + `tests/fixtures/pg-wallet.js`** — the headline: a 150-run **differential of the
  REAL `doge_spend`/`doge_gift`/`doge_sell` plpgsql** (in **`@electric-sql/pglite`**, WASM Postgres, NO Docker — new roster-server
  devDep; confirmed it runs plpgsql) vs the reducer. **Closes the s16 "fake hand-copies the SQL" gap.** Plus the C1 rolling-cap pin.
- **Layer C `formal/wallet-model/` + `roster-server/tools/wallet-model-emit-cases.mjs`** — Redex exact-rational column model,
  cross-checked vs the JS oracle → `PASS 1200/1200`. Run: `node roster-server/tools/wallet-model-emit-cases.mjs` then **PowerShell**
  `racket formal/wallet-model/crosscheck.rkt` (racket v9.2 + redex via scoop; **segfaults under MSYS bash → PowerShell**).
- **FINDING F1 (major, FIXED):** `markEndpoint` (mark-given/mark-sent/address) was a read-modify-write that upserted the WHOLE row
  via `rowFor()` → a student buy/sell committing between the teacher's read and write was clobbered (candy minted/destroyed). Exactly
  the lost-update race 0019's atomic fns exist to prevent; `updateDogeChain` already dodges it with a narrow `.update()`. **Fix:** new
  `db.updateDogeField()` (narrow single-column write), both callers switched, `rowFor` deleted. **No migration** (JS-side bug). Residual
  clamp-staleness is the already-surfaced `candyBalanceRaw<0` (a future atomic `doge_mark` 0024 would close it; out of scope, NOT a
  conservation hole). **F2/F3** (mark-given `+candy_realized` term + the clamp had no independent oracle) and **C1** (gift cap modeled
  lifetime vs SQL rolling-24h) hardened with targeted tests.
- **Tests:** roster-server **1015/1015**; Layer C **1200/1200**; root **7255 pass / the SAME 6 pre-existing onboarding failures**
  (desk-gating-fixes / desk-self-signup / desk-user-role / desk-signin-wall), UNCHANGED. The F1 fix is roster-server-only (auto-deploys
  to Railway on push) — no migration for the teacher to run.

## ⏭ SESSION 16 SHIPPED (2026-06-17) — DOGE ⇄ candy BIDIRECTIONAL: cash DOGE back to candy at the live rate (7-number ledger)

fa HEAD `5c2f3c3`. Migration `0023_doge_sell.sql` USER-RUN — ✅ **TEACHER RAN IT.** From the teacher's ask: *"buy candy
WITH dogecoin — convert into DOGE at one rate, convert back at a new rate; DOGE worth 2 candy today, 3 tomorrow → a way
students get MORE candy."* This **reverses DOGE_WALLET_SPEC decision #4 ("no sell-back") ON PURPOSE** — it's the
appreciating-asset payoff lesson. Investigated (7-reader workflow) → 3 teacher decisions → built → 3-lens adversarial
review (2 minor findings folded; 3 plausible objections DISPROVEN) → pushed. Spec: `SELL_DOGE_SPEC.md`; memory:
`doge-candy-buyback-decisions.md`.

- **TEACHER'S 3 LOCKED DECISIONS:** (1) **UNCAPPED gains** — kids keep all appreciation; NOT bounded by the $300 candy
  budget but *hedged* by the teacher's ~10,273 real node DOGE appreciating in parallel (treat node DOGE as the reserve).
  (2) **OVERNIGHT (~24h) FIFO hold** before cash-out (`SELL_HOLD_HOURS=24`) — this, NOT price freshness, is the
  anti-arbitrage defense (it dwarfs the 5-min CoinGecko cache window, so there's no risk-free same-window churn). (3)
  **HONEST P&L** — payout = `coins × liveRate` regardless of cost basis, so a fallen coin returns LESS than it cost (the
  kid's own risk; hardest to game). The teacher keeps the difference on a loss.
- **The build:** `POST /wallet/sell-doge` (+ `BUYBACK_ENABLED` env kill-switch, default ON, mirrors gifting's). Migration
  `0023`: new `candy_realized` column (signed net P&L), widen `doge_ledger.kind` CHECK to add `sell_doge`, atomic
  `doge_sell()` fn (FOR UPDATE → un-sent-in-app guard `doge_balance−doge_sent` → FIFO-maturity guard → avg-cost unwind →
  books `(payout−basis)` to `candy_realized`), plus `+ candy_realized` added to the `doge_spend`/`doge_gift` spendable
  guards (so realized candy is spendable/giftable). **Only un-sent IN-APP coins are reclaimable** — coins the teacher
  already pushed on-chain are self-custodied in the kid's paper wallet and can NEVER be cashed back. `candyFromDoge`
  mirrored in `doge-econ.js` + `js/wallet_logic.js`. Desk: a "🍬 Cash out Ɖ" control + a live **gain line** ("Your X Ɖ in
  hand is worth Y 🍬 now — you put in C, ▲ up Z%"), gated on the matured `sellableDoge` and valuing ONLY the cashable
  in-app portion. Dashboard `rawOwed` flag + the earned-cell tooltip learn the realized term.
- **NO buy minimum (follow-on, same day, user):** the old "1 DOGE's worth" convert floor (`minConvertCandy`) is REMOVED —
  even **1 candy** now buys a fraction of a DOGE (only guard is `candy > 0`). On-chain dust is still prevented by the
  separate 5-DOGE materialize threshold (in-app buys never touch the chain). `GET /wallet` returns `minBuyCandy: 0`; the
  Desk buy hint reads "(buy any amount → a fraction of Ɖ)". `minConvertCandy` deleted from `doge-econ.js`;
  `MIN_CONVERSION_CANDY` kept only as the client-mirror const. Tests rewritten (buy floor → "no minimum"); suites green.
- **The 6-number ledger is now a 7-NUMBER identity:** `Earned + Received + Realized = Gifted + Converted + Materialized +
  Owed`. A sell decrements `doge_balance` + `doge_cost_basis` (Converted, AVERAGE cost basis), credits the FULL payout to
  Owed, and books the gain/loss surplus to Realized — so Owed always rises by exactly the payout and the books close.
  Enforced in BOTH the SQL guards AND JS `deriveBalances` (the two-place invariant, CANDY_LEDGER_SPEC #2).
- **Adversarial review (3-lens, per-finding verify) DISPROVED 3 objections** — recorded so they're not re-raised: (a)
  "materialize-then-sell-at-a-loss leaks candy" → IMPOSSIBLE: a sell always raises the mark-given cap by the full payout
  (Δcap = +payout ≥ 0; Converted and Realized move from the SAME leg). (b) "FIFO maturity double-subtracts `doge_sent`"
  (flagged by 2 lenses) → CORRECT FIFO accounting (the two `−doge_sent` terms apply to two DISTINCT quantities — the
  un-sent ceiling and the matured-pool-after-sends; the proposed "fix" would itself create an over-cashout exploit
  defeating the hold). (c) "average-cost vs FIFO mints candy" → NO: per-sale candy effect is always `coins×rate`,
  self-correcting. **2 minor findings FOLDED:** the 7-number conservation test was tautological (Owed routed back through
  the same formula it checked) → replaced with a hand-computed partial-sell oracle pinning the exact
  `(dogeBalance, converted, realized, owed)`; and the gain line over-valued sent-on-chain coins → now in-app only.
- **Tests:** roster-server **995** (wallet suite **59**), root **7238** + the SAME 6 pre-existing onboarding failures
  (desk-gating-fixes / desk-self-signup / desk-user-role / desk-signin-wall), UNCHANGED. ⚠ KNOWN test-quality gap (review,
  accepted): the in-memory `dogeSell` fake hand-copies the SQL formula, so a bug copied into BOTH would pass — a live
  Postgres differential harness over `doge_sell`/`doge_spend`/`doge_gift` is the strong follow-on (see grade-integrity ↓).
- **WALLET UI DECLUTTER (follow-on, fa `3c8ff13`):** teacher: "the candy/DOGE block in My Ledger is cluttered." A 6-lens
  design panel (System-7-native + info-hierarchy won) → synthesis → critique rebuilt the block as a titled **"Candy & DOGE"**
  System-7 sub-panel: ONE candy-to-spend hero + ONE DOGE asset line (`Ɖ held · worth · maturity · gain ▲/▼`) + three native
  `.s7btn` pills (Buy / Cash out / Gift) that open **ONE inline form at a time** (live `→ ≈` preview), with the full 7-number
  ledger behind a **▸ Details** disclosure (exact values; the face uses `_candyFmt`/`_dogeFmt` glance rounding — fixes the old
  "0.7 vs 1 / up 0%" wart). Pure display-only refactor of `_dogeWalletRender` (reuses `_dogeWalletAction`/`_dogeWalletGiftForm`/
  `_dogeWalletChainArm` + endpoints unchanged); new `_walletLedgerDetail`. A 2nd adversarial review of the IMPLEMENTATION caught
  6 minor issues — ALL folded (hero/footer contradiction on a price outage; "Held Ɖ 0 / Worth 🍬 0" when all coins are on-chain;
  "7.0" stray decimal; "0.0 ready" for tiny matured amounts; sub-1% moves swallowed as "even" → now show direction off the raw
  delta; an incoming candy-gift repaint that ate a half-typed form → now skipped while a wallet input is focused). New jsdom
  EXECUTION test `tests/desk-wallet-render.test.js` (14) runs the REAL panel across all states; root suite 7252 pass / the 6
  pre-existing onboarding failures. Spec: `WALLET_REDESIGN_SPEC.md`. The live on-chain watch line moved INTO ▸ Details (cuts
  BlockCypher polling to only-while-open); a cheap **on-chain face hint** (`⛓ Ɖ N in your wallet (yours to keep)`, from
  `doge_sent`, no poll) was then added at rest (fa `3e477d1`) so a kid still glances at their REAL deposited coins — shown even
  when inApp=0 (all coins on-chain). The face = instant glance; ▸ Details = the live, explorer-linked blockchain truth.

## ⏭ SESSION 15 SHIPPED (2026-06-17) — calendar load-fix + cr identity #2 + CANDY economy REVIVED (poke + 6-number ledger + DOGE floors)

fa HEAD `040726a`; cr HEAD `6626dc3`. **The candy/DOGE feature is REVIVED — the teacher is re-engaged and actively building it**
(NOT deprecating). Every item below was adversarially reviewed (3-lens workflows) + pushed; the teacher tests on the public URL.

1. **Calendar initial-load crop FIX (fa `e4d77f8`).** The dynamic focus window sized from a COLD `/grade` cache on first
   paint → next-up resolved to an early/already-done lesson → the window cropped the true next lesson (self-corrected only after
   the user paged the calendar). FIX: force ONE `rCal()` on the cold→warm `/grade` transition in `renderDoNowGrades`.
   paintLocalDoneCells's lock-flip rCal escalation CAN'T cover it — it scans only RENDERED cells and the corrected next-up cell
   is the one cropped out of the DOM. Mirrors the summer-schedule loader's one-time rCal. Calendar suites green.

2. **cr identity cheap-wins #2 (curriculum_render `4314897`, branch `main`).** The two HOLEs left from `6c60965`:
   **HOLE 4** focus/visibility roster refresh — and EXPOSED `window.refreshRosterStatus` (it was IIFE-local, so the s11 cross-tab
   `storage` refresh + `_notifyAuthExpired` were silently no-op'ing). **HOLE 5** evict the stale peer cache on a genuine in-session
   identity switch — clears the IDB **`peerCache` store** (the review caught that `localStorage.removeItem('classData')` ALONE is a
   no-op on the primary IDB path: peers live in the `peerCache` store read by `rebuildClassDataView`). Gated so a same-user reload
   keeps its warm cache. cr suite 1415/8 baseline.

3. **CANDY POKE (fa `b077e97` + cr `6626dc3`).** Tap a peer's avatar in the Live Classroom → send 1 candy (Facebook-poke style):
   optimistic "Sent 1🍬 · Undo" (3s, commit DEFERRED so Undo needs no server reversal) → real `POST /wallet/gift` → COSMETIC
   `candy_gift_received` relayed over the cr classroom WS so the recipient sees a toast (USERNAME ONLY — no real names; balance is
   always server-truth so a spoof can't mint candy). Reuses the existing gift backend + the avatar click→username hit-test in
   `classroom-board.js` + the toast system. Fixed 1 candy; per-recipient ~10min cooldown (armed OPTIMISTICALLY pre-POST to close a
   double-tap race) on top of the server 20/day cap. cr-server adds a `candy_gift_received` case → `broadcastToClients` (global,
   like `user_online`; clients filter by `toUsername`). `tests/candy-poke.test.js` (11). Spec: `CANDY_POKE_SPEC.md`.

4. **CANDY LEDGER — "materialized candy" 6-number model (fa `bdb7f8d`; migration `0022` USER-RUN — ✅ TEACHER RAN IT).**
   `Earned + Received = Gifted + Converted + Materialized + Owed`. **Spendable === Owed** (the un-realized pool IS what's free to
   gift/convert), so the spend guard subtracts MATERIALIZED (`candy_given`), NOT the retired `candy_eaten`. **NO new columns** —
   all six map to existing data (Materialized = `candy_given`). **"Eat" RETIRED** (`/wallet/eat`→no-op; `candy_eaten` now vestigial).
   `mark-given` cap re-based to Owed-eligible (Earned+Received−Gifted−Converted), monotonic-safe. Students see "N earned · M in hand
   · O still coming" (the wallet is now ON by default for students). Dashboard "Owed 🍬" worklist + 6-number tooltip-on-hover +
   identity-based overspend ⚠. **`0022_retire_candy_eaten.sql` = CREATE OR REPLACE doge_spend/doge_gift (candy_eaten→candy_given in
   the 3 spendable guards; no columns) — ALREADY RUN.** Spec: `CANDY_LEDGER_SPEC.md`.

5. **DOGE convert-floor + 5-DOGE materialize threshold (fa `040726a`, NO migration).** Convert floor is now DYNAMIC = 1 DOGE's
   worth of candy at the live price (`minConvertCandy` = `candyPerDoge` ≈ 2.4; floats with DOGE/USD), replacing the fixed 5-candy
   min — a kid banks fractional DOGE. New `MIN_MATERIALIZE_DOGE=5`: in-app DOGE only goes ON-CHAIN once UNSENT ≥ 5 (no dust sends);
   dashboard ✓send arms only at ≥5 (else "needs 5 to send"), `planSends` skips sub-5 (reported, accruing), student sees
   "(goes on-chain at 5 Ɖ)". `mark-sent` keeps a manual override below 5. Conservation unchanged.

- **TEACHER DECISIONS this session:** **#1 (Live Classroom poll/vote modeling) = DEPRECATED** ("too extra", parked far back).
  **#2 (cr identity cheap-wins) = SHIPPED** (above). **#3 (Schoology UID coverage) = DEFERRED to ~Sept 1** — it becomes necessary
  when grades sync to Schoology; the teacher doesn't have `ROSTER_TEACHER_SECRET` and is fine trading that security for smoothness
  until then. Do it LAST. **CANDY/DOGE = REVIVED**, actively built (poke + materialized ledger) — do NOT treat it as paused.
  The mental model: **candy is the social/delight currency** (earn → gift via avatar poke → teacher materializes physical candy
  weekly from the dashboard Owed worklist); **DOGE is the optional appreciating-asset lesson** (convert candy at the 1-DOGE-worth
  floor → DOGE accrues in-app → materializes on-chain at 5 DOGE).
- **CANDY LEDGER Phase 2 (OPTIONAL, NOT built):** a weekly "to give THIS WEEK" grouping needs ONE additive column
  `last_materialized_at timestamptz` (the only further migration). Today the running **Owed** column already serves as the worklist.

## ⏭ SESSION 14 SHIPPED (2026-06-17) — Desk CALENDAR cohesion + accessibility + tactility polish

HEAD `0db94a2` (one commit since `f13ac7a`, pushed → GH Pages auto-republishes). From "make the calendar more dynamic /
polished / cohesive + sharpen the code." Ran a 6-lens design workflow (40 proposals → synthesize → adversarial critique →
finalize) then a 3-agent adversarial review (verdict **SHIP**; 6 minor/nit findings ALL folded). Spec + the unshipped queue:
`CALENDAR_POLISH_PROPOSAL.md`. Memory: `project_calendar_polish.md`. Edits all in `ap_stats_roadmap_square_mode.html` (the
Desk) + new `tests/calendar-cohesion.test.js` (24). Full root suite **7188 pass / 6 fail** (the 6 = the user's pre-existing
onboarding refactor, UNCHANGED — desk-gating-fixes / desk-self-signup / desk-signin-wall / desk-user-role).

- **SHIPPED (7 items, all additive / behavior-preserving / in the System-7 aesthetic):**
  1. **Legend decodes every overlay STATE** — collapsed `<details class="legend-states">` "What the marks mean" key
     (today/up-next/done/in-progress/ahead/locked/PC/poster/ready/poll); swatches REUSE the live cell classes so the key
     can't drift from the CSS. `updateLegend` (NOT test-pinned).
  2. **Keyboard access** — interactive cells get `role=button`+`tabIndex=0`+Enter/Space→`c.click()` (reuses the existing
     onclick, honoring the lock + Do-Now guards) + a classic-Mac dotted `:focus-visible` ring (white on dark PC/exam cells).
  3. **Screen-reader layer** — new `cellAria()` helper, `aria-label`+`aria-current='step'` in rCal, `#cg role=group`, a
     `.sr-only` `#cal-sr` aria-live region announcing the visible window on paging; `paintDonowCells` mirrors server
     done/ahead into the label (idempotent).
  4. **Stepped (pixel-crisp `steps(2)`) hover/press tactility** on `.dc` + `.cal-nav-btn`; reduced-motion disables it; the
     press bevel is scoped OFF state-ring cells so it never erases the next-up/done ring.
  5. **Paired the two corner dots** → one 7px scale (round = personal status, squircle = class poll); mobile shrinks both
     + hides the `.dbl` 2x text.
  6. **Code sharpening** — reflowed rCal's dense minified week-building loop to readable code + `// ── N. phase ──` banners
     (a poll-dot date-key DRY onto `_ymdISO` was REVERTED — poll-archive-desk.test.js test 18 pins the inline `getMonth()+1`/`padStart`).
  7. **Named magic numbers** — `--cell-past-dim/--cell-lock-dim/--cell-done-dim` `:root` vars; documented the cls()/htm() sentinels.
- **⚠ CALENDAR TEST-CONTRACT GOTCHAS (durable, for future calendar work):** `tests/calendar-polish.test.js` (46) uses
  `fnBody(html,'rCal')` and pins MANY exact substrings INSIDE rCal → logic CANNOT be extracted into helpers without rewriting
  those tests. The **synthwave `.cal-current`** (#ff2e97 + calCurrentPulse + reduced-motion) is a FROZEN tested contract —
  do NOT swap it (reconciliation options are in the proposal doc). `poll-archive-desk.test.js` test 30 does
  `indexOf('.poll-dot {')` so any earlier `.poll-dot {` token breaks it — order such selectors as `.poll-dot, .status-dot {`.
- **✅ ROUND 2 (`10ef5f3`) — ALL 9 needs-your-nod items APPROVED + SHIPPED** ("all of it, per your judgement"). My calls:
  (8) hover → **additive outline ring** (no more full-black invert wiping state cues); (9) synthwave → a **live "Up-next style"
  switcher** in the legend (Neon default / Toned / Marching-ants / Gold), persisted to localStorage as `#cg[data-calcur]`,
  alternatives layered AFTER the frozen `.cal-current` so the default is byte-identical + 46 frozen tests green — pick by feel;
  (10) dropped the redundant ◀TODAY chip (frame signals today) + `2x`→bottom-center; (11) **colorblind glyphs** ✓/◐/▶ via
  `::after` reusing the tooltip symbols (+white halo, shown on touch); (12) mobile clamps the subtitle (ellipsis) not hides it;
  (13) **honest progress** — a pure unit-tested `_computePace` (deduped DOT-LESSON universe) drives a pace label + done-fill,
  fail-open, recomputed when the /grade cache warms; (14) tooltip → honest open-hint (the cursor-following links were dead);
  (15) today seated forward **statically** (no idle animation); (16) one-ring — today keeps its 2px frame, glyph carries state.
  A 2nd 3-agent adversarial review (verdict *fix-first*) caught 2 real majors before push — an inflated progress denominator
  (specials counted as lessons → fixed via `_computePace` + execution test) and a legend swatch that mis-taught ✓ as "Ahead"
  (Done swatch now uses the real `dc-done`). `tests/calendar-cohesion.test.js` now **42**.
- **✅ ROUND 2b — live teacher-feedback fixes (`77f7fb3`):** (a) removed the deprecated registry
  "readiness" signal from the STUDENT view (cell status-dot + tooltip Ready/Partial/Pending line +
  legend "Ready" entry) — it marked most lessons "partial" (teacher material-tracking) and
  contradicted the new student glyphs; (b) tooltip drops the "double-click for grade" hint (single
  click opens the panel first → dblclick rarely lands; grade is on the Do-Now anyway) → now just
  "Click to open"; (c) **marching ants is now the DEFAULT** up-next style (`CALCUR_DEFAULT='ants'`;
  'neon' falls through to the frozen rule so 46 frozen tests stay green); (d) the "What the marks
  mean" legend was made a visible System-7 chip (was faint grey text — teacher couldn't find it).
  **⚠ (c) + "No open task" are SUPERSEDED by ROUND 2c below — the legend was then HIDDEN entirely, and a real open
  ants/summer task exists.** `tests/calendar-cohesion.test.js` was **44** at 2b. ⚠ `.status-dot` CSS is
  retained-but-deprecated (kept so the mobile `.poll-dot, .status-dot` selector + poll-archive
  `indexOf('.poll-dot {')` test stay valid) — purge both together if desired. The day-grade
  dblclick/right-click handlers are still wired (only the misleading hint was removed).
- **✅ ROUND 2c — more live teacher feedback (`3936f5b` + `94e208e`):**
  (a) **Teacher-as-self progress overlay SUPPRESSED** (`3936f5b`) — the ◐ "in progress" markings were the TEACHER's own
  browsing marks rendered as student progress (inaccurate noise). rCal (`_suppressProgress`) + paintLocalDoneCells
  (`suppressProgress`) now skip the local progress overlay (greying + ◐/✓) when `_deskIsTeacher()` — gated so
  preview-as-student + real students KEEP it. cal-current/next-up is kept for teachers.
  (b) **Up-next style moved `#cg[data-calcur]` → `body[data-calcur]`** (`3936f5b`) so the legend "Up next" swatch previews
  the chosen style LIVE, not only the grid cell. `_applyCalcurStyle` sets it on `document.body`.
  (c) **LEGEND HIDDEN** (`94e208e`, SUPERSEDES 2b's "visible chip") — teacher: "the legend isn't necessary, the cells +
  glyphs are self-explanatory, rid it for cleanliness." `#legend-bar { display:none }` (one CSS line, reversible). updateLegend
  still runs so the marching-ants default still applies; the switcher UI is now hidden → the up-next style is effectively fixed
  to the `ants` default (change `CALCUR_DEFAULT` to re-default; un-hide `#legend-bar` to bring the switcher back).
  `tests/calendar-cohesion.test.js` now **47**; full root suite **7211 pass / 6 fail** (the same pre-existing onboarding 6).

- **✅ ROUND 2d — greying fixed + marching ants now lands on the summer lesson (RESOLVED the prior OPEN item):**
  (1) **GREYING (`62bc8e6` + `4596b99`, teacher-CONFIRMED):** the teacher's completed 1.1 (worksheet 73% + flashcards 93%)
  wasn't greying — root = the /grade cache-cold RACE + the over-aggressive teacher-suppression. FIXED: suppress only browsing
  `'partial'`, KEEP real `'done'`. Diag confirmed `complete_1_1:true, state_1_1:"done"`. Also the flashcards button labelled by
  100% not the 80 gate → said "Improve (flashcards)" at 93%; now "Flashcards ✓ done — redo to improve" (`4596b99`).
  (2) **ANTS / SUMMER↔FALL DISCONNECT (`7252c99`):** next-up was computed ONLY over FALL combined topics ("1.2+1.3"), which
  never match the individual SUMMER cells ("1.1"/"1.2") → no summer cell ever got `cal-current`. (The first diag's `summerCells:0`
  was a cache RACE; the 2nd showed `summerLoaded:true, nextUpTopic:"1.2+1.3"` — confirming the disconnect, not a load failure.)
  Shipped the **WINDOW REDESIGN**: new `_orderedSummerTopics()` + summer-aware next-up (rCal + paintLocalDoneCells mark the
  summer cell; the FALL `inf.t === _nextUpTopic` lines kept VERBATIM, summer is a separate else-if), a **DYNAMIC window**
  (`CAL_FOCUS_WEEKS` now sized to span today→next-up, clamped [1,4]; AHEAD anchors today, BEHIND anchors the overdue lesson;
  `_calStepWeeks` pages by the visible width), and a **Today** button (3rd nav child between the arrows, dims at offset 0).
  Designed via a 4-lens workflow whose critique caught 2 blockers (summer head-start "Sept jump" + paging dead-end) → the
  REVISED algo avoids both → a 3-agent review re-verified (live case 1.1-done→ants-on-1.2 traces; both blockers confirmed fixed)
  → its 1 major (paintLocalDoneCells missing rCal's summer-active guard → would clobber the fall next-up OFF-season) folded via
  a DOM-truth guard (`#cg .dc[data-summer="1"]`). ONE frozen calStep test rewritten (`*2`→`*_calStepWeeks`, authorized); all 46
  other calendar-polish pins preserved VERBATIM. `tests/calendar-cohesion.test.js` now **57**; full root suite **7221 pass / 6**
  (the pre-existing onboarding 6). **NO open calendar task.** Key fns: `_orderedSummerTopics()` (~L7015), rCal section 3/3b
  (next-up-before-sizing + dynamic window), `calToday()`/`_calStepWeeks` (~L16426), `_walletLoadSummerSchedule` (~L7191).
  **✅ TEACHER-CONFIRMED LIVE (2026-06-17):** all 4 verified on the public URL — (1) 1.1 greyed + "Flashcards ✓ done",
  (2) next-up dashed box on 1.2, (3) window sizes to reach the next lesson, (4) Today button. NOTE: the next-up box renders
  STATIC (not marching) for the teacher because **prefers-reduced-motion is on** in their browser/OS — working as designed
  (we honor reduce-motion; `matchMedia('(prefers-reduced-motion: reduce)').matches` confirms), teacher ACCEPTED the static box.
  Settled-with-defaults (teacher fine): CAL_MAX_WEEKS=4, up-next default = marching-ants. **The entire CALENDAR program is DONE.**

## ⏭ SESSION 13 SHIPPED (2026-06-16) — grade-policy SIMULATOR + 3 perverse-incentive fixes + appeal/gating state-machine models

HEAD `d48bf32` (4 commits since `0780ece`, ALL pushed). `04c5fe6` + `3029dae` touch `roster-server/**` + all 69 worksheets →
**Railway auto-deploys + GH Pages republishes.** Started from the user's question *"is it smart to model the app as a state
machine to simulate how student decisions affect outcomes?"* — built it, found real bugs, fixed them, then extended the technique.
Specs: `GRADE_SIMULATION_SPEC.md`, `GRADE_FIX_F1_F3_BUILD.md`. Findings: `GRADE_SIMULATION_FINDINGS.md`. Memory: `project_grade_simulator.md`.

- **The grade simulator (3 layers), commit `04c5fe6` + Layer C `5e042ca`:**
  - **Layer A** — `roster-server/tests/grade-sim*.test.js` + `tests/fixtures/sim-world.js`: property-fuzz (`fast-check`, now a
    roster-server devDep) of synthetic ledger-row trajectories through the **REAL `computeGrade`** (zero drift) — invariants A1–A9 + 5 archetypes.
  - **Layer B** — `roster-server/tools/grade-sim-sweep.mjs` (sweep config knobs) + `grade-sim-f1a-compare.mjs` (the F1-A comparison that chose the policy from data).
  - **Layer C** — `formal/grade-model/` PLT **Redex** model of the quarter-grade fold, cross-checked vs JS **PASS 1000/1000**.
    Run: `node roster-server/tools/grade-model-emit-cases.mjs` then **PowerShell** `racket formal/grade-model/crosscheck.rkt`
    (racket = scoop `current=9.2`, on `scoop/shims`; **segfaults under MSYS bash → use PowerShell**). Codex draft folded (Redex `number` not `rational`; subscripted-nonterminal pattern vars; flonum gates/rounding to mirror JS IEEE doubles).
- **4 findings (3 fixed + 1 averted), all simulator-found:**
  - **F1** ahead-of-schedule work could LOWER your grade (−14): a not-yet-due lesson joined the Lessons denominator on first touch AND its un-taken quiz counted as 0.
  - **F2** v3 work weights + the 40/70 gates were HARDCODED (despite grade-config's "all knobs here" claim) → now config (`v3WorkWeights`, `v3Gates`), defaults byte-identical.
  - **F3** your FIRST worksheet blank dropped the lesson 100→75 (Cws flips from absent/ignored to 1-of-4 with the unfilled blanks as 0).
  - **F4 (headline):** the sim caught that the FIRST proposed F1-A fix `'only-helps'` was itself **NON-MONOTONIC** (raising a due lesson could evict an above-avg early lesson → A3 violation) BEFORE it shipped → shipped the monotonic `'not-until-due'`.
  - **Shipped flags (`roster-server/grade-config.js`, ENABLED):** `v3FixQuizZero:true`, `v3FixCwsReveal:true`, `v3AheadOfScheduleLessons:'not-until-due'`. **Default-OFF path is byte-identical** (`grade-sim-fixes.test.js` pins the findings under legacy config + verifies the fixes). Adversarial review (Codex, read-only) CLEAN (A2 ceiling, A3 monotonicity, no double-count, flags-off identity). ⚠ **`'only-helps' must NOT ship — it violates A3.**
- **Appeal state machine — `3029dae`:** `tests/appeal-state-machine.test.js` EXHAUSTIVELY model-checks the reflection appeal machine
  (tiny space = proof). **F5** "AI only ever raises" was enforced ONLY by the `_aiFrqFloor` overlay monkey-patch (~L2290), NOT the base
  `recordReflectionToGradebook` (~L1206) → a P→I appeal could write the LOWER grade. **F6** a downgrade appeal lowered the DISPLAYED
  score while the UI said "Score maintained". **FIXED:** `scripts/wire-appeal-clamp.mjs` injects a clamp (appeal verdict never below
  previous; marker `APPEAL-CLAMP`) into all **69 worksheets**; `u3_lesson6-7_live.html` (original prototype, different handler) patched directly.
- **Lesson gating — MODELED, NO findings (`d48bf32`):** `tests/lesson-gating.test.js` exhaustively model-checks the strict gate
  (`_isLessonUnlocked`/`_isLessonComplete`/`_prevTopicInSequence`/`_prevSummerTopic`) → reachable states are CONTIGUOUS PREFIXES
  (the historical parity leak 1.2/1.4/1.6-open/1.3/1.5-locked is structurally impossible), monotonic, no deadlock, combined-topic bridge works. **Confirms the s11 LESSON_GATE_BUILD §8 fix holds.**
- **⚠ Rigor caveat:** Layer A drives the **real** engine; the appeal + gating models are faithful models of the **documented logic**, NOT the live DOM-coupled code. A live-code harness (extract the real functions + stub their globals) would make them true differential checks — an optional follow-on.
- **Tests:** roster-server **985/985**; root **7139 pass** — the **6 pre-existing failures** (desk-gating-fixes / desk-self-signup / desk-user-role / desk-signin-wall) are the user's parallel onboarding refactor, UNCHANGED. Racket v9.2 + redex installed on this box (scoop).

## ⏭ SESSION 12 SHIPPED (2026-06-16) — "view as student" worksheets show the STUDENT's answers READ-ONLY + Show-Answers cheat closed

HEAD `0780ece` (one commit, 80 files). Touches `roster-server/**` → **Railway auto-deploys**; GH Pages republishes. Both bugs the
teacher hit are fixed and 20-agent adversarially reviewed (1 MAJOR + NITs folded). **TEACHER CONFIRMED IT WORKS LIVE.**

- **BUG 1 — view-as opened a worksheet showing the TEACHER's own past answers; now shows the STUDENT's, READ-ONLY.** Root cause:
  the Desk's view-as is per-tab `sessionStorage` impersonation that NEVER changes the roster login; worksheets are separate pages
  that hydrate via `gradebook-client.js fetchPrior` → `GET /ledger/student/:id` keyed on the signed-in identity (= the teacher).
  - `roster-server/ledger.js` — a verified TEACHER token may now read ANY student's ledger; non-teacher cross-student reads still
    403. **GOTCHA (folded): the role lookup runs on the ROSTER db, not the ledger db** — `server.js` threads `rosterDb: db` into
    `mountLedger`; without that every view-as read 403'd.
  - `gradebook-client.js` — `fetchPrior` honors `window.__VIEW_AS_STUDENT_ID__` (teacher token rides along in the header).
  - Desk `_wireViewAsWorksheetLinks` — capturing click/auxclick listener appends `?viewAsUserId=<sid>` to worksheet anchor hrefs
    ONLY under `_viewAsContext()` (worksheet filenames only; skips edgar/mit/quiz/external).
  - `scripts/wire-worksheet-viewas.mjs` — idempotent, EOL-preserving codemod (marker `WS-VIEWAS-MODULE`) injecting the read-only
    module across all **69 worksheets**: sets `__VIEW_AS_STUDENT_ID__` + `__WS_READ_ONLY__`, **NEUTERS every server write sink**
    (`gradebookClient.record` + `railwayClient.submitAnswer` → no-ops — this is what covers the on-load `healLocalAnswersToLedger`
    path), disables inputs, hides grade/answer buttons, fetches `/teacher/student/:sid/profile` for the banner + identity (fail-safe:
    blanks the header if the fetch fails — never the wrong person). **⚠ To edit the module: `git checkout -- $(git diff --name-only |
    grep -E '^u\d+_lesson.*_live\.html$')` to revert the 69 first, then re-run `--apply` — the marker makes a plain re-run a SKIP.**
  - `roster-prefill.js` — bails in view-as (it was filling the TEACHER's name + a green "signed in as teacher" banner = the review's MAJOR).
- **BUG 2 — "Show Answers" was a free 100%** (fill key → Check). Button now ships `hidden`; revealed ONLY for a signed teacher on
  their OWN worksheet (gated on `rosterClient.current().role`, re-gated on a later sign-in). **NOTE (accepted): a casual-cheat speed
  bump, NOT a boundary** — `data-answer` values + the `showAnswers()` global are in the page; the durable fix is server-side scoring
  (out of scope). LEFT (noted, out of scope): the pre-existing `?token=` query-string fallback on `GET /ledger/student` (new code is header-only).
- **Tests:** roster-server **963/963**; new `tests/worksheet-viewas-module.test.js` 11/11 (runs the real injected module in jsdom);
  `gradebook-client` / `desk-view-as` / `roster-prefill` extended + green; root **7125 pass** — the **6 pre-existing onboarding/icon
  failures** (desk-gating-fixes / desk-self-signup / desk-user-role / desk-signin-wall) are the user's parallel refactor, UNCHANGED.

## ⏭ SESSION 11 SHIPPED (2026-06-16) — Desk/gating/Live-Classroom + cr login, all adversarially reviewed

- **STRICT topic-sequence lesson gate** (`0a79f1c`, LESSON_GATE_BUILD §8): the gate keyed on the previous CALENDAR CELL
  (parity leak: 1.2/1.4/1.6 open, 1.3/1.5 locked) → now gates on the true topic-predecessor (`_prevTopicInSequence`),
  window-independent + cross-portion (topic-keyed completion). Date bypass REMOVED (strict; fall too — teacher P5 unlock is
  the escape). **⚠ live config forces period E (combined pacing `1.2+1.3`…) but summer is individual (`1.1`..`1.10`)** → the
  gate DISPATCHES by cell surface (`_prevSummerTopic` for summer cells, `_prevTopicInSequence` for fall) + a completion
  bridge (`_isLessonComplete`: combined "A+B" done when its parts are). The review caught this as a BLOCKER (a naive single-
  sequence gate left summer always-open). Verified vs live cP=E.
- **Buy-min 25→5** (`d7b0636`) + disbursement **"✓ given/sent"** fix; **Teacher Tools launcher** + **Roster Console restored**
  (`5bd38cd`, Class Gradebook dropped); **voluntary "Change Password"** in the User menu (`c141867`); **"I'm not on the list"
  → straight to GUEST** (no self-signup) (`68eb697`).
- **Kid→kid candy gifting** (`db24a41`, migration `0021` USER-RUN) — `POST /wallet/gift` by username, Desk 🎁, atomic
  `doge_gift()` w/ HARD daily cap, active-student-only recipient, kill-switch. 15-finding review folded.
- **Guest + Teacher Live-Classroom AVATARS** (`7a1eb0c` guest; fa `7aa5891` + cr `42b74e3` teacher): guests + the teacher
  now render as avatars in the scene; the teacher's avatar is movable + can step into doorways (vote VISUAL-ONLY — doesn't
  steer the class winner; server checkin role-guard). ⚠ KNOWN minor: arrow/Space drive the avatar in the tall teacher
  cockpit (mouse-wheel scroll still works) — accepted cost.
- **cr↔Desk login tightened** (cr `6c60965`): 401/expiry surfaced ("sign in again", was silent grade loss); cross-tab
  `storage` sign-out listener; `roster-client.js` synced to the Desk's. **LEFT (user chose cheap-wins): cr focus-roster-
  refresh + clear stale peer `classData` on identity change.** Audit detail in `project_cr_identity_unify.md`.

## ⏭ NEXT — candy economy REVIVED + BIDIRECTIONAL (poke + 7-number ledger + DOGE cash-out, see s16/s15 ↑). Calendar + grade-integrity COMPLETE.

> **GRADE-INTEGRITY MODELING (s13 — DONE).** Model app areas as state machines / property tests over the real logic to FIND or
> VERIFY integrity bugs. SHIPPED s13 (all pushed): grade engine (Layers A/B/C, 3 fixes + F4 averted), appeal machine (F5/F6 fixed
> across all 69 worksheets, `3029dae`), lesson gating (modeled → SOUND, `d48bf32`), Schoology reconciliation (modeled → SOUND,
> idempotent + dup-safe, `43c3089`), AND the **LIVE-CODE harnesses** (`21219ff`): `tests/lesson-gating-live.test.js` +
> `tests/appeal-clamp-live.test.js` extract the REAL Desk/worksheet functions (brace-match + `new Function` with stubbed globals)
> and run the invariants against the shipping code — the real gate matches the model and the real appeal clamp is verified
> end-to-end. **No open task in this program.** The reusable recipe: identify/extract the pure logic → fixture + generator → assert
> invariants (exhaustive when the state space is small, fast-check/seeded-random when large) → pin findings → fix → (optional)
> live-code harness via the `fnBody` extractor. **Possible NEW targets if reopened:** Live Classroom poll/vote protocol (wants TLA+,
> not fast-check — but DEPRECATED per s15), or the **candy/DOGE wallet conservation math** — ✅ **DONE (s17)**: the 7-number
> identity `Earned+Received+Realized=Gifted+Converted+Materialized+Owed` got the full Layer A (fast-check) + Layer B (real-Postgres
> differential via pglite — closes the "fake hand-copies the SQL" gap) + Layer C (Redex) treatment, plus a 19-agent adversarial
> review that caught + FIXED F1 (the teacher-path lost-update race). See the SESSION 17 block at the top + `WALLET_CONSERVATION_FINDINGS.md`.
> Findings doc: `GRADE_SIMULATION_FINDINGS.md`; memory: `project_grade_simulator.md` + `doge-candy-buyback-decisions.md`.
> (DOGE is no longer "paused" — see s15/s16.)

> **DOGE/candy status (UPDATED s16 — BIDIRECTIONAL):** migrations `0019` / `0021` / `0022` / `0023` are **RUN**. The candy economy
> is the teacher's ACTIVE focus: avatar **poke** gifting + the **7-number ledger** (candy earned → owed → materialized weekly from
> the dashboard Owed worklist; **Realized** added by the s16 cash-out) + **DOGE** as a now-BIDIRECTIONAL appreciating-asset layer —
> candy → DOGE (1-DOGE-worth convert floor, 5-DOGE on-chain materialize) AND **DOGE → candy cash-out at the live rate** (uncapped
> gains, ~24h FIFO hold, honest P&L; un-sent in-app coins only). The teacher leaned toward deprecating in s12 but REVIVED + rebuilt
> it in s15 and made it bidirectional in s16 — **do NOT treat it as paused.** Still **NOT physically handing out paper wallets /
> registering addresses** (the on-chain DOGE go-live stays OPTIONAL),
> but the in-app candy ledger + poke are LIVE and in use. If on-chain go-live is wanted: print the wallet sheet → register each
> address (Reward Disbursement) → DRY-RUN `node tools/doge-send.mjs` (CC plans only; `--send` is the teacher's deliberate,
> irreversible call; now batches at **≥5 DOGE** per the materialize threshold).

The original DOGE go-live checklist is kept below for reference, but items 1–2 are DONE and item 3 is on hold per the note above.

0. **✅ DONE (session 10):** migrations **0019 + 0020 RUN**; **node restarted** (mainnet, synced, 10,273 DOGE, RPC live);
   **30 paper wallets generated + node-validated** at `C:/Users/rober/doge-wallets/` (OUTSIDE the repo — real keys; print
   the HTML, seal the `-KEYS.csv` offline, delete the HTML after printing); **canary send VERIFIED end-to-end** (1 DOGE →
   wallet #1 `DEuXEB47…`, txid `eaa5d3b6…`, 14 confs; `doge-chain.js` read it back `confirmedDoge:1`). The full loop works.
1. **✅ DONE (s12): migration `0021` (gifting) RUN.** `POST /wallet/gift` + the 🎁 button are live.
2. **✅ DONE (s12): Abraham Ladny (`olive_sloth`, PeriodX) + a few other students ENROLLED.** (Still set Abraham's Schoology UID
   `191627` if not yet done.)
3. **⏸ ON HOLD (s12): NOT handing out / registering wallets** — the teacher is considering deprecating candy/DOGE (see the status
   note above). If revived: print the wallet sheet, register each address in the dashboard (Reward Disbursement → set), then a
   DRY-RUN of `node tools/doge-send.mjs` (plan only) → first real `--send` when ready (CC runs dry-run only; `--send` is your
   deliberate call, irreversible).
   - **Optional:** set Railway env `BLOCKCYPHER_TOKEN` (lifts the explorer free-tier ~100 req/hr ceiling; on-chain display works without it).
   - **Buy minimum is now 5 candy** (~1 lesson, was 25) — budget-neutral, kids can convert sooner.
   - **PENDING discussion:** guest-workflow hardening (complement the no-guest sign-in wall, don't collide with the in-progress onboarding refactor).
4. **✅ DONE (session 9, `c84a8e4`): watch-only on-chain balance display.** `roster-server/doge-chain.js` (BlockCypher
   `doge/main`; testnet has NO provider → explicit error, registration mainnet-locked), `GET /wallet/chain` +
   `GET /class/wallets/chain`, Desk ⛓ on-chain line + dashboard On-chain Ɖ column. **Two NEW optional activation items:**
   (a) run migration `0020_doge_chain_cache` (USER-RUN, OPTIONAL — the live read works with just 0019 + a registered
   address; 0020 only adds durable cache cols read back on an explorer outage); (b) set Railway env `BLOCKCYPHER_TOKEN`
   (free tier ~100 req/hr; the Desk polls per open wallet every 5 min). Plus item-6 hardening (uuid-404, overspend ⚠,
   `?section=` scope, address regex → 34 chars). roster-server 944 green; root 7092 green.
5. **VERIFY the My Ledger ↔ Pacing color fix landed** (`46f5220`): the Desk's summer-schedule fetch could fail silently →
   My Ledger showed fall 'eligible' (yellow) while the dashboard Pacing showed summer (green) for the same person. Fix
   retries the load on `openWallet` + re-paints on success. If it persists, console diag in the Desk:
   `console.log(!!window._summerSchedule, _walletDisplayReadiness())` — null schedule = the fetch is still failing.
6. **✅ DONE (session 9): the verification minor-backlog hardening** — negative candy now SURFACED (`candyBalanceRaw` +
   dashboard ⚠ overspend badge, not silently clamped); `studentId` uuid-shape guard → 404 not 500; `GET /class/wallets`
   (+`/chain`) section-scoped; `mark-given/sent` clamp regression-tested; custodial price-window exposure documented (spec §3).
7. **(carried from session 7 — RESOLVED session 9):** section naming is **already canonical** — `/roster/section/PeriodX`
   returns the 27 students, `/roster/section/PERIODX` is empty → **NO `UPDATE` needed** (self-signup writes `PeriodX`; any
   all-caps would be legacy, and none exist). Both Railway servers are **deployed** (`/commits`→401 auth-gate, cr
   `/api/user-answers/<u>`→200). **Still open:** Schoology-UID coverage for the 27 — needs the teacher secret:
   `ROSTER_TEACHER_SECRET=… python tools/build_schoology_fixture.py --section PeriodX --inspect` (read `uid_bridge_covered`).

## ✅ SHIPPED THIS SESSION (2026-06-15/16, session 8)

**DOGE EFFORT WALLET — the headline. Spec `DOGE_WALLET_SPEC.md` (v2, `60a6485`); memory `project_doge_effort_wallet.md`.**
A reward system on top of the existing effort points (`js/wallet_logic.js` WALLET_POINTS): kids earn **candy** (stable
≈-dollar unit, FIXED 36 pts = 1 candy = $0.036) → **eat it** (consumed) or **buy DOGE** at the **live FLOATING price**
(buy early = cheaper; "33 candy/DOGE" if it appreciates). Real on-chain **paper wallets**, app **watch-only**. **Broker
economics**: teacher cost = candy-dollars forgone, capped at the $300 budget, no DOGE price exposure. Forced session-end
choice, one-way (no sell-back). Teacher confirmed all decisions; teaching goal = work-early + appreciating-asset-vs-consumable.
- **Phase 1a `f5f1152`** — `wallet_logic.js` conversion math (`candyFromPoints`/`candyPerDoge`/`dogeFromCandy`/`usdFromCandy`)
  + Desk My-Ledger preview panel. **Gated**: shows for teachers automatically (`_deskIsTeacher`) or `localStorage
  'apstats_doge_wallet_preview'='1'` for students (default OFF). **NOTE: gated OFF in `apstats_preview_as_student` mode.**
- **Phase 1b `6d2f366`** — `tools/doge-wallet-gen.mjs`: OFFLINE Dogecoin paper-wallet generator. 100% Node built-in crypto
  (secp256k1 via createECDH, SHA256+RIPEMD160), hand-rolled base58check self-tested vs the canonical vector each run.
  Prints HTML sheet (addr+QR / WIF+QR) + sealed addr↔key CSV. mainnet `D…` + `--testnet` `n…`. `qrcode` devDep. 9 tests + live testnet run.
- **Phase 2 backend `0935f55`** — migration `0019` (USER-RUN), `doge-econ.js` (shared frozen econ + `computeEffort`),
  `doge-wallet.js` mounted: student `GET /wallet` / `POST /wallet/eat` / `buy-doge` (server-stamped price, 25-candy floor);
  teacher `POST /wallet/address` / `mark-given` / `mark-sent` / `GET /class/wallets`. db helpers. 503-graceful pre-0019.
- **Phase 2 Desk wallet `cf0e8f1`** — interactive 🍬 Eat / Ɖ Buy-DOGE in My Ledger (display-only fallback pre-0019).
- **Phase 2 disbursement `c9bb63c`** + `369d25b` + `46f5220` — teacher-dashboard "🍬 Reward Disbursement": per-kid candy
  earned / **to give** (eaten−given) / **to deposit** (balance−sent) / address, with ✓gave/✓sent/set-address; `/class/grades`
  gained a per-student `effort:{points,candy}`. Now **includes teacher/test accounts** (badged 🧪) for testing.
- **Spend race FIXED `f0d16fa`** — `/wallet/eat`+`/wallet/buy-doge` now use an atomic `doge_spend()` Postgres function
  (a single guarded UPDATE, folded into 0019) instead of read-modify-write; +tests (eat-then-buy conservation; the real
  PostgREST row-of-nulls guard).
- **Phase 3 `4ce2673`+`d4fe519`** — `tools/doge-send.mjs`: OFFLINE batch sender. Reads `/class/wallets`, plans ONE
  `sendmany` from the node to kids' addresses, broadcasts, then marks sent. DRY-RUN default; mainnet assert + fee buffer +
  validate-every-address before broadcast; **crash-resilient journal** (refuses `--send` while a prior batch is
  un-reconciled → no double-send); mark-given/sent clamped at owed/banked. `planSends` unit-tested (11). Spending key
  never leaves the node (watch-only app).
- **Verified by TWO 3-agent adversarial workflows:** Phase-2 (security + integration CLEAN; the race was the one MAJOR →
  now fixed) and Phase-3 (`doge_spend` SQL CLEAN; the sender's crash double-send MAJOR → now fixed; RLS + clamps folded).
  roster-server suite 919 green; root suites green except the 6 pre-existing onboarding failures.

**DESK POLISH (secondary):** username-wheel login footer declutter (`10e4e04`); Do-Now card restructure + click-opens-My-
Ledger fix (`50203a1`/`36ec71e`); My Gradebook folded into My Ledger (`ed310a6`); Pacing Overview shows teacher/test rows
(`397927d`); **summer schedule woven INTO the calendar grid** as amber weeks (`856d643`→`07881c8`); **school year opens with
orientation + a no-stakes Unit-1 baseline** (`5d197c3`). All adversarially verified; weekend-anchor calendar bug fixed as a bonus.

## KEY FACTS / GOTCHAS
- **roster-server is self-contained** — can't import `../js`; the frozen econ is DUPLICATED in `roster-server/doge-econ.js`
  (mirror of `js/wallet_logic.js`). Keep in sync if the peg ever changes (it shouldn't).
- **Effort points** = receipt-carrying `item_ledger` rows (with `receipt_compact`), deduped by `source|item_id`, scored by
  WALLET_POINTS. `computeEffort` is the single source (class.js + wallet routes agree → teacher total = kid's wallet).
- **Numbers** (tunable, frozen at outset): 36 pts/candy, $0.036/candy ($13 / 360-pc bag), ~30 kids, ~$300 budget ≈ 8,300
  candy; DOGE ~$0.088 → 1 DOGE ≈ 2.4 candy. `POINTS_PER_CANDY=36` is the one dial — retune once real accrual lands, then freeze.
- **6 pre-existing root-suite failures** (desk-gating-fixes icon + desk-self-signup/signin-wall/user-role onboarding) are
  the user's parallel onboarding/icon refactor — NOT this session's; left untouched. Root suite otherwise green (~7080 pass).
- **Guests can't appear server-side** anywhere (pacing, disbursement) — device-local aliases, never on the roster.
