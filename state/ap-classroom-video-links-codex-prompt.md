# Codex prompt — verify and repoint every AP Classroom video link for the Fall-2026 course — 2026-09-04

Repo `C:/Users/rober/Downloads/Projects/school/follow-alongs` (Windows; forward slashes; `python`, `node` on PATH).
**Plan first, then implement.** Write the plan to `state/ap-classroom-video-links-PLAN.md` (what you found on the live
site, the id-by-id mapping, anything ambiguous) and STOP for the teacher's OK if more than ~10 links would change or if
any topic has no obvious AP Daily match. Then implement. **Never push.** Commit in small batches and report hashes.

## What to fix and what to leave alone
The Desk (`ap_stats_roadmap_square_mode.html`) carries, inline, a `RESOURCES` object (starts near line 10570) keyed by the
OLD 9-unit lesson id. Each entry has `videos: [{ url, altUrl }, …]`:
- `url` = the AP Classroom "AP Daily" video (147 of them, form `https://apclassroom.collegeboard.org/d/<id>?sui=33,1`).
  **These are what you verify and, where wrong, repoint** to the Fall-2026 course's videos.
- `altUrl` = a Google Drive copy of the teacher's OLD recording (145). **Do not touch any `altUrl`, ever** — they stay
  pointing at the old material until the teacher re-records; they are the fallback when AP Classroom is unavailable.
Nothing else in the Desk changes. The Supabase `lesson_urls` overlay does not carry videos (it has worksheet/drills/quiz/
blooket only), so this is a file edit, not a table write.

## Where the truth is
- The live course: `https://apclassroom.collegeboard.org/33/home?unit=0` (course 33 = AP Statistics). Each Fall-2026 unit
  page lists its topics; each topic has one or more AP Daily videos with a share link of the `/d/<id>?sui=33,1` form.
  College Board requires the teacher's sign-in. Drive Edge through the repo's CDP rig:
  `python tools/cdp/edge.py --url "https://apclassroom.collegeboard.org/33/home?unit=0" --keep` opens a dedicated Edge
  profile (`%TEMP%/edge-claude-cdp`, currently signed into Schoology, NOT College Board). If the page lands on a
  College Board login, **ask the teacher to sign in in that window** and wait; do not type credentials. Then use
  `EdgeCDP.eval_js` (see `tools/cdp/edge.py`, and `tools/schoology_ops.py` for the pattern of DOM reads) to enumerate,
  per unit page (`?unit=1` … `?unit=5`), every topic heading and every video link/title on it. Save the raw scrape to
  `state/ap-classroom-videos-2026.json` (topic → [{title, url}]) so the mapping is reproducible.
- OLD topic → NEW topic: `2026-crosswalk.json` (`map[old] = {newUnit, newTopic, newLabel, status core|bonus}`) and the
  same data in `roadmap-data.json` `lessons.<old>.ced2026`. `ap-stats-video-crosswalk.md` Part A is the human-readable
  version, EK-verified against the five Fall-2026 unit guides. Several OLD lessons fold into ONE new topic
  (3.1+3.2 → 1.10, 3.5+3.6 → 1.13, 2.1+2.2 → 2.1, 4.1+4.2 → 2.3, 4.10+4.11 → 2.10); a few OLD topics are `bonus`
  ("Beyond the Exam", no new-CED slot). `data/lesson-schedule.json` has the dated order.

## The job
1. **Scrape** every Fall-2026 unit page into the JSON above (title, url, unit, topic number as shown on the page).
2. **Diff** against `RESOURCES`: for each OLD lesson id, take its NEW topic from the crosswalk, list the AP Daily videos the
   live site shows for that NEW topic, and compare with the entry's current `url`s. Classify each entry:
   `same` (already correct) · `repoint` (a different/ additional/ removed AP Daily video for that topic) · `folded` (two
   OLD ids share one NEW topic — both get the same video set, in the order the site lists them) · `bonus` (no new-CED slot:
   keep the existing `url` if it still resolves, otherwise leave the AP Classroom link as-is and rely on `altUrl`; report it)
   · `unmatched` (no video on the site for that topic — report, do not guess).
3. **Repoint** only the `url` values, preserving each entry's `altUrl` string byte-for-byte and the array order rule
   above. If a NEW topic has more AP Daily videos than the OLD entry had `altUrl`s, add the extra `{url}` objects
   WITHOUT an `altUrl` (the Desk already handles a missing `altUrl`). If it has fewer, keep the surplus OLD objects but
   set their `url` to the last valid video and say so in the report — never drop an `altUrl`.
4. **Verify** each new `url` resolves (HTTP 200 or a College Board redirect to the player, not a 404) through the
   signed-in rig, and that every `altUrl` you left alone is unchanged (`git diff` must show only `url:` values changing).
5. **Tests**: read `tests/desk-video-availability.test.js`, `tests/offline-video.test.js`, `tests/fetch-offline-videos.test.js`
   first — they pin the shape of `videos[]` and the offline lookup (`OfflineVideo.localFor(v.url) || localFor(v.altUrl)`,
   keyed by URL in `media-manifest.json` for the offline pack). Keep them green; if the offline manifest keys on the OLD
   `url`, note that the pack still resolves through `altUrl` and add a test that pins that fallback for a repointed entry.
   Run `npx vitest run tests/desk-video-availability.test.js tests/offline-video.test.js tests/fetch-offline-videos.test.js`.
6. **Report** `state/ap-classroom-video-links-REPORT.md`: a table OLD id · NEW topic · classification · old url → new url ·
   video title on the site; counts per class; the unmatched/bonus list for the teacher; and the exact `git diff --stat`.

## Rules
- `altUrl` is sacred. A diff that touches one is a failed run.
- Do not reorder, rename, or reformat `RESOURCES`; touch only the `url:` strings (and add `{ url }` objects where §3 says).
- Do not "fix" worksheet/quiz/blooket links or anything in `roadmap-data.json` or Supabase.
- If College Board's page structure defeats DOM scraping (dynamic loading), fall back to reading the network responses
  (`EdgeCDP.wait_for_response`) or ask the teacher to expand a unit while you re-read the DOM — do not hand-type ids.
- Commit per unit (`feat(desk): repoint Unit N AP Daily links to the Fall-2026 course`), plus one commit for the scrape
  JSON + plan + report. Never push.
