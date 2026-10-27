# Class Log section plans

The main Card and Practice deck are two views of one saved section/date plan. `roster-server/section-plan.js` compiles both from explicit lesson assets, recording evidence, teacher decisions and durable commitments. It makes no model call and reads no files. The server can therefore rebuild a future plan immediately after a summary or commitment status changes, using the stored lesson inputs.

## Plan the next class in conversation

Load the relevant section's context before proposing changes:

```powershell
node scripts/plan-next-class.mjs context --section C --date 2026-10-27 --out roster-local/class-plans/context-C.json
```

This is read-only except for the requested output file. It includes the current package, detailed authored routine, latest source, open and closed commitments, mastery snapshot and existing decision journal. Dates resolve to that section's first meeting on or after the supplied date. Without `--date`, the search starts tomorrow in New York. `--offline` uses saved inputs and the local summary cache; it cannot publish and may not have the latest commitment status.

Record the teacher's explicit edits in a JSON file:

```json
{
  "id": "2026-10-27-C-endpoint-correction-1",
  "at": "2026-10-26T20:00:00Z",
  "set": {
    "teacherBrief.lastClass": "Example 3 was completed; Example 5 is still pending.",
    "teacherBrief.today": [
      "Finish Example 5 and Try It 5.",
      "Run RVD and W67 if time permits; quiz next class."
    ],
    "teacherBrief.next": "Give the 1-3 quiz next class.",
    "observerCard.body": "Example 5 and Try It 5: compare the endpoint rules and discrete range before the optional IXL drills."
  }
}
```

Apply and compile the correction locally:

```powershell
node scripts/plan-next-class.mjs decide --section C --date 2026-10-27 --decision roster-local/class-plans/edits-C.json
node scripts/plan-next-class.mjs compile --section C --date 2026-10-27
```

The single ignored artifact `roster-local/class-plans/2026-10-27-C.json` contains the source inputs, decision journal, expected server revisions and compiled package. Repeating the same decision ID and edits does nothing. Reusing that ID for different edits fails; a later correction gets a new ID. Teacher decisions reapply after automatic source revisions. An explicit last-class correction governs both the displayed account and the recap cue.

Factual `source.*` and `teacherBrief.lastClass` corrections retain `sourceBinding` metadata identifying the class recording being corrected. A later automatic summary of that same class does not erase the correction. A recording from a different class date uses its own evidence; old facts are kept in the journal but never relabelled as the newer class. Context reports those inactive source decisions. Authored directions such as today's sequence, IXL drills and the detailed routine remain persistent until explicitly changed.

Allowed edit keys are `teacherBrief.title`, `ixl`, `lastClass`, `today`, `next`, `mode`, `minutes`; `observerCard.title`, `body`, `frame`, `mode`, `minutes`; and `source.landed`, `promises`, `questions`, `nextPrep`. Keys are written in dotted form as above. Array-valued fields remain arrays. Changing the lesson examples or routine requires updating `observerCard.body` together with the concise brief: the textbook selector deliberately uses the detailed routine. Source corrections change the saved account; resolve or defer a durable commitment through its status control.

## Publish the reviewed package

```powershell
node scripts/plan-next-class.mjs publish --section C --date 2026-10-27
```

The CLI sends only compiler inputs plus expected plan and commitment-scope revisions. The server recompiles with authoritative commitment status and trusted roster privacy rules, then updates the saved package and compatibility card/deck rows in one transaction. The card ID remains stable. No separate card/deck publish is needed. Do not run the legacy publishers for a packaged class.

To prepare every section's next meeting, use `publish --per-section`. All selected targets compile before one batch is sent. Any missing authored entry, invalid lesson input, compilation error or revision conflict stops publication. The existing package stays intact.

If the server returns a conflict, reload `context` and reconcile the teacher decisions against the newer plan. When local pending edits are explicitly reviewed against that newer context, rerun `decide` or `compile` with `--rebase`, then publish. This flag acknowledges the local journal's base revision; it does not bypass the server's transaction checks. It is not an automatic retry option.

## Commitments and rehearsal

Promise and preparation statements keep stable IDs and explicit open/done/deferred/cancelled status across summary revisions. An old promise remains a checkable reminder until explicitly resolved, even when it predates the latest summary by more than 14 days. A deferred reminder returns on its deferral date. Status changes rebuild future packages on the server.

Existing reviewed `continuity` handoffs are adopted when their source date and recorded instant match. Equivalent UTC timestamp spellings match. The adoption records persistent source decisions and reconciles reviewed promise/preparation statements only against commitments proven to come from that recording revision. It preserves unrelated older promises and already-resolved statuses; replay does not create new commitments or increment versions again.

The deck reserves up to three daily cues, each holding one complete action or source statement. Daily cues have no textbook mastery node and change identity when their answer changes. Long statements remain in plan evidence instead of being clipped into misleading claims. Existing textbook node IDs, mastery behavior, Teacher's Edition prompt reservations and complete multipart prompts remain intact. Text is checked against Android's UTF-16 limits.

The package also retains the detailed routine and complete source metadata for the app's expandable evidence. Shared projections omit roster names and individual scores; raw canonical source stays private on the server.

## Nightly and recovery

`tools/nightly_tomorrow.ps1` pulls summaries, writes Tomorrow notes, validates/rebuilds lesson trees, then runs the atomic package publisher. It no longer performs separate card and deck writes. Teacher decisions in saved and server plans survive the nightly run. A failed tree check or package publication returns a nonzero exit code and leaves the published pair unchanged.

The teacher secret is read from the existing local environment configuration. Do not include it in handoff files or command logs. Local artifacts can be recreated from the server's saved inputs; they are a working copy, not a replacement for durable server commitments or package history.

## Deployment

Deploying the server code can precede the database migration. Existing summary fallback and legacy card/deck routes continue to work; the new plan routes return 503 until the required tables and transaction functions exist.

Apply `roster-server/migrations/0048_class_plans.sql` through the privileged Supabase SQL connection. It bootstraps existing summary history and durable promises/preparation tasks, stores immutable raw summary revisions, and preserves already-reviewed commitment statuses if rerun.

Then publish the initial reviewed packages with the CLI above. It loads each scope's version from `GET /teacher/commitments` and uses `expectedRevision: null` for a class without a package. The server transaction publishes matching card/deck pairs and stable card IDs. Thereafter, legacy separate card/deck writes return 409 for packaged targets; classes without a package retain their compatibility behavior.
