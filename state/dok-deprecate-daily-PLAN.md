# DOK daily deprecation plan ? 2026-09-12

Preserve unrelated changes. Never push. No scratch directories under state/.

1. Commit git mv archive: 68 lessons, 68 registry, 204 tex, 204 PDFs; PENDING header; archive README; this plan.
2. Commit builder/validator, metadata-only additions to Screen Time, active manifest and card index. Require standalone, misconceptions and generated. Preserve both content guards.
3. Commit Desk row removal, dashboard target labels and tests. Preserve resource panel, Do Now, gate, Teacher menu and APP_REGISTRY.dok.
4. Commit dated historical spec notes, active README and verification JSON after validation, compile, focused Vitest, pytest and root npm test with baseline failure names.

Tests: delete dok-coverage.test.js; add dok-active.test.js; replace desk-dok-ladder-row.test.js; adapt dok-registry.test.js, dok-index.test.js, teacher-dashboard-misconceptions.test.js and desk-e-pairing.test.js. Retain desk-teacher-dok-app.test.js. In test_dok_build.py remove test_group_tether_and_emission, replace test_standalone_keeps_calendar_and_finish_exceptions and obsolete time-budget case with active-schema tests; migrate daily fixtures to active sheet and retain policy/emission checks.

Remove Desk function _dokLadderRowHtml (and nested link helper). Former production caller: showResourcePanel, two branches. Git grep callers/extractors:

ap_stats_roadmap_square_mode.html:11213:function _dokLadderRowHtml(topicKey) {
ap_stats_roadmap_square_mode.html:11622:        // Teacher-only DOK-3 links (never rendered for students â€” see _dokLadderRowHtml).
ap_stats_roadmap_square_mode.html:11623:        if(!dayCell.group)lessonHtml += _dokLadderRowHtml(inf.t);
ap_stats_roadmap_square_mode.html:11631:    if(dayCell.group)html += _dokLadderRowHtml(dayCell);
tests/desk-dok-ladder-row.test.js:34:  const src = fnBody(DESK, '_dokLadderRowHtml');
tests/desk-dok-ladder-row.test.js:36:  return new Function('_deskIsTeacher', src + '\nreturn _dokLadderRowHtml;')(() => isTeacher)(topic);
tests/desk-dok-ladder-row.test.js:61:    const call = panel.indexOf("lessonHtml += _dokLadderRowHtml(inf.t);");
tests/desk-dok-ladder-row.test.js:69:    const helper = fnBody(DESK, '_dokLadderRowHtml');
tests/desk-e-pairing.test.js:232:   const s=load(['showResourcePanel','_lessonCoachHtml','_resourcePanelEsc','_dokLadderRowHtml','_renderTodayTopics','_focusTodayLessonVideo'],{

Computed 68-lesson move inventory:
dok/lessons/1.1.yaml
dok/lessons/1.10.yaml
dok/lessons/1.2.yaml
dok/lessons/1.3.yaml
dok/lessons/1.4.yaml
dok/lessons/1.4_1.5.yaml
dok/lessons/1.5.yaml
dok/lessons/1.6.yaml
dok/lessons/1.7.yaml
dok/lessons/1.7_1.8.yaml
dok/lessons/1.8.yaml
dok/lessons/1.9.yaml
dok/lessons/2.1.yaml
dok/lessons/2.2.yaml
dok/lessons/2.3.yaml
dok/lessons/2.4.yaml
dok/lessons/2.5.yaml
dok/lessons/2.6.yaml
dok/lessons/2.7.yaml
dok/lessons/2.8.yaml
dok/lessons/3.1.yaml
dok/lessons/3.2.yaml
dok/lessons/3.3.yaml
dok/lessons/3.4.yaml
dok/lessons/3.5.yaml
dok/lessons/3.6.yaml
dok/lessons/4.1.yaml
dok/lessons/4.10.yaml
dok/lessons/4.11.yaml
dok/lessons/4.2.yaml
dok/lessons/4.3.yaml
dok/lessons/4.4.yaml
dok/lessons/4.5.yaml
dok/lessons/4.6.yaml
dok/lessons/4.7.yaml
dok/lessons/4.8.yaml
dok/lessons/5.1.yaml
dok/lessons/5.2.yaml
dok/lessons/5.3.yaml
dok/lessons/5.4.yaml
dok/lessons/5.5.yaml
dok/lessons/5.6.yaml
dok/lessons/5.7.yaml
dok/lessons/5.8.yaml
dok/lessons/6.1.yaml
dok/lessons/6.10.yaml
dok/lessons/6.11.yaml
dok/lessons/6.2.yaml
dok/lessons/6.3.yaml
dok/lessons/6.4.yaml
dok/lessons/6.5.yaml
dok/lessons/6.6.yaml
dok/lessons/6.7.yaml
dok/lessons/6.8.yaml
dok/lessons/6.9.yaml
dok/lessons/7.1.yaml
dok/lessons/7.2.yaml
dok/lessons/7.3.yaml
dok/lessons/7.4.yaml
dok/lessons/7.5.yaml
dok/lessons/7.6.yaml
dok/lessons/7.7.yaml
dok/lessons/7.8.yaml
dok/lessons/7.9.yaml
dok/lessons/8.1.yaml
dok/lessons/8.4.yaml
dok/lessons/8.5.yaml
dok/lessons/8.6.yaml

Complete computed move list:
dok/lessons/1.1.yaml -> dok/archive/lessons/1.1.yaml
dok/registry/1.1.jsonl -> dok/archive/registry/1.1.jsonl
dok/tex/aps_1.1_student.tex -> dok/archive/tex/aps_1.1_student.tex
dok/tex/aps_1.1_board.tex -> dok/archive/tex/aps_1.1_board.tex
dok/tex/aps_1.1_teacher.tex -> dok/archive/tex/aps_1.1_teacher.tex
dok/pdf/aps_1.1_student.pdf -> dok/archive/pdf/aps_1.1_student.pdf
dok/pdf/aps_1.1_board.pdf -> dok/archive/pdf/aps_1.1_board.pdf
dok/pdf/aps_1.1_teacher.pdf -> dok/archive/pdf/aps_1.1_teacher.pdf
dok/lessons/1.10.yaml -> dok/archive/lessons/1.10.yaml
dok/registry/1.10.jsonl -> dok/archive/registry/1.10.jsonl
dok/tex/aps_1.10_student.tex -> dok/archive/tex/aps_1.10_student.tex
dok/tex/aps_1.10_board.tex -> dok/archive/tex/aps_1.10_board.tex
dok/tex/aps_1.10_teacher.tex -> dok/archive/tex/aps_1.10_teacher.tex
dok/pdf/aps_1.10_student.pdf -> dok/archive/pdf/aps_1.10_student.pdf
dok/pdf/aps_1.10_board.pdf -> dok/archive/pdf/aps_1.10_board.pdf
dok/pdf/aps_1.10_teacher.pdf -> dok/archive/pdf/aps_1.10_teacher.pdf
dok/lessons/1.2.yaml -> dok/archive/lessons/1.2.yaml
dok/registry/1.2.jsonl -> dok/archive/registry/1.2.jsonl
dok/tex/aps_1.2_student.tex -> dok/archive/tex/aps_1.2_student.tex
dok/tex/aps_1.2_board.tex -> dok/archive/tex/aps_1.2_board.tex
dok/tex/aps_1.2_teacher.tex -> dok/archive/tex/aps_1.2_teacher.tex
dok/pdf/aps_1.2_student.pdf -> dok/archive/pdf/aps_1.2_student.pdf
dok/pdf/aps_1.2_board.pdf -> dok/archive/pdf/aps_1.2_board.pdf
dok/pdf/aps_1.2_teacher.pdf -> dok/archive/pdf/aps_1.2_teacher.pdf
dok/lessons/1.3.yaml -> dok/archive/lessons/1.3.yaml
dok/registry/1.3.jsonl -> dok/archive/registry/1.3.jsonl
dok/tex/aps_1.3_student.tex -> dok/archive/tex/aps_1.3_student.tex
dok/tex/aps_1.3_board.tex -> dok/archive/tex/aps_1.3_board.tex
dok/tex/aps_1.3_teacher.tex -> dok/archive/tex/aps_1.3_teacher.tex
dok/pdf/aps_1.3_student.pdf -> dok/archive/pdf/aps_1.3_student.pdf
dok/pdf/aps_1.3_board.pdf -> dok/archive/pdf/aps_1.3_board.pdf
dok/pdf/aps_1.3_teacher.pdf -> dok/archive/pdf/aps_1.3_teacher.pdf
dok/lessons/1.4.yaml -> dok/archive/lessons/1.4.yaml
dok/registry/1.4.jsonl -> dok/archive/registry/1.4.jsonl
dok/tex/aps_1.4_student.tex -> dok/archive/tex/aps_1.4_student.tex
dok/tex/aps_1.4_board.tex -> dok/archive/tex/aps_1.4_board.tex
dok/tex/aps_1.4_teacher.tex -> dok/archive/tex/aps_1.4_teacher.tex
dok/pdf/aps_1.4_student.pdf -> dok/archive/pdf/aps_1.4_student.pdf
dok/pdf/aps_1.4_board.pdf -> dok/archive/pdf/aps_1.4_board.pdf
dok/pdf/aps_1.4_teacher.pdf -> dok/archive/pdf/aps_1.4_teacher.pdf
dok/lessons/1.4_1.5.yaml -> dok/archive/lessons/1.4_1.5.yaml
dok/registry/1.4_1.5.jsonl -> dok/archive/registry/1.4_1.5.jsonl
dok/tex/aps_1.4_1.5_student.tex -> dok/archive/tex/aps_1.4_1.5_student.tex
dok/tex/aps_1.4_1.5_board.tex -> dok/archive/tex/aps_1.4_1.5_board.tex
dok/tex/aps_1.4_1.5_teacher.tex -> dok/archive/tex/aps_1.4_1.5_teacher.tex
dok/pdf/aps_1.4_1.5_student.pdf -> dok/archive/pdf/aps_1.4_1.5_student.pdf
dok/pdf/aps_1.4_1.5_board.pdf -> dok/archive/pdf/aps_1.4_1.5_board.pdf
dok/pdf/aps_1.4_1.5_teacher.pdf -> dok/archive/pdf/aps_1.4_1.5_teacher.pdf
dok/lessons/1.5.yaml -> dok/archive/lessons/1.5.yaml
dok/registry/1.5.jsonl -> dok/archive/registry/1.5.jsonl
dok/tex/aps_1.5_student.tex -> dok/archive/tex/aps_1.5_student.tex
dok/tex/aps_1.5_board.tex -> dok/archive/tex/aps_1.5_board.tex
dok/tex/aps_1.5_teacher.tex -> dok/archive/tex/aps_1.5_teacher.tex
dok/pdf/aps_1.5_student.pdf -> dok/archive/pdf/aps_1.5_student.pdf
dok/pdf/aps_1.5_board.pdf -> dok/archive/pdf/aps_1.5_board.pdf
dok/pdf/aps_1.5_teacher.pdf -> dok/archive/pdf/aps_1.5_teacher.pdf
dok/lessons/1.6.yaml -> dok/archive/lessons/1.6.yaml
dok/registry/1.6.jsonl -> dok/archive/registry/1.6.jsonl
dok/tex/aps_1.6_student.tex -> dok/archive/tex/aps_1.6_student.tex
dok/tex/aps_1.6_board.tex -> dok/archive/tex/aps_1.6_board.tex
dok/tex/aps_1.6_teacher.tex -> dok/archive/tex/aps_1.6_teacher.tex
dok/pdf/aps_1.6_student.pdf -> dok/archive/pdf/aps_1.6_student.pdf
dok/pdf/aps_1.6_board.pdf -> dok/archive/pdf/aps_1.6_board.pdf
dok/pdf/aps_1.6_teacher.pdf -> dok/archive/pdf/aps_1.6_teacher.pdf
dok/lessons/1.7.yaml -> dok/archive/lessons/1.7.yaml
dok/registry/1.7.jsonl -> dok/archive/registry/1.7.jsonl
dok/tex/aps_1.7_student.tex -> dok/archive/tex/aps_1.7_student.tex
dok/tex/aps_1.7_board.tex -> dok/archive/tex/aps_1.7_board.tex
dok/tex/aps_1.7_teacher.tex -> dok/archive/tex/aps_1.7_teacher.tex
dok/pdf/aps_1.7_student.pdf -> dok/archive/pdf/aps_1.7_student.pdf
dok/pdf/aps_1.7_board.pdf -> dok/archive/pdf/aps_1.7_board.pdf
dok/pdf/aps_1.7_teacher.pdf -> dok/archive/pdf/aps_1.7_teacher.pdf
dok/lessons/1.7_1.8.yaml -> dok/archive/lessons/1.7_1.8.yaml
dok/registry/1.7_1.8.jsonl -> dok/archive/registry/1.7_1.8.jsonl
dok/tex/aps_1.7_1.8_student.tex -> dok/archive/tex/aps_1.7_1.8_student.tex
dok/tex/aps_1.7_1.8_board.tex -> dok/archive/tex/aps_1.7_1.8_board.tex
dok/tex/aps_1.7_1.8_teacher.tex -> dok/archive/tex/aps_1.7_1.8_teacher.tex
dok/pdf/aps_1.7_1.8_student.pdf -> dok/archive/pdf/aps_1.7_1.8_student.pdf
dok/pdf/aps_1.7_1.8_board.pdf -> dok/archive/pdf/aps_1.7_1.8_board.pdf
dok/pdf/aps_1.7_1.8_teacher.pdf -> dok/archive/pdf/aps_1.7_1.8_teacher.pdf
dok/lessons/1.8.yaml -> dok/archive/lessons/1.8.yaml
dok/registry/1.8.jsonl -> dok/archive/registry/1.8.jsonl
dok/tex/aps_1.8_student.tex -> dok/archive/tex/aps_1.8_student.tex
dok/tex/aps_1.8_board.tex -> dok/archive/tex/aps_1.8_board.tex
dok/tex/aps_1.8_teacher.tex -> dok/archive/tex/aps_1.8_teacher.tex
dok/pdf/aps_1.8_student.pdf -> dok/archive/pdf/aps_1.8_student.pdf
dok/pdf/aps_1.8_board.pdf -> dok/archive/pdf/aps_1.8_board.pdf
dok/pdf/aps_1.8_teacher.pdf -> dok/archive/pdf/aps_1.8_teacher.pdf
dok/lessons/1.9.yaml -> dok/archive/lessons/1.9.yaml
dok/registry/1.9.jsonl -> dok/archive/registry/1.9.jsonl
dok/tex/aps_1.9_student.tex -> dok/archive/tex/aps_1.9_student.tex
dok/tex/aps_1.9_board.tex -> dok/archive/tex/aps_1.9_board.tex
dok/tex/aps_1.9_teacher.tex -> dok/archive/tex/aps_1.9_teacher.tex
dok/pdf/aps_1.9_student.pdf -> dok/archive/pdf/aps_1.9_student.pdf
dok/pdf/aps_1.9_board.pdf -> dok/archive/pdf/aps_1.9_board.pdf
dok/pdf/aps_1.9_teacher.pdf -> dok/archive/pdf/aps_1.9_teacher.pdf
dok/lessons/2.1.yaml -> dok/archive/lessons/2.1.yaml
dok/registry/2.1.jsonl -> dok/archive/registry/2.1.jsonl
dok/tex/aps_2.1_student.tex -> dok/archive/tex/aps_2.1_student.tex
dok/tex/aps_2.1_board.tex -> dok/archive/tex/aps_2.1_board.tex
dok/tex/aps_2.1_teacher.tex -> dok/archive/tex/aps_2.1_teacher.tex
dok/pdf/aps_2.1_student.pdf -> dok/archive/pdf/aps_2.1_student.pdf
dok/pdf/aps_2.1_board.pdf -> dok/archive/pdf/aps_2.1_board.pdf
dok/pdf/aps_2.1_teacher.pdf -> dok/archive/pdf/aps_2.1_teacher.pdf
dok/lessons/2.2.yaml -> dok/archive/lessons/2.2.yaml
dok/registry/2.2.jsonl -> dok/archive/registry/2.2.jsonl
dok/tex/aps_2.2_student.tex -> dok/archive/tex/aps_2.2_student.tex
dok/tex/aps_2.2_board.tex -> dok/archive/tex/aps_2.2_board.tex
dok/tex/aps_2.2_teacher.tex -> dok/archive/tex/aps_2.2_teacher.tex
dok/pdf/aps_2.2_student.pdf -> dok/archive/pdf/aps_2.2_student.pdf
dok/pdf/aps_2.2_board.pdf -> dok/archive/pdf/aps_2.2_board.pdf
dok/pdf/aps_2.2_teacher.pdf -> dok/archive/pdf/aps_2.2_teacher.pdf
dok/lessons/2.3.yaml -> dok/archive/lessons/2.3.yaml
dok/registry/2.3.jsonl -> dok/archive/registry/2.3.jsonl
dok/tex/aps_2.3_student.tex -> dok/archive/tex/aps_2.3_student.tex
dok/tex/aps_2.3_board.tex -> dok/archive/tex/aps_2.3_board.tex
dok/tex/aps_2.3_teacher.tex -> dok/archive/tex/aps_2.3_teacher.tex
dok/pdf/aps_2.3_student.pdf -> dok/archive/pdf/aps_2.3_student.pdf
dok/pdf/aps_2.3_board.pdf -> dok/archive/pdf/aps_2.3_board.pdf
dok/pdf/aps_2.3_teacher.pdf -> dok/archive/pdf/aps_2.3_teacher.pdf
dok/lessons/2.4.yaml -> dok/archive/lessons/2.4.yaml
dok/registry/2.4.jsonl -> dok/archive/registry/2.4.jsonl
dok/tex/aps_2.4_student.tex -> dok/archive/tex/aps_2.4_student.tex
dok/tex/aps_2.4_board.tex -> dok/archive/tex/aps_2.4_board.tex
dok/tex/aps_2.4_teacher.tex -> dok/archive/tex/aps_2.4_teacher.tex
dok/pdf/aps_2.4_student.pdf -> dok/archive/pdf/aps_2.4_student.pdf
dok/pdf/aps_2.4_board.pdf -> dok/archive/pdf/aps_2.4_board.pdf
dok/pdf/aps_2.4_teacher.pdf -> dok/archive/pdf/aps_2.4_teacher.pdf
dok/lessons/2.5.yaml -> dok/archive/lessons/2.5.yaml
dok/registry/2.5.jsonl -> dok/archive/registry/2.5.jsonl
dok/tex/aps_2.5_student.tex -> dok/archive/tex/aps_2.5_student.tex
dok/tex/aps_2.5_board.tex -> dok/archive/tex/aps_2.5_board.tex
dok/tex/aps_2.5_teacher.tex -> dok/archive/tex/aps_2.5_teacher.tex
dok/pdf/aps_2.5_student.pdf -> dok/archive/pdf/aps_2.5_student.pdf
dok/pdf/aps_2.5_board.pdf -> dok/archive/pdf/aps_2.5_board.pdf
dok/pdf/aps_2.5_teacher.pdf -> dok/archive/pdf/aps_2.5_teacher.pdf
dok/lessons/2.6.yaml -> dok/archive/lessons/2.6.yaml
dok/registry/2.6.jsonl -> dok/archive/registry/2.6.jsonl
dok/tex/aps_2.6_student.tex -> dok/archive/tex/aps_2.6_student.tex
dok/tex/aps_2.6_board.tex -> dok/archive/tex/aps_2.6_board.tex
dok/tex/aps_2.6_teacher.tex -> dok/archive/tex/aps_2.6_teacher.tex
dok/pdf/aps_2.6_student.pdf -> dok/archive/pdf/aps_2.6_student.pdf
dok/pdf/aps_2.6_board.pdf -> dok/archive/pdf/aps_2.6_board.pdf
dok/pdf/aps_2.6_teacher.pdf -> dok/archive/pdf/aps_2.6_teacher.pdf
dok/lessons/2.7.yaml -> dok/archive/lessons/2.7.yaml
dok/registry/2.7.jsonl -> dok/archive/registry/2.7.jsonl
dok/tex/aps_2.7_student.tex -> dok/archive/tex/aps_2.7_student.tex
dok/tex/aps_2.7_board.tex -> dok/archive/tex/aps_2.7_board.tex
dok/tex/aps_2.7_teacher.tex -> dok/archive/tex/aps_2.7_teacher.tex
dok/pdf/aps_2.7_student.pdf -> dok/archive/pdf/aps_2.7_student.pdf
dok/pdf/aps_2.7_board.pdf -> dok/archive/pdf/aps_2.7_board.pdf
dok/pdf/aps_2.7_teacher.pdf -> dok/archive/pdf/aps_2.7_teacher.pdf
dok/lessons/2.8.yaml -> dok/archive/lessons/2.8.yaml
dok/registry/2.8.jsonl -> dok/archive/registry/2.8.jsonl
dok/tex/aps_2.8_student.tex -> dok/archive/tex/aps_2.8_student.tex
dok/tex/aps_2.8_board.tex -> dok/archive/tex/aps_2.8_board.tex
dok/tex/aps_2.8_teacher.tex -> dok/archive/tex/aps_2.8_teacher.tex
dok/pdf/aps_2.8_student.pdf -> dok/archive/pdf/aps_2.8_student.pdf
dok/pdf/aps_2.8_board.pdf -> dok/archive/pdf/aps_2.8_board.pdf
dok/pdf/aps_2.8_teacher.pdf -> dok/archive/pdf/aps_2.8_teacher.pdf
dok/lessons/3.1.yaml -> dok/archive/lessons/3.1.yaml
dok/registry/3.1.jsonl -> dok/archive/registry/3.1.jsonl
dok/tex/aps_3.1_student.tex -> dok/archive/tex/aps_3.1_student.tex
dok/tex/aps_3.1_board.tex -> dok/archive/tex/aps_3.1_board.tex
dok/tex/aps_3.1_teacher.tex -> dok/archive/tex/aps_3.1_teacher.tex
dok/pdf/aps_3.1_student.pdf -> dok/archive/pdf/aps_3.1_student.pdf
dok/pdf/aps_3.1_board.pdf -> dok/archive/pdf/aps_3.1_board.pdf
dok/pdf/aps_3.1_teacher.pdf -> dok/archive/pdf/aps_3.1_teacher.pdf
dok/lessons/3.2.yaml -> dok/archive/lessons/3.2.yaml
dok/registry/3.2.jsonl -> dok/archive/registry/3.2.jsonl
dok/tex/aps_3.2_student.tex -> dok/archive/tex/aps_3.2_student.tex
dok/tex/aps_3.2_board.tex -> dok/archive/tex/aps_3.2_board.tex
dok/tex/aps_3.2_teacher.tex -> dok/archive/tex/aps_3.2_teacher.tex
dok/pdf/aps_3.2_student.pdf -> dok/archive/pdf/aps_3.2_student.pdf
dok/pdf/aps_3.2_board.pdf -> dok/archive/pdf/aps_3.2_board.pdf
dok/pdf/aps_3.2_teacher.pdf -> dok/archive/pdf/aps_3.2_teacher.pdf
dok/lessons/3.3.yaml -> dok/archive/lessons/3.3.yaml
dok/registry/3.3.jsonl -> dok/archive/registry/3.3.jsonl
dok/tex/aps_3.3_student.tex -> dok/archive/tex/aps_3.3_student.tex
dok/tex/aps_3.3_board.tex -> dok/archive/tex/aps_3.3_board.tex
dok/tex/aps_3.3_teacher.tex -> dok/archive/tex/aps_3.3_teacher.tex
dok/pdf/aps_3.3_student.pdf -> dok/archive/pdf/aps_3.3_student.pdf
dok/pdf/aps_3.3_board.pdf -> dok/archive/pdf/aps_3.3_board.pdf
dok/pdf/aps_3.3_teacher.pdf -> dok/archive/pdf/aps_3.3_teacher.pdf
dok/lessons/3.4.yaml -> dok/archive/lessons/3.4.yaml
dok/registry/3.4.jsonl -> dok/archive/registry/3.4.jsonl
dok/tex/aps_3.4_student.tex -> dok/archive/tex/aps_3.4_student.tex
dok/tex/aps_3.4_board.tex -> dok/archive/tex/aps_3.4_board.tex
dok/tex/aps_3.4_teacher.tex -> dok/archive/tex/aps_3.4_teacher.tex
dok/pdf/aps_3.4_student.pdf -> dok/archive/pdf/aps_3.4_student.pdf
dok/pdf/aps_3.4_board.pdf -> dok/archive/pdf/aps_3.4_board.pdf
dok/pdf/aps_3.4_teacher.pdf -> dok/archive/pdf/aps_3.4_teacher.pdf
dok/lessons/3.5.yaml -> dok/archive/lessons/3.5.yaml
dok/registry/3.5.jsonl -> dok/archive/registry/3.5.jsonl
dok/tex/aps_3.5_student.tex -> dok/archive/tex/aps_3.5_student.tex
dok/tex/aps_3.5_board.tex -> dok/archive/tex/aps_3.5_board.tex
dok/tex/aps_3.5_teacher.tex -> dok/archive/tex/aps_3.5_teacher.tex
dok/pdf/aps_3.5_student.pdf -> dok/archive/pdf/aps_3.5_student.pdf
dok/pdf/aps_3.5_board.pdf -> dok/archive/pdf/aps_3.5_board.pdf
dok/pdf/aps_3.5_teacher.pdf -> dok/archive/pdf/aps_3.5_teacher.pdf
dok/lessons/3.6.yaml -> dok/archive/lessons/3.6.yaml
dok/registry/3.6.jsonl -> dok/archive/registry/3.6.jsonl
dok/tex/aps_3.6_student.tex -> dok/archive/tex/aps_3.6_student.tex
dok/tex/aps_3.6_board.tex -> dok/archive/tex/aps_3.6_board.tex
dok/tex/aps_3.6_teacher.tex -> dok/archive/tex/aps_3.6_teacher.tex
dok/pdf/aps_3.6_student.pdf -> dok/archive/pdf/aps_3.6_student.pdf
dok/pdf/aps_3.6_board.pdf -> dok/archive/pdf/aps_3.6_board.pdf
dok/pdf/aps_3.6_teacher.pdf -> dok/archive/pdf/aps_3.6_teacher.pdf
dok/lessons/4.1.yaml -> dok/archive/lessons/4.1.yaml
dok/registry/4.1.jsonl -> dok/archive/registry/4.1.jsonl
dok/tex/aps_4.1_student.tex -> dok/archive/tex/aps_4.1_student.tex
dok/tex/aps_4.1_board.tex -> dok/archive/tex/aps_4.1_board.tex
dok/tex/aps_4.1_teacher.tex -> dok/archive/tex/aps_4.1_teacher.tex
dok/pdf/aps_4.1_student.pdf -> dok/archive/pdf/aps_4.1_student.pdf
dok/pdf/aps_4.1_board.pdf -> dok/archive/pdf/aps_4.1_board.pdf
dok/pdf/aps_4.1_teacher.pdf -> dok/archive/pdf/aps_4.1_teacher.pdf
dok/lessons/4.10.yaml -> dok/archive/lessons/4.10.yaml
dok/registry/4.10.jsonl -> dok/archive/registry/4.10.jsonl
dok/tex/aps_4.10_student.tex -> dok/archive/tex/aps_4.10_student.tex
dok/tex/aps_4.10_board.tex -> dok/archive/tex/aps_4.10_board.tex
dok/tex/aps_4.10_teacher.tex -> dok/archive/tex/aps_4.10_teacher.tex
dok/pdf/aps_4.10_student.pdf -> dok/archive/pdf/aps_4.10_student.pdf
dok/pdf/aps_4.10_board.pdf -> dok/archive/pdf/aps_4.10_board.pdf
dok/pdf/aps_4.10_teacher.pdf -> dok/archive/pdf/aps_4.10_teacher.pdf
dok/lessons/4.11.yaml -> dok/archive/lessons/4.11.yaml
dok/registry/4.11.jsonl -> dok/archive/registry/4.11.jsonl
dok/tex/aps_4.11_student.tex -> dok/archive/tex/aps_4.11_student.tex
dok/tex/aps_4.11_board.tex -> dok/archive/tex/aps_4.11_board.tex
dok/tex/aps_4.11_teacher.tex -> dok/archive/tex/aps_4.11_teacher.tex
dok/pdf/aps_4.11_student.pdf -> dok/archive/pdf/aps_4.11_student.pdf
dok/pdf/aps_4.11_board.pdf -> dok/archive/pdf/aps_4.11_board.pdf
dok/pdf/aps_4.11_teacher.pdf -> dok/archive/pdf/aps_4.11_teacher.pdf
dok/lessons/4.2.yaml -> dok/archive/lessons/4.2.yaml
dok/registry/4.2.jsonl -> dok/archive/registry/4.2.jsonl
dok/tex/aps_4.2_student.tex -> dok/archive/tex/aps_4.2_student.tex
dok/tex/aps_4.2_board.tex -> dok/archive/tex/aps_4.2_board.tex
dok/tex/aps_4.2_teacher.tex -> dok/archive/tex/aps_4.2_teacher.tex
dok/pdf/aps_4.2_student.pdf -> dok/archive/pdf/aps_4.2_student.pdf
dok/pdf/aps_4.2_board.pdf -> dok/archive/pdf/aps_4.2_board.pdf
dok/pdf/aps_4.2_teacher.pdf -> dok/archive/pdf/aps_4.2_teacher.pdf
dok/lessons/4.3.yaml -> dok/archive/lessons/4.3.yaml
dok/registry/4.3.jsonl -> dok/archive/registry/4.3.jsonl
dok/tex/aps_4.3_student.tex -> dok/archive/tex/aps_4.3_student.tex
dok/tex/aps_4.3_board.tex -> dok/archive/tex/aps_4.3_board.tex
dok/tex/aps_4.3_teacher.tex -> dok/archive/tex/aps_4.3_teacher.tex
dok/pdf/aps_4.3_student.pdf -> dok/archive/pdf/aps_4.3_student.pdf
dok/pdf/aps_4.3_board.pdf -> dok/archive/pdf/aps_4.3_board.pdf
dok/pdf/aps_4.3_teacher.pdf -> dok/archive/pdf/aps_4.3_teacher.pdf
dok/lessons/4.4.yaml -> dok/archive/lessons/4.4.yaml
dok/registry/4.4.jsonl -> dok/archive/registry/4.4.jsonl
dok/tex/aps_4.4_student.tex -> dok/archive/tex/aps_4.4_student.tex
dok/tex/aps_4.4_board.tex -> dok/archive/tex/aps_4.4_board.tex
dok/tex/aps_4.4_teacher.tex -> dok/archive/tex/aps_4.4_teacher.tex
dok/pdf/aps_4.4_student.pdf -> dok/archive/pdf/aps_4.4_student.pdf
dok/pdf/aps_4.4_board.pdf -> dok/archive/pdf/aps_4.4_board.pdf
dok/pdf/aps_4.4_teacher.pdf -> dok/archive/pdf/aps_4.4_teacher.pdf
dok/lessons/4.5.yaml -> dok/archive/lessons/4.5.yaml
dok/registry/4.5.jsonl -> dok/archive/registry/4.5.jsonl
dok/tex/aps_4.5_student.tex -> dok/archive/tex/aps_4.5_student.tex
dok/tex/aps_4.5_board.tex -> dok/archive/tex/aps_4.5_board.tex
dok/tex/aps_4.5_teacher.tex -> dok/archive/tex/aps_4.5_teacher.tex
dok/pdf/aps_4.5_student.pdf -> dok/archive/pdf/aps_4.5_student.pdf
dok/pdf/aps_4.5_board.pdf -> dok/archive/pdf/aps_4.5_board.pdf
dok/pdf/aps_4.5_teacher.pdf -> dok/archive/pdf/aps_4.5_teacher.pdf
dok/lessons/4.6.yaml -> dok/archive/lessons/4.6.yaml
dok/registry/4.6.jsonl -> dok/archive/registry/4.6.jsonl
dok/tex/aps_4.6_student.tex -> dok/archive/tex/aps_4.6_student.tex
dok/tex/aps_4.6_board.tex -> dok/archive/tex/aps_4.6_board.tex
dok/tex/aps_4.6_teacher.tex -> dok/archive/tex/aps_4.6_teacher.tex
dok/pdf/aps_4.6_student.pdf -> dok/archive/pdf/aps_4.6_student.pdf
dok/pdf/aps_4.6_board.pdf -> dok/archive/pdf/aps_4.6_board.pdf
dok/pdf/aps_4.6_teacher.pdf -> dok/archive/pdf/aps_4.6_teacher.pdf
dok/lessons/4.7.yaml -> dok/archive/lessons/4.7.yaml
dok/registry/4.7.jsonl -> dok/archive/registry/4.7.jsonl
dok/tex/aps_4.7_student.tex -> dok/archive/tex/aps_4.7_student.tex
dok/tex/aps_4.7_board.tex -> dok/archive/tex/aps_4.7_board.tex
dok/tex/aps_4.7_teacher.tex -> dok/archive/tex/aps_4.7_teacher.tex
dok/pdf/aps_4.7_student.pdf -> dok/archive/pdf/aps_4.7_student.pdf
dok/pdf/aps_4.7_board.pdf -> dok/archive/pdf/aps_4.7_board.pdf
dok/pdf/aps_4.7_teacher.pdf -> dok/archive/pdf/aps_4.7_teacher.pdf
dok/lessons/4.8.yaml -> dok/archive/lessons/4.8.yaml
dok/registry/4.8.jsonl -> dok/archive/registry/4.8.jsonl
dok/tex/aps_4.8_student.tex -> dok/archive/tex/aps_4.8_student.tex
dok/tex/aps_4.8_board.tex -> dok/archive/tex/aps_4.8_board.tex
dok/tex/aps_4.8_teacher.tex -> dok/archive/tex/aps_4.8_teacher.tex
dok/pdf/aps_4.8_student.pdf -> dok/archive/pdf/aps_4.8_student.pdf
dok/pdf/aps_4.8_board.pdf -> dok/archive/pdf/aps_4.8_board.pdf
dok/pdf/aps_4.8_teacher.pdf -> dok/archive/pdf/aps_4.8_teacher.pdf
dok/lessons/5.1.yaml -> dok/archive/lessons/5.1.yaml
dok/registry/5.1.jsonl -> dok/archive/registry/5.1.jsonl
dok/tex/aps_5.1_student.tex -> dok/archive/tex/aps_5.1_student.tex
dok/tex/aps_5.1_board.tex -> dok/archive/tex/aps_5.1_board.tex
dok/tex/aps_5.1_teacher.tex -> dok/archive/tex/aps_5.1_teacher.tex
dok/pdf/aps_5.1_student.pdf -> dok/archive/pdf/aps_5.1_student.pdf
dok/pdf/aps_5.1_board.pdf -> dok/archive/pdf/aps_5.1_board.pdf
dok/pdf/aps_5.1_teacher.pdf -> dok/archive/pdf/aps_5.1_teacher.pdf
dok/lessons/5.2.yaml -> dok/archive/lessons/5.2.yaml
dok/registry/5.2.jsonl -> dok/archive/registry/5.2.jsonl
dok/tex/aps_5.2_student.tex -> dok/archive/tex/aps_5.2_student.tex
dok/tex/aps_5.2_board.tex -> dok/archive/tex/aps_5.2_board.tex
dok/tex/aps_5.2_teacher.tex -> dok/archive/tex/aps_5.2_teacher.tex
dok/pdf/aps_5.2_student.pdf -> dok/archive/pdf/aps_5.2_student.pdf
dok/pdf/aps_5.2_board.pdf -> dok/archive/pdf/aps_5.2_board.pdf
dok/pdf/aps_5.2_teacher.pdf -> dok/archive/pdf/aps_5.2_teacher.pdf
dok/lessons/5.3.yaml -> dok/archive/lessons/5.3.yaml
dok/registry/5.3.jsonl -> dok/archive/registry/5.3.jsonl
dok/tex/aps_5.3_student.tex -> dok/archive/tex/aps_5.3_student.tex
dok/tex/aps_5.3_board.tex -> dok/archive/tex/aps_5.3_board.tex
dok/tex/aps_5.3_teacher.tex -> dok/archive/tex/aps_5.3_teacher.tex
dok/pdf/aps_5.3_student.pdf -> dok/archive/pdf/aps_5.3_student.pdf
dok/pdf/aps_5.3_board.pdf -> dok/archive/pdf/aps_5.3_board.pdf
dok/pdf/aps_5.3_teacher.pdf -> dok/archive/pdf/aps_5.3_teacher.pdf
dok/lessons/5.4.yaml -> dok/archive/lessons/5.4.yaml
dok/registry/5.4.jsonl -> dok/archive/registry/5.4.jsonl
dok/tex/aps_5.4_student.tex -> dok/archive/tex/aps_5.4_student.tex
dok/tex/aps_5.4_board.tex -> dok/archive/tex/aps_5.4_board.tex
dok/tex/aps_5.4_teacher.tex -> dok/archive/tex/aps_5.4_teacher.tex
dok/pdf/aps_5.4_student.pdf -> dok/archive/pdf/aps_5.4_student.pdf
dok/pdf/aps_5.4_board.pdf -> dok/archive/pdf/aps_5.4_board.pdf
dok/pdf/aps_5.4_teacher.pdf -> dok/archive/pdf/aps_5.4_teacher.pdf
dok/lessons/5.5.yaml -> dok/archive/lessons/5.5.yaml
dok/registry/5.5.jsonl -> dok/archive/registry/5.5.jsonl
dok/tex/aps_5.5_student.tex -> dok/archive/tex/aps_5.5_student.tex
dok/tex/aps_5.5_board.tex -> dok/archive/tex/aps_5.5_board.tex
dok/tex/aps_5.5_teacher.tex -> dok/archive/tex/aps_5.5_teacher.tex
dok/pdf/aps_5.5_student.pdf -> dok/archive/pdf/aps_5.5_student.pdf
dok/pdf/aps_5.5_board.pdf -> dok/archive/pdf/aps_5.5_board.pdf
dok/pdf/aps_5.5_teacher.pdf -> dok/archive/pdf/aps_5.5_teacher.pdf
dok/lessons/5.6.yaml -> dok/archive/lessons/5.6.yaml
dok/registry/5.6.jsonl -> dok/archive/registry/5.6.jsonl
dok/tex/aps_5.6_student.tex -> dok/archive/tex/aps_5.6_student.tex
dok/tex/aps_5.6_board.tex -> dok/archive/tex/aps_5.6_board.tex
dok/tex/aps_5.6_teacher.tex -> dok/archive/tex/aps_5.6_teacher.tex
dok/pdf/aps_5.6_student.pdf -> dok/archive/pdf/aps_5.6_student.pdf
dok/pdf/aps_5.6_board.pdf -> dok/archive/pdf/aps_5.6_board.pdf
dok/pdf/aps_5.6_teacher.pdf -> dok/archive/pdf/aps_5.6_teacher.pdf
dok/lessons/5.7.yaml -> dok/archive/lessons/5.7.yaml
dok/registry/5.7.jsonl -> dok/archive/registry/5.7.jsonl
dok/tex/aps_5.7_student.tex -> dok/archive/tex/aps_5.7_student.tex
dok/tex/aps_5.7_board.tex -> dok/archive/tex/aps_5.7_board.tex
dok/tex/aps_5.7_teacher.tex -> dok/archive/tex/aps_5.7_teacher.tex
dok/pdf/aps_5.7_student.pdf -> dok/archive/pdf/aps_5.7_student.pdf
dok/pdf/aps_5.7_board.pdf -> dok/archive/pdf/aps_5.7_board.pdf
dok/pdf/aps_5.7_teacher.pdf -> dok/archive/pdf/aps_5.7_teacher.pdf
dok/lessons/5.8.yaml -> dok/archive/lessons/5.8.yaml
dok/registry/5.8.jsonl -> dok/archive/registry/5.8.jsonl
dok/tex/aps_5.8_student.tex -> dok/archive/tex/aps_5.8_student.tex
dok/tex/aps_5.8_board.tex -> dok/archive/tex/aps_5.8_board.tex
dok/tex/aps_5.8_teacher.tex -> dok/archive/tex/aps_5.8_teacher.tex
dok/pdf/aps_5.8_student.pdf -> dok/archive/pdf/aps_5.8_student.pdf
dok/pdf/aps_5.8_board.pdf -> dok/archive/pdf/aps_5.8_board.pdf
dok/pdf/aps_5.8_teacher.pdf -> dok/archive/pdf/aps_5.8_teacher.pdf
dok/lessons/6.1.yaml -> dok/archive/lessons/6.1.yaml
dok/registry/6.1.jsonl -> dok/archive/registry/6.1.jsonl
dok/tex/aps_6.1_student.tex -> dok/archive/tex/aps_6.1_student.tex
dok/tex/aps_6.1_board.tex -> dok/archive/tex/aps_6.1_board.tex
dok/tex/aps_6.1_teacher.tex -> dok/archive/tex/aps_6.1_teacher.tex
dok/pdf/aps_6.1_student.pdf -> dok/archive/pdf/aps_6.1_student.pdf
dok/pdf/aps_6.1_board.pdf -> dok/archive/pdf/aps_6.1_board.pdf
dok/pdf/aps_6.1_teacher.pdf -> dok/archive/pdf/aps_6.1_teacher.pdf
dok/lessons/6.10.yaml -> dok/archive/lessons/6.10.yaml
dok/registry/6.10.jsonl -> dok/archive/registry/6.10.jsonl
dok/tex/aps_6.10_student.tex -> dok/archive/tex/aps_6.10_student.tex
dok/tex/aps_6.10_board.tex -> dok/archive/tex/aps_6.10_board.tex
dok/tex/aps_6.10_teacher.tex -> dok/archive/tex/aps_6.10_teacher.tex
dok/pdf/aps_6.10_student.pdf -> dok/archive/pdf/aps_6.10_student.pdf
dok/pdf/aps_6.10_board.pdf -> dok/archive/pdf/aps_6.10_board.pdf
dok/pdf/aps_6.10_teacher.pdf -> dok/archive/pdf/aps_6.10_teacher.pdf
dok/lessons/6.11.yaml -> dok/archive/lessons/6.11.yaml
dok/registry/6.11.jsonl -> dok/archive/registry/6.11.jsonl
dok/tex/aps_6.11_student.tex -> dok/archive/tex/aps_6.11_student.tex
dok/tex/aps_6.11_board.tex -> dok/archive/tex/aps_6.11_board.tex
dok/tex/aps_6.11_teacher.tex -> dok/archive/tex/aps_6.11_teacher.tex
dok/pdf/aps_6.11_student.pdf -> dok/archive/pdf/aps_6.11_student.pdf
dok/pdf/aps_6.11_board.pdf -> dok/archive/pdf/aps_6.11_board.pdf
dok/pdf/aps_6.11_teacher.pdf -> dok/archive/pdf/aps_6.11_teacher.pdf
dok/lessons/6.2.yaml -> dok/archive/lessons/6.2.yaml
dok/registry/6.2.jsonl -> dok/archive/registry/6.2.jsonl
dok/tex/aps_6.2_student.tex -> dok/archive/tex/aps_6.2_student.tex
dok/tex/aps_6.2_board.tex -> dok/archive/tex/aps_6.2_board.tex
dok/tex/aps_6.2_teacher.tex -> dok/archive/tex/aps_6.2_teacher.tex
dok/pdf/aps_6.2_student.pdf -> dok/archive/pdf/aps_6.2_student.pdf
dok/pdf/aps_6.2_board.pdf -> dok/archive/pdf/aps_6.2_board.pdf
dok/pdf/aps_6.2_teacher.pdf -> dok/archive/pdf/aps_6.2_teacher.pdf
dok/lessons/6.3.yaml -> dok/archive/lessons/6.3.yaml
dok/registry/6.3.jsonl -> dok/archive/registry/6.3.jsonl
dok/tex/aps_6.3_student.tex -> dok/archive/tex/aps_6.3_student.tex
dok/tex/aps_6.3_board.tex -> dok/archive/tex/aps_6.3_board.tex
dok/tex/aps_6.3_teacher.tex -> dok/archive/tex/aps_6.3_teacher.tex
dok/pdf/aps_6.3_student.pdf -> dok/archive/pdf/aps_6.3_student.pdf
dok/pdf/aps_6.3_board.pdf -> dok/archive/pdf/aps_6.3_board.pdf
dok/pdf/aps_6.3_teacher.pdf -> dok/archive/pdf/aps_6.3_teacher.pdf
dok/lessons/6.4.yaml -> dok/archive/lessons/6.4.yaml
dok/registry/6.4.jsonl -> dok/archive/registry/6.4.jsonl
dok/tex/aps_6.4_student.tex -> dok/archive/tex/aps_6.4_student.tex
dok/tex/aps_6.4_board.tex -> dok/archive/tex/aps_6.4_board.tex
dok/tex/aps_6.4_teacher.tex -> dok/archive/tex/aps_6.4_teacher.tex
dok/pdf/aps_6.4_student.pdf -> dok/archive/pdf/aps_6.4_student.pdf
dok/pdf/aps_6.4_board.pdf -> dok/archive/pdf/aps_6.4_board.pdf
dok/pdf/aps_6.4_teacher.pdf -> dok/archive/pdf/aps_6.4_teacher.pdf
dok/lessons/6.5.yaml -> dok/archive/lessons/6.5.yaml
dok/registry/6.5.jsonl -> dok/archive/registry/6.5.jsonl
dok/tex/aps_6.5_student.tex -> dok/archive/tex/aps_6.5_student.tex
dok/tex/aps_6.5_board.tex -> dok/archive/tex/aps_6.5_board.tex
dok/tex/aps_6.5_teacher.tex -> dok/archive/tex/aps_6.5_teacher.tex
dok/pdf/aps_6.5_student.pdf -> dok/archive/pdf/aps_6.5_student.pdf
dok/pdf/aps_6.5_board.pdf -> dok/archive/pdf/aps_6.5_board.pdf
dok/pdf/aps_6.5_teacher.pdf -> dok/archive/pdf/aps_6.5_teacher.pdf
dok/lessons/6.6.yaml -> dok/archive/lessons/6.6.yaml
dok/registry/6.6.jsonl -> dok/archive/registry/6.6.jsonl
dok/tex/aps_6.6_student.tex -> dok/archive/tex/aps_6.6_student.tex
dok/tex/aps_6.6_board.tex -> dok/archive/tex/aps_6.6_board.tex
dok/tex/aps_6.6_teacher.tex -> dok/archive/tex/aps_6.6_teacher.tex
dok/pdf/aps_6.6_student.pdf -> dok/archive/pdf/aps_6.6_student.pdf
dok/pdf/aps_6.6_board.pdf -> dok/archive/pdf/aps_6.6_board.pdf
dok/pdf/aps_6.6_teacher.pdf -> dok/archive/pdf/aps_6.6_teacher.pdf
dok/lessons/6.7.yaml -> dok/archive/lessons/6.7.yaml
dok/registry/6.7.jsonl -> dok/archive/registry/6.7.jsonl
dok/tex/aps_6.7_student.tex -> dok/archive/tex/aps_6.7_student.tex
dok/tex/aps_6.7_board.tex -> dok/archive/tex/aps_6.7_board.tex
dok/tex/aps_6.7_teacher.tex -> dok/archive/tex/aps_6.7_teacher.tex
dok/pdf/aps_6.7_student.pdf -> dok/archive/pdf/aps_6.7_student.pdf
dok/pdf/aps_6.7_board.pdf -> dok/archive/pdf/aps_6.7_board.pdf
dok/pdf/aps_6.7_teacher.pdf -> dok/archive/pdf/aps_6.7_teacher.pdf
dok/lessons/6.8.yaml -> dok/archive/lessons/6.8.yaml
dok/registry/6.8.jsonl -> dok/archive/registry/6.8.jsonl
dok/tex/aps_6.8_student.tex -> dok/archive/tex/aps_6.8_student.tex
dok/tex/aps_6.8_board.tex -> dok/archive/tex/aps_6.8_board.tex
dok/tex/aps_6.8_teacher.tex -> dok/archive/tex/aps_6.8_teacher.tex
dok/pdf/aps_6.8_student.pdf -> dok/archive/pdf/aps_6.8_student.pdf
dok/pdf/aps_6.8_board.pdf -> dok/archive/pdf/aps_6.8_board.pdf
dok/pdf/aps_6.8_teacher.pdf -> dok/archive/pdf/aps_6.8_teacher.pdf
dok/lessons/6.9.yaml -> dok/archive/lessons/6.9.yaml
dok/registry/6.9.jsonl -> dok/archive/registry/6.9.jsonl
dok/tex/aps_6.9_student.tex -> dok/archive/tex/aps_6.9_student.tex
dok/tex/aps_6.9_board.tex -> dok/archive/tex/aps_6.9_board.tex
dok/tex/aps_6.9_teacher.tex -> dok/archive/tex/aps_6.9_teacher.tex
dok/pdf/aps_6.9_student.pdf -> dok/archive/pdf/aps_6.9_student.pdf
dok/pdf/aps_6.9_board.pdf -> dok/archive/pdf/aps_6.9_board.pdf
dok/pdf/aps_6.9_teacher.pdf -> dok/archive/pdf/aps_6.9_teacher.pdf
dok/lessons/7.1.yaml -> dok/archive/lessons/7.1.yaml
dok/registry/7.1.jsonl -> dok/archive/registry/7.1.jsonl
dok/tex/aps_7.1_student.tex -> dok/archive/tex/aps_7.1_student.tex
dok/tex/aps_7.1_board.tex -> dok/archive/tex/aps_7.1_board.tex
dok/tex/aps_7.1_teacher.tex -> dok/archive/tex/aps_7.1_teacher.tex
dok/pdf/aps_7.1_student.pdf -> dok/archive/pdf/aps_7.1_student.pdf
dok/pdf/aps_7.1_board.pdf -> dok/archive/pdf/aps_7.1_board.pdf
dok/pdf/aps_7.1_teacher.pdf -> dok/archive/pdf/aps_7.1_teacher.pdf
dok/lessons/7.2.yaml -> dok/archive/lessons/7.2.yaml
dok/registry/7.2.jsonl -> dok/archive/registry/7.2.jsonl
dok/tex/aps_7.2_student.tex -> dok/archive/tex/aps_7.2_student.tex
dok/tex/aps_7.2_board.tex -> dok/archive/tex/aps_7.2_board.tex
dok/tex/aps_7.2_teacher.tex -> dok/archive/tex/aps_7.2_teacher.tex
dok/pdf/aps_7.2_student.pdf -> dok/archive/pdf/aps_7.2_student.pdf
dok/pdf/aps_7.2_board.pdf -> dok/archive/pdf/aps_7.2_board.pdf
dok/pdf/aps_7.2_teacher.pdf -> dok/archive/pdf/aps_7.2_teacher.pdf
dok/lessons/7.3.yaml -> dok/archive/lessons/7.3.yaml
dok/registry/7.3.jsonl -> dok/archive/registry/7.3.jsonl
dok/tex/aps_7.3_student.tex -> dok/archive/tex/aps_7.3_student.tex
dok/tex/aps_7.3_board.tex -> dok/archive/tex/aps_7.3_board.tex
dok/tex/aps_7.3_teacher.tex -> dok/archive/tex/aps_7.3_teacher.tex
dok/pdf/aps_7.3_student.pdf -> dok/archive/pdf/aps_7.3_student.pdf
dok/pdf/aps_7.3_board.pdf -> dok/archive/pdf/aps_7.3_board.pdf
dok/pdf/aps_7.3_teacher.pdf -> dok/archive/pdf/aps_7.3_teacher.pdf
dok/lessons/7.4.yaml -> dok/archive/lessons/7.4.yaml
dok/registry/7.4.jsonl -> dok/archive/registry/7.4.jsonl
dok/tex/aps_7.4_student.tex -> dok/archive/tex/aps_7.4_student.tex
dok/tex/aps_7.4_board.tex -> dok/archive/tex/aps_7.4_board.tex
dok/tex/aps_7.4_teacher.tex -> dok/archive/tex/aps_7.4_teacher.tex
dok/pdf/aps_7.4_student.pdf -> dok/archive/pdf/aps_7.4_student.pdf
dok/pdf/aps_7.4_board.pdf -> dok/archive/pdf/aps_7.4_board.pdf
dok/pdf/aps_7.4_teacher.pdf -> dok/archive/pdf/aps_7.4_teacher.pdf
dok/lessons/7.5.yaml -> dok/archive/lessons/7.5.yaml
dok/registry/7.5.jsonl -> dok/archive/registry/7.5.jsonl
dok/tex/aps_7.5_student.tex -> dok/archive/tex/aps_7.5_student.tex
dok/tex/aps_7.5_board.tex -> dok/archive/tex/aps_7.5_board.tex
dok/tex/aps_7.5_teacher.tex -> dok/archive/tex/aps_7.5_teacher.tex
dok/pdf/aps_7.5_student.pdf -> dok/archive/pdf/aps_7.5_student.pdf
dok/pdf/aps_7.5_board.pdf -> dok/archive/pdf/aps_7.5_board.pdf
dok/pdf/aps_7.5_teacher.pdf -> dok/archive/pdf/aps_7.5_teacher.pdf
dok/lessons/7.6.yaml -> dok/archive/lessons/7.6.yaml
dok/registry/7.6.jsonl -> dok/archive/registry/7.6.jsonl
dok/tex/aps_7.6_student.tex -> dok/archive/tex/aps_7.6_student.tex
dok/tex/aps_7.6_board.tex -> dok/archive/tex/aps_7.6_board.tex
dok/tex/aps_7.6_teacher.tex -> dok/archive/tex/aps_7.6_teacher.tex
dok/pdf/aps_7.6_student.pdf -> dok/archive/pdf/aps_7.6_student.pdf
dok/pdf/aps_7.6_board.pdf -> dok/archive/pdf/aps_7.6_board.pdf
dok/pdf/aps_7.6_teacher.pdf -> dok/archive/pdf/aps_7.6_teacher.pdf
dok/lessons/7.7.yaml -> dok/archive/lessons/7.7.yaml
dok/registry/7.7.jsonl -> dok/archive/registry/7.7.jsonl
dok/tex/aps_7.7_student.tex -> dok/archive/tex/aps_7.7_student.tex
dok/tex/aps_7.7_board.tex -> dok/archive/tex/aps_7.7_board.tex
dok/tex/aps_7.7_teacher.tex -> dok/archive/tex/aps_7.7_teacher.tex
dok/pdf/aps_7.7_student.pdf -> dok/archive/pdf/aps_7.7_student.pdf
dok/pdf/aps_7.7_board.pdf -> dok/archive/pdf/aps_7.7_board.pdf
dok/pdf/aps_7.7_teacher.pdf -> dok/archive/pdf/aps_7.7_teacher.pdf
dok/lessons/7.8.yaml -> dok/archive/lessons/7.8.yaml
dok/registry/7.8.jsonl -> dok/archive/registry/7.8.jsonl
dok/tex/aps_7.8_student.tex -> dok/archive/tex/aps_7.8_student.tex
dok/tex/aps_7.8_board.tex -> dok/archive/tex/aps_7.8_board.tex
dok/tex/aps_7.8_teacher.tex -> dok/archive/tex/aps_7.8_teacher.tex
dok/pdf/aps_7.8_student.pdf -> dok/archive/pdf/aps_7.8_student.pdf
dok/pdf/aps_7.8_board.pdf -> dok/archive/pdf/aps_7.8_board.pdf
dok/pdf/aps_7.8_teacher.pdf -> dok/archive/pdf/aps_7.8_teacher.pdf
dok/lessons/7.9.yaml -> dok/archive/lessons/7.9.yaml
dok/registry/7.9.jsonl -> dok/archive/registry/7.9.jsonl
dok/tex/aps_7.9_student.tex -> dok/archive/tex/aps_7.9_student.tex
dok/tex/aps_7.9_board.tex -> dok/archive/tex/aps_7.9_board.tex
dok/tex/aps_7.9_teacher.tex -> dok/archive/tex/aps_7.9_teacher.tex
dok/pdf/aps_7.9_student.pdf -> dok/archive/pdf/aps_7.9_student.pdf
dok/pdf/aps_7.9_board.pdf -> dok/archive/pdf/aps_7.9_board.pdf
dok/pdf/aps_7.9_teacher.pdf -> dok/archive/pdf/aps_7.9_teacher.pdf
dok/lessons/8.1.yaml -> dok/archive/lessons/8.1.yaml
dok/registry/8.1.jsonl -> dok/archive/registry/8.1.jsonl
dok/tex/aps_8.1_student.tex -> dok/archive/tex/aps_8.1_student.tex
dok/tex/aps_8.1_board.tex -> dok/archive/tex/aps_8.1_board.tex
dok/tex/aps_8.1_teacher.tex -> dok/archive/tex/aps_8.1_teacher.tex
dok/pdf/aps_8.1_student.pdf -> dok/archive/pdf/aps_8.1_student.pdf
dok/pdf/aps_8.1_board.pdf -> dok/archive/pdf/aps_8.1_board.pdf
dok/pdf/aps_8.1_teacher.pdf -> dok/archive/pdf/aps_8.1_teacher.pdf
dok/lessons/8.4.yaml -> dok/archive/lessons/8.4.yaml
dok/registry/8.4.jsonl -> dok/archive/registry/8.4.jsonl
dok/tex/aps_8.4_student.tex -> dok/archive/tex/aps_8.4_student.tex
dok/tex/aps_8.4_board.tex -> dok/archive/tex/aps_8.4_board.tex
dok/tex/aps_8.4_teacher.tex -> dok/archive/tex/aps_8.4_teacher.tex
dok/pdf/aps_8.4_student.pdf -> dok/archive/pdf/aps_8.4_student.pdf
dok/pdf/aps_8.4_board.pdf -> dok/archive/pdf/aps_8.4_board.pdf
dok/pdf/aps_8.4_teacher.pdf -> dok/archive/pdf/aps_8.4_teacher.pdf
dok/lessons/8.5.yaml -> dok/archive/lessons/8.5.yaml
dok/registry/8.5.jsonl -> dok/archive/registry/8.5.jsonl
dok/tex/aps_8.5_student.tex -> dok/archive/tex/aps_8.5_student.tex
dok/tex/aps_8.5_board.tex -> dok/archive/tex/aps_8.5_board.tex
dok/tex/aps_8.5_teacher.tex -> dok/archive/tex/aps_8.5_teacher.tex
dok/pdf/aps_8.5_student.pdf -> dok/archive/pdf/aps_8.5_student.pdf
dok/pdf/aps_8.5_board.pdf -> dok/archive/pdf/aps_8.5_board.pdf
dok/pdf/aps_8.5_teacher.pdf -> dok/archive/pdf/aps_8.5_teacher.pdf
dok/lessons/8.6.yaml -> dok/archive/lessons/8.6.yaml
dok/registry/8.6.jsonl -> dok/archive/registry/8.6.jsonl
dok/tex/aps_8.6_student.tex -> dok/archive/tex/aps_8.6_student.tex
dok/tex/aps_8.6_board.tex -> dok/archive/tex/aps_8.6_board.tex
dok/tex/aps_8.6_teacher.tex -> dok/archive/tex/aps_8.6_teacher.tex
dok/pdf/aps_8.6_student.pdf -> dok/archive/pdf/aps_8.6_student.pdf
dok/pdf/aps_8.6_board.pdf -> dok/archive/pdf/aps_8.6_board.pdf
dok/pdf/aps_8.6_teacher.pdf -> dok/archive/pdf/aps_8.6_teacher.pdf
dok/PENDING.md -> dok/archive/PENDING.md

Resumed with explicit authorization to use git grep for the unindexable Desk.
Desk blast radius: _dokLadderRowHtml has one direct caller (showResourcePanel), at two call sites; its nested link helper is only called inside it. Remove all three with no other panel edits.
showResourcePanel has eight production call sites: recordLinkVisit, maybeBumpThenOpen/open, renderDoNowGrades, _showWorkDayPanel/finish.onclick, storage event listener, _studentMarkSave, _blooketCommit, and _focusTodayLessonVideo. These resource, completion-refresh and today-navigation flows make the panel HIGH risk; removal is limited to DOK output and covered by Desk regressions. Git grep line inventory at resume: 6612, 8050, 8795, 11278, 11810, 11866, 14712, 24377.

Dashboard loadRemediationSheets upstream impact: LOW; one top-level initialization caller; zero affected processes. Test helper impact queries report LOW with zero callers for indexed helpers; newer test cases are absent from the index. They are test-only entry points with no production callers.
Staged detect_changes before commits 1/2/3: no indexed changes / LOW (6 symbols, 0 processes) / LOW (9 symbols, 0 processes). The graph's Python hunk mapping includes stale baseline and unrelated symbol names; staged diff review is authoritative for those files. Desk caller inventory above is the explicitly authorized substitute.

Completed implementation: 545 archive renames; active YAML content unchanged except added metadata; active TeX unchanged; one sheet compiled to three PDFs. Refreshed the Desk/dashboard generated shadows after the root lineage check exposed drift. Final focused run: 10 files / 66 passed. Python: 64 passed. Final root: 315 files, 19 failed files; 26 failed tests plus the pre-existing study-break-smoke syntax error. All failed test titles match prior reports; exact names and evidence are recorded in dok-deprecate-daily-verification.json. No new failures remain. No push; unrelated work preserved.
