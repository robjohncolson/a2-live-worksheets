# Enriched Pass Rollout — Dependency Graph

## Wave 1 (all parallel — no dependencies between agents)

| Agent | Files | Complexity |
|-------|-------|------------|
| A — U3 special | u3_lesson6-7_live.html (ReflectionGrader class pattern) | M |
| B — U4 | u4_lesson1-2, u4_lesson1-2-3, u4_lesson3-4-5, u4_lesson6, u4_lesson7-8, u4_lesson9, u4_lesson10-12 (7 files) | L |
| C — U5 | u5_lesson1-2, u5_lesson3, u5_lesson4, u5_lesson5, u5_lesson6, u5_lesson7, u5_lesson8 (7 files) | L |
| D — U6 front | u6_lesson1-2, u6_lesson3, u6_lesson4, u6_lesson5, u6_lesson6 (5 files) | M |
| E — U6 back | u6_lesson7, u6_lesson8, u6_lesson9, u6_lesson10, u6_lesson11 (5 files) | M |
| F — U7 | u7_lesson1 through u7_lesson9 (9 files) | L |
| G — U8 + MIT | u8_lesson1, u8_lesson2, mit_ocw_lec1, mit_ocw_lec2 (4 files) | S |

**Total: 36 files, 7 agents, 1 wave, 0 dependencies.**

All agents apply the same 4-touch pattern from ENRICHED_PASS_ROLLOUT_SPEC.md.
Only varying element per file: the LESSON_CONTEXT variable name in fetchEnrichedAnswer().
