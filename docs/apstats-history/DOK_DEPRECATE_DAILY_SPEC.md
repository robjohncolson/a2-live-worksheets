# DOK_DEPRECATE_DAILY_SPEC.md — only misconception-generated DOK-3 sheets stay active

**Teacher (2026-09-12):** "I probably won't give the Wednesday pairing worksheets. In fact I think all DOK3 worksheets
except for the misconception generated ones should be deprecated."

## 1. What this means

- **Active DOK sheets = sheets generated from the misconceptions panel.** Today that is exactly one:
  `1.1+1.2+1.4+1.7` "Screen Time, Two Deletions". The weekly automation (next spec) will add one per week.
- **Deprecated = the 66 per-topic daily ladders + the 2 Wednesday pairing sheets (`1.4+1.5`, `1.7+1.8`).** They are
  ARCHIVED, not deleted: history and PDFs stay reachable, nothing links to them, no test or builder considers them.
- The DOK "one per calendar day" program is over. `dok/PENDING.md`, the day-group coverage rules, and the Desk's
  per-lesson DOK links go with it.

## 2. Moves (use `git mv` so history follows)

```
dok/lessons/<68 files>.yaml      → dok/archive/lessons/
dok/registry/<68 files>.jsonl    → dok/archive/registry/
dok/tex/aps_<68>_{student,board,teacher}.tex → dok/archive/tex/
dok/pdf/aps_<68>_{student,board,teacher}.pdf → dok/archive/pdf/
dok/PENDING.md                   → dok/archive/PENDING.md (with a one-line header "program deprecated 2026-09-12")
```
`dok/archive/README.md`: what these are, why archived, how to resurrect one (move back + add `standalone:true` +
`misconceptions:[…]`, rebuild).

## 3. Active-sheet schema (small, forward-looking)

Every active YAML MUST have:
```yaml
standalone: true
misconceptions:            # the panel keys/labels this sheet was built to address (the triage link)
  - counts-vs-percents
  - "label:connects the number to the real question of whether flint's water was safe to drink"
generated: { by: "orchestrator+teacher", on: "2026-09-12", window_days: 42 }   # weekly job will write by:"weekly-auto"
```
Validator: `--validate` requires these on every active sheet and rejects any active sheet without `standalone:true`.
Fill them in for Screen Time (the five labels it targeted: numbers without context; individuals vs variables;
counts vs percents; mean-resistant; unusual values dropped — use the panel's exact keys where a tag exists).

## 4. Builder, manifest, index, Desk, dashboard

- `build_ladder.py --all` / `compile.ps1 -All` operate on `dok/lessons/*.yaml` only (the archive is outside).
  Remove the day-group / `dayGroups` / ten-minute / worksheet-per-member rules entirely (dead with the program).
  Keep the video-free and self-paced guards.
- `dok/manifest.json`: active sheets only, each with `misconceptions` and `generated` carried through.
- `dok/index.html`: title "DOK-3 misconception sheets"; one card per active sheet: title, the labels it targets,
  generated-on, three PDF links. No unit/topic grid.
- **Desk:** remove the teacher-only per-lesson DOK row from lesson tiles / resource panel (`_dokLadderRowHtml` and
  its callers) — those links would 404. Keep Teacher menu → "DOK ladders…" (it opens the index).
- **Dashboard:** the "Remediation sheets" strip now lists ALL active sheets (they are all remediation sheets); show
  the labels each targets.

## 5. Tests

- Delete `tests/dok-coverage.test.js` (coverage of calendar days is meaningless now) and the `test_dok_build.py`
  cases about day groups / ten minutes / board follow-along; replace with `tests/dok-active.test.js`: every active
  sheet has `standalone:true` + non-empty `misconceptions` + `generated`; the archive holds exactly 68 lessons,
  68 registry files, 204 tex, 204 PDFs; nothing in `dok/lessons` references a `dayGroups` topic; manifest ==
  active set; index renders only active cards.
- `tests/desk-dok-ladder-row.test.js` → replaced by a test that the per-lesson DOK row is GONE and the Teacher
  menu item remains.
- `tests/dok-registry.test.js`, `tests/dok-index.test.js`, `tests/desk-teacher-dok-app.test.js`,
  `tests/teacher-dashboard-misconceptions.test.js`: adapt to active-only.
- Root `npm test`, `pytest tests/test_dok_build.py`: green apart from the named pre-existing failures.

## 6. Docs + memory of the decision

`APS_DOK_LADDER_SPEC.md`, `DOK_DAY_SHEETS_SPEC.md`, `DOK_VIDEO_FREE_SPEC.md`, `DOK_SELF_PACED_SPEC.md`: a dated
one-line note at the top: "2026-09-12: the daily/pairing program is deprecated; only misconception-generated
sheets are active — see DOK_DEPRECATE_DAILY_SPEC.md." `dok/README.md` rewritten to the active-only flow.

## 7. Out of scope

The weekly auto-generation job (separate spec, pending the teacher's auto-publish vs review-first answer), the
schedule, grading, the misconceptions endpoint.
