# Study Break Tetris — improvement review digest (2026-09-08)

Source: 267-agent multi-lens review workflow run from Claude Code session 427f129c (2026-09-08 ~20:00-21:00 EDT).
85 findings: 18 bugs, 19 quick wins, 10 bigger features, 5 refactors. First implementation patch (22 edits) applied to ap_stats_roadmap_square_mode.html the same evening, uncommitted.
Status tracking: see memory project_study_break_tetris_review.md

## Status 2026-09-09 (patch 2 applied, UNCOMMITTED)

Implemented (patch 1, 2026-09-08 + patch 2, 2026-09-09) — bugs B1–B17 all addressed; quick wins Q1–Q5, Q7–Q17, Q19;
bigger features B1 (touch strip), B2 (visible spawn), B3 (ghost square glow + hints), B4 (split HUD: mini hold/next,
series line, pot), B5 (10Hz light opponent updates + their hold/next), B6 (garbage at lock, one hole), B7 (Esc keeps a
solo board, resumes PAUSED), B8 (personal best / mean card + piece histogram), B10 (dashboard Bets W–L column);
refactors R3 (_endGame funnel), R4 (drawCell ctx parity), R5 (idle redraw throttle); R2 partially (P2P attempt OFF,
rtc plumbing kept). Tests: tests/study-break-improvements.test.js (33 pins/behaviour) + tests/study-break-smoke.test.js
(runtime drive of the real object in jsdom).

NOT done, by design:
- Q6 stop shattering a cut square — DONE 2026-09-09 (teacher agreed): the remainder of a cut square stays a square and keeps paying.
- B18 policy half — a confirmed Esc×2 forfeit still REFUNDS — teacher DECIDED 2026-09-09: keep the refund. Don't re-propose.
- Bigger B9 (lobby shows who is mid-match) — needs a curriculum_render relay change (user_online on room create/delete).
- R1 (extract rules to lib/square-mode-rules.js) — deferred; behaviour is pinned by the two new test files instead.
- Q18 interim touch guard — superseded by the touch strip (bigger B1).

Root suite after patch 2: 9629 passed; the 26 failures (j2/j7 journeys, teacher-student-console-remediation) reproduce
on a clean HEAD worktree on this machine → pre-existing (see memory reference_windows_root_test_failures).

```
=== bugs_or_rough_edges (18) ===

[B1] Soft-drop tap teleports the piece (fallTimer never reset) | lines: 18834-18838 (ArrowDown), 19819-19827 (update gravity loop), 18641 (SOFT_DROP_INTERVAL=80)
  WHAT: Set `this.fallTimer = 0` when Down transitions to pressed (optionally clamp on keyup); separately consider SOFT_DROP_INTERVAL 80→50 so soft drop stays ≥1.8x gravity at high levels.
  WHY: Banked gravity time (up to ~900ms at L1) is drained at 80ms/step in one frame, so every Down tap lurches the piece up to 11 cells — the most visible feel bug and a misdrop factory for beginners.

[B2] Live Classroom capture-phase arrow handler hijacks drop keys; Desk Esc destroys app windows under the game | lines: 23505-23527 (capture=true ArrowUp/Down → sendActivityValue), 18784 (game keydown registered lazily in init), 22539-22558 (Desk Escape destroyApp loop)
  WHAT: Add `if (typeof studyBreak !== 'undefined' && studyBreak.isOpen && studyBreak.isOpen()) return;` at the top of the 23505 handler and guard the `.app-overlay` destroyApp loop at 22539 the same way; add a source pin. Verified: the capture handler has no overlay check.
  WHY: During a live values activity the game's ↑/↓ are dead and each press silently nudges the student's value on the teacher's board; Esc closing the game also kills an open TI-84/quiz/wallet window.

[B3] Enter/1/R in the lobby or challenge dialog start an invisible game; Enter never accepts, Esc never declines | lines: 18797-18814 (Enter/1/2/R branches), 19038-19051 (startMultiplayer hides canvas, state stays idle), 19014-19036 (startNewGame never restores display), 
  WHAT: At the top of the keydown handler: if #challenge-dialog is visible, Enter → click Accept, Esc → click Decline, swallow the rest; if #game-lobby is visible, ignore Enter/1/2/R. Store `this.pendingChallenger` in showChallengeDialog so close() can send challenge_decline (server rejects a decline without `from`); focus Accept on show and add role=dialog.
  WHY: Keyboard-first students press the key the card advertises and get phantom sounds on a hidden canvas, or strand a classmate on 'Challenging…' for the full 30s server expiry — the first thing the unrun two-student smoke will hit.

[B4] R restarts a live game with no state or repeat guard (free board wipe in a staked 1v1) | lines: 18811-18814 (R branch, before the state gate at 18819), 19014-19026 (startNewGame: gameNumber++, gameScored=false, board reset)
  WHAT: Gate in the keydown handler: ignore e.repeat for R/P/Enter/1/2; allow R only in 'gameover'/'paused' for solo and only 'gameover' in 1v1 (the card already says 'R to skip' only there). Keep startNewGame's body untouched so the stakes-test pins stay green.
  WHY: A losing student can press R mid-game for an empty stack while the candy stays escrowed, and gameNumber desyncs between clients; in solo an accidental R wipes a good board.

[B5] Firm drop bypasses the 15-reset cap and there is no hard drop | lines: 19991-19997 (firmDrop zeroes lockTimer directly), 18840 (!e.repeat only blocks held keys), 19904-19911 (_resetLockTimer / LOCK_RESET_CAP)
  WHAT: At the top of firmDrop: `if (this.isGrounded(this.active)) { this.lockPiece(); return; }` — first tap firm-drops with the 500ms adjust window, second tap locks. Optionally route the firm drop through _resetLockTimer so it counts against the cap.
  WHY: Tapping Up/Space faster than every 500ms on a grounded piece stalls forever (relevant with candy escrowed), and skilled students get a natural double-tap hard drop without a new key.

[B6] Pause or window blur freezes one side of a live 1v1; split view has no pointer path to resume; solo resume locks instantly | lines: 19797-19808 (togglePause, no mode check), 18857-18864 (blur → paused), 19414-19427 (heartbeat sends regardless of state), 18763 + 19301 (only mousedow
  WHAT: In togglePause AND the blur handler: if mode==='1v1' && mpState && !seriesOver, don't pause (blur → clearKeys + flash 'No pausing in a match'). Attach the mousedown handler to #game-split (not all of .game-content — the lobby buttons live there). On solo resume zero fallTimer/lockTimer; change 20340 to 'Press P or tap the board to resume'.
  WHY: The paused side keeps stamping the opponent's watchdog alive, so an alt-tab or a P press silently stalls a candy-staked match; and 'click to resume' is dead in split mode.

[B7] Inbound peer messages are unvalidated: garbage lines uncapped, bare JSON.parse, unchecked board coords | lines: 19636-19649 (receiveGarbage `pendingGarbage += lines`), 19651-19681 (insertGarbage), 19525-19532 + 22201-22204 (bare JSON.parse), 19538-19546 (updateO
  WHAT: In receiveGarbage: `const n = Math.min(MAX_GARBAGE, Math.max(0, Math.floor(Number(lines)||0))); if (!n) return;` — define MAX_GARBAGE (does not exist; 4 today, 6-8 if strips send garbage). Wrap both onmessage parses in try/catch, integer-range-check y/x/ci in updateOpponentState and stamp lastOpponentMs after a successful decode. Add a source pin.
  WHY: One forged `{type:'game_garbage', lines:24}` from DevTools on a shared Chromebook buries the opponent, whose own client then reports the loss that settles the candy; the clamp caps the attack at what a legitimate tetris can do.

[B8] The doge-icon challenge panel never mentions the 1-candy stake | lines: 22371-22381 (showChallengePanel: 'wants to play Study Break!'), 22126 (submenu button), vs 19255 (in-game dialog says 'best of 3 · winner takes 2 🍬');
  WHAT: Add the exact 19255 string ('best of 3 · 1 candy at stake, winner takes 2') to the panel innerHTML and the submenu button title so the two prompts cannot drift.
  WHY: The Desk-side panel is the common accept path and Accept arms a real escrow; the spec required informed consent on the prompt and it was never built.

[B9] Lobby status sticks on 'Connecting…' then 'Challenging X…' forever; no single-pending guard; stale-socket sends | lines: 19063-19069 (reuse branch never writes #lobby-status), 19224-19229 (studyBreak.sendChallenge: mpWs only, no pending guard), 19212 (rows call studyBrea
  WHAT: Set status to 'Connected as <name> — pick a classmate' in the reuse branch; route lobby row clicks through DogePresence.sendChallenge (owns challengePending/timeout) and have its challenge_declined/challenge_error/match_start branches write 'Bob declined' / 'No answer' / 'Bob is busy' into #lobby-status and re-enable rows; show a client 'Challenging Bob… 27s' countdown and grey rows while pending; set the dialog countdown to 25s so the client decline beats the server sweep. Route open()/submitLeaderboardScore through _liveWs().
  WHY: A student who sees nothing change clicks other names; each click is a separate server challenge, and a second accept overwrites the challenger's wsToRoom and mis-routes a live staked match.

[B10] Hall of Fame is dead code: the relay never handles leaderboard_get/submit | lines: 18910-18913 (open sends leaderboard_get), 19444-19455 (submitLeaderboardScore, 6 call sites), 19190 + 22315 (receivers), 20637/20682-20696 (drawModeSe
  WHAT: Delete the sends, both receivers and the draw block (~40 lines), or leave a comment that the cr relay must implement them; use the freed card space for the personal-best/history card (see bigger features). Keep submitLeaderboardScore as the hook where a local best is written.
  WHY: Every game end fires phantom traffic for a board that can never render, and a global all-time board would be an equity problem in a mixed-skill class anyway.

[B11] Flash banner overflows its 108px box across the side panels; level-up is silent | lines: 20541-20555 (drawFlashBanner: w=COLS*CELL-12, one line, no clip/measureText), 20062-20070 (message join with ' • '), 20037 (level-up plays indigo only
  WHAT: Stack up to three short lines (squares / lines / bonus, or lead with a big '+45' and a 9px sub-line) inside a ctx.clip() of the well, or move the banner below the well; set a `leveledUp` flag at 20037 and push 'Level N!' after `messages` is declared at 20062.
  WHY: Even the common 'SILVER SQUARE! • 2 LINES • SILVER BONUS +10' smears over HOLD/NEXT in solo and off the 215px split canvas — the reward moment is unreadable. (Dropped claim: the banner does not hide the spawn; pieces spawn in hidden rows.)

[B12] Incoming-garbage meter is drawn beside the OPPONENT's well; 1v1 help line says 'Marathon mode' / 'Press R to rematch' | lines: 19627-19632 (red bars on opponentConfig.ctx), 20323-20327 (own 1v1 branch draws only 'L1 | 0ln | 0pts'), 20254-20256 (updateHud 1v1 strings), 20045-20
  WHAT: Move the red ticks to `this.BOARD_X - 6` on my canvas in draw()'s 1v1 branch with a small '+N' label and remove them from drawOpponentBoard; in updateHud for 1v1 show 'vs Bob • Game n of 3 • 2→1, 3→2, 4→4 garbage • red = incoming' while running and 'next game in 3s • R to skip' / '<result> • Esc to exit' at game over.
  WHY: Students read red-next-to-Bob as Bob's problem and get 'Buried!' from nowhere; the cancel rule is the only strategic depth in 1v1 and it is invisible.

[B13] Series loser hears the win jingle and sees 'Bob disconnected' when the winner presses Esc | lines: 19697-19725 (opponentLeft: only the resolve block is guarded by !seriesOver; koWin 1.0, state='gameover', flash rewrite run unconditionally), 18928-18
  WHAT: Add `if (ms.seriesOver) return;` at the top of opponentLeft after the mpState guard (also a prerequisite for the rematch feature).
  WHY: The last thing a student hears after losing a candy should not be a victory fanfare plus a 'did I actually win?' card the teacher has to adjudicate.

[B14] Near-simultaneous top-outs make both players see 'YOU WIN!' while both tally a loss → bet refunds | lines: 19683-19695 (opponentKO sets _wonThisGame=true unconditionally), 19677 (update()→draw() scores synchronously via _studyBreakScoreGameOnce), 19759-1977
  WHAT: Stamp ms.gameOverAt on every 1v1 gameover; in _studyBreakScoreGameOnce, if !_wonThisGame && !_forfeit && now-gameOverAt < 600 defer counting (treat a missing gameOverAt as 'count now' so existing unit tests pass); in opponentKO, if my state is already 'gameover' and unscored, decide deterministically by score then mpState.side (lines are not on the relay wire). Reword KO detail to 'KO — Bob topped out'.
  WHY: After a garbage exchange both screens can say YOU WIN and then 'bet refunded — no agreement', the exact 'the game cheated me' complaint.

[B15] Solo canvas is CSS-stretched to 422px and the 1v1 row overflows into a scrollbar | lines: 53-54 (border-box), 962-975 (.game-window 432 → 428 inner), 997-1005 (.game-content margins/border → 422; flex column, align-items:stretch), 2414 (can
  WHAT: Edit the 1230 rule to `width:min(442px,96vw)` and add `.game-content > canvas, #game-split { align-self:center }` so the 430px canvas and the 432px split row fit without scaling; keep overflow only for the vertical case (overflow-x:hidden). The mousedown hit test already normalizes by rect.width.
  WHY: A uniform 1.9% non-integer downscale under image-rendering:pixelated gives uneven grid lines on every Chromebook, and the 4px overflow puts a scrollbar (≤760px viewports) or a clipped opponent board under the mode that carries candy.

[B16] Opponent view renders received garbage as I-piece cyan; wire palette is duplicated and decoupled from `colors` | lines: 19373 + 19539 (two hard-coded 10-hex colorPalette arrays), 19380 (`ci >= 0 ? ci : 0`), 19661 (garbage color '#888888' not in palette), 18653-18664 (co
  WHAT: Build one `PALETTE` in init from Object.values(this.colors) plus '#888888' (append-only keeps indices stable) and use it for encode and decode; add a decode(encode(board)) round-trip test.
  WHY: Today every garbage row a student has received shows on the rival's board as a wall of I-pieces, and any future color tweak silently desyncs the two screens.

[B17] Modifier combos fire game actions (Ctrl+C holds, Ctrl+P pauses and blocks print, Ctrl+R restarts and blocks reload); no ↑-rotate option | lines: 18784-18791 (keydown: no ctrlKey/metaKey/altKey check; 'r'/'p' in the handled list get preventDefault), 18839-18840 (ArrowUp||' ' → firmDrop)
  WHAT: First line of the handler: `if (e.ctrlKey || e.metaKey || e.altKey) return;` (same guard the Desk already uses at 14489/14518/14556/17856). Optionally one persisted boolean 'classic' preset (K key or a row under the mode buttons) mapping ArrowUp → tryRotate(1) with Space staying firm drop, shown in the KEYS panel.
  WHY: Stops the game eating browser shortcuts on a school Chromebook, and Up-to-rotate is the most common novice mis-input from phone/NES Tetris (worse once double-tap hard-locks).

[B18] Esc mid-series voids the bet (quitters refunded, honest losers pay) and an accidental Esc kills a classmate's match | lines: 18793-18796 (Escape → closeGame unconditionally), 18916-18935 (close() sends game_leave, never resolves), 19697-19725 (opponentLeft comment: 'accepted
  WHAT: UX part (do now): while a 1v1 series is live, first Esc flashes 'Esc again to concede the match' with a 2s window, second Esc proceeds. Policy part (TEACHER SIGN-OFF — reverses the documented rage-quit-voids decision): on the confirmed second Esc set ms.oppWins=2, gameScored=true, seriesOver=true and call the existing _studyBreakResolveStakes() before closeGame() so the peer's forfeit report agrees and the bet settles; network drops still refund via the sweep. No new money path, stake unchanged.
  WHY: Today the loophole binds only students who do not know it, and Esc is the Desk's universal close key.

=== quick_wins (19) ===

[Q1] Per-type wall kicks: the vertical I cannot rotate off a wall or stand up from the floor; the downward kick reads as a stumble | lines: 19938-19955 (kick table [0,0],[0,+1],[±1,0],[0,-1]), 18671-18676 (I offsets: rot1 column at cx=2, rot3 at cx=1)
  WHAT: For 'I' use [[0,0],[±1,0],[±2,0],[0,-1],[0,-2]]; for the others keep the mild table but move (0,+1) last or drop it. Pure data change; the panel already says 'Mild wall kicks'.
  WHY: I rot1 flush-left and rot3 flush-right silently fail in both directions and a flat I on the floor cannot stand up — students assume the key is broken.

[Q2] Input feel: last-direction-wins DAS and buffered rotate/hold during the 150ms entry delay | lines: 19999-20009 (handleAutoShift requires exactly one arrow down), 18820-18833, 18638 (ENTRY_DELAY), 20076-20077 (active=null), 19939 + 19958 (tryRotate/h
  WHAT: Track keys.lastDir on Left/Right keydown (restore the other on keyup, re-arm its next) and auto-shift only lastDir. While running && !active, record pendingRotate/pendingHold (last wins) and apply once in spawnNext after the validity check; clear both in resetBoardState.
  WHY: Overlapping arrows on a cramped Chromebook cluster freeze the piece, and rotate/hold pressed in the 20% blind window per piece vanish without feedback.

[Q3] Bound bag droughts and draw the starting hold from the bag | lines: 19845-19853 (refillBag: 9×7 shuffled), 19855-19858 (nextFromBag), 19030 + 19357 (hold = randomType() outside the bag)
  WHAT: In nextFromBag track pieces-since-seen per type; if any type is ≥14 behind, swap it to the top before popping (keeps ~17 gold-friendly same-type windows per game vs 22 today, cuts P(drought≥25) from 71% to ~5%). Replace both randomType() hold seeds with nextFromBag().
  WHY: A 30-piece wait for an I or the O that finishes a gold square reads as unfair; honest counts also make the piece-count histogram correct.

[Q4] Steepen the level curve for a 5-10 minute session; solo-only start-level pick | lines: 19837-19839 (gravity = max(90, 920-(level-1)*65)), 20036 (level = 1+floor(lines/10)), 18641 (SOFT_DROP_INTERVAL), 20657-20666 (mode-select SOLO button
  WHAT: Level every ~6 lines with `gravity = max(90, 920 * 0.82 ** (level-1))` (L5 ≈415ms, floor near 78 lines), SOFT_DROP_INTERVAL ≈50, announce level-ups in the flash; optional Left/Right on the idle card picks start level 1/5/10 for SOLO only (1v1 must stay symmetric; resetBoardState already resets level). Scoring untouched.
  WHY: A typical break clears 20-40 lines, so students only ever see 920-660ms gravity where an idle piece takes 18s to fall — strong players are bored and level changes nothing else.

[Q5] Teach the whole-piece rule: rewrite the SQUARES panel and draw it | lines: 20296-20305 (SQUARES panel text), 20251 (idle prefix), 20575 (drawCenterCard appends 'Gold = same piece' even on PAUSED/GET READY), 20698 (mode-select
  WHAT: Five lines: '4 WHOLE pieces in a 4×4', 'same shape = gold · mixed = silver', 'row thru gold +10 · silver +5', 'X = broken, never a square', 'tetris = 5 total'; idle prefix 'Fit 4 whole pieces into a 4×4'. Add a two-row mini diagram (four O's → gold block, I+I+O+O → silver) with drawCell/drawSquareBlock at scale 5 in the 116×96 panel; drop the Gold/Silver line from PAUSED/GET READY. Optional first-launch tip card (localStorage) with 'S and Z can never make gold — ask why'.
  WHY: The whole-piece rule is the entire game and no copy states it, so a student who fills a 4×4 with half a piece concludes squares are random.

[Q6] Stop shattering a cut square (teacher rules decision) | lines: 20168-20176 (brokenSquareIds), 20192-20206 (survivors → kind:'fragment'), 20177-20186 (strip check needs only 4 same-squareId cells in the row), 20421
  WHAT: Delete the brokenSquareIds set and the fragment loop so surviving square cells keep kind/squareId/material; the strip check, row collapse and renderer already handle a 4×3/4×2 remainder. If the teacher prefers the harsh rule, at least say 'a cut square breaks' in the SQUARES panel.
  WHY: Today one single through a gold square pays 11 and kills 12 cells (four singles = 14 vs I-tetris = 45), so squares only pay for Tetris veterans who can dig a well; with the change four singles = 44 vs 45 and every student can cash a square.

[Q7] Make squares matter in 1v1: strips send garbage | lines: 20041-20055 (garbageTable {1:0,2:1,3:2,4:4}; goldStrips/silverStrips only feed the flash), 19683-19696 (win by KO only); relay 2874-2877 forwards `lin
  WHAT: `garbage = (table[clear.lines]||0) + clear.goldStrips*2 + clear.silverStrips`, capped at a new MAX_GARBAGE (4-6; insertGarbage lands all rows in one tick) and mirrored by the receive-side clamp; append '+N garbage' to the flash; keep the cancel logic. No server change, stake untouched.
  WHY: In the one mode students compete for candy the optimal strategy is to ignore the mode's signature mechanic and play survival Tetris.

[Q8] Shared per-game piece sequence in 1v1 from a roomId-seeded PRNG | lines: 19841-19855 (randomType/refillBag use Math.random), 19357 + 19030 (starting hold), 19325 (roomId stored), 19023 (gameNumber bumped in lockstep), 12750
  WHAT: In resetBoardState seed `this.rng` from hash(roomId+':'+gameNumber) when mode==='1v1' (Math.random in solo) and use it in randomType and the bag shuffle; keep garbage gap columns on a separate stream since the two sides consume gaps at different rates. Test: same seed → identical 63-bag.
  WHY: Identical sequences are the versus-Tetris fairness norm and remove the 'you got more I's' excuse from a candy bet; seeded games also make rule tests reproducible.

[Q9] KEYS panel instead of the MODE trivia panel; label and dim HOLD; show '1 / Enter' and '2' on the mode card | lines: 20284 + 20313-20318 (MODE panel), 20247-20259 (updateHud appends the full legend to every message), 1030-1037 (.game-help 40px overflow:hidden), 20280
  WHAT: Turn MODE into KEYS ('←→ move ↓ soft', 'Z/X rotate', '↑/Spc drop', 'C hold P pause'); let the help line carry only state + flash at 11px on one line; title 'HOLD (C)' and draw the held piece at 40% alpha while holdLocked; write '1 / Enter' and '2' under the buttons.
  WHY: Beginners have one glance to learn the keys and hold discoverability is the biggest gap between 'stack until top-out' and actually playing; long lock messages currently clip the legend's tail.

[Q10] Recolor O/T/L to guideline hues and give the ghost an alpha fill | lines: 18654-18664 (O '#b7b7b7', T yellow, L purple, silver '#d2d2d2', ghost '#7f7f7f'), 19662 (garbage '#888888'), 20522-20526 (drawGhostCell: 1px stroke on
  WHAT: O yellow, T purple, L orange (keep the black bevel); fill ghost cells with the piece color at ~18% alpha plus the outline; leave silver/garbage gray so 'gray = made/imposed, color = live'. Update the wire palette in the same edit.
  WHY: A plain O already looks 'silver' so the square transformation is invisible, and at CELL=10 the ghost hairline is the one aid low-skill players rely on.

[Q11] Stake transparency where the decision happens: pot/free indicator, W-L/EV on both accept prompts and the series card, '/game' → '/match' | lines: 19733-19741 (ms.staked set, read only at 19770), 20321-20324 (1v1 header), 20602 (bare 'Esc to exit' else-branch), 19783-19796 (_studyBreakCasinoLine 
  WHAT: Append ' · pot 2 🍬' (status 'opened'; 'bet pending' while 'waiting') or ' · free' to the 1v1 header; on the series card show 'free match, no candy moved' when !ms.staked (keep 'bet pending' when staked but candyOutcome is null). Cache /wallet/casino on this._casino (invalidate after resolve at 19774), render 'You: 2W-5L · p(win)=0.29 · EV −0.43 candy/match (n=7)' on both accept prompts and under the candy line on the card; relabel '/game' to '/match' (tallyCasino counts one series per bet).
  WHY: Removes 'I won, where's my candy?' / 'why did I lose candy?' cases the teacher adjudicates, and expected value only teaches at the moment of choice — the one equity lever the constraints allow.

[Q12] Break clock in the HUD + Do-Now-aware copy (information, not a gate) | lines: 18894-18914 (open() stores no start time), 20247-20258 (updateHud), 20255 (solo gameover hint 'Press Enter, R, or click to retry'), 20700 (mode-select
  WHAT: Stamp this.openedAt in open() (clear in close()) and draw 'Break m:ss' on canvas in draw() (updateHud is not per-frame). After BREAK_SOFT_MIN (e.g. 10) change the SOLO game-over hint to 'Break: 12 min · your Do Now is waiting (Esc)'. In drawModeSelect, compute once in open() `_isLessonComplete(_todayLessonInf.t, getStudentMarks())` (typeof-guarded; oracle fails open, so keep copy soft) and show 'Today's lesson done — enjoy the break' / 'Not done yet — short break?'. Never auto-close; never touch the 1v1 branch.
  WHY: Short sessions inside a class period are the design intent, yet the game silently supports a whole-period session and knows nothing about the student's own Do Now state.

[Q13] Rematch from the series-over card (R/Enter) | lines: 19016-19021 (startNewGame returns when seriesOver), 20602 ('Esc to exit'), 20254 (help still says 'Press R to rematch'), 22321 (DogePresence.sendChall
  WHAT: On the series-over card map R/Enter to DogePresence.sendChallenge(ms.opponent), show 'Rematch sent to Bob…' on the card, and keep mpState until match_start arrives so the settlement line stays visible; accepting mints a fresh roomId and escrow via the existing path. Do NOT send game_leave (it triggers the opponent's koWin/'fled' path — the leaked room is rebound on the next accept) or ship the opponentLeft seriesOver guard first. Fix the card/help strings to 'R = rematch · Esc = exit'.
  WHY: Today a rematch costs Esc → menu → lobby → find classmate → challenge → accept → countdown, most of a five-minute break, so pairs drift back to solo.

[Q14] Mirror Arm Gate / Green Light into the game | lines: 953-960 (.game-overlay z-index 250 covers the pico strip), 23582-23589 (onStateChange stashes _lastClassroomSummary; _renderLiveIndicator is a no-op a
  WHAT: In onStateChange, when studyBreak.isOpen() and gate.armed or greenlight transitions to true, write a persistent line into #game-help ('Teacher armed the gate — Esc to return', cleared when it drops) and additionally flash() only while state is running/paused so the game-over card text is never clobbered. No auto-close.
  WHY: Live Classroom is the teacher's one whole-class channel and a student in Tetris cannot see it; a visible signal keeps the student in control while ending the 'I didn't see it' excuse.

[Q15] One mute that actually mutes, and cues that don't pile up | lines: 9480-9512 (SFX, 'studybreak-muted'), 18484-18521 (MacSFX, 'macsound-muted'), 2411 (game mute toggles SFX only), 1973/18547 (menu mute toggles MacSFX o
  WHAT: In SFX.play: `if (this.muted || (typeof MacSFX !== 'undefined' && MacSFX.muted)) return;` and make the game button toggle both (then _renderSoundIcon()). In lockPiece skip 'droplet' when anything cleared; schedule 'indigo' ~350ms after the clear cue via a start offset; drop 'logjam' to ~0.3 as a warning; koWin 0.7. Keep the mute device-global; optional master GainNode.
  WHY: In a room of Chromebooks a mute that doesn't silence the game, plus four oscillator stacks on a gold tetris and a full-volume win jingle, is what gets sound banned.

[Q16] Draw-side feedback: lock-delay cue, danger border, line-clear flash | lines: 19829-19835 (lockTimer accumulates silently), 19904-19911 (reset cap), 20498-20507 (drawPiece takes no timer), 20392-20415 (fixed black well border), 
  WHAT: When the active piece is grounded, darken its inner outline or dim it by t = lockTimer/LOCK_DELAY (red outline at the reset cap is optional); stroke the well border #b00000 while any cell sits in rows HIDDEN_ROWS..+3 (no beep). Before clearLines, snapshot the board and full rows into this.clearFx {rows, board, timer:120}, add 120ms to spawnTimer, and draw the snapshot with full rows painted white while the timer runs (drop it early if garbage lands; skip on gameover). A flat +10 'PERFECT CLEAR' can ride the same hook.
  WHY: Pieces 'mysteriously' freeze and rows vanish in the same frame they lock, so novices cannot see which rows cleared or why a piece stopped; the state is already there, only the rendering is missing.

[Q17] Piece-count histogram on the solo game-over card (the 63-bag as a sampling demo) | lines: 19876-19879 (spawnNext: single entry point), 19029 (initial hold outside the bag — fix via the drought-guard item), 19841-19858 (9 of each), 20345-203
  WHAT: Add pieceCounts reset in resetBoardState and bumped in spawnNext; widen only the solo game-over card to 212×100 (keep or move the two existing text lines) and draw seven 8px bars in piece colors with counts and a caption 'n = 47 of 63 · 9 of each in the bag'. Pure client.
  WHY: The class already runs a Casino Stats lab on the 1v1 bets; the solo card can teach without-replacement sampling variability for free every time a student tops out (note: no type can exceed 9 before piece 64).

[Q18] Interim touch guard until the control strip ships | lines: 20634-20705 (drawModeSelect footer), 19241-19283 (showChallengeDialog), 22368-22381 (showChallengePanel)
  WHAT: Compute `matchMedia('(hover: none) and (pointer: coarse)').matches` once; draw 'Needs a keyboard on this device' as the mode-select footer and above both challenge prompts' buttons, and focus Decline by default. Warn-and-default, not hard-block (2-in-1s misreport).
  WHY: A tablet student who taps Accept is dropped into a 1-candy best-of-3 they physically cannot play and loses by default.

[Q19] Accessibility basics: real mute button + M key, dialog role, live status, focus restore | lines: 2409 (mute is a click-only span), 2405-2406 (no role/aria-modal), 18906 (open focuses canvas), 18916-18964 (close never restores focus), 20247-20259 (
  WHAT: Make mute a <button aria-label='Mute sounds' aria-pressed> and bind M (add to handled keys; check for Desk collisions); role=dialog aria-modal on .game-window; one sr-only aria-live='polite' region written only on state transitions (paused, game over + score, squares, countdown); remember document.activeElement in open()/launchMatch and focus it in close().
  WHY: Cheap and consistent with the rest of the Desk, and it fixes the practical 'I can't find the mute' complaint on shared machines.

=== bigger_features (10) ===

[B1] System 7 touch control strip + touch hardening + narrow-screen scaling | lines: 18763-18781 (only pointer input: canvas mousedown, idle/gameover/paused only), 18784-18855 (all gameplay input is document keydown/keyup on the keys s
  WHAT: Insert `<div id="game-touch" class="game-touch" hidden>` between the canvases and #game-score with seven .s7btn buttons (◀ ▶ ▼ ↺ ↻ HOLD DROP) wired via pointerdown/up/cancel/leave into the SAME keys struct (◀/▶ set keys.x.down + next=now+DAS_DELAY + tryMove; ▼ toggles keys.down.down; ↺/↻ → tryRotate; HOLD → holdSwap; DROP → firmDrop), gated on state==='running' and pointer-captured; reveal on the first pointerType==='touch' event (persist in localStorage) rather than (pointer:coarse). CSS: touch-action:none / user-select:none / -webkit-touch-callout:none on canvases and strip, overscroll-behavior:contain on the overlay (not touch-action:none — the window scrolls at 96vh), ::after{inset:-8px} hit extenders on close/mute, min-height:32px on lobby rows and .s7btn with :active invert (rows need a class). In the ≤700px block: .game-window 100vw and `#game-split canvas { width:calc(50vw - 6px)
  WHY: Touchscreen 2-in-1 Chromebooks and iPads can start a game and Accept a candy challenge today but cannot move a single piece; a strip of beveled buttons is exactly what a System 7 control panel looks like.

[B2] Pieces appear immediately: spawn just above the skyline and use Guideline lock-out | lines: 19866-19874 (createPiece y:0), 20498-20501 (drawPiece skips cell.y < HIDDEN_ROWS), 18627-18629 (HIDDEN_ROWS 4, BOARD_Y 24), 19838 (920ms at L1), 20017
  WHAT: Spawn at y = HIDDEN_ROWS-2 and let drawPiece/drawGhostPiece render rows ≥ HIDDEN_ROWS-2 in the 24px strip above the well (2×12px solo, 2×10px split); move the 1v1 stat line below the well; change toppedOut to 'every locked cell above HIDDEN_ROWS' (spawn collision already covers block-out); mirror the visibility change in drawOpponentBoard. detectSquares' loop bounds stay.
  WHY: Every piece is invisible for three gravity ticks (2.8s at L1, ~1.6s at L7) while its ghost sits on the floor, and a piece landing at rows 3-4 loses with the top visible row empty.

[B3] Square planning aids: ghost turns gold/silver when the drop completes a square; optional one-piece-away hint | lines: 20330-20331 (drawGhostPiece then drawPiece), 20511-20520 (ghost is always #7f7f7f), 19984-19989 (getGhostY), 20105-20125 (whole-piece test inline in d
  WHAT: Extract a pure `_regionMaterial(cells4x4)` → 'gold'|'silver'|null (reused by detectSquares); in draw(), for the ≤49 regions touching the ghost cells, evaluate it on board+ghost cells (ghost cells carry the active piece's id/type, kind 'piece'), cached by `${type}${rot}${x}${ghostY}|${_boardVersion}` with _boardVersion++ in lockPiece/clearLines/insertGarbage, and stroke the ghost in colors.gold/silver at lineWidth 2. Optional: `_computeSquareHints()` at the three mutation sites outlining 4×4 regions with exactly 3 whole pieces + a 4-connected 4-cell hole whose columns are open from above (dashed rect, gold if same type and hole shape matches); H toggles.
  WHY: A novice discovers the whole-piece rule by seeing the ghost light up and an expert gets a fast 'drop here' confirmation — the single biggest learnability win available.

[B4] 1v1 split HUD: mini HOLD/NEXT, live series score, a visible GO! | lines: 20276-20325 (all panels gated on mode!=='1v1'; 1v1 gets one 9px line at 20324), 18643 (splitConfig BOARD_X 58 → 58/57px margins), 19957 + 19877-19879 
  WHAT: On each 215px canvas draw a mini HOLD (scale 5, left margin) and 3 mini NEXT slots (right margin) with drawMiniPiece; put 'Game 2 · You 1–0 Bob · 🍬 pot 2' in the p1/p2 labels or a 9px line under the boards; hold 'GO!' ~400ms (or this.flash('GO!')) with 'droplet' per tick and 'wildEep' on GO. Keep the draw() gameover branch shape pinned by tests/study-break-hardening.test.js:158.
  WHY: The only staked mode is played blind-holding with no preview and no idea whether this is game 1 or the decider — exactly the 'unfair' complaint a teacher has to adjudicate.

[B5] Opponent board at ~10Hz instead of a 2.5s slideshow; show their hold/next | lines: 20076 (active=null) then 20090 (sendGameState — every lock snapshot has active:null), 18636 (HEARTBEAT_MS 2500), 19370-19398 (payload already carries 
  WHAT: Set `_mpDirty` in the success paths of tryMove/tryRotate/holdSwap/spawnNext; in loop(), when 1v1 && dirty && now-_mpLastSend ≥ 100ms send a light {type:'game_state', active, hold, queue, score, lines, level} with no board (keep full-board sends at lock and heartbeat). In updateOpponentState only replace opponentBoard when Array.isArray(data.board) — ship this guard in the same commit — and store hold/queue; draw them in the opponent's 58px gutter with drawMiniPiece.
  WHY: The split screen is the reason to play 1v1; today the rival's stack jumps in place and their piece teleports every 2.5s, so it is two solo games side by side.

[B6] Garbage lands at lock time with one hole per batch (no more 'Buried!' mid-placement) | lines: 19643-19648 (setTimeout 1000 → insertGarbage), 19651-19682 (insertGarbage: per-row Math.random gap; kills the active piece), 20044-20057 (cancel block
  WHAT: receiveGarbage keeps adding to pendingGarbage and sets ms.garbageReadyAt = now+1000 (no timer); in lockPiece after the cancel block and before active=null, insertGarbage() if pendingGarbage>0 && now ≥ garbageReadyAt. Pick one gap per batch (1-in-3 chance to shift when >2 rows). Drop the 'Buried!' branch — a true top-out surfaces via spawnNext's existing game_over path — and update the SB-1 source pin at tests/study-break-hardening.test.js:154. Remove garbageTimer clears from startMatch/close.
  WHY: Students should lose because they stacked badly, not because the board moved under a piece they were dropping; lock-time garbage also gives the defender the standard clear-to-cancel decision.

[B7] Esc keeps the solo board: resume on reopen | lines: 18793-18796 (Escape → closeGame unconditionally), 18954 (close() demotes running→paused and keeps the board), 18894-18901 (open() forces idle + resetB
  WHAT: In open(): if mode==='solo' && state==='paused' && (score>0||lines>0||active), skip the reset and show the PAUSED card with 'P/click = resume · N = new game'; change 18801 so Enter on that card resumes instead of wiping (or add N). Optionally first Esc in a running solo game pauses with flash('Esc again to leave — your game is kept'); optionally serialize {board, queue, bag, hold, score, lines, level, gold, silver} to localStorage `studybreak-save:<username>` on close and restore on open. 1v1 untouched (mpState is nulled in close).
  WHY: Short sessions on shared Chromebooks get interrupted constantly and Esc is the Desk's universal close key; the code already preserves the board and never uses it.

[B8] Solo game-over card with personal best and score history (best / median / percentile) | lines: 20347 (drawCenterCard 'GAME OVER' with no numbers), 20255 (HUD prefix), 19444-19455 (submitLeaderboardScore — the one hook all 3 solo game-over sites 
  WHAT: Inside submitLeaderboardScore (solo branch only) push {score, lines, gold, silver, ts} into localStorage `studybreak-scores:<username>` (cap 50; skip when no username); render on the solo card 'Score / Lines / Gold / Silver · Best 1240 · Median 610 · beat 73% of your 11 games' with 'NEW BEST!' as the title when beaten; add a BEST line to STATUS and 'Your games: n · best · median' on the mode card. Keep _studyBreakScoreGameOnce untouched.
  WHY: A study break needs a reason to come back; every student competes against their own distribution instead of the class expert, using the Unit 1 vocabulary the course already teaches.

[B9] Lobby shows who is mid-match ('⚔ vs Bob') via presence | lines: 19206-19222 (updateLobby keys only on onDesk), 19248-19252 (busy player silently auto-declines), 22182/22193 (Desk identify + heartbeat location), rel
  WHAT: Preferred (untrusting): have the relay derive activity/vs from gameRooms and broadcast user_online on room create/delete; alternatively carry {activity:'tetris', vs} in identify AND heartbeat (the heartbeat overwrites wsLocation) and re-send identify on startMatch/seriesOver/close. Whitelist activity (enum) and vs (length-capped, rendered via _deskEsc) in sanitizeLocation and pass them through aggregateLocation. Lobby rows with activity==='tetris' render greyed '⚔ vs Bob' with no onclick; DogePresence chips can reuse the field. Requires a cr-repo deploy; no spectating.
  WHY: A student sees at a glance who is free, and the class gets the small social signal that queues up rematches — without any voice/screen-share/spectator surface.

[B10] Teacher dashboard consumes the existing GET /class/casino | lines: roster-server/doge-wallet.js 574-590 (teacher-gated, ?section=, returns players[{studentId, wins, losses, games, netCandy}]), teacher-dashboard.html 5
  WHAT: When 'Load wallets' runs also fetch /class/casino?section=<current> and add a 'Bets W-L (net)' column (or a collapsible 'Study Break bets' table) joined on studentId, '—' for absent ids, sorted by net.
  WHY: Candy moves student-to-student with no teacher view; the teacher can spot a novice being farmed, and the zero-sum net column is the promised Casino Stats discussion data.

=== refactors (5) ===

[R1] Pin the scoring rules with behavior tests (extract to lib/square-mode-rules.js) | lines: 20094-20156 (detectSquares), 20158-20239 (clearLines), 20042-20052 (garbage table + cancel), 19837-19839 (gravity), 19941-19943 (kicks), 19845-19857 (
  WHAT: Move detectSquares/clearLines/garbageFor/gravityMs/KICKS/bag into lib/square-mode-rules.js as pure functions (UMD shape), load it unconditionally (openGame refuses with a message if missing — no inline fallback copy), and delegate from studyBreak; leave timing constants inline. Tests: four O's → gold; O+O+I+I → silver; T pinwheel → gold; hanging piece → no square; tetris through gold → 45 / goldStrips 4; single through silver → 6 and survivor kind; garbage rows never form squares; post-collapse seam square found by the second pass; fast-check: clearLines conserves non-cleared cells, every 'piece' cell belongs to a whole 4-cell piece, garbageFor never exceeds the table. Cheaper fallback: methodBody-extract the two methods onto a ctx {board, COLS, HIDDEN_ROWS, TOTAL_ROWS, colors, nextSquareId, goldCount, silverCount}.
  WHY: grep finds zero tests touching detectSquares/clearLines/goldStrips; a regression in the ruleset students argue about ships unnoticed, and the shatter/strip-garbage/ghost items all edit exactly this code.

[R2] Delete the dead transports: WebRTC that never connects and the own-socket fallback with 9 unreachable cases | lines: 19488 (`side === 0` but the relay sends 'left'/'right' at server.js 2809/2815), 19484/19495/19172 (rtc_* sent with no `to`; relay 3110-3120 breaks for
  WHAT: Remove setupWebRTC/setupDataChannel/_addIce/_flushIce, the rtc_* cases and forwarder, the useP2P branch, the teardown lines in close(), and the fallback socket branch; shrink handleMpMessage to the live cases and rename it _handlePeerMessage; drop the Player#### identity fallback but keep `this.mpWs = DogePresence.ws` (close/sendChallenge/_liveWs still read it). Update the MP-3 pins (tests/study-break-hardening.test.js 175-179) and the connectMultiplayerWS pin at tests/doge-presence-submenu.test.js:397. If P2P is ever wanted: `side === 'left'`, `to: ms.opponent`, and a game-room branch in the relay.
  WHY: Every match sits through a silent 5s timeout and a STUN call to Google from a school Chromebook before running on the WS relay anyway; the next maintainer (and the smoke test) should reason about one transport.

[R3] Collapse the four drifted top-out copies into _topOut(msg) | lines: 19881-19891 (spawnNext), 19965-19972 (holdSwap: no 'monkey' sound), 20081-20089 (lockPiece), 19670-19679 (insertGarbage: game_over sent without the mo
  WHAT: `_topOut(msg) { active=null; state='gameover'; if 1v1 sendGameMessage(game_over); SFX 'monkey' 0.6; flash(msg); submitLeaderboardScore(); updateHud(); }` called with 'Stack jammed' / 'Hold jammed the stack' / 'Top out' / 'Buried!'; pin that exactly one `state = 'gameover'` write exists outside opponentKO/opponentLeft and rewrite the SB-1 ordering regex at tests/study-break-hardening.test.js:155.
  WHY: The escrow-stranding 'garbage burial never scored' bug was exactly this drift; any future game-over behavior is then edited once.

[R4] Split-view render parity, kept S-sized | lines: 18628-18632 vs 18641 (constants duplicated in soloConfig and mutated by enterSplitMode/exitSplitMode 18876-18892), 20267-20272 (draw(cfg) — no caller 
  WHAT: Give drawCell a ctx parameter and use it in drawOpponentBoard for bevel parity; delete the dead cfg parameter. Do not chase full parity (fragment X, square blocks) — the wire format carries only color until the game_state payload adds kind/squareId; do not touch exitSplitMode's call inside the audited close().
  WHY: The two halves of the split screen currently look like different games; the small change gets most of the visual win without an M-sized refactor before the 1v1 smoke has run.

[R5] Throttle idle redraw and hoist per-frame constants | lines: 18966-18983 (loop() draws + re-arms rAF in every state), 20351-20354 (drawOpponentBoard every frame), 20290/20299/20313 (stats/squareText/modeLines ar
  WHAT: Inside loop(), draw at ~10fps when state !== 'running' (one-liner, draw-then-throttle so the blur-pause branch still paints the PAUSED card) rather than stopping rAF and hand-wiring redraws; hoist the three constant text arrays; use the first pushed cell as a square's origin with size from its cell count. Skip the ghost-Y cache and isValid rewrite (no measurable benefit, added invalidation surface).
  WHY: Students leave the game open and paused on shared Chromebooks while the Desk's other canvases share the main thread; these are the zero-risk pieces.

=== DROPPED NOTES ===
 Merged duplicates across lenses: lobby/dialog key routing (feel #3, ux challenge-dialog, mobile Enter/Esc) → one bug; R-restart (feel, code) → one; pause/blur + 1v1 pointer resume (feel, mobile) → one; flash banner overflow (rules, ux) → one, dropping the 'banner hides the spawn' framing (pieces spawn in hidden rows) and the 'credited twice' claim; garbage meter (ux, multiplayer) → one incl. the 'Marathon mode'/'Press R to rematch' strings; shared seed (rules, multiplayer, code) → one, with garbage gaps on a separate stream; Hall of Fame (ux, pedagogy) → one delete item plus one personal-best/history feature; lobby status / pending guard / stale sendChallenge socket (ux, multiplayer, code) → one, with the open()/submitLeaderboardScore _liveWs hygiene folded in; touch controls (feel, ux, mobile ×4 incl. touch-harden CSS, 700px breakpoint, lobby targets) → one bigger feature plus the interim keyboard guard; canvas geometry (ux, mobile) → one, corrected to a uniform 1.9% downscale and a 4px 1v1 overflow, fixed at the top-level rule on line 1230 (verified it is not inside a media query); opponent palette/garbage-as-cyan (rules, code) → one; level curve (feel, rules) → one, solo-only start pick; whole-piece help text + square diagram (rules, ux) → one; scoring tests + lib extraction (rules, code) → one refactor scoped to M per correction; perfect clear folded into the line-clear flash hook; classic ↑-rotate preset folded into the modifier-guard item; ctrl-guard corrected to 'Ctrl+R restarts AND blocks the reload'. Dropped: the shared wall-clock gravity curve for 1v1 (divergence is ≤1 level in a short series and the own-lines rule already favors the weaker player); the DPR-aware backing store (two lenses, one refuted — integer DPR is already pixel-doubled by image-rendering:pixelated and fractional DPR only sharpens text, not the 1px grid; not worth it); the ghost-Y cache / non-allocating isValid (no measurable win, new invalidation surface); stopping the rAF loop outrigh

survivors: 85 rejected: 1
 REJECTED: pedagogy Report 'study-break' in the presence lesson slot so the teacher's whereabouts chip shows who is on break
```
