# Answer-key freeze

Answer-key freeze status: **implemented in commit `<pending>`; deployed when the
overseer pushes.**

## What is frozen and why

Server-side grading for each school year uses a committed copy of the
answer-key document. For SY2627 that artifact is
`roster-server/data/answer-key.SY2627.json`; its `answerKey` map is loaded into
the SY2627 `GradeContext`, validated, cloned once at server boot, and shared by
every grading route, including `/grade/offline-inputs`.

The freeze prevents a later regeneration of the live `data/answer-key.json`
from changing previously earned `curriculum_quiz` credit. Client answer-key
routes still serve the live document, so freezing server-side grading does not
change worksheet or quiz-client behavior.

The active school year fails closed in production. If its committed freeze is
missing, unreadable, malformed, or structurally invalid, the roster server
throws during boot instead of grading against the live key. A missing freeze in
tests or for a non-active historical context logs one warning and falls back to
the live key; malformed or invalid freeze files throw in every environment.

## SY2728 rollover runbook

1. Populate the new Algebra 2 answer key with the A2 content pipeline.
   Phase 2a ships empty valid keys; the AP Stats generator is retired.

2. Copy the newly generated bundled document to the next immutable artifact:

   ```sh
   cp roster-server/data/answer-key.json roster-server/data/answer-key.SY2728.json
   ```

3. Register `answer-key.SY2728.json` and the SY2728 context in
   `roster-server/grade-contexts.js`.
4. Flip `ACTIVE_SCHOOL_YEAR` to `SY2728` only after the freeze is registered.
5. Keep every older `answer-key.SY*.json` freeze forever. Never regenerate or
   overwrite a historical freeze.
6. Run the grade golden master and smoke-test `/grade` with a known correct and
   incorrect quiz response. Confirm `/grade/offline-inputs` re-derives the same
   grade from its redacted frozen key before deployment.
