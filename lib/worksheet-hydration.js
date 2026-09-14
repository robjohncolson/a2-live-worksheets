async function hydratePriorAnswers() {
            var diagnosticRun = window.worksheetDiagnostics && window.worksheetDiagnostics.begin(gbWsPrefix());
            var prior;
            try {
                if (!window.gradebookClient || !window.gradebookClient.fetchPrior) return;
                var prefix = gbWsPrefix();
                if (!prefix) return;
                prior = await window.gradebookClient.fetchPrior(prefix, { restore: true });
                if (!prior || prior.size === 0) return;

                // Fill empty .blank inputs.
                document.querySelectorAll('.blank[data-question-id]').forEach(function (blank) {
                    var itemId = blank.dataset.questionId;
                    var entry = prior.get(itemId);
                    if (!entry || entry.response === undefined || entry.response === null) return;
                    if (blank.dataset.gbEdited === '1' || (blank.value && blank.value.trim())) return;  // never clobber
                    var v = typeof entry.response === 'string'
                          ? entry.response
                          : String(entry.response);
                    blank.value = v;
                    blank.dataset.restored = '1';
                    if (typeof checkAnswer === 'function') checkAnswer(blank);
                    _markRestored(blank);
                });

                // Fill empty reflection textareas (source:'frq', itemId = prefix + '-' + textareaId).
                document.querySelectorAll('textarea[id]').forEach(function (ta) {
                    var itemId = prefix + '-' + ta.id;
                    var entry = prior.get(itemId);
                    if (!entry || entry.response === undefined || entry.response === null) return;
                    if (ta.dataset.gbEdited === '1' || (ta.value && ta.value.trim())) return;
                    var v = typeof entry.response === 'string'
                          ? entry.response
                          : String(entry.response);
                    ta.value = v;
                    ta.dataset.restored = '1';
                    // W2.4: restore grade class from ledger score (1->E, 0.5->P, 0->I).
                    if (entry.score !== null && entry.score !== undefined) {
                        var gradeMap = { 1: 'E', 0.5: 'P', 0: 'I' };
                        var gradeClass = gradeMap[entry.score];
                        if (gradeClass) {
                            ta.classList.remove('graded-E', 'graded-P', 'graded-I');
                            ta.classList.add('graded-' + gradeClass);
                            // W2.5: rebuild gradingState so a post-reload edit clears the stale grade.
                            // W2.6: carry the stored feedback (the hourly auto-grader saves it now) and
                            // say WHEN the grade was applied to the saved answer — an overnight grade
                            // with no explanation is what "my grade dropped" looked like to students.
                            var storedFb = (entry.result && typeof entry.result.feedback === 'string') ? entry.result.feedback : '';
                            if (typeof gradingState !== 'undefined' && gradingState && typeof gradingState.set === 'function') {
                                gradingState.set(ta.id, { result: { score: gradeClass, feedback: storedFb }, originalAnswer: v, appealCount: 0, history: [] });
                            }
                            _markAutoGraded(ta, gradeClass, storedFb, entry.gradedAt, entry.result && entry.result.provider, entry.result && entry.result.missing);
                        }
                    }
                    _markRestored(ta);
                });
            } catch (_) { /* silent — never block the worksheet */ }
            finally { if (window.worksheetDiagnostics) window.worksheetDiagnostics.finish(diagnosticRun, prior); }
        }

        

async function healLocalAnswersToLedger() {
            try {
                if (!window.gradebookClient || !window.gradebookClient.fetchPrior) return;
                if (typeof recordBlankToGradebook !== 'function' || typeof gbWsPrefix !== 'function') return;
                var signedIn = false;
                try { signedIn = !!(window.rosterClient && typeof rosterClient.token === 'function' && rosterClient.token()); } catch (_) { signedIn = false; }
                if (!signedIn) return;
                var prefix = gbWsPrefix();
                if (!prefix) return;
                var prior = await window.gradebookClient.fetchPrior(prefix, { repair: true });
                // A failed read cannot prove that a saved answer is missing.
                if (!prior || prior.loadFailed) return;
                document.querySelectorAll('.blank[data-question-id]').forEach(function (blank) {
                    try {
                        var value = (blank.value || '').trim();
                        if (!value) return;                                  // only answered blanks
                        var id = blank.dataset.questionId;
                        var entry = (prior && typeof prior.get === 'function') ? prior.get(id) : null;
                        // Skip ONLY when the ledger already holds this exact answer WITH a
                        // numeric score. Otherwise (missing / null-score / edited) re-record.
                        if (entry && typeof entry.score === 'number' && entry.response === value) return;
                        recordBlankToGradebook(blank);                       // checkAnswer -> score -> record
                    } catch (_) { /* per-blank best-effort */ }
                });
            } catch (_) { /* heal is best-effort; never block the worksheet */ }
        }

        