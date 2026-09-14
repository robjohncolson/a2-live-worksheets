# Six cooperative APStat Park levels: implementation contract

Requested: make cooperation essential, faithfully adapt PICO PARK gameplay rules, include all of World 1 and six total choices. Preserve calendar canvas/keyboard, sparse networking, replay and classroom recall.

Verified references:
- https://store.steampowered.com/app/1509960/PICO_PARK/ : 2-8 players; key, unlock, everybody reaches exit; multiplayer gimmicks.
- https://picoparkmobilewalkthrough.blogspot.com/2021/09/pico-park-level-1-puzzles-walkthrough.html : World 1 has FOUR stages. 1-1 head boost and button bridge; 1-2 moving walls, uncover key, pillar bridge, return push; 1-3 upper button enables lower route, lower crates on buttons unblock upper route; 1-4 weighted platforms, moving pillar, lower key, capacity-limited exit lift.
- https://picoparkmobilewalkthrough.blogspot.com/2021/09/pico-park-level-10-two-players-puzzle.html : paired held-button crossings (10-1), two-person elevator (10-3).

Six choices: retain indices 0 Hello Together (1-1), 1 Switchback (paired-button adaptation), 2 Lift Relay (two-rider lift adaptation); add 3 Moving Walls (1-2), 4 Upstairs / Downstairs (1-3), 5 Weight Together (1-4). Labels must not imply six stages in World 1. Layouts adapted to the board, rules based on references; no extracted game code or art.

Acceptance:
- Distinct student identities, minimum TWO online for puzzle actions or completion. One student / multiple tabs cannot solve the puzzle. Waiting students can move, jump and return through lobby/calendar doors; falls respawn locally. No solo step or reduced-to-one switch bypass.
- Held buttons release when stepped off; box-weighted buttons depend on box position, not a permanent visit. Held intent sent reliably on changes with sparse lease renewal; stale/disconnected holders cannot keep a gate open.
- Key-holder unlocks, all connected participants arrive, replay clears attempt state. Below two players allows local exploration but pauses cooperative progress without revoking earned milestones; replacement can join. Explicit replay differs from transport resume.
- Moving blocks are physical terrain, pushed by contact and direction, synchronized by bounded movement events (not game snapshots). Mutually useful routes, actual box placement.
- Weighted lifts derive motion from rider-count changes and relay-time anchors. No per-frame network physics. Capacity, pressure and hazard rules are readable in scene.
- Six actual keyboard-playable levels, cooperative paths tested with separate browsers, solo attempts fail, reconnect/leave/replay and isolation tested. No arbitrarily hard timing added just for difficulty.
- Build bump, targeted regression tests, code review, deploy frontend then relay, verify live rooms and served assets before completion.

Status: shipped; all six passed the full combined two-browser keyboard run, including replay, reconnect, classroom recall and real Desk canvas checks. Deployed and verified; see APSTAT_PARK_COOP_RELEASE.md for hashes and evidence. Larger-group weight requirements cap at four riders so the existing board-sized platforms remain usable; blocks use authored rails. These are gameplay adaptations, not exact geometry ports.
