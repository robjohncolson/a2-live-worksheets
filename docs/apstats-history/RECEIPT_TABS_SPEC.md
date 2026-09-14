# Wallet Receipt Organization — Tabs Spec

The wallet's recorded-work feed can be tens of receipts even for one lesson (every
worksheet blank + quiz item is its own receipt). Keep that granularity, but organize it:
a **[Lessons] [Types] [Days]** tab bar over the feed, each tab showing **collapsible
groups** (collapsed by default, with a count badge). Default tab: Lessons.

## `WalletLogic.groupReceipts(receipts, dimension)` (pure, tested)

Returns an ORDERED array of groups: `[{ key, label, icon, count, receipts:[…newest first] }]`.
`receipts` are the merged wallet receipts `{ id, compact, src, i, sc, ts }`.

### dimension = 'lesson'
Parse unit+lesson from the item id `i` (first match wins):
- `^WS-U(\d+)L(\d+)` (worksheet blanks / `…-reflect#`)
- `^BL-U(\d+)-L(\d+)` (blooket / `…-DESK_DONE` flashcard make-up)
- `^U(\d+)-L(\d+)` (curriculum_quiz, incl. `…#rev` / `…#exc` suffixes)
→ `key='U{u}-L{l}'`, `label='Unit {u} · Lesson {u}.{l}'`, sort by (unit, lesson).
- `^U(\d+)-PC` → `label='Unit {u} · Progress Check'`, sorts AFTER that unit's lessons.
- no match → `key='other'`, `label='Other'`, sorts last.
Order: unit asc, then lesson asc (PC after lessons in its unit), 'other' last.

### dimension = 'type'
Group by `src`, with friendly labels + icons (reuse `_receiptSourceIcon`):
`worksheet`→**"Worksheet questions"**, `curriculum_quiz`→"Quizzes", `frq`→"Reflections (FRQ)",
`pc`→"Progress Checks", `blooket`→"Blooket", `quiz_verdict`→"AI grade verdicts",
`quiz_review`/`quiz_exception`→"Appeals & reviews", `trainer`→"Calculator trainer",
else "Other". Order: worksheet, curriculum_quiz, frq, pc, blooket, quiz_verdict,
quiz_review, trainer, other.

**Second level for worksheet questions:** the `worksheet` group (only) ALSO carries
`subgroups` — its receipts re-grouped by worksheet using the SAME lesson parser, ordered
by (unit, lesson), label **"Lesson {u}.{l} worksheet"**, each `{ key, label, count,
receipts:[newest-first] }`, 'other' last. So in the Types tab "Worksheet questions"
expands to per-worksheet sub-groups, each of which expands to its per-question receipts.
Other type groups have no `subgroups` (they expand straight to their rows).

### dimension = 'day'
Group by the local `YYYY-MM-DD` of `ts`. Label: "Today" / "Yesterday" / a short date
(e.g. "Jun 12"). Order: newest day first. Receipts within every group: newest `ts` first.

## UI (in `ap_stats_roadmap_square_mode.html`, the wallet feed)

- A small System-7 tab strip above the feed: **Lessons · Types · Days** (active tab
  highlighted). Remember the chosen tab for the session (a module var; default 'lesson').
- Render `groupReceipts(merged, activeDim)`: each group = a collapsible header row
  (chevron ▸/▾ + icon + label + a count badge like "34"), **collapsed by default**.
  Expanding shows that group's existing receipt rows (`_walletReceiptRow`, with the
  Verify/QR/Copy actions) newest first. Track expanded keys in a Set.
- **Nested groups:** if a group has `subgroups` (the worksheet type group), expanding it
  shows its sub-group headers (collapsible, collapsed by default) instead of rows; expanding
  a sub-group shows its question receipts. Use composite expand keys (e.g.
  `'worksheet'` and `'worksheet/U1-L1'`) so the two levels track independently.
- A tiny total line stays at the top ("48 recorded items"). Empty state unchanged.
- Best-effort, never throw; if `groupReceipts` is unavailable, fall back to the current
  flat list.

## Tests (`tests/wallet-logic.test.js`, extend)

- lesson: `WS-U1L1-Q3`, `U1-L1-Q01`, `BL-U1-L1-DESK_DONE` all land in `U1-L1`;
  `U1-L3-Q01#rev` lands in `U1-L3`; `U1-PC-1` → Progress Check sorting after L-lessons;
  junk → 'other' last; groups ordered by unit then lesson.
- type: srcs map to the right labels + the fixed order; counts correct.
- day: 'Today'/'Yesterday'/date bucketing newest-first; within-group newest-first.
- counts equal the input size summed across groups; execute the imported fn.
