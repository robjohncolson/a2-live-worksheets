# Algebra 2 Desk

An isolated Algebra 2 fork for LEHS sections C (Mon/Tue/Thu), D (Mon/Wed/Fri), and G (Tue/Wed/Thu/Fri), SY2026–27. Early-release Wednesdays remain meeting days.

The roster, academic ledger, receipts, transcripts, flashcards, teacher feedback, and offline recovery survive. The district grade is Assessments 50% (minimum 4), Assignments 40% (minimum 10), and Engagement 10% (minimum 10). Lesson checks are 10 points, topic assessments 100, Try-Its 2, and passed lesson decks 1 per quarter. Missing due work counts as zero after its lesson day. The alternative v3 engine retains its two-track gates.

Content is authored in `../Lesson_planning`; see `A2_FORK_PLAN.md` for the Savvas transcription and question-bank pipeline. Lesson 1-1 is published in `content/a2/`; later lessons remain unpublished until authored content is ready.

Class Log Android practice must include the Teacher's Edition guidance for each taught example: questions to ask, expected student thinking, and sourced misconception/support prompts. `node scripts/build-lesson-tree.mjs --all --check` imports these from the TE transcriptions and keeps portable extractions in `content/a2/teacher-prompts/`. Production builds must reject kept examples without guidance. The daily deck selector reserves room for the current examples' prompts; adding them only to the full lesson tree does not reach Android practice. Publish the card and practice deck together through `scripts/plan-next-class.mjs publish`; the nightly workflow uses this atomic package path.

The Android main Card is a concise teacher brief: IXL drill codes and skill names first, the last confirmed class stopping point, then this class's sequence and destination. Author `teacherBrief` beside `observerCard` in the day log with `title`, `ixl` (string array), `lastClass`, `today` (string array), and optional `next`, `mode`, and `minutes`. Label optional drills and unfinished work; never turn an earlier plan into a claimed outcome. The publisher uses the brief for the phone, while the detailed `observerCard` continues to supply rehearsal and textbook prompts. Keep the brief under Android's 2,000-character body limit, use plain paragraphs, and omit student names, scores, standards lists, and observer-procedure detail. A whole-class brief may use the actual period length for `minutes`.

Class Log's next-class conversation uses a saved, versioned section plan. Start with `node scripts/plan-next-class.mjs context --section C --date YYYY-MM-DD`; it loads the authored plan, latest source, durable commitments and previous teacher decisions. Record explicit teacher corrections with `decide --section C --date YYYY-MM-DD --decision FILE`, using a new decision ID for each correction. The journal is idempotent and survives later automatic summary revisions. Factual source/last-class corrections retain their source date: they apply to re-summaries of that class, never to a different class date. Today/IXL/routine directives remain persistent. When changing which examples are taught, update the detailed `observerCard.body` as well as the concise `teacherBrief.today`. Do not infer completion from an earlier plan or from activities "not heard" in a recording.

Compile/review the saved artifact, then publish with `node scripts/plan-next-class.mjs publish --section C --date YYYY-MM-DD` (or `--per-section` for each section's next meeting). One shared deterministic compiler produces the card, deck, source evidence and detailed routine; the server checks plan/scope revisions and publishes the pair atomically. Once a class has a package, never use the legacy separate card/deck publishers to update it. A conflict requires fresh context and reviewed reconciliation, not a blind retry or force write. See `docs/CLASS_PLAN_WORKFLOW.md` for the edit schema and recovery steps.

Promises and preparation tasks have persistent IDs and open/done/deferred/cancelled status. They remain available beyond the latest recording and never expire merely because they are more than 14 days old; only an explicit status decision resolves them. A promise is a reminder to check, and a recorded question is not automatically unanswered. Each daily cue contains one action or complete source statement, has no mastery node, and preserves qualifications. Keep textbook node IDs and complete Teacher's Edition prompt groups intact. Omit student names and individual scores from the card, deck and shared context; raw source records remain private. Plan artifacts and conversation handoffs live in ignored `roster-local/class-plans/`.

Run `npx vitest run` at root, `npx vitest run` from `roster-server/`, and `pytest tests/` at root. Named inherited failures and phase results live in `A2_FORK_BASELINE.md`.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "master"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/algebra2-live-worksheet/context` | Codebase overview, check index freshness |
| `gitnexus://repo/algebra2-live-worksheet/clusters` | All functional areas |
| `gitnexus://repo/algebra2-live-worksheet/processes` | All execution flows |
| `gitnexus://repo/algebra2-live-worksheet/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
## Code Style

Write extremely easy to consume code. Optimize for how easy the code is to read. Make the code skimmable. Avoid cleverness. Use early returns.

Historical architecture and removed-feature documents are in `docs/apstats-history/`; use `A2_FORK_PLAN.md` and `A2_FORK_BASELINE.md` for the current Algebra 2 implementation.
