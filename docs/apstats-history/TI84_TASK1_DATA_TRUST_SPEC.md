# Task 1: TI-84 Trainer data-trust core (Codex implement spec)

Repo: C:/Users/rober/Downloads/Projects/school/follow-alongs
Owned paths: ti84-trainer-v2/app.js, ti84-trainer-v2/lib/ (new, optional), ti84-trainer-v2/build.mjs, ti84-trainer-v2/index.html, ti84-trainer-v2/generated/, ti84-trainer-v2/standalone.html, gradebook-client.js, tests/
Do NOT touch: roster-server/, any u*_lesson*_live.html worksheet, edgar_*, ap_stats_roadmap_square_mode.html, data files (ti84-procedures-data.json, ti84-pattern-recognition-data.json), ti84-trainer-v2/native/ (except nothing - leave native alone entirely).
Do NOT commit. Leave changes in the working tree. The tree has pre-existing dirty files (GRADEBOOK_TAGGING_AUDIT.md, data/skill-map.js, state/, .ai-tutor-*) - never revert or stage them.

Background: ti84-trainer-v2/app.js is a single IIFE (~3,687 lines, zero exports). It renders into #app via full innerHTML re-render (render() at ~3339). The trainer records practice attempts to the roster gradebook via window.gradebookClient.record() (gradebook-client.js). All line numbers below were verified against current master on 2026-06-11; treat them as anchors, re-locate by reading the code.

Style: edit in place. No wrappers, no new abstraction layers, no retries framework, no config system. Match existing code style (skimmable, early returns). Preserve LF line endings. Student-facing copy in plain friendly English.

## W1. Recall mode must stop showing the answer (finding: recall narration leak)

Track 2 walkthroughs have walkthrough.mode 'guided' or 'recall'. In recall mode the student is supposed to remember the next key, but today the answer leaks through four channels. Fix all four. Guided mode behavior is unchanged.

1. renderWalkthroughPanel (~app.js:2754): copy = step?.narration is rendered with no mode gate. In recall mode, for normal key steps (NOT the data-setup or result-review phase overrides which already replace copy), show instead: "Step {n} of {total} - what comes next?" where n/total come from the walkthrough position.
2. renderCalculatorColumn narration bar (~app.js:3111 and ~3166): same gate - in recall mode show the same neutral prompt, not step.narration.
3. Mock-LCD footer (~app.js:3415): prints "Expect [key]" for every step. Suppress that footer line entirely in recall mode (keep it in guided).
4. wrongFeedback fallback (~app.js:1921-1937): in recall mode, never reveal "The next key is [X]". Use "Not that key." as the fallback. KEEP the authored commonErrors coaching strings when they match (they explain why a key is wrong, which is fine) - only the fallback that names the next key changes.
5. Physical-mode step card (~app.js:3037-3052) always shows "Press {keyLabel}" even in recall mode. In physical + recall mode, show "Step {n} of {total} - do the next step on your calculator." instead of naming the key. Physical + guided keeps showing the key.

The Hint button (recall-only, ~3173) stays the single legitimate reveal channel. Do not change hint/error costs (showHint ~2444).

## W2. Physical mode: credit requires verification (teacher decision 2026-06-12)

physicalMode (default true, ~app.js:750) is an honor system: physicalAdvance (~2485-2506) counts no errors/hints, so recallQuality(0,0)=5 and recordTrainerAttempt (~2163-2194) writes score 1.0 to the gradebook for button clicks. Teacher decision: in physical mode, a completion only records to the gradebook if the student passed the type-the-result answer verification.

1. In recordTrainerAttempt: when app.physicalMode is true, only call window.gradebookClient.record() if the just-completed walkthrough passed answer verification (the answerVerified flag used by the finish-review gate at ~3497-3503). If the procedure has no VERIFICATION_FIELDS entry (~506-572) there is nothing observable, so in physical mode record nothing for it. Local SM-2 state still updates exactly as today in all cases - only the gradebook write is gated.
2. Add the input mode to the recorded payload: inside the response object recordTrainerAttempt already sends (it carries quality/errors/hints/mode where mode is guided|recall), add inputMode: 'physical' or 'emulator' from app.physicalMode. Do not rename the existing mode field.
3. Failed verification checks must cost something (today they never increment errors, so quality stays 5): in checkAnswerVerification (~2300-2344), each Check click that has at least one wrong field increments walkthrough.errors by 1. This makes verification-gated physical scores honest and also affects emulator-mode quality consistently.

## W3. Stop the Expected-value leak in verification (finding: first-miss answer reveal)

Today any failed check renders "Expected: {value}" beside each field (~2700-2705), so clicking Check with blank fields hands the student the answers.

1. Track per-field failed-check counts on the walkthrough verification state. Show the "Expected: {value}" reveal for a field only after that field has failed 3 checks. For failures 1-2, mark the field wrong with a neutral message such as "Not a match - check sign and decimals." (per-field, no value shown).
2. Mock-LCD result screens: screenLinesForMock (~3396-3411) ignores screen.lines, so in mock mode (ROM unavailable) result screens show no computed values and the Expected leak was the only way to read them. Make screenLinesForMock also render screen.lines when present, substituting {value}-style placeholders using the same computed-values source computeExpected uses, so a mock-mode student can genuinely read results off the LCD. Look at how the result screens store lines in the generated data (window.TI84V2ProceduresData screens, e.g. one-var-stats-result-page1, t-test-result) and reuse the existing placeholder substitution approach used elsewhere in app.js if one exists.
3. Dead-code fix that this depends on: computeExpected (~584-708) prefers app.backend?.getComputedValues?.() but app.backend is never assigned - the backend object is stored as app.bridge (~3645). Rebind that lookup to app.bridge so native/ROM computed values are actually preferred. Verify the property name by reading the assignment site.

## W4. Track 1 brute-force penalty (finding: cancel-branch is free)

handleChoice (~3428-3448) records nothing on a wrong procedure choice; cancel-branch (~3480-3484) just nulls the branch intro; track1QualityForBranches (~2197-2211) computes quality from branchCount only, so guess-cancel-repeat earns quality 5.

1. In handleChoice, when the chosen procedure is wrong, increment a wrongChoices counter on the active question object (initialize to 0 when the question is created).
2. In track1QualityForBranches, treat each wrongChoice like a branch: effective = branchCount + (question.wrongChoices || 0), then apply the existing quality mapping to effective. Completed branches must not double-count with the wrong choice that opened them - read the bookkeeping at ~2228-2233 first: branchCount increments only on COMPLETED branches, and a completed branch's original wrong click would now also have incremented wrongChoices, so subtract completed branches from wrongChoices when combining (effective = branchCount + max(0, wrongChoices - branchCount)) or increment wrongChoices only when the branch is cancelled rather than completed. Pick whichever is cleaner in the code; the invariant is: a wrong choice followed by a completed branch costs exactly what it costs today (one branch), and a wrong choice followed by cancel costs the same as one branch instead of nothing.

## W5. Raise-only recorded score (finding: shaky re-practice overwrites a good score)

recordTrainerAttempt pins attempt:1 so re-practice upserts the same ledger row, and score = lastQuality/5 can LOWER a previously recorded 1.0 to 0.2. Repo convention is raise-only (AI grading only raises; Blooket takes max).

1. Persist a per-procedure bestScore in the trainer's localStorage state (the track2 record created by ensureProcedureRecord is the natural home). On each record, send score = max(storedBest, quality/5) and update storedBest. The response object keeps the LATEST diagnostics (quality/errors/hints/mode/inputMode) - only the score field is raise-only.

## W6. Auth-aware failure surfacing (finding: expired tokens silently drop every row)

Tokens expire after 30 days; rosterClient.current() never checks the token, so an expired student passes the guard, the server 401s, and gradebook-client returns {ok:false, reason:'network'} with only a console.warn. Nothing is visible to the student.

1. gradebook-client.js (~126-132): distinguish failure reasons. HTTP 401/403 -> {ok:false, reason:'auth'}; other non-2xx -> {ok:false, reason:'server'}; fetch threw -> {ok:false, reason:'network'}. BEFORE changing anything, grep the repo for callers reading the reason field (Desk, worksheets, study guide all load gradebook-client.js) and keep every existing consumer working - if any caller switches on reason==='network', preserve that value for genuine network errors only. The {ok:boolean} shape must not change.
2. recordTrainerAttempt: stop discarding the promise. .then() the result into a small status on the session-result card (the screen shown after completeWalkthrough): on ok true -> "Saved to your gradebook."; reason 'auth' -> "Not saved - your sign-in expired. Open the Desk and sign in again."; otherwise -> "Not saved (connection problem)." Only render the line for signed-in students who attempted a record (physical-unverified completions that skip recording show nothing). The record call must remain unable to throw into the practice loop. Note the full-innerHTML render() pattern: set state then call render() (or update the existing element in place if the session-result card is still mounted) - follow whichever pattern the file already uses for async banner updates.

## W7. Tests (root vitest + jsdom, tests/ directory)

Root suite runs with npm test (vitest, jsdom env available). Add focused tests; pin behavior, not implementation details. If testing through the IIFE is impractical, you MAY extract ONLY the pure functions recallQuality, sm2, track1QualityForBranches, valuesMatch into a new ti84-trainer-v2/lib/trainer-logic.js with the repo's dual-export pattern (window global + module.exports, see ti84-trainer-v2/native/screen-renderer.js end of file), loaded by index.html before app.js and added to build.mjs so standalone.html inlines it (read build.mjs first - native files are listed in nativeScriptFilenames). No other extraction. If you extract, app.js must consume the extracted functions (no duplicated logic).

Required coverage:
1. Recall gating: recall-mode render contains the neutral prompt and does NOT contain step narration, "Expect", or "The next key is"; guided mode still shows narration.
2. Record payload: signed-out -> no record call; signed-in emulator -> payload {source:'trainer', itemId:'TI84-<id>', unit:'U<n>', attempt:1, response.inputMode:'emulator'}; physical + unverified -> no record call; physical + verified -> record with inputMode 'physical'.
3. Raise-only: best 1.0 then quality 1 -> score stays 1.0; best 0.4 then quality 5 -> 1.0.
4. Track 1 quality: 0 wrong = 5; one cancelled wrong guess = same quality as one completed branch; completed branch does not double-count.
5. gradebook-client reasons: 401 -> 'auth', 500 -> 'server', fetch reject -> 'network' (mock fetch).

## W8. Rebuild + verify

1. node ti84-trainer-v2/build.mjs - MUST run after app.js/gradebook-client edits so generated/ and standalone.html match sources (students load standalone.html; gradebook-client.js is script-src'd, not inlined - verify by reading build.mjs and the standalone template).
2. npm test from repo root - must exit 0.
3. Do NOT run or modify the native suite (it has one known pre-existing red: a stale 27-vs-29 count pin; out of scope here).
4. Report: list of behavior changes, files touched, test counts, and anything you found that contradicts this spec (do not silently improvise around contradictions - report them).
