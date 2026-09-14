# Task 3: trainer build guard + robustness (Codex implement spec)

Repo: C:/Users/rober/Downloads/Projects/school/follow-alongs
Owned paths: ti84-trainer-v2/ (app.js, bridge.js, build.mjs, index.html, generated/, standalone.html, a new rom-config file), package.json (scripts only), tests/ti84-standalone-sync.test.js (new), ti84-trainer-v2/native/tests/ (manifest dedup only).
Do NOT touch: roster-server/, gradebook-client.js, data JSONs at repo root, any worksheet, the Desk, tests/ti84-data-trust.test.js.
Do NOT commit. Never revert or stage pre-existing dirty/untracked files.

All findings below were adversarially verified against the code (line anchors from 2026-06-11; re-locate by reading).

## C1. Build guard: standalone.html drift test

standalone.html is the artifact students load (Desk + start-here point at it) but it is rebuilt only by a manual `node ti84-trainer-v2/build.mjs`; git history has one staleness incident (2cc6f7d). The build is deterministic (verified byte-identical on rebuild).

1. Refactor build.mjs to export a buildStandalone() function returning the assembled HTML string (and the generated/* contents), with the CLI entry calling it and writing files. Keep output byte-identical - verify by rebuilding and checking git status stays clean BEFORE your other changes, and again after.
2. Add "build:ti84": "node ti84-trainer-v2/build.mjs" to package.json scripts.
3. New root test tests/ti84-standalone-sync.test.js: import buildStandalone() and assert the committed ti84-trainer-v2/standalone.html equals the fresh output. Normalize line endings on both sides before comparing (CRLF-checkout safety). Also assert each generated/* file matches its fresh content.

## C2. IndexedDB failure must not abort the ROM download

bridge.js init() (~599-645): readRecord at ~602 is unprotected, so an IDB rejection (private mode, locked-down Chromebooks) jumps to the catch at ~633 and lands in simplified mode even though downloadRomFromSupabase + bootRecord only need bytes in memory. deleteRecord (~610) and writeRecord (~626) are already individually caught - mirror that: wrap the readRecord call in its own try/catch and treat any failure as a cache miss so the download still runs.

## C3. ROM download integrity + cache invalidation

bridge.js: isCacheCurrent (~384) is version-only and bootRecord's catch (~584-596) never deletes a corrupt record, so a corrupt-but-version-current cached ROM fails on every load forever (recovery is buried in Options -> Firmware).

1. In downloadRomFromSupabase (~400-479): after assembling the bytes, if the response had a content-length and receivedBytes !== content-length, throw instead of caching.
2. Invalidate narrowly: in bootRecord, ONLY when the failure happens AFTER the wasm module is up and the ROM bytes are being installed (the FS.writeFile/callMain region), deleteRecord(ROM_CONFIG.cacheKey) before showing the fallback. Do NOT delete on factory()/network failures (the wasm fetch can fail transiently offline and must not nuke a good cached ROM). Structure: wrap the post-factory install region in its own try/catch that deletes then rethrows.
3. While there: handleClick case 'clear-rom' in app.js (~3686) awaits app.bridge.clearStoredRom() with no try/catch - wrap it so an IDB rejection shows a banner instead of leaving the dialog stuck (every other async case handles errors).

## C4. Guard localStorage writes

app.js savePersisted (~790) and saveListMemory (~810) call localStorage.setItem unguarded; completeWalkthrough mutates state, then saves, then render()s - a quota/SecurityError throw skips render and strands the UI, and SM-2 progress silently never persists. Wrap both in try/catch mirroring loadPersisted's guard; on first failure set app.banner = "Progress can't be saved in this browser." once (a module-level warned flag) and console.warn. Also the two inline setItem sites (~handleChange unit-filter and ~2478 region) - route them through savePersisted or guard them the same way.

## C5. Lazy ROM boot in physical mode

physicalMode defaults true and renderCalculatorColumn short-circuits to the physical column, yet init() unconditionally awaits app.bridge.init(), which downloads a 4.0 MB ROM from Supabase and boots wasm + a render loop nobody sees. Make it lazy:

1. In init(): when app.persisted.physicalMode is true, skip app.bridge.init() and set the offline/simplified status (the status plumbing already exists - getStatus before init should yield a sensible idle state; if not, add a minimal 'idle' status).
2. Trigger the real init the first time the student leaves physical mode (togglePhysicalMode and the intro-emulator first-run choice) or opens the ROM dialog - exactly once (an app-level initStarted flag). Buttons must not double-boot on rapid clicks.
3. The first-run intro chooser ('intro-emulator' action in handleClick) must also trigger it.
4. Make sure the existing tests/ti84-data-trust.test.js still passes: it boots with physicalMode false in most tests (bridge stub init runs), and physicalMode true in others (with your change the stub init is skipped there - the tests do not assert on it). Run the file to confirm.

## C6. Single-source the native module manifest

The ordered native file list is hand-maintained in four places: index.html script tags (~17-30), build.mjs nativeScriptFilenames (~24-34), native/tests/verify-all-procedures.test.js moduleOrder (~14-24), and native/tests/ti84-native.test.js (~28-38). Create ti84-trainer-v2/native/manifest.mjs exporting the ordered list; build.mjs imports it; both test files import it (they are vitest, ESM import is fine); add an assertion in the new standalone-sync test (or build.mjs itself) that index.html's script tags match the manifest order.

## C7. Move the ROM URL out of source

bridge.js:10-14 hardcodes a 10-year signed Supabase URL to TI's copyrighted ROM, inlined into standalone.html and published. Move the ROM_CONFIG values (url, cacheKey, cacheVersion) into a new ti84-trainer-v2/rom-config.js assigning window.TI84_ROM_CONFIG (same pattern as ../roster_config.js). bridge.js reads window.TI84_ROM_CONFIG with the current values as inline fallback ONLY for cacheKey/cacheVersion - the URL itself must come solely from the config file (no URL fallback in bridge.js, that is the point). index.html and the build.mjs standalone template add a script-src tag for it (NOT inlined - rotation must be a one-file edit with no rebuild). Confirm after rebuild: the signed URL string appears in rom-config.js only, not in standalone.html or bridge.js.

## Verify + report

1. node ti84-trainer-v2/build.mjs, then npx vitest run from repo root (ALL green, including the new sync test and the existing tests/ti84-data-trust.test.js), then cd ti84-trainer-v2/native && npx vitest run (362+ green).
2. If your harness forbids running tests, say so explicitly and list exactly which verifications were skipped.
3. Report: files touched, the rom-config tag placement, lazy-init trigger points, and any spec contradiction found (report, do not improvise).
