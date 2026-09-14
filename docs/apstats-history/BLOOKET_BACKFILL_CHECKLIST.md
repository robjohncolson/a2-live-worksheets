# Blooket backfill — ✅ COMPLETE (2026-06-09, ahead of the Q2 2026-11-14 due date)

**All 77 topics now have a live Blooket set** wired through the full pipeline:
Supabase `lesson_urls.blooket_url` (live source, verified by read-back) →
`roadmap-data.json` → `roster-server/data/blooket-lessons.json` (69 → 77) →
v3 engine `hasBlooket` counts them.

## History
- **U1, U2, U8, U9** — had URLs from the start.
- **3.6, 3.7 + 4.1–4.6** — mined from `units.js` (2026-06-04, s5).
- **5.3–5.8, 6.1–6.11, 7.1–7.9** — mined from the live Supabase overlay (2026-06-04, s5, `9bd9345`).
- **4.7–4.12, 5.1, 5.2** — the final 8, closed out 2026-06-09 (s6): per-topic 35-question CSVs
  built via hybrid audit + adversarial verify (`ebb3cff`), uploaded by CC end-to-end with
  `Agent/scripts/upload-blooket.mjs` (CDP on the home-laptop Edge debug profile), upserted to
  `lesson_urls`, propagated, tests green (blooket 24 + v3 engine 40).

## The final 8 sets
- 4.7 → https://dashboard.blooket.com/set/6a28bb3d1e7a675c780d361f
- 4.8 → https://dashboard.blooket.com/set/6a28bb601e7a675c780d3623
- 4.9 → https://dashboard.blooket.com/set/6a28bb731e7a675c780d3627
- 4.10 → https://dashboard.blooket.com/set/6a28bb868b718c8f0cf3c5af
- 4.11 → https://dashboard.blooket.com/set/6a28bb9a37d04217db27244c
- 4.12 → https://dashboard.blooket.com/set/6a28bbad8b718c8f0cf3c5b7
- 5.1 → https://dashboard.blooket.com/set/6a28bbc037d04217db272452
- 5.2 → https://dashboard.blooket.com/set/6a28bbd48b718c8f0cf3c5bc

## Notes
- The per-topic CSVs (`u4_l7` … `u4_l12`, `u5_l1`, `u5_l2`) supersede the old grouped CSVs
  (`u4_l7_l8`, `u4_l10_l11_l12`, `u5_l1_l2`) — grouped files remain in the repo for history only.
- Future Blooket authoring goes through lesson-prep (`upload-blooket.mjs` → `upsertLessonUrls`);
  re-mine + propagate (`gen-blooket-lessons.mjs`) whenever new sets are added so the engine counts them.
