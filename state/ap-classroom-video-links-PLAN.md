# AP Classroom video links: plan (2026-09-04)

**Status: live scrape complete; awaiting teacher approval of a no-change audit. No link edits, commits, or pushes have been made.**

## Recommended action

Keep all 147 existing AP Classroom URLs and all alternate values unchanged. The signed-in Fall-2026 course exposes no AP Daily videos for any of its 55 topics, so there is no observed replacement URL to use. Save and commit the scrape, this plan, and the report after teacher review. Re-run the comparison when topic AP Daily resources become available.

This is a finding about the content returned to this signed-in account at the captured time. It does not establish why videos are absent or when they will become available.

## Live evidence

- Captured Overview and Units 1-5 through the repository EdgeCDP rig, starting `2026-09-05T02:17:10.485862+00:00` (UTC; local date 2026-09-04).
- Used the visible unit navigation and clicked `Expand all` on each page. All 55 topic headings were captured, with no AP Daily titles or `/d/` share links.
- Unit guides use the `Statistics/AY26-27/` path, and the five visible unit titles match the Fall-2026 structure. The SPA document.title stayed at Unit 0 during navigation; each page URL, visible heading, guide path, and joined network unit independently establishes the correct unit.
- Independently captured an authenticated HTTP 200 `courseOutline` response from `https://apc-api-production.collegeboard.org/units/graphql`. Every one of the 55 topic `resources` arrays is empty.
- Joined DOM topic rows to network records by `subunitId`. The internal `tag` can differ from the visible topic number because it includes progress-check rows; it was not used as the topic key.
- Overview includes four teacher FRQ walkthroughs marked `NeverShow` to students and `isShareable: false`. They are not AP Daily topic matches.
- Raw DOM observations, visible topic metadata, relevant course-outline response records (Overview and Units 1-5; unrelated archive/exam groups explicitly excluded), and the derived comparison are saved in `state/ap-classroom-videos-2026.json`. `topics` maps all 55 visible topic numbers to empty video arrays.

| Unit | Live title | Topics | AP Daily videos |
| --- | --- | ---: | ---: |
| 1 | Exploring One-Variable Data and Collecting Data | 13 | 0 |
| 2 | Probability, Random Variables, and Probability Distributions | 12 | 0 |
| 3 | Inference for Categorical Data: Proportions | 15 | 0 |
| 4 | Inference for Quantitative Data: Means | 10 | 0 |
| 5 | Regression Analysis | 5 | 0 |

## Classification and scope

- **69 unmatched**: 66 core OLD lessons map to the 55 live topics with no AP Daily videos; 3 OLD entries have no crosswalk target.
- **11 bonus**: no new-CED slot; keep their 24 existing URL slots unchanged.
- **0 same, 0 repoint, 0 folded** as exclusive final classifications. Missing videos take `unmatched` precedence; 21 core OLD lessons still belong to the 10 fold groups listed below.
- Proposed URL replacements: **0**. Added objects: **0**. Removed objects: **0**. Surplus duplicate URL slots: **0**.
- `RESOURCES` contains 80 entries / 147 AP URLs: 119 core URL slots, 24 bonus slots, 4 without crosswalk mappings.
- Preserve 145 Drive altUrl strings, one YouTube altUrl string, and one explicit altUrl:null byte-for-byte and in their existing positions.
- Existing AP URL query strings range from `sui=33,1` to `sui=33,9`. No query normalization is proposed.

## Teacher review items

- Missing crosswalk IDs: **7-10** (2 URLs), **8-7** (1 URL), **9-6** (1 URL). Keep them unchanged; no target is inferred.
- Bonus IDs: **2-9, 3-7, 4-9, 4-12, 8-2, 8-3, 9-1, 9-2, 9-3, 9-4, 9-5**. Keep unchanged irrespective of current player resolution.
- All 55 NEW topics lack an observed AP Daily match. Their visible titles are preserved in the scrape metadata.
- All 24 bonus URLs were checked through a separate authenticated tab. Each redirected to a course guide carrying the original `apd` ID, with no player or video title. Record these as `redirects_no_player`; no claim of playability or 404 is made. Preserve all URLs and alternatives. Detailed checks are included in the scrape JSON; navigation HTTP status was unavailable.

## Fold groups retained for a future comparison

| NEW topic | OLD IDs (all currently unmatched) |
| --- | --- |
| 1.10 | 3-1, 3-2 |
| 1.13 | 3-5, 3-6 |
| 2.1 | 2-1, 2-2 |
| 2.3 | 4-1, 4-2 |
| 2.10 | 4-10, 4-11 |
| 2.11 | 1-10, 5-2 |
| 2.12 | 5-1, 5-3 |
| 3.3 | 6-1, 6-2 |
| 3.14 | 8-1, 8-4, 8-5 |
| 4.2 | 7-1, 7-2 |

## ID-by-ID proposed mapping

Every arrow below preserves the original URL; it does not assert that the current URL is a valid Fall-2026 AP Daily match. No live AP Daily title can be supplied where the site lists none.

| OLD ID | NEW topic | Classification | OLD URL -> proposed NEW URL | AP Daily title on live site |
| --- | --- | --- | --- | --- |
| 1-1 | 1.1 | unmatched | `https://apclassroom.collegeboard.org/d/708w9bpk60?sui=33,1` -> unchanged | None listed for this NEW topic |
| 1-2 | 1.2 | unmatched | `https://apclassroom.collegeboard.org/d/o7atnjt521?sui=33,1` -> unchanged | None listed for this NEW topic |
| 1-3 | 1.3 | unmatched | `https://apclassroom.collegeboard.org/d/5umo3jmlhy?sui=33,1` -> unchanged | None listed for this NEW topic |
| 1-4 | 1.4 | unmatched | `https://apclassroom.collegeboard.org/d/nnomwwtzqc?sui=33,1` -> unchanged<br>`https://apclassroom.collegeboard.org/d/yd2t974opr?sui=33,1` -> unchanged | None listed for this NEW topic |
| 1-5 | 1.5 | unmatched | `https://apclassroom.collegeboard.org/d/o142s0yu7e?sui=33,1` -> unchanged | None listed for this NEW topic |
| 1-6 | 1.6 | unmatched | `https://apclassroom.collegeboard.org/d/q0wwgrkzqb?sui=33,1` -> unchanged | None listed for this NEW topic |
| 1-7 | 1.7 | unmatched | `https://apclassroom.collegeboard.org/d/99bxa5glos?sui=33,1` -> unchanged<br>`https://apclassroom.collegeboard.org/d/99h7sgooy8?sui=33,1` -> unchanged | None listed for this NEW topic |
| 1-8 | 1.8 | unmatched | `https://apclassroom.collegeboard.org/d/rm76rrgb3t?sui=33,1` -> unchanged | None listed for this NEW topic |
| 1-9 | 1.9 | unmatched | `https://apclassroom.collegeboard.org/d/27s7exmq1d?sui=33,1` -> unchanged | None listed for this NEW topic |
| 1-10 | 2.11 | unmatched | `https://apclassroom.collegeboard.org/d/0ps3pcvbfn?sui=33,1` -> unchanged<br>`https://apclassroom.collegeboard.org/d/wualxc69hl?sui=33,1` -> unchanged<br>`https://apclassroom.collegeboard.org/d/3fev7ihoms?sui=33,1` -> unchanged | None listed for this NEW topic |
| 2-1 | 2.1 | unmatched | `https://apclassroom.collegeboard.org/d/n766cdx9w9?sui=33,2` -> unchanged | None listed for this NEW topic |
| 2-2 | 2.1 | unmatched | `https://apclassroom.collegeboard.org/d/6piak9dz9w?sui=33,2` -> unchanged | None listed for this NEW topic |
| 2-3 | 2.2 | unmatched | `https://apclassroom.collegeboard.org/d/5xlg4390iu?sui=33,2` -> unchanged | None listed for this NEW topic |
| 2-4 | 5.1 | unmatched | `https://apclassroom.collegeboard.org/d/mistxmwcx2?sui=33,2` -> unchanged<br>`https://apclassroom.collegeboard.org/d/gf7ybqjkpt?sui=33,2` -> unchanged | None listed for this NEW topic |
| 2-5 | 5.2 | unmatched | `https://apclassroom.collegeboard.org/d/15jvfeyacb?sui=33,2` -> unchanged<br>`https://apclassroom.collegeboard.org/d/xz46lkcplm?sui=33,2` -> unchanged | None listed for this NEW topic |
| 2-6 | 5.3 | unmatched | `https://apclassroom.collegeboard.org/d/8dyu2x687t?sui=33,2` -> unchanged<br>`https://apclassroom.collegeboard.org/d/5hphawrnfm?sui=33,2` -> unchanged | None listed for this NEW topic |
| 2-7 | 5.4 | unmatched | `https://apclassroom.collegeboard.org/d/1nld3zauyo?sui=33,2` -> unchanged<br>`https://apclassroom.collegeboard.org/d/gqn51yxt67?sui=33,2` -> unchanged | None listed for this NEW topic |
| 2-8 | 5.5 | unmatched | `https://apclassroom.collegeboard.org/d/tcc9dyd84p?sui=33,2` -> unchanged<br>`https://apclassroom.collegeboard.org/d/3oo2fwicoe?sui=33,2` -> unchanged<br>`https://apclassroom.collegeboard.org/d/ikvel44wq7?sui=33,2` -> unchanged | None listed for this NEW topic |
| 2-9 | None | bonus | `https://apclassroom.collegeboard.org/d/mnkem3n2pk?sui=33,2` -> unchanged<br>`https://apclassroom.collegeboard.org/d/h1a9n9iqpk?sui=33,2` -> unchanged | Not applicable: no new-CED slot |
| 3-1 | 1.10 | unmatched | `https://apclassroom.collegeboard.org/d/bszm5v38o5?sui=33,3` -> unchanged | None listed for this NEW topic |
| 3-2 | 1.10 | unmatched | `https://apclassroom.collegeboard.org/d/zntfxmmdts?sui=33,3` -> unchanged | None listed for this NEW topic |
| 3-3 | 1.11 | unmatched | `https://apclassroom.collegeboard.org/d/0we2mcfcam?sui=33,3` -> unchanged<br>`https://apclassroom.collegeboard.org/d/ljd0cb2e7u?sui=33,3` -> unchanged | None listed for this NEW topic |
| 3-4 | 1.12 | unmatched | `https://apclassroom.collegeboard.org/d/tndkb7he2i?sui=33,3` -> unchanged | None listed for this NEW topic |
| 3-5 | 1.13 | unmatched | `https://apclassroom.collegeboard.org/d/k19v0dbk86?sui=33,3` -> unchanged<br>`https://apclassroom.collegeboard.org/d/z5lwfxjjdv?sui=33,3` -> unchanged<br>`https://apclassroom.collegeboard.org/d/0xfkk5691j?sui=33,3` -> unchanged | None listed for this NEW topic |
| 3-6 | 1.13 | unmatched | `https://apclassroom.collegeboard.org/d/2ausyc2u4j?sui=33,3` -> unchanged<br>`https://apclassroom.collegeboard.org/d/01da23635a?sui=33,3` -> unchanged | None listed for this NEW topic |
| 3-7 | None | bonus | `https://apclassroom.collegeboard.org/d/cgkp7vw65d?sui=33,3` -> unchanged | Not applicable: no new-CED slot |
| 4-1 | 2.3 | unmatched | `https://apclassroom.collegeboard.org/d/7vn9faj6p9?sui=33,4` -> unchanged | None listed for this NEW topic |
| 4-2 | 2.3 | unmatched | `https://apclassroom.collegeboard.org/d/lbulj7eskd?sui=33,4` -> unchanged<br>`https://apclassroom.collegeboard.org/d/v5phdup7pz?sui=33,4` -> unchanged | None listed for this NEW topic |
| 4-3 | 2.4 | unmatched | `https://apclassroom.collegeboard.org/d/3naih8n3ar?sui=33,4` -> unchanged | None listed for this NEW topic |
| 4-4 | 2.5 | unmatched | `https://apclassroom.collegeboard.org/d/owppp11zpq?sui=33,4` -> unchanged | None listed for this NEW topic |
| 4-5 | 2.6 | unmatched | `https://apclassroom.collegeboard.org/d/d4g6056pk8?sui=33,4` -> unchanged | None listed for this NEW topic |
| 4-6 | 2.7 | unmatched | `https://apclassroom.collegeboard.org/d/nsd56rqpjj?sui=33,4` -> unchanged<br>`https://apclassroom.collegeboard.org/d/5dfvjr08nh?sui=33,4` -> unchanged<br>`https://apclassroom.collegeboard.org/d/j9zx3pjmpi?sui=33,4` -> unchanged | None listed for this NEW topic |
| 4-7 | 2.8 | unmatched | `https://apclassroom.collegeboard.org/d/qgm2j1noql?sui=33,4` -> unchanged<br>`https://apclassroom.collegeboard.org/d/a7hqt3u3mr?sui=33,4` -> unchanged | None listed for this NEW topic |
| 4-8 | 2.9 | unmatched | `https://apclassroom.collegeboard.org/d/qcoxl3r54z?sui=33,4` -> unchanged | None listed for this NEW topic |
| 4-9 | None | bonus | `https://apclassroom.collegeboard.org/d/fr03ec4ajm?sui=33,4` -> unchanged<br>`https://apclassroom.collegeboard.org/d/eekak8j8le?sui=33,4` -> unchanged | Not applicable: no new-CED slot |
| 4-10 | 2.10 | unmatched | `https://apclassroom.collegeboard.org/d/wut3wgzwsd?sui=33,4` -> unchanged | None listed for this NEW topic |
| 4-11 | 2.10 | unmatched | `https://apclassroom.collegeboard.org/d/5b5h0x75vo?sui=33,4` -> unchanged | None listed for this NEW topic |
| 4-12 | None | bonus | `https://apclassroom.collegeboard.org/d/bqu99yuglu?sui=33,4` -> unchanged<br>`https://apclassroom.collegeboard.org/d/pjrxy0uy47?sui=33,4` -> unchanged | Not applicable: no new-CED slot |
| 5-1 | 2.12 | unmatched | `https://apclassroom.collegeboard.org/d/951j439qxl?sui=33,5` -> unchanged | None listed for this NEW topic |
| 5-2 | 2.11 | unmatched | `https://apclassroom.collegeboard.org/d/3ahfseusno?sui=33,5` -> unchanged<br>`https://apclassroom.collegeboard.org/d/xas8ymbml4?sui=33,5` -> unchanged<br>`https://apclassroom.collegeboard.org/d/5cjfnynb4w?sui=33,5` -> unchanged | None listed for this NEW topic |
| 5-3 | 2.12 | unmatched | `https://apclassroom.collegeboard.org/d/sayt12b4ew?sui=33,5` -> unchanged<br>`https://apclassroom.collegeboard.org/d/7vvumt4qzm?sui=33,5` -> unchanged | None listed for this NEW topic |
| 5-4 | 3.1 | unmatched | `https://apclassroom.collegeboard.org/d/0k9y4dbl6i?sui=33,5` -> unchanged | None listed for this NEW topic |
| 5-5 | 3.2 | unmatched | `https://apclassroom.collegeboard.org/d/n68xwj4nrz?sui=33,5` -> unchanged<br>`https://apclassroom.collegeboard.org/d/3hds9p8qlq?sui=33,5` -> unchanged | None listed for this NEW topic |
| 5-6 | 3.9 | unmatched | `https://apclassroom.collegeboard.org/d/hl9fyvkpih?sui=33,5` -> unchanged<br>`https://apclassroom.collegeboard.org/d/ik3wqrxnwg?sui=33,5` -> unchanged | None listed for this NEW topic |
| 5-7 | 4.1 | unmatched | `https://apclassroom.collegeboard.org/d/9a15613osy?sui=33,5` -> unchanged<br>`https://apclassroom.collegeboard.org/d/em70n6vdbf?sui=33,5` -> unchanged | None listed for this NEW topic |
| 5-8 | 4.6 | unmatched | `https://apclassroom.collegeboard.org/d/vdhw7lx8zh?sui=33,5` -> unchanged<br>`https://apclassroom.collegeboard.org/d/8tey1w8y00?sui=33,5` -> unchanged | None listed for this NEW topic |
| 6-1 | 3.3 | unmatched | `https://apclassroom.collegeboard.org/d/w7b6pfew1i?sui=33,6` -> unchanged | None listed for this NEW topic |
| 6-2 | 3.3 | unmatched | `https://apclassroom.collegeboard.org/d/cue0tavkxg?sui=33,6` -> unchanged<br>`https://apclassroom.collegeboard.org/d/sa1jzello1?sui=33,6` -> unchanged<br>`https://apclassroom.collegeboard.org/d/ho2mfeuu5x?sui=33,6` -> unchanged | None listed for this NEW topic |
| 6-3 | 3.4 | unmatched | `https://apclassroom.collegeboard.org/d/5096or6fs1?sui=33,6` -> unchanged<br>`https://apclassroom.collegeboard.org/d/9nl593n5le?sui=33,6` -> unchanged<br>`https://apclassroom.collegeboard.org/d/avzy7twn1u?sui=33,6` -> unchanged | None listed for this NEW topic |
| 6-4 | 3.5 | unmatched | `https://apclassroom.collegeboard.org/d/pde094fkxp?sui=33,6` -> unchanged<br>`https://apclassroom.collegeboard.org/d/mg1k959s5t?sui=33,6` -> unchanged | None listed for this NEW topic |
| 6-5 | 3.6 | unmatched | `https://apclassroom.collegeboard.org/d/xkvphnx7qu?sui=33,6` -> unchanged<br>`https://apclassroom.collegeboard.org/d/crg48hjihw?sui=33,6` -> unchanged | None listed for this NEW topic |
| 6-6 | 3.7 | unmatched | `https://apclassroom.collegeboard.org/d/7tp98ixuv7?sui=33,6` -> unchanged<br>`https://apclassroom.collegeboard.org/d/a2xb71gu0q?sui=33,6` -> unchanged | None listed for this NEW topic |
| 6-7 | 3.8 | unmatched | `https://apclassroom.collegeboard.org/d/6tvg0n0vow?sui=33,6` -> unchanged<br>`https://apclassroom.collegeboard.org/d/0nelp4z6as?sui=33,6` -> unchanged | None listed for this NEW topic |
| 6-8 | 3.10 | unmatched | `https://apclassroom.collegeboard.org/d/2722ixl0j3?sui=33,6` -> unchanged<br>`https://apclassroom.collegeboard.org/d/ylbup5g6tt?sui=33,6` -> unchanged | None listed for this NEW topic |
| 6-9 | 3.11 | unmatched | `https://apclassroom.collegeboard.org/d/dpnop7yqy7?sui=33,6` -> unchanged<br>`https://apclassroom.collegeboard.org/d/px2wxa1pql?sui=33,6` -> unchanged | None listed for this NEW topic |
| 6-10 | 3.12 | unmatched | `https://apclassroom.collegeboard.org/d/ycy5l5nclj?sui=33,6` -> unchanged<br>`https://apclassroom.collegeboard.org/d/etzlkyzo8u?sui=33,6` -> unchanged | None listed for this NEW topic |
| 6-11 | 3.13 | unmatched | `https://apclassroom.collegeboard.org/d/f1fyz21kv4?sui=33,6` -> unchanged<br>`https://apclassroom.collegeboard.org/d/xjd28ei312?sui=33,6` -> unchanged<br>`https://apclassroom.collegeboard.org/d/8xwgbceh02?sui=33,6` -> unchanged | None listed for this NEW topic |
| 7-1 | 4.2 | unmatched | `https://apclassroom.collegeboard.org/d/3t8pczvov0?sui=33,7` -> unchanged | None listed for this NEW topic |
| 7-2 | 4.2 | unmatched | `https://apclassroom.collegeboard.org/d/tapwqbw3dq?sui=33,7` -> unchanged<br>`https://apclassroom.collegeboard.org/d/utu3y3bkag?sui=33,7` -> unchanged<br>`https://apclassroom.collegeboard.org/d/pytemtrew7?sui=33,7` -> unchanged | None listed for this NEW topic |
| 7-3 | 4.3 | unmatched | `https://apclassroom.collegeboard.org/d/b1ywa7d80z?sui=33,7` -> unchanged<br>`https://apclassroom.collegeboard.org/d/xk5a52ajgk?sui=33,7` -> unchanged<br>`https://apclassroom.collegeboard.org/d/lghtcfwy1x?sui=33,7` -> unchanged | None listed for this NEW topic |
| 7-4 | 4.4 | unmatched | `https://apclassroom.collegeboard.org/d/kyfddpb99h?sui=33,7` -> unchanged<br>`https://apclassroom.collegeboard.org/d/2ufhcaan1t?sui=33,7` -> unchanged | None listed for this NEW topic |
| 7-5 | 4.5 | unmatched | `https://apclassroom.collegeboard.org/d/6vq538ni85?sui=33,7` -> unchanged<br>`https://apclassroom.collegeboard.org/d/pc2evx8bvr?sui=33,7` -> unchanged<br>`https://apclassroom.collegeboard.org/d/n1c6957pbw?sui=33,7` -> unchanged | None listed for this NEW topic |
| 7-6 | 4.7 | unmatched | `https://apclassroom.collegeboard.org/d/9i05oi3975?sui=33,7` -> unchanged<br>`https://apclassroom.collegeboard.org/d/q64qp5gkag?sui=33,7` -> unchanged | None listed for this NEW topic |
| 7-7 | 4.8 | unmatched | `https://apclassroom.collegeboard.org/d/rgaf9khpy1?sui=33,7` -> unchanged<br>`https://apclassroom.collegeboard.org/d/fbif6dujgq?sui=33,7` -> unchanged | None listed for this NEW topic |
| 7-8 | 4.9 | unmatched | `https://apclassroom.collegeboard.org/d/kf1yd6gpdi?sui=33,7` -> unchanged<br>`https://apclassroom.collegeboard.org/d/9xskxlobvm?sui=33,7` -> unchanged | None listed for this NEW topic |
| 7-9 | 4.10 | unmatched | `https://apclassroom.collegeboard.org/d/2kkmkj7ric?sui=33,7` -> unchanged<br>`https://apclassroom.collegeboard.org/d/j22ffmh28e?sui=33,7` -> unchanged<br>`https://apclassroom.collegeboard.org/d/ox9np4xfys?sui=33,7` -> unchanged | None listed for this NEW topic |
| 7-10 | None | unmatched | `https://apclassroom.collegeboard.org/d/p1yut2e5pp?sui=33,7` -> unchanged<br>`https://apclassroom.collegeboard.org/d/dkerwbidln?sui=33,7` -> unchanged | Unknown: no crosswalk target |
| 8-1 | 3.14 | unmatched | `https://apclassroom.collegeboard.org/d/ej0nzh9akp?sui=33,8` -> unchanged | None listed for this NEW topic |
| 8-2 | None | bonus | `https://apclassroom.collegeboard.org/d/y7ikpxw7jp?sui=33,8` -> unchanged<br>`https://apclassroom.collegeboard.org/d/3uua57pe0x?sui=33,8` -> unchanged<br>`https://apclassroom.collegeboard.org/d/z0hykwj3ge?sui=33,8` -> unchanged | Not applicable: no new-CED slot |
| 8-3 | None | bonus | `https://apclassroom.collegeboard.org/d/9fkzxeaa5b?sui=33,8` -> unchanged<br>`https://apclassroom.collegeboard.org/d/1rm91jvq1n?sui=33,8` -> unchanged<br>`https://apclassroom.collegeboard.org/d/nayiwphnlr?sui=33,8` -> unchanged | Not applicable: no new-CED slot |
| 8-4 | 3.14 | unmatched | `https://apclassroom.collegeboard.org/d/hmyh34raqt?sui=33,8` -> unchanged | None listed for this NEW topic |
| 8-5 | 3.14 | unmatched | `https://apclassroom.collegeboard.org/d/0bnpabex6u?sui=33,8` -> unchanged<br>`https://apclassroom.collegeboard.org/d/kqfcpu28su?sui=33,8` -> unchanged | None listed for this NEW topic |
| 8-6 | 3.15 | unmatched | `https://apclassroom.collegeboard.org/d/gp64nrb7vq?sui=33,8` -> unchanged<br>`https://apclassroom.collegeboard.org/d/88cjo73k9v?sui=33,8` -> unchanged<br>`https://apclassroom.collegeboard.org/d/1ea6gxau2t?sui=33,8` -> unchanged | None listed for this NEW topic |
| 8-7 | None | unmatched | `https://apclassroom.collegeboard.org/d/v3kuvm87ss?sui=33,8` -> unchanged | Unknown: no crosswalk target |
| 9-1 | None | bonus | `https://apclassroom.collegeboard.org/d/pdddxf5g7m?sui=33,9` -> unchanged | Not applicable: no new-CED slot |
| 9-2 | None | bonus | `https://apclassroom.collegeboard.org/d/juuru4ud2g?sui=33,9` -> unchanged<br>`https://apclassroom.collegeboard.org/d/s7fp3ef6i1?sui=33,9` -> unchanged<br>`https://apclassroom.collegeboard.org/d/ote8293qie?sui=33,9` -> unchanged | Not applicable: no new-CED slot |
| 9-3 | None | bonus | `https://apclassroom.collegeboard.org/d/umv9qc22kb?sui=33,9` -> unchanged<br>`https://apclassroom.collegeboard.org/d/ynbq7du52l?sui=33,9` -> unchanged | Not applicable: no new-CED slot |
| 9-4 | None | bonus | `https://apclassroom.collegeboard.org/d/quc0brlorr?sui=33,9` -> unchanged<br>`https://apclassroom.collegeboard.org/d/mqvjasjnfa?sui=33,9` -> unchanged | Not applicable: no new-CED slot |
| 9-5 | None | bonus | `https://apclassroom.collegeboard.org/d/qepiqzyga4?sui=33,9` -> unchanged<br>`https://apclassroom.collegeboard.org/d/7rptngcenm?sui=33,9` -> unchanged<br>`https://apclassroom.collegeboard.org/d/mwl7ag5ipr?sui=33,9` -> unchanged | Not applicable: no new-CED slot |
| 9-6 | None | unmatched | `https://apclassroom.collegeboard.org/d/mitydyeo84?sui=33,9` -> unchanged | Unknown: no crosswalk target |

## Validation and offline behavior

- Read all three requested tests before implementation. Baseline command: `npx vitest run tests/desk-video-availability.test.js tests/offline-video.test.js tests/fetch-offline-videos.test.js`.
- **3 test files passed; 30 tests passed.** Existing jsdom `HTMLMediaElement.prototype.pause` stderr is nonfatal. Production and test files remain byte-identical, so no new test or repeat run is warranted for this documentation-only result.
- `media/media-manifest.json` has 289 URL keys. 145 videos resolve under both their existing AP URL and their unchanged Drive alternative, and all referenced files exist.
- Existing offline gaps remain: OLD 2-5 index 1 (YouTube alternative, no local copy) and OLD 4-6 index 2 (altUrl:null, no local copy).
- Desk already uses `OfflineVideo.localFor(v.url) || OfflineVideo.localFor(v.altUrl)`. No URL was repointed, so the conditional repointed-entry regression is not applicable. A future repoint must pin that fallback behavior.
- The offline extractor currently returns 146 entries because it misses the null-alt object. The preservation audit independently counts all 147 URL slots.
- If a future live topic requires new `{ url }` objects, review the extractor test that currently requires every entry to be downloadable, while preserving validation of existing alternatives.

## Impact evidence and limitations

Before editing any indexed symbol, run GitNexus upstream impact and report callers, processes, and risk; warn on HIGH or CRITICAL. The initial limited refresh completed successfully (19,569 nodes, 36,397 edges, 300 flows), but its size cap excluded the Desk. Two subsequent attempts with a 2048 KB cap did not complete successfully; do not claim complete fresh Desk coverage. Sequential upstream lookups resolve the inline shadow: `RESOURCES` returns LOW/zero but misses known direct data readers; `showResourcePanel` returns **CRITICAL**, 7 direct callers, 48 affected symbols, 5 process groups, and 9 modules. At minimum confidence 0.8 it remains CRITICAL with 26 affected symbols. Direct callers include `recordLinkVisit`, nested `open` in `maybeBumpThenOpen`, `renderDoNowGrades`, `_studentMarkSave`, `_blooketCommit`, `_focusTodayLessonVideo`, and the storage-event refresh. Some process groups involve generic-name matches and need caution. Current source directly reads RESOURCES in `_lessonCoachHtml` and `showResourcePanel`, which contains the video/offline rendering. The renderer risk was reported before any implementation; no renderer changes are proposed. Generated shadow changes were restored, and existing guidance bytes were preserved.

## Approval gate and remaining steps

The supplied task says to "STOP for the teacher's OK" if any topic has no obvious AP Daily match. That condition applies to all 55 NEW topics. The requested decision is whether to finalize the audit with all existing URLs unchanged.

After approval: incorporate any teacher corrections, verify the staged scope contains only the three audit artifacts, run GitNexus `detect_changes` on the staged scope, and commit those artifacts together. There are no per-unit link commits to create when no URLs change. Report the commit hash; never push.

Any future repoint will still require actual observed share links, authenticated destination checks, URL-only source edits, complete alternate-byte preservation, the requested tests, and per-unit commits.

## Baseline preservation

- Baseline HEAD: `6abea7397ac9d3842ac8bf27054046237aba2502`.
- Desk SHA-256: `6700867258c9bfb8aaee4da23b8a9793cfe6bfa0054edc6c2d24bd64675305f0`.
- Existing unrelated modifications to guidance, AGENTS.md, CLAUDE.md, GRADEBOOK_TAGGING_AUDIT.md, and data/skill-map.js, plus untracked Schoology logs, are excluded from this task.
- No credentials, auth headers, cookies, account identifiers, or signed media URLs are included in these audit artifacts.
