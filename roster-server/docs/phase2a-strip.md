## Phase 2a ? roster-server strip

| Kind | Item | Decision | Disposition |
| --- | --- | --- | --- |
| module | `admin-restore.js` | KEEP | Remove candy award metadata from restore. |
| module | `admin-snapshot.js` | KEEP | Remove candy award metadata from snapshots. |
| module | `backfill.js` | KEEP | Academic/flashcard commits, integrity and recovery. |
| module | `bkt.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `class.js` | KEEP | Remove economy totals and trainer summaries from class responses. |
| module | `code-hash.js` | KEEP | Academic/flashcard commits, integrity and recovery. |
| module | `commits.js` | KEEP | Academic/flashcard commits, integrity and recovery. |
| module | `crypto.js` | KEEP | Remove wallet WIF encryption and wallet secret resolution; keep password cryptography. |
| module | `db.js` | KEEP | Remove wallet, candy, chain, payout and stake database operations and review candy metadata. |
| module | `doge-chain.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `doge-econ.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `doge-wallet.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `donow.js` | KEEP | Retained service infrastructure. |
| module | `frq-ledger-db.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `frq-prompt.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `frq-verdict.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `frq-worker.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `grade-answer-key.js` | KEEP | Unified academic ledger, grades and transcripts. |
| module | `grade-config.js` | KEEP | Remove PC anchors/curves, trainer, poster and pcTrack settings; retain dates/useV3 and add Phase 3 placeholder. |
| module | `grade-contexts.js` | KEEP | Stop loading retired event tracks; accept empty valid curriculum bundles. |
| module | `grade-offline-inputs.js` | KEEP | Remove trainer data and PC-specific redaction options. |
| module | `grade.js` | KEEP | Remove PC/trainer grading branches; retain legacy and v3 grade entry points. |
| module | `gradebook-grid.js` | KEEP | Remove PC/poster columns and category branches; preserve supported grid and Schoology inputs. |
| module | `ledger-db.js` | KEEP | Unified academic ledger, grades and transcripts. |
| module | `ledger-import.js` | KEEP | Unified academic ledger, grades and transcripts. |
| module | `ledger.js` | KEEP | Reject retired and unsupported sources through the surviving-source allowlist. |
| module | `lesson-grade.js` | KEEP | Remove PC/trainer/poster aggregation; retain generic two-track v3 arithmetic and supported work grading. |
| module | `lesson-unlock-db.js` | KEEP | Teacher feedback and lesson access; no classroom state. |
| module | `lesson-unlock.js` | KEEP | Teacher feedback and lesson access; no classroom state. |
| module | `lib/doge-keys.mjs` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `mastery.js` | KEEP | Academic grading, diagnostics and remediation. |
| migration | `migrations/0001_roster.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0002_item_ledger.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0003_roster_pw.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0004_remediation_assignment.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0005_roster_role.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0006_roster_sprite_hue.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0007_poll_archive.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0008_nudges_log.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0009_lesson_unlock.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0010_schoology_sync.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0011_item_ledger_pc_source.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0012_roster_schoology_uid.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0013_item_ledger_blooket_source.sql` | KEEP | Remove retired source values and stale poster comment; retain Blooket. |
| migration | `migrations/0014_item_ledger_quiz_exception.sql` | KEEP | Remove retired source values; retain quiz exceptions. |
| migration | `migrations/0015_item_ledger_quiz_review.sql` | KEEP | Remove retired source values; retain quiz reviews. |
| migration | `migrations/0016_item_ledger_trainer_source.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0017_trainer_state.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0018_item_ledger_receipt.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0019_doge_wallet.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0020_doge_chain_cache.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0021_doge_gifting.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0022_retire_candy_eaten.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0023_doge_sell.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0024_tetris_stakes.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0025_review_marks.sql` | KEEP | Keep review marks/indexes/RLS; remove candy fields, grants and RPC schema. |
| migration | `migrations/0026_trusted_issuers.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0027_student_keys.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0028_submission_archive.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0029_pc_makeup.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0030_quarter_grade_snapshot.sql` | KEEP | Remove stale PC schema comment; retain snapshots. |
| migration | `migrations/0031_frq_tickets.sql` | KEEP | Retained roster, academic ledger, Schoology, receipt or recovery schema. |
| migration | `migrations/0032_payout_batch.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0033_wallet_address_proposals.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0034_candy_return.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| migration | `migrations/0035_wallet_custody.sql` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `misconception-assets.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `misconception-triage.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `misconceptions.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `nudge-db.js` | KEEP | Teacher feedback and lesson access; no classroom state. |
| module | `nudge.js` | KEEP | Teacher feedback and lesson access; no classroom state. |
| module | `payout.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `pc-db.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `pc-figures.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `pc.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `poll-archive-db.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `poll-archive.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `rate-limit.js` | KEEP | Retained service infrastructure. |
| module | `receipts.js` | KEEP | Remove payout receipt issuance; retain signed academic receipts. |
| module | `remediation-db.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `remediation.js` | KEEP | Academic grading, diagnostics and remediation. |
| module | `review.js` | KEEP | Remove candy minting and award responses; retain signed marks and feedback. |
| module | `rollup.js` | KEEP | Unified academic ledger, grades and transcripts. |
| module | `scoring.js` | KEEP | Remove PC row scoring. |
| module | `scripts/build-golden-fixture.mjs` | KEEP | Remove PC diagnostic logging and stale economy comment. |
| module | `scripts/build-golden-synthetic.mjs` | KEEP | Remove PC/trainer generators and config before documented regeneration. |
| module | `scripts/gen-blooket-lessons.mjs` | KEEP | Retained Blooket authoring or golden-fixture tooling. |
| module | `scripts/load-pc-bank.mjs` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `server.js` | KEEP | Remove retired imports, mounts and production initialization; preserve injectable startup. |
| module | `signup-config.js` | KEEP | Identity, authentication and self-signup. |
| module | `snapshot-verify.js` | KEEP | Academic/flashcard commits, integrity and recovery. |
| module | `student-keys.js` | KEEP | Identity, authentication and self-signup. |
| module | `submissions.js` | KEEP | Academic/flashcard commits, integrity and recovery. |
| module | `teacher-auth.js` | KEEP | Remove payout-agent authorization helpers; keep teacher auth. |
| module | `teacher.js` | KEEP | Remove student poll archive endpoint. |
| module | `token.js` | KEEP | Identity, authentication and self-signup. |
| module | `tools/grade-model-emit-cases.mjs` | KEEP | Remove poster track generation. |
| module | `tools/grade-sim-f1a-compare.mjs` | KEEP | Retained grade simulation tooling. |
| module | `tools/grade-sim-sweep.mjs` | KEEP | Remove the poster-weight sweep setting. |
| module | `tools/wallet-model-emit-cases.mjs` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `trainer-db.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `trainer.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `transcript-canonical.js` | KEEP | Unified academic ledger, grades and transcripts. |
| module | `transcript.js` | KEEP | Unified academic ledger, grades and transcripts. |
| module | `username.js` | KEEP | Identity, authentication and self-signup. |
| module | `vitest.config.js` | KEEP | Retained service infrastructure. |
| module | `wallet-custody.js` | DROP | Retired feature module, schema or dedicated tooling. |
| module | `worksheet-diagnostics.js` | KEEP | Academic grading, diagnostics and remediation. |
| route | `/admin/verify` | KEEP | admin-restore.js |
| route | `/admin/restore` | KEEP | admin-restore.js |
| route | `/admin/snapshot` | KEEP | admin-snapshot.js |
| route | `/class/misconceptions` | KEEP | class.js |
| route | `/class/blank/:itemId` | KEEP | class.js |
| route | `/class/grades` | KEEP | class.js |
| route | `/class/quarter/close` | KEEP | class.js |
| route | `/class/quarter/deltas` | KEEP | class.js |
| route | `/class/blooket` | KEEP | class.js |
| route | `/class/backfill-receipts` | KEEP | class.js |
| route | `/class/mastery` | KEEP | class.js |
| route | `/commits` | KEEP | commits.js |
| route | `/wallet` | DROP | doge-wallet.js |
| route | `/wallet/chain` | DROP | doge-wallet.js |
| route | `/wallet/eat` | DROP | doge-wallet.js |
| route | `/wallet/buy-doge` | DROP | doge-wallet.js |
| route | `/wallet/sell-doge` | DROP | doge-wallet.js |
| route | `/wallet/gift` | DROP | doge-wallet.js |
| route | `/wallet/bet/open` | DROP | doge-wallet.js |
| route | `/wallet/bet/resolve` | DROP | doge-wallet.js |
| route | `/wallet/casino` | DROP | doge-wallet.js |
| route | `/class/casino` | DROP | doge-wallet.js |
| route | `/wallet/address` | DROP | doge-wallet.js |
| route | `/wallet/address/propose` | DROP | doge-wallet.js |
| route | `/class/wallet-proposals` | DROP | doge-wallet.js |
| route | `/wallet/address/approve` | DROP | doge-wallet.js |
| route | `/wallet/address/reject` | DROP | doge-wallet.js |
| route | `/wallet/mark-given` | DROP | doge-wallet.js |
| route | `/wallet/mark-sent` | DROP | doge-wallet.js |
| route | `/wallet/mark-returned` | DROP | doge-wallet.js |
| route | `/class/wallets` | DROP | doge-wallet.js |
| route | `/class/wallets/chain` | DROP | doge-wallet.js |
| route | `/donow` | KEEP | donow.js |
| route | `/grade/answer-key` | KEEP | grade-answer-key.js |
| route | `/grade/offline-inputs` | KEEP | grade-offline-inputs.js |
| route | `/grade` | KEEP | grade.js |
| route | `/ledger/import` | KEEP | ledger-import.js |
| route | `/ledger/record` | KEEP | ledger.js |
| route | `/ledger/frq-config` | KEEP | ledger.js |
| route | `/ledger/frq-status` | KEEP | ledger.js |
| route | `/ledger/frq-appeal` | KEEP | ledger.js |
| route | `/ledger/frq-regrade` | KEEP | ledger.js |
| route | `/ledger/student/:studentId` | KEEP | ledger.js |
| route | `/teacher/lesson-unlock` | KEEP | lesson-unlock.js |
| route | `/teacher/lesson-unlock/revoke` | KEEP | lesson-unlock.js |
| route | `/student/lesson-unlocks` | KEEP | lesson-unlock.js |
| route | `/teacher/student/:studentId/lesson-unlocks` | KEEP | lesson-unlock.js |
| route | `/mastery` | KEEP | mastery.js |
| route | `/teacher/nudge` | KEEP | nudge.js |
| route | `/teacher/nudge-history` | KEEP | nudge.js |
| route | `/student/nudge` | KEEP | nudge.js |
| route | `/student/nudge-history` | KEEP | nudge.js |
| route | `/student/nudge-history-guest` | KEEP | nudge.js |
| route | `/student/nudge-reply` | KEEP | nudge.js |
| route | `/teacher/nudge-inbox` | KEEP | nudge.js |
| route | `/payout/plan` | DROP | payout.js |
| route | `/payout/batch` | DROP | payout.js |
| route | `/payout/batch/:id/cancel` | DROP | payout.js |
| route | `/payout/next` | DROP | payout.js |
| route | `/payout/batch/:id/claim` | DROP | payout.js |
| route | `/payout/batch/:id/arm` | DROP | payout.js |
| route | `/payout/batch/:id/complete` | DROP | payout.js |
| route | `/payout/batch/:id/fail` | DROP | payout.js |
| route | `/payout/status` | DROP | payout.js |
| route | `/pc/:unit/:part` | DROP | pc.js |
| route | `/pc/:unit/:part/submit` | DROP | pc.js |
| route | `/pc/grade` | DROP | pc.js |
| route | `/pc/unlock` | DROP | pc.js |
| route | `/pc/unlock/student` | DROP | pc.js |
| route | `/pc/unlock/status` | DROP | pc.js |
| route | `/pc/unlock/class` | DROP | pc.js |
| route | `/poll-archive` | DROP | poll-archive.js |
| route | `/poll-archive/:id` | DROP | poll-archive.js |
| route | `/receipts/issuer` | KEEP | receipts.js |
| route | `/receipts/trusted-issuers` | KEEP | receipts.js |
| route | `/receipts/trusted-issuers/revoke` | KEEP | receipts.js |
| route | `/remediation/propose` | KEEP | remediation.js |
| route | `/remediation/approve` | KEEP | remediation.js |
| route | `/remediation/complete` | KEEP | remediation.js |
| route | `/remediation/waive` | KEEP | remediation.js |
| route | `/remediation/student` | KEEP | remediation.js |
| route | `/remediation/list` | KEEP | remediation.js |
| route | `/remediation/unlocks` | KEEP | remediation.js |
| route | `/remediation/propose-from-mastery` | KEEP | remediation.js |
| route | `/class/review-queue` | KEEP | review.js |
| route | `/class/review-item/:ledgerId` | KEEP | review.js |
| route | `/class/review-by-item` | KEEP | review.js |
| route | `/class/review` | KEEP | review.js |
| route | `/rollup` | KEEP | rollup.js |
| route | `/health` | KEEP | server.js |
| route | `/roster/enroll` | KEEP | server.js |
| route | `/roster/verify` | KEEP | server.js |
| route | `/roster/resolve` | KEEP | server.js |
| route | `/roster/change-password` | KEEP | server.js |
| route | `/roster/open-sections` | KEEP | server.js |
| route | `/roster/claim` | KEEP | server.js |
| route | `/roster/list` | KEEP | server.js |
| route | `/roster/:studentId` | KEEP | server.js |
| route | `/roster/:studentId/archive` | KEEP | server.js |
| route | `/roster/:studentId/unarchive` | KEEP | server.js |
| route | `/roster/:studentId/sprite-hue` | KEEP | server.js |
| route | `/roster/:studentId/schoology-uid` | KEEP | server.js |
| route | `/roster/section/:section` | KEEP | server.js |
| route | `/student-keys/register` | KEEP | student-keys.js |
| route | `/student-keys` | KEEP | student-keys.js |
| route | `/student-keys/revoke` | KEEP | student-keys.js |
| route | `/submissions/archive` | KEEP | submissions.js |
| route | `/teacher/student/:studentId/profile` | KEEP | teacher.js |
| route | `/teacher/student/:studentId/grade` | KEEP | teacher.js |
| route | `/teacher/student/:studentId/recent` | KEEP | teacher.js |
| route | `/teacher/student/:studentId/donow` | KEEP | teacher.js |
| route | `/teacher/student/:studentId/poll-archive` | DROP | teacher.js |
| route | `/class/backfill-receipts?section=P1` | KEEP | tests/backfill-receipts.test.js |
| route | `/class/blank/WS-U6L1-2-Q1` | KEEP | tests/class-blank.test.js |
| route | `/class/blank/WS-U6L1-2-Q1?token=good` | KEEP | tests/class-blank.test.js |
| route | `/class/blank/WS-U6L1-2-Q2` | KEEP | tests/class-blank.test.js |
| route | `/class/blank/WS-U6L1-2-Q99` | KEEP | tests/class-blank.test.js |
| route | `/class/grades?section=P1` | KEEP | tests/class.test.js |
| route | `/class/grades?includeSavedWork=1` | KEEP | tests/class.test.js |
| route | `/class/grades?includeStaff=1` | KEEP | tests/class.test.js |
| route | `/class/quarter/deltas?quarter=Q1` | KEEP | tests/class.test.js |
| route | `/class/quarter/deltas?quarter=nope` | KEEP | tests/class.test.js |
| route | `/grade?token=garbage` | KEEP | tests/grade.test.js |
| route | `/teacher/student/stu_abc123/lesson-unlocks` | KEEP | tests/lesson-unlock-endpoints.test.js |
| route | `/teacher/student/stu_unknown/lesson-unlocks` | KEEP | tests/lesson-unlock-endpoints.test.js |
| route | `/mastery?token=garbage` | KEEP | tests/mastery.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter&teacherUsername=apple-fox` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya,evil` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya(evil` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya.evil` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya'evil` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=student_name-99&teacherUsername=apple-fox` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter&limit=999&teacherUsername=apple-fox` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter&limit=banana&teacherUsername=apple-fox` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter&limit=0&teacherUsername=apple-fox` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter&limit=-5&teacherUsername=apple-fox` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter&offset=-5&teacherUsername=apple-fox` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter&offset=banana&teacherUsername=apple-fox` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-history?studentUsername=papaya-otter&teacherUsername=INJECTED` | KEEP | tests/nudge-history.test.js |
| route | `/teacher/nudge-inbox?section=PeriodE&since=2026-08-01T00:00:00.000Z&limit=999` | KEEP | tests/nudge-inbox.test.js |
| route | `/teacher/nudge-inbox?limit=0` | KEEP | tests/nudge-inbox.test.js |
| route | `/teacher/nudge-inbox?since=2026-08-01` | KEEP | tests/nudge-inbox.test.js |
| route | `/teacher/nudge-inbox?since=yesterday` | KEEP | tests/nudge-inbox.test.js |
| route | `/rollup?token=garbage` | KEEP | tests/rollup.test.js |
| route | `/student/nudge-history?limit=999` | KEEP | tests/student-dm.test.js |
| route | `/student/nudge-history?limit=banana` | KEEP | tests/student-dm.test.js |
| route | `/student/nudge-history?offset=-5` | KEEP | tests/student-dm.test.js |
| route | `/student/nudge-history-guest?guestUsername=Guest_Mango_Turtle` | KEEP | tests/student-dm.test.js |
| route | `/student/nudge-history-guest?guestUsername=guest_mango_turtle` | KEEP | tests/student-dm.test.js |
| route | `/student/nudge-history-guest?guestUsername=papaya-otter` | KEEP | tests/student-dm.test.js |
| route | `/student/nudge-history-guest?guestUsername=Guest_Berry_Sloth` | KEEP | tests/student-dm.test.js |
| route | `/teacher/student/stu_abc123/profile` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/no-such-student/profile` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/stu_abc123/grade` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/unknown-id/grade` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/stu_abc123/recent` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/stu_abc123/recent?limit=5` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/stu_abc123/recent?limit=banana` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/stu_abc123/recent?limit=999` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/no-such/recent` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/stu_abc123/recent?limit=Infinity` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/stu_abc123/donow` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/no-such/donow` | KEEP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/stu_abc123/poll-archive` | DROP | tests/teacher-endpoints.test.js |
| route | `/teacher/student/no-such/poll-archive` | DROP | tests/teacher-endpoints.test.js |
| route | `/transcript` | KEEP | tests/transcript.test.js |
| route | `/trainer/state/:deckId` | DROP | trainer.js |
| route | `/trainer/leaderboard/:section/:deckId` | DROP | trainer.js |
| route | `/trainer/section/:section/summary/:deckId` | DROP | trainer.js |
| route | `/wallet/custody` | DROP | wallet-custody.js |
| route | `/wallet/custody/print` | DROP | wallet-custody.js |
| route | `/wallet/custody/:studentId` | DROP | wallet-custody.js |
| route | `/class/wallet-custody/export` | DROP | wallet-custody.js |
| route | `/class/wallet-custody` | DROP | wallet-custody.js |
| route | `/student/worksheet-diagnostics` | KEEP | worksheet-diagnostics.js |
| route | `/teacher/worksheet-diagnostics` | KEEP | worksheet-diagnostics.js |
| environment | `ANSWER_KEY_PATH` | KEEP | grade-contexts.js, server.js |
| environment | `BCRYPT_COST` | KEEP | server.js, vitest.config.js |
| environment | `BLOCKCYPHER_TOKEN` | DROP | doge-chain.js |
| environment | `BUYBACK_ENABLED` | DROP | doge-wallet.js |
| environment | `FRQ_APPEAL_MAX_PER_MINUTE` | KEEP | ledger.js |
| environment | `FRQ_CANARY_STUDENTS` | KEEP | ledger.js |
| environment | `FRQ_GRADE_MODE` | KEEP | server.js |
| environment | `FRQ_GRADER_SECRET` | KEEP | server.js |
| environment | `FRQ_GRADER_URL` | KEEP | server.js |
| environment | `FRQ_RECORD_MAX_PER_MINUTE` | KEEP | ledger.js |
| environment | `FRQ_STATUS_MAX_PER_MINUTE` | KEEP | ledger.js |
| environment | `GIFTING_ENABLED` | DROP | doge-wallet.js |
| environment | `GRADE_FREEZE_DIR` | KEEP | grade-contexts.js |
| environment | `LESSON_SCHEDULE_PATH` | KEEP | grade-contexts.js, server.js |
| environment | `NODE_ENV` | KEEP | frq-worker.js, grade-contexts.js, server.js, doge-wallet.js |
| environment | `OPEN_SIGNUP_SECTIONS` | KEEP | signup-config.js |
| environment | `PAYOUT_AGENT_KEY` | DROP | retired wallet / payout configuration |
| environment | `PAYOUT_BATCH_CAP` | DROP | payout.js |
| environment | `PC_FIGURES_MANIFEST_PATH` | DROP | pc-figures.js |
| environment | `PC_FIGURES_SUPABASE_SERVICE_KEY` | DROP | pc-figures.js |
| environment | `PC_FIGURES_SUPABASE_URL` | DROP | pc-figures.js |
| environment | `PC_TRACK_ENABLED` | DROP | grade-config.js |
| environment | `PORT` | KEEP | server.js |
| environment | `RAILWAY_GIT_COMMIT_SHA` | KEEP | server.js |
| environment | `RECEIPT_ISSUER_PRIVATE_KEY` | KEEP | receipts.js |
| environment | `RETIRED_ISSUER_PUBKEYS` | KEEP | receipts.js |
| environment | `REVIEW_GRANT_PUBKEY` | KEEP | receipts.js |
| environment | `ROSTER_GRADER_SECRET` | KEEP | server.js |
| environment | `ROSTER_PROCTOR_SECRET` | KEEP | ledger.js |
| environment | `ROSTER_PW_ENC_KEY` | KEEP | crypto.js |
| environment | `ROSTER_SUPABASE_SERVICE_KEY` | KEEP | db.js, ledger-db.js, lesson-unlock-db.js, nudge-db.js, remediation-db.js, worksheet-diagnostics.js, payout.js, pc-db.js, poll-archive-db.js, trainer-db.js |
| environment | `ROSTER_SUPABASE_URL` | KEEP | db.js, ledger-db.js, lesson-unlock-db.js, nudge-db.js, remediation-db.js, worksheet-diagnostics.js, payout.js, pc-db.js, poll-archive-db.js, trainer-db.js |
| environment | `ROSTER_TEACHER_SECRET` | KEEP | ledger.js, server.js, teacher-auth.js |
| environment | `ROSTER_TOKEN_SECRET` | KEEP | token.js, worksheet-diagnostics.js |
| environment | `SIGNUP_CLAIM_MAX` | KEEP | server.js |
| environment | `SIGNUP_CLAIM_WINDOW_MS` | KEEP | server.js |
| environment | `SKILL_MAP_PATH` | KEEP | server.js |
| environment | `STAKES_ENABLED` | DROP | doge-wallet.js |
| environment | `STUDENT_WALLET_OPTIN` | DROP | retired wallet / payout configuration |
| environment | `TEACHER_KEY` | KEEP | teacher-auth.js |
| environment | `TRAINER_DECK_ALLOWLIST` | DROP | trainer.js |
| environment | `USE_V3_GRADING` | KEEP | grade-config.js |
| environment | `VERIFY_IP_MAX` | KEEP | server.js |
| environment | `VERIFY_IP_WINDOW_MS` | KEEP | server.js |
| environment | `VERIFY_LOCKOUT_MAX` | KEEP | server.js |
| environment | `VERIFY_LOCKOUT_WINDOW_MS` | KEEP | server.js |
| environment | `VITEST` | KEEP | grade-contexts.js |
| environment | `WALLET_KEY_SECRET` | DROP | retired wallet / payout configuration |
| environment | `WORK_MANIFEST_PATH` | KEEP | server.js |
| environment | `WORKSHEET_KEY_PATH` | KEEP | server.js |
| environment | `UPDATE_M2B_GOLDEN` | KEEP | tests/m2b-grade-invariance.test.js |
| worker | `frq-worker.js polling interval and request timeout` | KEEP | Queued academic FRQ grading; worker starts in production. |
| worker | `doge-wallet.js stale-stake sweep interval` | DROP | Removed wallet scheduler and stake timeout refunds. |
| worker | `doge-chain.js external request timeout` | DROP | Removed balance fetches and timers. |
| middleware | `CORS, JSON body limits, student token, teacher auth, rate limiting` | KEEP | Protect surviving academic and roster routes. |
| middleware | `Wallet/payout/PC/trainer/poll-specific guards` | DROP | Removed with their route mounts. |
| feature | `Live classroom presence/poll, pico level/activity, Tetris and video` | DROP | No standalone server module/migration beyond deleted poll and wallet-stake modules; root/Desk clients belong to Phase 2b. |
| data | `pc_bank` | DROP | Removed loader and consumers; no standalone pc_bank data directory was present. |
| schema | `roster_sprite_hue (0006)` | KEEP | Identity preference, not classroom activity or level state. |

### Scope and provenance

Implemented 2026-09-13. Paths below are relative to `roster-server/` unless stated otherwise. KEEP on mixed modules means surviving behavior is retained and retired branches removed. The table covers all 178 indexed pre-strip route entries, modules, migrations, detected environment names, workers and middleware families. Duplicate route paths can represent different HTTP methods. No additional cron files were present. Routes come from this fork's pre-strip GitNexus index. Deleted environment consumers were reconstructed read-only from matching AP source counterparts at `../school/follow-alongs/roster-server` and checked against surviving code; no secret values are included.

### Deleted files (60)

- `data/pc-figures-manifest.json`
- `data/ti84-lesson-map.json`
- `docs/cors-allowlist.patch`
- `doge-chain.js`
- `doge-econ.js`
- `doge-wallet.js`
- `lib/doge-keys.mjs`
- `migrations/0007_poll_archive.sql`
- `migrations/0011_item_ledger_pc_source.sql`
- `migrations/0016_item_ledger_trainer_source.sql`
- `migrations/0017_trainer_state.sql`
- `migrations/0019_doge_wallet.sql`
- `migrations/0020_doge_chain_cache.sql`
- `migrations/0021_doge_gifting.sql`
- `migrations/0022_retire_candy_eaten.sql`
- `migrations/0023_doge_sell.sql`
- `migrations/0024_tetris_stakes.sql`
- `migrations/0029_pc_makeup.sql`
- `migrations/0032_payout_batch.sql`
- `migrations/0033_wallet_address_proposals.sql`
- `migrations/0034_candy_return.sql`
- `migrations/0035_wallet_custody.sql`
- `payout.js`
- `pc-db.js`
- `pc-figures.js`
- `pc.js`
- `poll-archive-db.js`
- `poll-archive.js`
- `scripts/load-pc-bank.mjs`
- `tests/bundle-parity.test.js`
- `tests/candy-return.test.js`
- `tests/derive-quarter-bands.test.js`
- `tests/doge-chain.test.js`
- `tests/doge-wallet.test.js`
- `tests/fixtures/exit-ticket-without-golden.json`
- `tests/fixtures/m2b-invariance/sy2526-pc.json`
- `tests/fixtures/pg-wallet.js`
- `tests/fixtures/wallet-world.js`
- `tests/payout-conservation.test.js`
- `tests/payout-receipt.test.js`
- `tests/payout.test.js`
- `tests/pc-figures.test.js`
- `tests/pc-grade-wiring.test.js`
- `tests/pc-item-typing.test.js`
- `tests/pc.test.js`
- `tests/poll-archive.test.js`
- `tests/student-wallet-print.test.js`
- `tests/trainer-grade.test.js`
- `tests/trainer.test.js`
- `tests/wallet-conservation-pg.test.js`
- `tests/wallet-conservation.test.js`
- `tests/wallet-custody.test.js`
- `tests/wallet-proposals-pg.test.js`
- `tests/wallet-proposals.test.js`
- `tests/wallet-stakes-conservation.test.js`
- `tests/wallet-stakes-routes.test.js`
- `tools/wallet-model-emit-cases.mjs`
- `trainer-db.js`
- `trainer.js`
- `wallet-custody.js`

### Edited or added files (79 server files)

| File | Reason |
| --- | --- |
| `.env.example` | Remove wallet setting and document isolated A2 configuration. |
| `.railwayignore` | Exclude local GitNexus cache and Phase 2a verification artifacts from deployment. |
| `README.md` | Document surviving service, separate deployment, environment settings, CORS and transitional grades. |
| `admin-restore.js` | Remove candy award metadata from restore. |
| `admin-snapshot.js` | Remove candy award metadata from snapshots. |
| `class.js` | Remove economy totals and trainer summaries from class responses. |
| `crypto.js` | Remove wallet WIF encryption and wallet secret resolution; keep password cryptography. |
| `data/answer-key.SY2627.json` | Replace AP content with empty, shape-valid startup fixture. |
| `data/answer-key.json` | Replace AP content with empty, shape-valid startup fixture. |
| `data/blooket-lessons.json` | Replace AP content with empty, shape-valid startup fixture. |
| `data/blooket-lessons.sy2526-freeze.json` | Replace AP content with empty, shape-valid startup fixture. |
| `data/grade-config.sy2526-freeze.json` | Remove retired grading keys from historical fixture. |
| `data/lesson-schedule.json` | Replace AP content with empty, shape-valid startup fixture. |
| `data/lesson-schedule.sy2526-freeze.json` | Replace AP content with empty, shape-valid startup fixture. |
| `data/skill-map.json` | Replace AP content with empty, shape-valid startup fixture. |
| `db.js` | Remove wallet, candy, chain, payout and stake database operations and review candy metadata. |
| `docs/answer-key-freeze.md` | Describe empty A2 keys and future content-pipeline population. |
| `docs/cors.md` | Replace obsolete allowlist patch with current CORS/deployment guidance. |
| `docs/golden-master.md` | Trim retired-track claims while preserving regeneration commands. |
| `docs/phase2a-strip.md` | Record inventory, changes, verification and Phase 3 follow-up. |
| `donow.js` | Remove stale comments about retired features; preserve surviving behavior. |
| `grade-config.js` | Remove PC anchors/curves, trainer, poster and pcTrack settings; retain dates/useV3 and add Phase 3 placeholder. |
| `grade-contexts.js` | Stop loading retired event tracks; accept empty valid curriculum bundles. |
| `grade-offline-inputs.js` | Remove trainer data and PC-specific redaction options. |
| `grade.js` | Remove PC/trainer grading branches; retain legacy and v3 grade entry points. |
| `gradebook-grid.js` | Remove PC/poster columns and category branches; preserve supported grid and Schoology inputs. |
| `ledger.js` | Reject retired and unsupported sources through the surviving-source allowlist. |
| `lesson-grade.js` | Remove PC/trainer/poster aggregation; retain generic two-track v3 arithmetic and supported work grading. |
| `mastery.js` | Remove stale comments about retired features; preserve surviving behavior. |
| `migrations/0013_item_ledger_blooket_source.sql` | Remove retired source values and stale poster comment; retain Blooket. |
| `migrations/0014_item_ledger_quiz_exception.sql` | Remove retired source values; retain quiz exceptions. |
| `migrations/0015_item_ledger_quiz_review.sql` | Remove retired source values; retain quiz reviews. |
| `migrations/0025_review_marks.sql` | Keep review marks/indexes/RLS; remove candy fields, grants and RPC schema. |
| `migrations/0030_quarter_grade_snapshot.sql` | Remove stale PC schema comment; retain snapshots. |
| `phase2a-env-inventory.json` | Record retained and retired environment consumers. |
| `phase2a-inventory.json` | Record complete module/migration/route/environment/worker map. |
| `phase2a-route-inventory.json` | Record pre-strip GitNexus route KEEP/DROP decisions. |
| `phase2a-tests.json` | Preserve full-suite machine-readable results. |
| `receipts.js` | Remove payout receipt issuance; retain signed academic receipts. |
| `review.js` | Remove candy minting and award responses; retain signed marks and feedback. |
| `rollup.js` | Remove stale comments about retired features; preserve surviving behavior. |
| `scoring.js` | Remove PC row scoring. |
| `scripts/build-golden-fixture.mjs` | Remove PC diagnostic logging and stale economy comment. |
| `scripts/build-golden-synthetic.mjs` | Remove PC/trainer generators and config before documented regeneration. |
| `server.js` | Remove retired imports, mounts and production initialization; preserve injectable startup. |
| `teacher-auth.js` | Remove payout-agent authorization helpers; keep teacher auth. |
| `teacher.js` | Remove student poll archive endpoint. |
| `tests/class.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/exit-ticket-bonus.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/feature-strip.test.js` | Add retained v3 combiner, retired-source and school-year date regressions. |
| `tests/fixtures/golden-synthetic/expected.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/golden-synthetic/inputs.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/golden-synthetic/students.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/m2b-invariance/art-hashes.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/m2b-invariance/sy2526-pc-v3.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/m2b-invariance/sy2627-empty.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/m2b-invariance/sy2627-env-schedule-override.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/m2b-invariance/sy2627-frq_work.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/m2b-invariance/sy2627-mixed.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/m2b-invariance/sy2627-quiz_partial.json` | Regenerate using documented synthetic builder or UPDATE_M2B_GOLDEN suite command. |
| `tests/fixtures/pg-frq.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/golden-master.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/grade-contexts.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/grade-offline-inputs.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/grade-sim.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/grade.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/gradebook-grid.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/ledger.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/lesson-grade-v3.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/lesson-grade.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/m2b-grade-invariance.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/quarters-by-date.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/review-misconceptions.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/review.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/roster-archive.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/sy2627-due-and-early-bonus.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tests/teacher-endpoints.test.js` | Remove retired cases or adapt surviving tests to empty bundles and retained response shapes. |
| `tools/grade-model-emit-cases.mjs` | Remove poster track generation. |
| `tools/grade-sim-sweep.mjs` | Remove the poster-weight sweep setting. |

Also updated this root baseline section and wrote the required `state/cross-agent/52a62bbab12b.result.json`. Temporary implementation helpers and the accumulator were removed; they are not counted as pre-existing deleted files. The local GitNexus cache is tooling rather than application source.

### Deleted tests (23 files)

- `tests/bundle-parity.test.js`
- `tests/candy-return.test.js`
- `tests/derive-quarter-bands.test.js`
- `tests/doge-chain.test.js`
- `tests/doge-wallet.test.js`
- `tests/payout-conservation.test.js`
- `tests/payout-receipt.test.js`
- `tests/payout.test.js`
- `tests/pc-figures.test.js`
- `tests/pc-grade-wiring.test.js`
- `tests/pc-item-typing.test.js`
- `tests/pc.test.js`
- `tests/poll-archive.test.js`
- `tests/student-wallet-print.test.js`
- `tests/trainer-grade.test.js`
- `tests/trainer.test.js`
- `tests/wallet-conservation-pg.test.js`
- `tests/wallet-conservation.test.js`
- `tests/wallet-custody.test.js`
- `tests/wallet-proposals-pg.test.js`
- `tests/wallet-proposals.test.js`
- `tests/wallet-stakes-conservation.test.js`
- `tests/wallet-stakes-routes.test.js`

Removed cases/groups in mixed suites:

| File | Case/group |
| --- | --- |
| `tests/class.test.js` | surfaces per-student effort points → candy (DOGE wallet), matching the wallet |
| `tests/class.test.js` | adds a trainer summary from already-fetched ledger rows |
| `tests/teacher-endpoints.test.js` | GET /teacher/student/:studentId/poll-archive |
| `tests/roster-archive.test.js` | A2b: UNSCOPED /class/wallets excludes archived students (the payout worklist surface) |
| `tests/review.test.js` | awards candy only ONCE per student per day across multiple items, and an idempotent re-mark adds no candy |
| `tests/review.test.js` | migration 0025 candy_bonus (real plpgsql via pglite) |
| `tests/quarters-by-date.test.js` | lesson-schedule.json — SY26-27 date sanity |
| `tests/grade.test.js` | pcRawToP: piecewise linear, clamps, scales to 0 below p85 |
| `tests/sy2627-due-and-early-bonus.test.js` | PC track placed and dated by the event schedule (NEW units), not the old-unit band |
| `tests/sy2627-due-and-early-bonus.test.js` | loadEventScheduleWithPriority reads progressChecks/posters keyed by NEW units 1-5 from the bundled file |

### Deleted pending Phase 3

| File | Case/group |
| --- | --- |
| `tests/bundle-parity.test.js` | Entire AP content/band-dependent suite |
| `tests/derive-quarter-bands.test.js` | Entire AP content/band-dependent suite |
| `tests/grade-sim.test.js` | archetype: pc_ace_work_skipper is capped by the single-track ceiling (~70) |
| `tests/grade-sim.test.js` | archetype: work_grinder_pc_skipper is capped by the single-track ceiling (~70) |
| `tests/grade.test.js` | B = (1·W + 2·Q)/3, cap at 85, P only-raises via max |
| `tests/grade.test.js` | genuine master: minimal work, perfect PC → 100 (PC uncaps regardless) |
| `tests/grade.test.js` | strong worker, bad PC day → never punished (banked floor holds) |
| `tests/grade.test.js` | units[] UNCHANGED in shape and values after Phase 6 additions |
| `tests/gradebook-grid.test.js` | adds a Progress Check + Poster column per band unit |
| `tests/gradebook-grid.test.js` | Schoology total = category-weighted blend over present categories |
| `tests/lesson-grade-v3.test.js` | all four present → full weighted blend |
| `tests/lesson-grade-v3.test.js` | PC due + both tracks above floor → max-of-two |
| `tests/lesson-grade-v3.test.js` | PC-only gamer (high PC, no work) → 70% ceiling on the grade |
| `tests/lesson-grade-v3.test.js` | PC due but un-attempted engages the 70% single-track ceiling against strong work |
| `tests/lesson-grade-v3.test.js` | an out-of-range raw PC% is clamped so grade/ceiling never exceed 100 |
| `tests/lesson-grade.test.js` | PC-only data: P_quarter > 0 with nothing due → quarterGrade = P_quarter |
| `tests/sy2627-due-and-early-bonus.test.js` | event schedule reaches the production grade inputs |
| `tests/m2b-grade-invariance.test.js` | SY2526: PC ledger pins freeze (77 required, full config deep-equal, schedule 1.1 B) |
| `tests/grade-contexts.test.js` | answer key: empty map throws |
| `tests/grade-contexts.test.js` | blooket: 1 topic throws |
| `tests/grade-contexts.test.js` | schedule: empty lessons {} throws |
| `tests/grade-contexts.test.js` | structurally invalid blooket (1 topic) THROWS |
| `tests/exit-ticket-bonus.test.js` | strip exit tickets: all four SY2627 fixture public results remain byte-identical |
| `tests/golden-master.test.js` | detects an isolated v3Gates floor perturbation |
| `tests/golden-master.test.js` | detects an isolated v3Gates ceiling perturbation |
| `tests/lesson-grade.test.js` | PC + lessons: max(banked, P_quarter) preserves only-raises asymmetry |
| `tests/grade-offline-inputs.test.js` | redactPc (default) sentinels PC answers even when correct |
| `tests/lesson-grade.test.js` | U1-PC-Q3 → unit=1, lessonKey=null (PC is unit-scoped) |
| `tests/lesson-grade.test.js` | U1-PC-MCQ-A-Q01 → unit=1, lessonKey=null |

New `tests/feature-strip.test.js` checks the pure v3 two-track gates/fallback, retired-source grading with `useV3` off and on, and the required quarter boundaries. Existing generic ledger, receipts, roster, diagnostics and grade coverage remains.

### Stubs created

| File | Shape |
| --- | --- |
| `data/answer-key.json` | `{ generatedFrom: string, answerKey: {} }` |
| `data/answer-key.SY2627.json` | `{ generatedFrom: string, answerKey: {} }` |
| `data/skill-map.json` | `{}` |
| `data/blooket-lessons.json` | `{ topics: [], allTopics: [], requiredTopics: [], bonusTopics: [] }` |
| `data/blooket-lessons.sy2526-freeze.json` | `{ topics: [], allTopics: [], requiredTopics: [], bonusTopics: [] }` |
| `data/lesson-schedule.json` | `{ schemaVersion: 2, lessons: {} }` |
| `data/lesson-schedule.sy2526-freeze.json` | `{ schemaVersion: 2, lessons: {} }` |

### Verification and golden regeneration

- `cd roster-server && npx vitest run`: **70 files passed; 1,301 tests passed, 0 failed, 3 skipped (1,304 total)**. Exit 0; 37.30 seconds. JSON report: `phase2a-tests.json`.
- Root dry import with `NODE_ENV=test`, `PORT=0` and `node -e "require('./roster-server/server.js')"`: exit 0. Test mode suppresses DB setup/listening; production still requires Supabase.
- From `roster-server/`, ran `node scripts/build-golden-synthetic.mjs` (documented in `roster-server/docs/golden-master.md`): 16 synthetic students, 69 records; students.json, inputs.json and expected.json regenerated. Exit 0.
- From `roster-server/`, ran `UPDATE_M2B_GOLDEN=1 npx vitest run tests/m2b-grade-invariance.test.js` (documented in `roster-server/tests/m2b-grade-invariance.test.js header`): 4 tests passed; surviving m2b snapshots/artifact hashes regenerated. Exit 0.
- No golden JSON was hand-edited. node --check tools/grade-sim-sweep.mjs passed after removing its unused poster knob. Other changes after the full suite were comments, deployment exclusions and report artifacts.
- One earlier suite command accidentally used repository root and was canceled. Follow-up checks found no generated root source/data artifacts. The complete required roster-server suite subsequently passed.
- JSON aggregate numPassedTests includes skipped cases in this Vitest version; report counts come from assertionResults statuses and match the final CLI summary.

### Blocked on Phase 2b

None in the roster-server suite. Shared root/`lib/`/Desk changes and packaging remain Phase 2b work; no outside file needed modification to make this suite green.

### Impact analysis

Created a server-only GitNexus index with gitnexus analyze --skip-git --index-only. No git commands or commits. HIGH/CRITICAL risks were reported before edits to shared grading and app/route factories.

| Symbol | Risk | Direct callers | Affected processes |
| --- | --- | --- | --- |
| computeGrade | CRITICAL | 8 | 12 |
| computeQuarterV3 / computeLessonGrades | CRITICAL | 1 | 11 |
| createApp | CRITICAL | 2 | 5 |
| mountTeacherStudent / mountLedger / mountReview / mountClass / mountAdminRestore | HIGH | 1 | 4 |

191 original database/deleted-module functions were checked individually, alongside modified grade, route, crypto and generator helpers. Core impact includes class, teacher, review, transcript and grade HTTP flows. The simulator file lookup was unresolved (UNKNOWN); its only edit removed a top-level poster knob. No commit was made, so pre-commit detect_changes did not apply.

### Left in place / Phase 3 follow-up

- A2 categories are deferred. Static unit fallback bands, lesson/FRQ/quiz weights, early-bonus settings and supported grid category weights remain transitional. The required Phase 3 comment marks replacement of the category model.
- The generic v3 two-track engine and useV3 remain. No replacement mastery source was invented: computeQuarterV3 supplies null mastery and uses the tested Work-only fallback.
- Compatibility fields pcAvg/pcAvgRaw=null, pcDue=false and P_quarter=0, plus unused positional createApp/buildLessonsArray slots, remain for existing callers. They have no retired scoring or data loading behind them.
- KEEP modules still consume AP-derived frq-rubrics.SY2627.json, misconception maps/catalog/triage, teacher-question-catalog.json, worksheet-key.json and work-manifest.json. These need Phase 3 curriculum replacement; they are not empty stubs.
- Historical school-year support, frozen-fixture filenames (including sy2526-pc-v3.json), unused historical bundle-size constants and some simulator input labels/rows remain. Dedicated retired-feature tests are gone; remaining retired rows are inert or test rejection/ignoring.
- scripts/gen-blooket-lessons.mjs remains Blooket authoring tooling and still references AP roadmap/crosswalk inputs. Replace its inputs in Phase 3 before generating A2 decks; it is not a startup dependency.
- Guest-alias nudges and sprite hue remain teacher-feedback/identity features. They do not maintain classroom presence, poll, level or activity state.
- No database was created, migrated, purged or fabricated. Production still requires isolated Supabase configuration.
- GitNexus created a local roster-server/.gitnexus cache and registered the server-only index. This tooling cache is excluded from deployment and is not application source.

Quarter dates remain Q1 2026-09-02 to 2026-11-06; Q2 2026-11-09 to 2027-01-22; Q3 2027-01-25 to 2027-04-14; Q4 2027-04-15 to 2027-06-17. No A2 category model, git commits, Claude calls, live DB operations or deployment.
