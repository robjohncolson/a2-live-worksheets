# Algebra 2 Desk

An isolated Algebra 2 fork for LEHS sections C (Mon/Tue/Thu), D (Mon/Wed/Fri), and G (Tue/Wed/Thu/Fri), SY2026–27. Early-release Wednesdays remain meeting days.

The roster, academic ledger, receipts, transcripts, flashcards, teacher feedback, and offline recovery survive. The district grade is Assessments 50% (minimum 4), Assignments 40% (minimum 10), and Engagement 10% (minimum 10). Lesson checks are 10 points, topic assessments 100, Try-Its 2, and passed lesson decks 1 per quarter. Missing due work counts as zero after its lesson day. The alternative v3 engine retains its two-track gates.

Content is authored in `../Lesson_planning`; see `A2_FORK_PLAN.md` for the Savvas transcription and question-bank pipeline. Lesson 1-1 is published in `content/a2/`; later lessons remain unpublished until authored content is ready.

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
