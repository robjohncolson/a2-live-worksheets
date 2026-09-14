        // ==================== AI WORKSHEET GRADING (semantic blanks + folded FRQ) ====================
        // AI_WORKSHEET_GRADING_WIRED — AI_WORKSHEET_GRADING_BUILD.md — FRQ_GRADE_TICKETS_C_V1.
        // A SECOND layer on top of the verbatim check. A blank whose answer MEANS
        // the same thing as the key is upgraded to FULL credit; the FRQ section is
        // re-graded E/P/I UPGRADE-ONLY. ONE batched call for all blanks + hash
        // dedup + single-flight = anti-spam. AI NEVER downgrades (verbatim grade +
        // original FRQ grade are the floor). Soft-fails to the verbatim grade.
        (function () {
            if (window.__aiWorksheetGradeWired) return;     // runtime idempotency
            window.__aiWorksheetGradeWired = true;

            // Test-only lifecycle support. Production pages never set the seam
            // flag, so these registries simply mirror the browser's normal
            // timer/listener behavior for the lifetime of the page.
            var _aiDisposed = false;
            var _aiOwnedTimeouts = [];
            var _aiOwnedListeners = [];
            function _aiForgetOwnedTimeout(timeoutId) {
                var index = _aiOwnedTimeouts.indexOf(timeoutId);
                if (index >= 0) _aiOwnedTimeouts.splice(index, 1);
            }
            function _aiSetOwnedTimeout(callback, delayMs) {
                if (_aiDisposed) return null;
                var timeoutId = setTimeout(function () {
                    _aiForgetOwnedTimeout(timeoutId);
                    if (!_aiDisposed) callback();
                }, delayMs);
                _aiOwnedTimeouts.push(timeoutId);
                return timeoutId;
            }
            function _aiClearOwnedTimeout(timeoutId) {
                if (timeoutId == null) return;
                clearTimeout(timeoutId);
                _aiForgetOwnedTimeout(timeoutId);
            }
            function _aiClearAllOwnedTimeouts() {
                var timeouts = _aiOwnedTimeouts.slice();
                _aiOwnedTimeouts = [];
                timeouts.forEach(function (timeoutId) { clearTimeout(timeoutId); });
            }
            function _aiAddOwnedListener(target, type, handler) {
                if (_aiDisposed || !target || typeof target.addEventListener !== 'function') return;
                target.addEventListener(type, handler);
                _aiOwnedListeners.push({ target: target, type: type, handler: handler });
            }
            function _aiRemoveAllOwnedListeners() {
                _aiOwnedListeners.forEach(function (listener) {
                    try { listener.target.removeEventListener(listener.type, listener.handler); } catch (_) {}
                    try {
                        if (listener.target.dataset && (listener.type === 'input' || listener.type === 'blur')) {
                            delete listener.target.dataset.aiFrqWired;
                        }
                    } catch (_) {}
                });
                _aiOwnedListeners = [];
            }

            // -- roster capability + grader authentication ------------------
            // The capability is student-specific. Missing identity, a failed
            // fetch, an unknown mode, or a non-canary response all retain the
            // established legacy behavior.
            var _AI_FRQ_CONFIG_TTL_MS = 60000;
            var _AI_FRQ_CONFIG_TIMEOUT_MS = 4000;
            var _aiFrqConfig = { mode: 'off', authoritative: false, pollMs: 2000, at: 0 };
            var _aiFrqConfigFlight = null;
            var _aiFrqConfigAbortController = null;
            var _aiFrqLegacyClientFallback = false;
            function _aiRosterToken() {
                try {
                    return (window.rosterClient && typeof window.rosterClient.token === 'function')
                        ? window.rosterClient.token() : null;
                } catch (_) { return null; }
            }
            function _aiLegacyFrqConfig(mode, at) {
                _aiFrqConfig = { mode: mode || 'off', authoritative: false, pollMs: 2000, at: at || 0 };
                return _aiFrqConfig;
            }
            function _aiLatchLegacyClientFallback() {
                if (_aiFrqLegacyClientFallback) return true;
                if (window.gradebookClient && typeof window.gradebookClient.requestFrqGrade === 'function') return false;
                _aiFrqLegacyClientFallback = true;
                _aiStopFrqPolling();
                try {
                    if (window.console && typeof window.console.warn === 'function') {
                        window.console.warn('[ai-frq] stale gradebook-client.js is missing requestFrqGrade; using the legacy FRQ flow for this page.');
                    }
                } catch (_) {}
                return true;
            }
            function _aiIsAuthoritative() {
                if (_aiFrqConfig.mode !== 'authoritative' || _aiFrqConfig.authoritative !== true) return false;
                return !_aiLatchLegacyClientFallback();
            }
            function _aiDowngradeFrqMode(mode, at) {
                var wasAuthoritative = _aiIsAuthoritative();
                var config = _aiLegacyFrqConfig(mode, at);
                _aiStopFrqPolling();
                if (wasAuthoritative && !_aiDisposed) _aiScheduleAutoGrade(0);
                return config;
            }
            async function _aiFetchFrqConfig(force) {
                if (_aiDisposed) return _aiFrqConfig;
                var now = Date.now();
                if (!force && _aiFrqConfig.at && now - _aiFrqConfig.at < _AI_FRQ_CONFIG_TTL_MS) return _aiFrqConfig;
                if (_aiFrqConfigFlight) return _aiFrqConfigFlight;
                var token = _aiRosterToken();
                var base = window.ROSTER_SERVICE_URL;
                if (!token || !base || typeof fetch !== 'function') return _aiLegacyFrqConfig('off', 0);
                var flight = (async function () {
                    var controller = null;
                    try { controller = typeof AbortController !== 'undefined' ? new AbortController() : null; } catch (_) {}
                    _aiFrqConfigAbortController = controller;
                    var timeoutId = null;
                    try {
                        var timeout = new Promise(function (_, reject) {
                            timeoutId = _aiSetOwnedTimeout(function () {
                                try { if (controller) controller.abort(); } catch (_) {}
                                reject(new Error('frq config timeout'));
                            }, _AI_FRQ_CONFIG_TIMEOUT_MS);
                        });
                        var request = fetch(base + '/ledger/frq-config', {
                            method: 'GET', cache: 'no-store',
                            headers: { 'Authorization': 'Bearer ' + token },
                            signal: controller ? controller.signal : undefined
                        });
                        var res = await Promise.race([request, timeout]);
                        if (_aiDisposed) return _aiFrqConfig;
                        if (!res || !res.ok) return _aiDowngradeFrqMode('off', Date.now());
                        var data = await res.json();
                        if (_aiDisposed) return _aiFrqConfig;
                        var mode = data && typeof data.mode === 'string' ? data.mode : 'off';
                        var pollMs = data && typeof data.pollMs === 'number' && data.pollMs >= 1000
                            ? Math.round(data.pollMs) : 2000;
                        if (mode !== 'authoritative' || !data || data.authoritative !== true) {
                            return _aiDowngradeFrqMode(mode, Date.now());
                        }
                        _aiFrqConfig = {
                            mode: mode,
                            bundleVersion: data.bundleVersion,
                            pollMs: pollMs,
                            authoritative: true,
                            at: Date.now()
                        };
                        _aiIsAuthoritative();
                        return _aiFrqConfig;
                    } catch (_) {
                        return _aiDowngradeFrqMode('off', Date.now());
                    } finally {
                        _aiClearOwnedTimeout(timeoutId);
                        if (_aiFrqConfigAbortController === controller) _aiFrqConfigAbortController = null;
                    }
                })();
                _aiFrqConfigFlight = flight;
                try { return await flight; }
                finally { if (_aiFrqConfigFlight === flight) _aiFrqConfigFlight = null; }
            }
            async function _aiEnsureFrqConfig() {
                if (_aiFrqConfig.at) return _aiFetchFrqConfig(false);
                return _aiFetchFrqConfig(false);
            }
            function _aiInstallGraderBearer() {
                try {
                    var originalFetch = window.fetch;
                    if (typeof originalFetch !== 'function' || originalFetch.__aiRosterBearerWrapped) return;
                    var wrapped = function (input, init) {
                        var url = typeof input === 'string' ? input : (input && input.url ? String(input.url) : '');
                        var token = _aiRosterToken();
                        var isGrade = /\/api\/ai\/(?:grade|grade-batch|grade-worksheet)(?:[?#]|$)/.test(url);
                        if (!token || !isGrade) return originalFetch.apply(this, arguments);
                        var next = {};
                        var source = init || {};
                        for (var key in source) {
                            if (Object.prototype.hasOwnProperty.call(source, key)) next[key] = source[key];
                        }
                        var headers = {};
                        if (typeof Headers !== 'undefined' && source.headers instanceof Headers) {
                            source.headers.forEach(function (value, name) { headers[name] = value; });
                        } else if (Array.isArray(source.headers)) {
                            source.headers.forEach(function (pair) { if (pair && pair.length >= 2) headers[pair[0]] = pair[1]; });
                        } else if (source.headers) {
                            for (var header in source.headers) {
                                if (Object.prototype.hasOwnProperty.call(source.headers, header)) headers[header] = source.headers[header];
                            }
                        }
                        headers.Authorization = 'Bearer ' + token;
                        next.headers = headers;
                        return originalFetch.call(this, input, next);
                    };
                    wrapped.__aiRosterBearerWrapped = true;
                    wrapped.__aiRosterBearerOriginal = originalFetch;
                    window.fetch = wrapped;
                } catch (_) {}
            }
            _aiInstallGraderBearer();

            // -- scenario: unit/lesson for framework grounding ----------------
            function _aiUnitLesson() {
                if (typeof UNIT_ID !== 'undefined' && UNIT_ID) return String(UNIT_ID);
                if (typeof WORKSHEET_ID !== 'undefined' && WORKSHEET_ID) return String(WORKSHEET_ID);
                return '';
            }
            function _aiFindLessonContext() {
                try {
                    for (var k in window) {
                        if (k.indexOf('LESSON_CONTEXT_') === 0 && typeof window[k] === 'string') return window[k];
                    }
                } catch (_) {}
                return '';
            }
            function _aiScenario() {
                var ul = _aiUnitLesson();
                var unit = null, lessons = [];
                var um = /(\d+)/.exec(ul);
                if (um) unit = parseInt(um[1], 10);
                var after = ul.replace(/^[^0-9]*\d+/, '');
                var lm = after.match(/\d+/g);
                if (lm) lessons = lm.map(function (n) { return parseInt(n, 10); });
                return {
                    topic: (document.title || 'Algebra 2 worksheet'),
                    unitLesson: ul,
                    unit: (unit == null || isNaN(unit)) ? null : unit,
                    lessons: lessons,
                    lessonContext: _aiFindLessonContext()
                };
            }

            // -- per-blank question prose (a blank carries no question text).
            //    ~60 blanks across 12 worksheets live in tables / lists / concept
            //    boxes with NO .question ancestor; widen the host to a meaningful
            //    container (and, for a table cell, prepend the row + column labels)
            //    so the AI still gets usable context instead of a bare fragment.
            function _aiExtractQuestion(blank) {
                try {
                    var host = (blank.closest ? (blank.closest('.question')
                        || blank.closest('li, td, th, p, .concept-box, .model-box, .note-box, .step, .question-box')) : null)
                        || blank.parentElement;
                    if (!host) return '';
                    var prefix = '';
                    // Table cell: prepend the row's first cell + the column header so
                    // a numeric/short cell is self-describing (e.g. "Expected | A").
                    try {
                        var cell = blank.closest ? blank.closest('td, th') : null;
                        if (cell) {
                            var row = cell.closest ? cell.closest('tr') : null;
                            var rowLabel = row ? (row.querySelector('th, td') || {}).textContent : '';
                            var table = cell.closest ? cell.closest('table') : null;
                            var headRow = table ? table.querySelector('tr') : null;
                            var colLabel = '';
                            if (headRow && row) {
                                var cells = Array.prototype.slice.call(row.children);
                                var idx = cells.indexOf(cell);
                                var heads = Array.prototype.slice.call(headRow.children);
                                if (idx >= 0 && heads[idx]) colLabel = heads[idx].textContent || '';
                            }
                            var lbl = [String(rowLabel || '').trim(), String(colLabel || '').trim()]
                                .filter(Boolean).join(' / ');
                            if (lbl) prefix = '[' + lbl.replace(/\s+/g, ' ').slice(0, 80) + '] ';
                        }
                    } catch (_) {}
                    var clone = host.cloneNode(true);
                    clone.querySelectorAll('.save-indicator, .restored-badge, .ai-credit-badge, button, .aggregate-btn, .aggregate-trigger')
                        .forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
                    return (prefix + (clone.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 600);
                } catch (_) { return ''; }
            }

            var _AI_BLANK_SCORE = { correct: 1, partial: 0.5, incorrect: 0 };
            function _aiBlankScore(blank) {
                if (typeof checkAnswer !== 'function') return 0;
                var v = checkAnswer(blank);
                return (v in _AI_BLANK_SCORE) ? _AI_BLANK_SCORE[v] : 0;
            }

            function _aiReflectionTextareas() {
                if (typeof _wsReflectionTextareas === 'function') return _wsReflectionTextareas();
                return Array.prototype.slice.call(document.querySelectorAll('textarea[id]'));
            }

            // -- dedup key: every blank + FRQ answer --------------------------
            function _aiHash() {
                var parts = [];
                document.querySelectorAll('.blank').forEach(function (b) {
                    parts.push((b.dataset.questionId || '') + '=' + ((b.value || '').trim()));
                });
                _aiReflectionTextareas().forEach(function (t) {
                    parts.push((t.id || '') + '=' + ((t.value || '').trim()));
                });
                return parts.join('|');
            }

            // -- persisted ledger scores = the FLOOR (so a re-grade can never
            //    write BELOW what is already recorded, even after the student
            //    edits an FRQ — which clears gradingState). Self-fetch via the
            //    existing gradebookClient.fetchPrior; no-ops when not signed in.
            async function _aiFetchPriorScores() {
                try {
                    if (!window.gradebookClient || !window.gradebookClient.fetchPrior) return new Map();
                    var prefix = (typeof gbWsPrefix === 'function') ? gbWsPrefix() : null;
                    if (!prefix) return new Map();
                    var m = await window.gradebookClient.fetchPrior(prefix);
                    return (m && typeof m.get === 'function') ? m : new Map();
                } catch (_) { return new Map(); }
            }
            var _aiPriorScoresPromise = null;
            var _aiPriorScoresCache = null;
            function _aiSharedPriorScores() {
                if (_aiDisposed) return Promise.resolve(new Map());
                if (_aiPriorScoresCache) return Promise.resolve(_aiPriorScoresCache);
                if (_aiPriorScoresPromise) return _aiPriorScoresPromise;
                _aiPriorScoresPromise = _aiFetchPriorScores().then(function (prior) {
                    if (!_aiDisposed) _aiPriorScoresCache = prior;
                    return prior;
                }, function () {
                    var empty = new Map();
                    if (!_aiDisposed) _aiPriorScoresCache = empty;
                    return empty;
                });
                return _aiPriorScoresPromise;
            }
            function _aiLedgerRank(score) {
                if (score === 1) return 2;      // E
                if (score === 0.5) return 1;    // P
                if (score === 0) return 0;      // I
                return -1;                      // no recorded grade
            }

            // -- central FRQ floor: best rank ever recorded for an FRQ item this
            //    session, seeded from the ledger on load. The recordReflectionToGradebook
            //    wrap below consults this so NO FRQ record path (the new pass, the
            //    legacy "Grade My Reflections" button, or an appeal) can ever write
            //    BELOW the recorded grade. itemId = gbWsPrefix + '-' + textareaId.
            var _AI_FRQ_RANK = { I: 0, P: 1, E: 2 };
            var _aiFrqFloor = {};
            function _aiVerdictRank(scoreLetter) {
                var c = (scoreLetter == null) ? '' : String(scoreLetter).trim().charAt(0).toUpperCase();
                return (c in _AI_FRQ_RANK) ? _AI_FRQ_RANK[c] : undefined;
            }
            function _aiFrqItemId(taId) {
                var p = (typeof gbWsPrefix === 'function') ? gbWsPrefix() : null;
                return p ? p + '-' + taId : null;
            }
            function _aiSeedFrqFloor(prior) {
                try {
                    if (!prior || typeof prior.get !== 'function') return;
                    _aiReflectionTextareas().forEach(function (ta) {
                        if (!ta || !ta.id) return;
                        var itemId = _aiFrqItemId(ta.id);
                        if (!itemId) return;
                        var led = prior.get(itemId);
                        if (!led) return;
                        var r = _aiLedgerRank(led.score);
                        if (r > (itemId in _aiFrqFloor ? _aiFrqFloor[itemId] : -1)) _aiFrqFloor[itemId] = r;
                    });
                } catch (_) {}
            }

            // -- apply AI credit to one blank: FORCE full credit (upgrade-only) -
            function _aiRecordBlankFull(blank) {
                if (!window.gradebookClient || !window.gradebookClient.record) return;
                var itemId = blank && blank.dataset ? blank.dataset.questionId : null;
                if (!itemId) return;
                var value = (blank.value || '').trim();
                if (!value) return;
                // Same source/itemId as the verbatim write (WS-...-Q{n}, source
                // 'worksheet') — latest-wins, so this 1.0 supersedes the verbatim
                // score. No new ledger source / no migration.
                window.gradebookClient.record({
                    source: 'worksheet', itemId: itemId,
                    unit: (typeof gbUnitFromItemId === 'function' ? gbUnitFromItemId(itemId) : undefined),
                    response: value, score: 1, attempt: 1
                });
            }
            // UI only: green class + the data-ai-credit flag (+ value) + badge.
            // NO ledger write — used both when the AI grants credit (paired with
            // _aiRecordBlankFull) and when restoring credit from the ledger.
            function _aiApplyCreditUi(blank, reason) {
                try {
                    blank.classList.remove('incorrect', 'partial');
                    blank.classList.add('correct');
                    blank.dataset.aiCredit = '1';
                    blank.dataset.aiCreditValue = (blank.value || '').trim();
                    var label = '✨ AI-accepted' + (reason ? ': ' + reason : '');
                    var sib = blank.nextSibling;
                    if (sib && sib.nodeType === 1 && sib.className === 'ai-credit-badge') {
                        sib.textContent = label; return;
                    }
                    if (!blank.parentNode) return;
                    var b = document.createElement('span');
                    b.className = 'ai-credit-badge';
                    b.textContent = label;
                    b.style.cssText = 'display:inline-block;margin-left:6px;padding:1px 6px;' +
                        'font-size:0.75em;background:#e8f5e9;border:1px solid #66bb6a;' +
                        'border-radius:4px;color:#2e7d32;';
                    blank.parentNode.insertBefore(b, blank.nextSibling);
                } catch (_) {}
            }
            function _aiApplyBlankCredit(blank, reason) {
                _aiApplyCreditUi(blank, reason);
                _aiRecordBlankFull(blank);         // upgrade-only: writes score 1
            }
            // Re-assert AI greens after a verbatim "Check Answers" wipes them.
            // Drops the credit if the student edited the blank since it was earned.
            function _aiReassertCredits() {
                try {
                    document.querySelectorAll('.blank[data-ai-credit="1"]').forEach(function (b) {
                        var val = (b.value || '').trim();
                        if (val && val === (b.dataset.aiCreditValue || '')) {
                            b.classList.remove('incorrect', 'partial');
                            b.classList.add('correct');
                        } else {
                            delete b.dataset.aiCredit;
                            var sib = b.nextSibling;
                            if (sib && sib.nodeType === 1 && sib.className === 'ai-credit-badge' && sib.parentNode) {
                                sib.parentNode.removeChild(sib);
                            }
                        }
                    });
                } catch (_) {}
            }
            // After a RELOAD the DOM is fresh: hydration re-fills an AI-credited
            // blank from the ledger and checkAnswer repaints it RED (verbatim ≠
            // key), and the data-ai-credit flag is gone — so a stray blur would
            // clobber the persisted 1.0. Re-establish the AI-credit flag + green
            // from the ledger: a filled blank whose LEDGER score is 1 but whose
            // VERBATIM verdict is not 'correct' was AI-credited. No re-record —
            // the ledger already holds 1.0; this only restores the UI + the flag
            // that the recordBlankToGradebook wrap relies on.
            async function _aiRestoreBlankCredits() {
                try {
                    var prior = await _aiFetchPriorScores();
                    if (!prior || typeof prior.get !== 'function' || !prior.size) return;
                    document.querySelectorAll('.blank[data-question-id]').forEach(function (b) {
                        try {
                            if (b.dataset.aiCredit === '1') return;          // already flagged
                            var val = (b.value || '').trim();
                            if (!val) return;
                            var led = prior.get(b.dataset.questionId);
                            if (!led || led.score !== 1) return;             // ledger isn't full credit
                            if (String(led.response || '').trim() !== val) return; // value changed since
                            var verdict = (typeof checkAnswer === 'function') ? checkAnswer(b) : null;
                            if (verdict === 'correct') return;               // verbatim-correct, not AI credit
                            _aiApplyCreditUi(b, '');                         // restore green + flag, NO re-record
                        } catch (_) {}
                    });
                } catch (_) {}
            }

            // -- FRQ fold: re-grade ungraded/changed reflections, UPGRADE ONLY.
            //    The recordReflectionToGradebook wrap enforces the persisted
            //    ledger floor, so this can never write below the recorded grade
            //    even after an edit clears gradingState. Extra guards here:
            //    in-session floor, per-text dedup (no wasted re-calls), and — on
            //    the AUTO (Done) path — never PERSIST a fresh "I" for an FRQ the
            //    student never asked to grade (manual still records everything).
            function _aiRememberFrqText(taId, answer) {
                if (typeof gradingState === 'undefined' || !gradingState) return;
                var keep = gradingState.get(taId) || {};
                keep.originalAnswer = answer;          // so the next pass dedups
                gradingState.set(taId, keep);
            }
            // Returns the number of FRQs whose grade was RAISED (for the toast).
            // Uniform grader: most worksheets expose a global gradeReflection(id, text);
            // the inline-grader worksheets (u3_lesson6-7) expose a ReflectionGrader
            // instance instead — same call shape, same {score, feedback, matched, missing}.
            function _aiGraderFn() {
                if (typeof gradeReflection === 'function') return gradeReflection;
                try {
                    var inst = (typeof reflectionGrader !== 'undefined' && reflectionGrader) ? reflectionGrader
                        : (window.reflectionGrader || null);
                    if (inst && typeof inst.gradeReflection === 'function') return inst.gradeReflection.bind(inst);
                } catch (_) {}
                return null;
            }
            // -- BATCH grading (2026-08-19): one model call for all reflections
            //    (POST /api/ai/grade-batch) when the page's own prompt builder is
            //    discoverable — window.buildReflectionPrompt<SUFFIX> + LESSON_CONTEXT_<SUFFIX>
            //    + the 'topic' string inside the page's gradeReflection. Otherwise the
            //    per-item path below runs unchanged. Results are cached per (id, answer)
            //    and consumed by the per-item loop, so every guard stays in one place.
            function _aiBatchBits() {
                try {
                    if (!window.RAILWAY_SERVER_URL || typeof fetch !== 'function') return null;
                    var builderKey = null, ctxKey = null, topic = null;
                    var keys = Object.keys(window);
                    for (var i = 0; i < keys.length; i++) {
                        if (/^buildReflectionPrompt[A-Za-z0-9_]*$/.test(keys[i]) && typeof window[keys[i]] === 'function') { if (builderKey) return null; builderKey = keys[i]; }
                        if (/^LESSON_CONTEXT_[A-Za-z0-9_]+$/.test(keys[i])) { if (ctxKey) return null; ctxKey = keys[i]; }
                    }
                    if (!builderKey) return null;
                    if (typeof gradeReflection === 'function') {
                        var m = /topic:\s*'([^']*)'/.exec(String(gradeReflection));
                        if (m) topic = m[1];
                    }
                    if (!topic) return null;
                    return { builder: window[builderKey], lessonContext: ctxKey ? window[ctxKey] : undefined, topic: topic };
                } catch (_) { return null; }
            }
            var _aiBatchCache = {};   // id → { answer, result }
            async function _aiBatchGrade(items) {
                var bits = _aiBatchBits();
                if (!bits || !items || items.length < 2) return false;
                var payload = [];
                for (var i = 0; i < items.length; i++) {
                    var prompt = null;
                    try { prompt = bits.builder(items[i].id, items[i].answer); } catch (_) { prompt = null; }
                    if (!prompt) return false;   // any unbuildable prompt → per-item path for all
                    payload.push({ questionId: items[i].id, prompt: prompt, answer: items[i].answer });
                }
                try {
                    var r = await fetch(window.RAILWAY_SERVER_URL + '/api/ai/grade-batch', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scenario: { topic: bits.topic, lessonContext: bits.lessonContext }, items: payload })
                    });
                    if (!r.ok) return false;
                    var j = await r.json();
                    var results = (j && j.results) || {};
                    var got = 0;
                    for (var k = 0; k < items.length; k++) {
                        var res = results[items[k].id];
                        if (res && !res.error && _aiVerdictRank(res.score) !== undefined) { _aiBatchCache[items[k].id] = { answer: items[k].answer, result: res }; got++; }
                    }
                    return got > 0;
                } catch (_) { return false; }
            }
            async function _aiGradeFrqs(manual) {
                await _aiEnsureFrqConfig();
                if (_aiIsAuthoritative()) {
                    await _aiRequestAllFrqGrades(!!manual);
                    return 0;
                }
                if (!_aiGraderFn()) return 0;   // no grader available on this worksheet
                var refs = _aiReflectionTextareas();
                var gradable = refs.filter(function (ta) {
                    return ta && ta.id && (ta.value || '').trim().length >= 20;
                });
                if (!gradable.length) return 0;
                var prior = await _aiFetchPriorScores();             // the persisted floor
                _aiSeedFrqFloor(prior);
                var upgrades = 0;
                // Pre-pass: which of these actually need a grader call (same dedup
                // rule as the loop) → one batch call, results cached for the loop.
                var candidates = [];
                for (var c = 0; c < gradable.length; c++) {
                    var cta = gradable[c];
                    var cAnswer = (cta.value || '').trim();
                    var cPrev = (typeof gradingState !== 'undefined' && gradingState) ? gradingState.get(cta.id) : null;
                    if (cPrev && cPrev.result && cPrev.result.score && (cPrev.originalAnswer || '').trim() === cAnswer) continue;
                    candidates.push({ id: cta.id, answer: cAnswer });
                }
                if (candidates.length >= 2) {
                    for (var b = 0; b < candidates.length; b++) _aiShowWaiting(candidates[b].id);
                    try { await _aiBatchGrade(candidates); } catch (_) {}
                }
                for (var i = 0; i < gradable.length; i++) {
                    var ta = gradable[i];
                    var answer = (ta.value || '').trim();
                    var prev = (typeof gradingState !== 'undefined' && gradingState) ? gradingState.get(ta.id) : null;
                    // Dedup: already graded THIS exact answer → skip (no re-call).
                    if (prev && prev.result && prev.result.score && (prev.originalAnswer || '').trim() === answer) continue;
                    var itemId = _aiFrqItemId(ta.id);
                    // floor = max(in-session grade, persisted ledger grade).
                    var prevScore = (prev && prev.result && prev.result.score) ? prev.result.score : null;
                    var floor = (prevScore && _AI_FRQ_RANK[prevScore] !== undefined) ? _AI_FRQ_RANK[prevScore] : -1;
                    if (itemId && (itemId in _aiFrqFloor)) floor = Math.max(floor, _aiFrqFloor[itemId]);
                    _aiShowWaiting(ta.id);
                    try {
                        var cached = _aiBatchCache[ta.id];
                        var result = (cached && cached.answer === answer) ? cached.result : null;
                        if (cached) delete _aiBatchCache[ta.id];
                        if (!result) result = await _aiGradeWithRetry(ta.id, answer);
                        if (!result || !result.score) {
                            _aiRememberUngraded(ta.id, true);
                            _aiClearWaiting(ta.id, '⚠️ Couldn’t reach the grader — saved; it will be graded automatically (we retry, and a background check runs every hour).');
                            continue;
                        }
                        _aiClearWaiting(ta.id);
                        // Stale verdict: the student kept typing while we waited. Do not
                        // show or record a grade for text that no longer exists; a
                        // trailing pass will grade the current text.
                        if ((ta.value || '').trim() !== answer) { _aiClearWaiting(ta.id); _aiScheduleAutoGrade(1500); continue; }
                        _aiRememberUngraded(ta.id, false);
                        // The worksheet's "enriched pass" rule: a P with nothing
                        // missing is really an E.
                        if (result.score === 'P' && Array.isArray(result.missing) && result.missing.length === 0) {
                            result = Object.assign({}, result, { score: 'E', feedback: 'Nice work — you covered the key ideas.' });
                        }
                        // POLISH (manual only): a close-P answer gets rewritten into
                        // a full-credit E with the missing pieces highlighted for the
                        // student's notes — the old "Grade My Reflections" nicety,
                        // now folded into the one button. Only when E would actually
                        // raise the grade (floor below E) and the helpers exist.
                        if (manual && result.score === 'P' && floor < 2 &&
                            typeof fetchEnrichedAnswer === 'function' && typeof renderEnrichedPass === 'function') {
                            var matchedCount = (result.matched || []).length;
                            var missingCount = (result.missing || []).length;
                            var hitRate = (matchedCount + missingCount) > 0 ? matchedCount / (matchedCount + missingCount) : 0;
                            if (hitRate >= 0.3 && missingCount > 0) {
                                try {
                                    var enriched = await fetchEnrichedAnswer(ta.id, answer, result.missing);
                                    if (enriched && enriched.score === 'E' && enriched.suggestion) {
                                        if (typeof gradingState !== 'undefined' && gradingState) {
                                            gradingState.set(ta.id, {
                                                result: Object.assign({}, result, { score: 'E' }), originalAnswer: answer,
                                                appealCount: prev ? prev.appealCount : 0, history: prev ? (prev.history || []) : []
                                            });
                                        }
                                        renderEnrichedPass(ta.id, enriched);
                                        if (typeof recordReflectionToGradebook === 'function') recordReflectionToGradebook(ta.id, answer, 'E');
                                        upgrades++;
                                        continue;
                                    }
                                } catch (_) { /* polish is best-effort; fall through to the plain grade */ }
                            }
                        }
                        var newRank = _aiVerdictRank(result.score);
                        if (newRank === undefined) continue;
                        if (newRank <= floor) { _aiRememberFrqText(ta.id, answer); continue; }   // never downgrade; remember text so we don't re-call
                        // 2026-08-19 (FRQ coverage): a FIRST-EVER "I" IS persisted on
                        // the auto path too. Every FRQ record path is floored (a later
                        // pass can only RAISE), so recording it is grade-safe — while
                        // not recording it left the row ungraded (score null) forever:
                        // 44% of all worksheet FRQ rows in the 2026-08-17 snapshot.
                        if (typeof gradingState !== 'undefined' && gradingState) {
                            gradingState.set(ta.id, {
                                result: result, originalAnswer: answer,
                                appealCount: prev ? prev.appealCount : 0,
                                history: prev ? (prev.history || []) : []
                            });
                        }
                        if (typeof showFeedback === 'function') showFeedback(ta.id, result);
                        if (typeof recordReflectionToGradebook === 'function') recordReflectionToGradebook(ta.id, answer, result.score);
                        if (floor >= 0) upgrades++;   // an actual RAISE over a prior grade (not a first-ever grade)
                    } catch (_) { _aiClearWaiting(ta.id, '⚠️ Grading hit an error — saved; it will be retried automatically.'); }
                }
                return upgrades;
            }

            // -- UI: button busy state + toast -------------------------------
            // -- honest wait status (2026-08-19): the grader is a shared queue; while a
            //    reflection waits, show "Queued · N ahead · ~Xs" / "Grading…" under it
            //    (from the server's /api/ai/status estimatedWaitMs), so a 30–60 s wait
            //    during class reads as expected, not broken. Removed when the verdict
            //    (or a failure note) lands.
            var _aiEtaCache = { at: 0, waitMs: null, ahead: 0 };
            async function _aiFetchEta() {
                try {
                    if (!window.RAILWAY_SERVER_URL || typeof fetch !== 'function') return null;
                    if (Date.now() - _aiEtaCache.at < 4000) return _aiEtaCache;
                    var r = await fetch(window.RAILWAY_SERVER_URL + '/api/ai/status', { cache: 'no-store' });
                    if (!r.ok) return null;
                    var j = await r.json();
                    var q = (j && j.queue) || {};
                    _aiEtaCache = {
                        at: Date.now(),
                        waitMs: (typeof q.estimatedWaitMs === 'number') ? q.estimatedWaitMs : null,
                        ahead: ((q.queueLength || 0) + (q.inFlight || 0))
                    };
                    return _aiEtaCache;
                } catch (_) { return null; }
            }
            function _aiEtaText(eta) {
                if (!eta || eta.waitMs == null) return 'Grading…';
                var s = Math.max(3, Math.round(eta.waitMs / 1000));
                var ahead = eta.ahead > 0 ? (eta.ahead + ' ahead · ') : '';
                return (eta.ahead > 0 ? 'Queued · ' : 'Grading… ') + ahead + '~' + s + ' s';
            }
            function _aiStatusEl(taId, create) {
                var ta = document.getElementById(taId);
                if (!ta) return null;
                var id = taId + '-ai-status';
                var el = document.getElementById(id);
                if (!el && create) {
                    el = document.createElement('div');
                    el.id = id;
                    el.className = 'ai-wait-status';
                    el.setAttribute('aria-live', 'off');
                    el.style.cssText = 'font-size:12px;color:#555;margin:4px 0 2px;display:flex;gap:6px;align-items:center';
                    ta.insertAdjacentElement('afterend', el);
                }
                return el;
            }
            var _aiStatusTimers = {};
            function _aiShowWaiting(taId) {
                var el = _aiStatusEl(taId, true);
                if (!el) return;
                function paint(eta) { el.textContent = '⏳ ' + _aiEtaText(eta); }
                paint(_aiEtaCache.waitMs != null ? _aiEtaCache : null);
                _aiFetchEta().then(paint).catch(function () {});
                if (_aiStatusTimers[taId]) clearInterval(_aiStatusTimers[taId]);
                _aiStatusTimers[taId] = setInterval(function () {
                    _aiFetchEta().then(function (eta) { if (eta) paint(eta); }).catch(function () {});
                }, 5000);
            }
            function _aiClearWaiting(taId, note) {
                if (_aiStatusTimers[taId]) { clearInterval(_aiStatusTimers[taId]); delete _aiStatusTimers[taId]; }
                var el = _aiStatusEl(taId, false);
                if (!el) return;
                if (note) { el.textContent = note; return; }
                try { el.remove(); } catch (_) {}
            }

            // -- authoritative FRQ tickets, status polling, and rendering ----
            var _AI_FRQ_POLL_MAX_MS = 120000;
            var _AI_FRQ_LOCAL_COPY = 'Saved on this device · waiting for a connection to queue grading.';
            var _AI_FRQ_UNSAVED_COPY = '⚠ Not saved — check your connection';
            var _aiFrqStates = {};
            var _aiFrqPollTimer = null;
            var _aiFrqPollStartedAt = 0;
            var _aiFrqPollInFlight = false;
            var _aiFrqPollBackoffMs = 0;
            var _aiFrqRenderedGrade = {};
            var _aiFrqAwayShown = {};
            var _aiFrqAnnouncedGrade = {};
            var _aiFrqTerminalReconciled = {};
            var _aiFrqSessionStartedAt = Date.now();

            function _aiFrqTextareaId(itemId) {
                var prefix = (typeof gbWsPrefix === 'function') ? gbWsPrefix() : '';
                var lead = prefix ? prefix + '-' : '';
                return lead && String(itemId).indexOf(lead) === 0 ? String(itemId).slice(lead.length) : null;
            }
            function _aiFrqTextarea(itemId) {
                var taId = _aiFrqTextareaId(itemId);
                return taId ? document.getElementById(taId) : null;
            }
            function _aiFrqVisible(itemId) {
                var ta = _aiFrqTextarea(itemId);
                if (!ta || ta.hidden || ta.getAttribute('aria-hidden') === 'true') return false;
                try {
                    var style = window.getComputedStyle ? window.getComputedStyle(ta) : null;
                    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
                } catch (_) {}
                return true;
            }
            function _aiFrqPending(status) {
                return status === 'local-only' || status === 'draft' || status === 'queued'
                    || status === 'grading' || status === 'retrying'
                    || status === 'appeal-queued' || status === 'appeal-grading';
            }
            function _aiHasVisibleFrqPending() {
                var ids = Object.keys(_aiFrqStates);
                for (var i = 0; i < ids.length; i++) {
                    if (_aiFrqPending(_aiFrqStates[ids[i]] && _aiFrqStates[ids[i]].status)
                        && _aiFrqVisible(ids[i])) return true;
                }
                return false;
            }
            function _aiSetFrqStatusText(taId, text, state, announce, etaText, announcementKey) {
                if (_aiStatusTimers[taId]) { clearInterval(_aiStatusTimers[taId]); delete _aiStatusTimers[taId]; }
                var el = _aiStatusEl(taId, true);
                if (!el) return null;
                var nextState = state || '';
                var nextText = String(text || '');
                var nextEta = String(etaText || '');
                var nextAnnouncement = announcementKey || '';
                if (nextState !== 'graded' && nextState !== 'graded-away' && nextState !== 'already-graded-edited') {
                    _aiRemoveFrqAppealControl(taId);
                }
                if (el.dataset.frqState === nextState && el.dataset.frqText === nextText
                    && el.dataset.frqEta === nextEta && el.dataset.frqAnnouncement === nextAnnouncement) return el;
                var copy = el.querySelector('.ai-status-copy');
                var eta = el.querySelector('.ai-status-eta');
                if (!copy || !eta) {
                    el.textContent = '';
                    copy = document.createElement('span');
                    copy.className = 'ai-status-copy';
                    eta = document.createElement('span');
                    eta.className = 'ai-status-eta';
                    eta.setAttribute('aria-live', 'off');
                    el.appendChild(copy);
                    el.appendChild(eta);
                }
                copy.setAttribute('aria-live', announce ? 'assertive' : 'off');
                copy.setAttribute('aria-atomic', 'true');
                if (copy.textContent !== nextText || (announce && el.dataset.frqAnnouncement !== nextAnnouncement)) {
                    copy.textContent = nextText;
                }
                if (eta.textContent !== nextEta) eta.textContent = nextEta;
                el.dataset.frqState = state || '';
                el.dataset.frqText = nextText;
                el.dataset.frqEta = nextEta;
                el.dataset.frqAnnouncement = nextAnnouncement;
                return el;
            }
            function _aiRenderFrqConnection(taId) {
                return _aiSetFrqStatusText(taId, _AI_FRQ_LOCAL_COPY, 'local-only');
            }
            function _aiRenderFrqUnsaved(taId) {
                return _aiSetFrqStatusText(taId, _AI_FRQ_UNSAVED_COPY, 'unsaved');
            }
            function _aiFrqEtaSeconds(item) {
                return item && typeof item.estimatedWaitMs === 'number' && item.estimatedWaitMs >= 0
                    ? Math.max(1, Math.round(item.estimatedWaitMs / 1000)) : null;
            }
            function _aiFrqRetryTime(value) {
                try {
                    var date = new Date(value);
                    if (!isFinite(date.getTime())) return String(value || 'soon');
                    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                } catch (_) { return String(value || 'soon'); }
            }
            function _aiFrqScoreLetter(item) {
                var score = item && typeof item.score === 'number' ? item.score
                    : (item && item.result && typeof item.result.score === 'number' ? item.result.score : null);
                return score === 1 ? 'E' : (score === 0.5 ? 'P' : (score === 0 ? 'I' : null));
            }
            function _aiFrqScoreName(letter) {
                return letter === 'E' ? 'Essentially Correct' : (letter === 'P' ? 'Partially Correct' : 'Incorrect');
            }
            function _aiRightRotate(value, amount) {
                return (value >>> amount) | (value << (32 - amount));
            }
            function _aiSha256Fallback(text) {
                var encoded;
                try { encoded = unescape(encodeURIComponent(String(text))); } catch (_) { return null; }
                var bytes = [], i, j;
                for (i = 0; i < encoded.length; i++) bytes.push(encoded.charCodeAt(i));
                var bitLength = bytes.length * 8;
                bytes.push(128);
                while (bytes.length % 64 !== 56) bytes.push(0);
                for (i = 7; i >= 0; i--) bytes.push(Math.floor(bitLength / Math.pow(256, i)) & 255);
                var h = [1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225];
                var k = [1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,
                    3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,
                    3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,
                    2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,
                    666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,
                    2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,
                    430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,
                    1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];
                for (i = 0; i < bytes.length; i += 64) {
                    var w = new Array(64);
                    for (j = 0; j < 16; j++) {
                        var p = i + j * 4;
                        w[j] = ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
                    }
                    for (j = 16; j < 64; j++) {
                        var s0 = (_aiRightRotate(w[j - 15], 7) ^ _aiRightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3)) >>> 0;
                        var s1 = (_aiRightRotate(w[j - 2], 17) ^ _aiRightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10)) >>> 0;
                        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
                    }
                    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
                    for (j = 0; j < 64; j++) {
                        var upper = (_aiRightRotate(e, 6) ^ _aiRightRotate(e, 11) ^ _aiRightRotate(e, 25)) >>> 0;
                        var choose = ((e & f) ^ ((~e) & g)) >>> 0;
                        var t1 = (hh + upper + choose + k[j] + w[j]) >>> 0;
                        var lower = (_aiRightRotate(a, 2) ^ _aiRightRotate(a, 13) ^ _aiRightRotate(a, 22)) >>> 0;
                        var majority = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
                        var t2 = (lower + majority) >>> 0;
                        hh = g; g = f; f = e; e = (d + t1) >>> 0;
                        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
                    }
                    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0;
                    h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
                    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0;
                    h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
                }
                return h.map(function (word) { return ('00000000' + word.toString(16)).slice(-8); }).join('');
            }
            async function _aiSha256Hex(text) {
                var value = String(text == null ? '' : text).trim();
                try {
                    if (window.crypto && window.crypto.subtle && typeof TextEncoder !== 'undefined') {
                        var bytes = new TextEncoder().encode(value);
                        var digest = await window.crypto.subtle.digest('SHA-256', bytes);
                        return Array.prototype.map.call(new Uint8Array(digest), function (b) {
                            return ('0' + b.toString(16)).slice(-2);
                        }).join('');
                    }
                } catch (_) {}
                return _aiSha256Fallback(value);
            }
            function _aiClearAuthoritativeVerdict(taId) {
                try {
                    var ta = document.getElementById(taId);
                    if (ta) ta.classList.remove('graded-E', 'graded-P', 'graded-I');
                    var feedback = document.getElementById(taId + '-feedback');
                    if (feedback) feedback.innerHTML = '';
                    if (typeof gradingState !== 'undefined' && gradingState) gradingState.delete(taId);
                } catch (_) {}
            }
            function _aiStoredFrqResult(item) {
                var letter = _aiFrqScoreLetter(item);
                if (!letter || !item || !item.result || typeof item.result !== 'object') return null;
                var result = { score: letter };
                ['feedback', 'suggestion'].forEach(function (field) {
                    if (typeof item.result[field] === 'string') result[field] = item.result[field];
                });
                ['matched', 'missing'].forEach(function (field) {
                    if (Array.isArray(item.result[field])) result[field] = item.result[field].slice();
                });
                if (item.result.revisedTextUsed === true) result.revisedTextUsed = true;
                return result;
            }
            var _AI_FRQ_APPEAL_LIMIT = 3;
            function _aiFrqAppealCount(item) {
                var count = Number(item && item.appealCount);
                return isFinite(count) && count >= 0 ? count : 0;
            }
            function _aiFrqAppealLimit(item) {
                var limit = Number(item && item.appealLimit);
                return isFinite(limit) && limit === _AI_FRQ_APPEAL_LIMIT
                    ? limit : _AI_FRQ_APPEAL_LIMIT;
            }
            function _aiFrqAppealExhausted(item) {
                if (!item || item.appealCount === undefined || item.appealCount === null) return false;
                var count = Number(item.appealCount);
                return isFinite(count) && count >= _aiFrqAppealLimit(item);
            }
            function _aiFrqAppealAllowed(item) {
                return _aiFrqScoreLetter(item) !== 'E'
                    && !_aiFrqAppealExhausted(item);
            }
            function _aiFrqAppealErrorCopy(reason) {
                var copies = {
                    limit: "You've used all 3 appeals for this question.",
                    cooldown: 'Please wait a minute before submitting another appeal.',
                    'already-pending': 'This appeal is already pending review.',
                    duplicate: 'This appeal is already pending review.',
                    not_graded: 'This response must be graded before you can appeal it.',
                    not_found: "We couldn't find this graded response. Refresh the page and try again."
                };
                return copies[reason] || String(reason || _AI_FRQ_LOCAL_COPY);
            }
            function _aiFrqAppealForm(taId) {
                return document.getElementById('appeal-form-' + taId)
                    || document.getElementById('appealForm-' + taId);
            }
            function _aiRenderFrqLastAppeal(taId, item) {
                var id = taId + '-frq-last-appeal';
                var existing = document.getElementById(id);
                var appeal = item && item.lastAppeal;
                var valid = appeal
                    && typeof appeal.text === 'string'
                    && typeof appeal.at === 'string'
                    && (appeal.outcome === 'raised' || appeal.outcome === 'maintained');
                if (!valid) {
                    if (existing) existing.remove();
                    return;
                }

                var form = _aiFrqAppealForm(taId);
                var section = form && form.closest ? form.closest('.appeal-section') : null;
                var feedback = document.getElementById(taId + '-feedback');
                var status = _aiStatusEl(taId, true);
                var host = section || feedback || (status && status.parentNode);
                if (!host) return;
                if (!existing) {
                    existing = document.createElement('p');
                    existing.id = id;
                    existing.setAttribute('role', 'status');
                }
                existing.className = 'appeal-result ' + appeal.outcome + ' ai-frq-last-appeal';
                var parsedAt = Date.parse(appeal.at);
                var date = isFinite(parsedAt)
                    ? new Date(parsedAt).toLocaleDateString()
                    : appeal.at;
                existing.textContent = 'Your last appeal (' + date + '): '
                    + appeal.text + ' — ' + appeal.outcome;
                if (existing.parentNode !== host) host.appendChild(existing);
            }
            function _aiRemoveFrqAppealControl(taId) {
                var status = _aiStatusEl(taId, false);
                var control = status && status.querySelector('.ai-frq-appeal-control');
                if (control) {
                    try { control.remove(); } catch (_) {
                        if (control.parentNode) control.parentNode.removeChild(control);
                    }
                }
            }
            function _aiSyncFrqAppealCount(form, item) {
                if (!form) return;
                var section = form.closest ? form.closest('.appeal-section') : null;
                var count = section ? section.querySelector('.appeal-count') : form.querySelector('.appeal-count');
                if (_aiFrqAppealExhausted(item)) {
                    var lastAppeal = section && section.querySelector('.ai-frq-last-appeal');
                    if (lastAppeal) {
                        Array.prototype.forEach.call(
                            section.querySelectorAll('.appeal-btn, .appeal-form, .appeal-count'),
                            function (control) { control.remove(); }
                        );
                        return;
                    }
                    var exhaustedUi = section || count;
                    if (exhaustedUi) {
                        try { exhaustedUi.remove(); } catch (_) {
                            if (exhaustedUi.parentNode) exhaustedUi.parentNode.removeChild(exhaustedUi);
                        }
                    }
                    return;
                }
                if (!count) return;
                count.textContent = 'Appeals used: ' + _aiFrqAppealCount(item)
                    + '/' + _aiFrqAppealLimit(item);
            }
            function _aiDisableFrqAppealForm(taId) {
                var form = _aiFrqAppealForm(taId);
                if (!form) return;
                Array.prototype.forEach.call(
                    form.querySelectorAll('button, input, textarea'),
                    function (control) { control.disabled = true; }
                );
            }
            function _aiShowRevisedAppealNotice(taId, item, form) {
                if (!form) return;
                var notice = form.querySelector('.ai-frq-revised-appeal-notice');
                if (!notice) {
                    notice = document.createElement('p');
                    notice.className = 'ai-frq-revised-appeal-notice';
                    notice.hidden = true;
                    notice.textContent = 'Your revised answer will be included.';
                    form.insertBefore(notice, form.firstChild);
                }
                var textarea = document.getElementById(taId);
                var currentText = String((textarea && textarea.value) || '').trim();
                var storedHash = item && item.responseHash;
                if (!storedHash) { notice.hidden = true; return; }
                _aiSha256Hex(currentText).then(function (currentHash) {
                    notice.hidden = !currentHash || currentHash === String(storedHash).toLowerCase();
                }).catch(function () { notice.hidden = true; });
            }
            var _aiAuthoritativeAppealClickHandler = null;
            function _aiInstallAuthoritativeAppealDelegation() {
                if (_aiAuthoritativeAppealClickHandler) return;
                _aiAuthoritativeAppealClickHandler = function (event) {
                    if (!_aiIsAuthoritative()) return;
                    var target = event && event.target;
                    if (!target || typeof target.closest !== 'function') return;
                    var submit = target.closest('.btn-check, button[type="submit"], input[type="submit"]');
                    if (!submit) return;
                    var form = submit.closest('[id^="appeal-form-"], [id^="appealForm-"]');
                    if (!form) return;
                    var formId = String(form.id || '');
                    var taId = '';
                    if (formId.indexOf('appeal-form-') === 0) {
                        taId = formId.slice('appeal-form-'.length);
                    } else if (formId.indexOf('appealForm-') === 0) {
                        taId = formId.slice('appealForm-'.length);
                    }
                    if (!taId) return;
                    event.preventDefault();
                    event.stopPropagation();
                    _aiSubmitAuthoritativeAppeal(taId);
                };
                document.addEventListener('click', _aiAuthoritativeAppealClickHandler, true);
            }
            function _aiOpenExistingFrqAppealForm(taId, item, control) {
                var form = _aiFrqAppealForm(taId);
                var materialized = false;
                if (!form) {
                    var result = _aiStoredFrqResult(item);
                    if (!result && item && typeof item.score === 'number' && isFinite(item.score)) {
                        result = {
                            score: _aiFrqScoreLetter(item) || 'I',
                            feedback: '',
                            matched: [],
                            missing: []
                        };
                    }
                    var canSeedState = typeof gradingState !== 'undefined' && gradingState
                        && typeof gradingState.get === 'function' && typeof gradingState.set === 'function';
                    var previousState = canSeedState ? gradingState.get(taId) : null;
                    var hadState = canSeedState && typeof gradingState.has === 'function' && gradingState.has(taId);
                    try {
                        if (canSeedState && result) {
                            gradingState.set(taId, {
                                result: result,
                                originalAnswer: String((document.getElementById(taId) || {}).value || ''),
                                appealCount: _aiFrqAppealCount(item),
                                history: previousState ? (previousState.history || []) : []
                            });
                        }
                        if (result && typeof showFeedback === 'function') showFeedback(taId, result);
                        form = _aiFrqAppealForm(taId);
                        materialized = !!form;
                    } catch (_) {
                        form = _aiFrqAppealForm(taId);
                        materialized = !!form;
                    } finally {
                        if (canSeedState) {
                            if (hadState) gradingState.set(taId, previousState);
                            else if (typeof gradingState.delete === 'function') gradingState.delete(taId);
                        }
                    }
                }
                if (!form) {
                    try {
                        var status = _aiStatusEl(taId, false);
                        if (status && status.parentNode) {
                            form = document.createElement('div');
                            form.id = 'appeal-form-' + taId;
                            form.className = 'appeal-form';

                            var prompt = document.createElement('p');
                            prompt.textContent = 'Explain why your answer deserves a higher score:';

                            var fallbackText = document.createElement('textarea');
                            fallbackText.id = 'appeal-text-' + taId;
                            fallbackText.rows = 3;
                            fallbackText.setAttribute('aria-label', 'Appeal explanation');

                            var submit = document.createElement('button');
                            submit.type = 'button';
                            submit.className = 'btn-check';
                            submit.textContent = 'Submit Appeal';

                            form.appendChild(prompt);
                            form.appendChild(fallbackText);
                            form.appendChild(submit);
                            var count = document.createElement('div');
                            count.className = 'appeal-count';
                            form.appendChild(count);
                            status.parentNode.insertBefore(form, status.nextSibling);
                            materialized = true;
                        }
                    } catch (_) {
                        form = null;
                    }
                }
                if (!form) {
                    var errorHost = document.getElementById(taId + '-feedback');
                    if (!errorHost) {
                        try {
                            errorHost = document.createElement('div');
                            errorHost.id = taId + '-feedback';
                            var errorStatus = _aiStatusEl(taId, false);
                            if (errorStatus) errorStatus.appendChild(errorHost);
                        } catch (_) {}
                    }
                    _aiAppealMessage(taId, 'Could not open the appeal form — reload the page and try again.', true);
                    return false;
                }
                if (materialized) {
                    var feedback = document.getElementById(taId + '-feedback');
                    var appealUi = form.closest ? form.closest('.appeal-section') : form;
                    if (feedback && appealUi && feedback.contains(appealUi)) {
                        feedback.innerHTML = '';
                        feedback.appendChild(appealUi);
                    }
                    var ta = document.getElementById(taId);
                    if (ta) ta.classList.remove('graded-E', 'graded-P', 'graded-I');
                }
                var text = form.querySelector('textarea')
                    || document.getElementById('appeal-text-' + taId)
                    || document.getElementById('appealText-' + taId);
                if (text) text.value = '';
                _aiRenderFrqLastAppeal(taId, item);
                _aiSyncFrqAppealCount(form, item);
                _aiShowRevisedAppealNotice(taId, item, form);
                form.classList.add('visible');
                if (control) control.setAttribute('aria-expanded', 'true');
                try { if (text) text.focus(); } catch (_) {}
                return true;
            }
            function _aiEnsureFrqAppealControl(taId, item) {
                if (!_aiFrqAppealAllowed(item)) {
                    _aiRemoveFrqAppealControl(taId);
                    return null;
                }
                var status = _aiStatusEl(taId, true);
                if (!status) return null;
                var control = status.querySelector('.ai-frq-appeal-control');
                if (!control) {
                    control = document.createElement('input');
                    control.type = 'button';
                    control.className = 'appeal-btn ai-frq-appeal-control';
                    control.value = 'Appeal this grade…';
                    control.setAttribute('aria-label', 'Appeal this grade');
                    control.setAttribute('aria-expanded', 'false');
                    control.onclick = function () {
                        _aiOpenExistingFrqAppealForm(taId, control.__aiFrqAppealItem, control);
                    };
                    status.appendChild(control);
                }
                control.__aiFrqAppealItem = item;
                return control;
            }
            function _aiRenderStoredFrqResult(taId, item, currentText) {
                var result = _aiStoredFrqResult(item);
                if (!result) return false;
                var renderKey = String(item.responseHash || '') + '|' + String(item.gradedAt || '')
                    + '|' + result.score + '|' + _aiFrqAppealCount(item)
                    + '|' + String(result.revisedTextUsed === true);
                if (_aiFrqRenderedGrade[taId] === renderKey) return true;
                try {
                    if (typeof gradingState !== 'undefined' && gradingState) {
                        var previous = gradingState.get(taId) || {};
                        gradingState.set(taId, {
                            result: result,
                            originalAnswer: currentText,
                            appealCount: item && item.appealCount !== undefined
                                ? _aiFrqAppealCount(item) : (previous.appealCount || 0),
                            history: previous.history || []
                        });
                    }
                    if (typeof showFeedback === 'function') showFeedback(taId, result);
                    _aiRenderFrqLastAppeal(taId, item);
                    _aiSyncFrqAppealCount(_aiFrqAppealForm(taId), item);
                    _aiFrqRenderedGrade[taId] = renderKey;
                    return true;
                } catch (_) { return false; }
            }
            function _aiLastSeenGradedKey(itemId) {
                var who = _aiStudentKey();
                return who ? 'a2_frq_last_seen_graded_' + who + '_' + itemId : null;
            }
            async function _aiReconcileTerminalText(itemId, ta) {
                if (!ta || (ta.value || '').trim() || ta.dataset.aiFrqEdited === '1'
                    || _aiFrqTerminalReconciled[itemId]) return;
                _aiFrqTerminalReconciled[itemId] = true;
                var prior = await _aiSharedPriorScores();
                var entry = prior && typeof prior.get === 'function' ? prior.get(itemId) : null;
                if (!entry || entry.response === undefined || entry.response === null) return;
                if ((ta.value || '').trim() || ta.dataset.aiFrqEdited === '1') return;
                ta.value = typeof entry.response === 'string' ? entry.response : String(entry.response);
                ta.dataset.restored = '1';
            }
            async function _aiRenderFrqStatus(itemId, item) {
                try {
                    var ta = _aiFrqTextarea(itemId);
                    var taId = ta && ta.id;
                    if (!taId || !item) return;
                    var status = String(item.status || 'draft');
                    _aiFrqStates[itemId] = item;
                    _aiRenderFrqLastAppeal(taId, item);
                    if (status === 'local-only') { _aiRenderFrqConnection(taId); return; }

                    var hasStoredGrade = status === 'graded'
                        || ((status === 'appeal-queued' || status === 'appeal-grading') && item.responseHash && item.result);
                    if (hasStoredGrade) {
                        await _aiReconcileTerminalText(itemId, ta);
                        var currentText = String(ta.value || '').trim();
                        var currentHash = await _aiSha256Hex(currentText);
                        if (item.responseHash
                            && (!currentHash || currentHash !== String(item.responseHash).toLowerCase())) {
                            var revisedWasReviewed = item.result && item.result.revisedTextUsed === true;
                            if (!revisedWasReviewed) {
                                _aiClearAuthoritativeVerdict(taId);
                                var editedCopy = _aiFrqAppealExhausted(item)
                                    ? "This response is already graded. You've used all 3 appeals for this question."
                                    : 'This response is already graded — appeal to have your revised answer reviewed.';
                                _aiSetFrqStatusText(taId, editedCopy, 'already-graded-edited');
                                _aiEnsureFrqAppealControl(taId, item);
                                return;
                            }
                        }
                        if (item.result && !_aiRenderStoredFrqResult(taId, item, currentText)) {
                            _aiRenderFrqConnection(taId);
                            return;
                        }
                        if (status === 'graded') {
                            var markerKey = _aiLastSeenGradedKey(itemId);
                            var gradedMs = Date.parse(item.gradedAt || '');
                            var seenMs = 0;
                            try { seenMs = markerKey ? Date.parse(localStorage.getItem(markerKey) || '') : 0; } catch (_) { seenMs = 0; }
                            var away = isFinite(gradedMs) && gradedMs < _aiFrqSessionStartedAt && (!isFinite(seenMs) || gradedMs > seenMs);
                            var label = _aiFrqScoreName(_aiFrqScoreLetter(item));
                            var announcementKey = String(item.responseHash || '') + '|' + String(item.gradedAt || '') + '|' + label;
                            if (_aiFrqAnnouncedGrade[itemId] === announcementKey) {
                                _aiEnsureFrqAppealControl(taId, item);
                                return;
                            }
                            if (item.result && item.result.revisedTextUsed === true) {
                                _aiSetFrqStatusText(taId, '✓ Revised answer reviewed: ' + label, 'graded', true, '', announcementKey);
                            } else if (away) {
                                _aiSetFrqStatusText(taId, '✓ Graded while you were away: ' + label, 'graded-away', true, '', announcementKey);
                                _aiFrqAwayShown[itemId] = String(item.gradedAt || '');
                            } else {
                                _aiSetFrqStatusText(taId, '✓ Graded: ' + label, 'graded', true, '', announcementKey);
                            }
                            _aiEnsureFrqAppealControl(taId, item);
                            _aiFrqAnnouncedGrade[itemId] = announcementKey;
                            try { if (markerKey && item.gradedAt) localStorage.setItem(markerKey, String(item.gradedAt)); } catch (_) {}
                            return;
                        }
                    }

                    var eta = _aiFrqEtaSeconds(item);
                    if (status === 'draft') {
                        _aiSetFrqStatusText(taId, 'Answer saved · grading starts after you pause or leave the box.', status);
                    } else if (status === 'queued' || status === 'appeal-queued') {
                        _aiSetFrqStatusText(taId, '✓ Saved · queued for grading', status, false, eta == null ? '' : ' · ~' + eta + ' s');
                    } else if (status === 'grading' || status === 'appeal-grading') {
                        _aiSetFrqStatusText(taId, '⏳ Grading…', status, false, eta == null ? '' : ' ~' + eta + ' s');
                    } else if (status === 'retrying') {
                        _aiSetFrqStatusText(taId, '⚠ Saved. The grader is unavailable; retrying automatically around ' + _aiFrqRetryTime(item.retryAt) + '.', status);
                    } else if (status === 'failed') {
                        _aiSetFrqStatusText(taId, '⚠ Saved, but grading needs teacher help.', status);
                    }
                } catch (_) {
                    var fallbackTa = _aiFrqTextarea(itemId);
                    if (fallbackTa) _aiRenderFrqUnsaved(fallbackTa.id);
                }
            }
            function _aiStopFrqPolling() {
                _aiClearOwnedTimeout(_aiFrqPollTimer);
                _aiFrqPollTimer = null;
            }
            function _aiScheduleFrqPoll(delayMs) {
                _aiStopFrqPolling();
                if (_aiDisposed) return;
                _aiFrqPollTimer = _aiSetOwnedTimeout(_aiPollFrqStatus, Math.max(0, delayMs));
            }
            function _aiStartFrqPolling(resume) {
                if (_aiDisposed || !_aiIsAuthoritative() || document.visibilityState === 'hidden' || !_aiHasVisibleFrqPending()) {
                    _aiStopFrqPolling();
                    return;
                }
                if (resume || !_aiFrqPollStartedAt) _aiFrqPollStartedAt = Date.now();
                if (Date.now() - _aiFrqPollStartedAt >= _AI_FRQ_POLL_MAX_MS) {
                    _aiStopFrqPolling();
                    return;
                }
                if (!_aiFrqPollTimer && !_aiFrqPollInFlight) _aiScheduleFrqPoll(0);
            }
            async function _aiRefreshFrqStatus() {
                if (_aiDisposed) return false;
                var token = _aiRosterToken();
                var base = window.ROSTER_SERVICE_URL;
                var prefix = (typeof gbWsPrefix === 'function') ? gbWsPrefix() : null;
                if (!token || !base || !prefix || typeof fetch !== 'function') {
                    return false;
                }
                try {
                    var res = await fetch(base + '/ledger/frq-status?prefix=' + encodeURIComponent(prefix), {
                        method: 'GET', cache: 'no-store',
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    if (!res || !res.ok) throw new Error('status unavailable');
                    var data = await res.json();
                    if (_aiDisposed) return false;
                    if (!data || !data.ok) throw new Error('bad status');
                    if (data.mode && data.mode !== 'authoritative') {
                        _aiDowngradeFrqMode(String(data.mode), Date.now());
                        return true;
                    }
                    if (!data.items || typeof data.items !== 'object') throw new Error('bad status');
                    var ids = Object.keys(data.items);
                    for (var i = 0; i < ids.length; i++) {
                        _aiFrqStates[ids[i]] = data.items[ids[i]];
                        await _aiRenderFrqStatus(ids[i], data.items[ids[i]]);
                    }
                    return true;
                } catch (_) {
                    return false;
                }
            }
            async function _aiPollFrqStatus(rearm) {
                _aiFrqPollTimer = null;
                if (_aiDisposed || _aiFrqPollInFlight || !_aiIsAuthoritative() || document.visibilityState === 'hidden'
                    || !_aiHasVisibleFrqPending() || Date.now() - _aiFrqPollStartedAt >= _AI_FRQ_POLL_MAX_MS) {
                    _aiStopFrqPolling();
                    return;
                }
                _aiFrqPollInFlight = true;
                var ok = false;
                try { ok = await _aiRefreshFrqStatus(); } catch (_) { ok = false; }
                _aiFrqPollInFlight = false;
                if (_aiDisposed || !_aiHasVisibleFrqPending() || Date.now() - _aiFrqPollStartedAt >= _AI_FRQ_POLL_MAX_MS) {
                    _aiStopFrqPolling();
                    return;
                }
                if (ok) {
                    _aiFrqPollBackoffMs = 0;
                    if (rearm !== false) _aiScheduleFrqPoll(_aiFrqConfig.pollMs || 2000);
                } else {
                    _aiFrqPollBackoffMs = _aiFrqPollBackoffMs
                        ? Math.min(30000, _aiFrqPollBackoffMs * 2)
                        : Math.max(4000, (_aiFrqConfig.pollMs || 2000) * 2);
                    if (rearm !== false) _aiScheduleFrqPoll(_aiFrqPollBackoffMs);
                }
            }
            function _aiPollFrqStatusOnce() {
                _aiStopFrqPolling();
                if (!_aiFrqPollStartedAt) _aiFrqPollStartedAt = Date.now();
                return _aiPollFrqStatus(false);
            }
            async function _aiRequestFrqGrade(taId, response, resume, keepalive) {
                if (_aiDisposed) return null;
                var itemId = _aiFrqItemId(taId);
                var answer = String(response == null ? '' : response).trim();
                if (!itemId || !answer) return null;
                await _aiEnsureFrqConfig();
                if (_aiDisposed) return null;
                if (!_aiIsAuthoritative()) {
                    _aiScheduleAutoGrade(0);
                    return { ok: false, reason: 'legacy-mode' };
                }
                _aiSetFrqStatusText(taId, 'Saving…', 'saving');
                try {
                    if (!window.gradebookClient || typeof window.gradebookClient.requestFrqGrade !== 'function') {
                        _aiLatchLegacyClientFallback();
                        _aiClearWaiting(taId);
                        _aiScheduleAutoGrade(0);
                        return { ok: false, reason: 'legacy-client' };
                    }
                    var request = { itemId: itemId, response: answer };
                    if (keepalive) request.keepalive = true;
                    var result = await window.gradebookClient.requestFrqGrade(request);
                    if (_aiDisposed) return result;
                    if (result && result.queued) {
                        _aiFrqStates[itemId] = { status: 'local-only' };
                        _aiRenderFrqConnection(taId);
                    } else if (!result || !result.ok) {
                        _aiFrqStates[itemId] = { status: 'unsaved' };
                        _aiRenderFrqUnsaved(taId);
                    } else {
                        var nextStatus = result.status === 'graded' ? 'queued' : (result.status || 'draft');
                        _aiFrqStates[itemId] = { status: nextStatus };
                        await _aiRenderFrqStatus(itemId, _aiFrqStates[itemId]);
                    }
                    _aiStartFrqPolling(!!resume);
                    return result;
                } catch (_) {
                    _aiFrqStates[itemId] = { status: 'unsaved' };
                    _aiRenderFrqUnsaved(taId);
                    _aiStartFrqPolling(!!resume);
                    return null;
                }
            }
            async function _aiRequestAllFrqGrades(resume, keepalive) {
                if (_aiDisposed) return 0;
                var refs = _aiReflectionTextareas();
                var work = [];
                for (var i = 0; i < refs.length; i++) {
                    var ta = refs[i];
                    var answer = ta && String(ta.value || '').trim();
                    if (ta && ta.id && answer) work.push(_aiRequestFrqGrade(ta.id, answer, resume, keepalive));
                }
                try { await Promise.all(work); } catch (_) {}
                return work.length;
            }
            var _aiDraftSaveTimers = {};
            var _aiDraftGradeTimers = {};
            var _aiDraftSaveVersion = {};
            var _aiDraftInFlight = {};
            var _aiOriginalDraftSaver = null;
            function _aiScheduleDraftGrade(taId, answer, startedAt) {
                _aiClearOwnedTimeout(_aiDraftGradeTimers[taId]);
                var delay = Math.max(0, 20000 - (Date.now() - startedAt));
                _aiDraftGradeTimers[taId] = _aiSetOwnedTimeout(function () {
                    delete _aiDraftGradeTimers[taId];
                    var ta = document.getElementById(taId);
                    if (!ta || String(ta.value || '').trim() !== answer) return;
                    _aiRequestFrqGrade(taId, answer, false);
                }, delay);
            }
            function _aiSaveFrqDraft(taId, response) {
                if (_aiDisposed) return Promise.resolve(null);
                var itemId = _aiFrqItemId(taId);
                var answer = String(response == null ? '' : response).trim();
                if (!itemId || !answer) return Promise.resolve(null);
                var existing = _aiDraftInFlight[itemId];
                if (existing && existing.answer === answer) return existing.promise;
                var version = (_aiDraftSaveVersion[itemId] || 0) + 1;
                _aiDraftSaveVersion[itemId] = version;
                var startedAt = Date.now();
                _aiSetFrqStatusText(taId, 'Saving…', 'saving');
                var promise = (async function () {
                    await _aiEnsureFrqConfig();
                    if (_aiDisposed) return null;
                    if (!_aiIsAuthoritative()) {
                        return _aiOriginalDraftSaver ? _aiOriginalDraftSaver.call(window, taId, answer) : null;
                    }
                    var result = null;
                    try {
                        if (window.gradebookClient && typeof window.gradebookClient.record === 'function') {
                            result = await window.gradebookClient.record({
                                source: 'frq', itemId: itemId, response: answer, attempt: 1
                            });
                        }
                    } catch (_) { result = null; }
                    if (_aiDisposed) return result;
                    var ta = document.getElementById(taId);
                    if (_aiDraftSaveVersion[itemId] !== version || !ta || String(ta.value || '').trim() !== answer) return result;
                    if (result && result.queued) {
                        _aiFrqStates[itemId] = { status: 'local-only' };
                        _aiRenderFrqConnection(taId);
                        _aiScheduleDraftGrade(taId, answer, startedAt);
                    } else if (result && result.ok) {
                        _aiFrqStates[itemId] = { status: 'draft' };
                        await _aiRenderFrqStatus(itemId, _aiFrqStates[itemId]);
                        _aiScheduleDraftGrade(taId, answer, startedAt);
                    } else {
                        _aiFrqStates[itemId] = { status: 'unsaved' };
                        _aiRenderFrqUnsaved(taId);
                    }
                    return result;
                })();
                _aiDraftInFlight[itemId] = { answer: answer, promise: promise };
                return promise.finally(function () {
                    if (_aiDraftInFlight[itemId] && _aiDraftInFlight[itemId].promise === promise) delete _aiDraftInFlight[itemId];
                });
            }
            function _aiScheduleDraftSave(ta) {
                if (!ta || !ta.id) return;
                var answer = String(ta.value || '').trim();
                _aiClearOwnedTimeout(_aiDraftSaveTimers[ta.id]);
                if (_aiDraftGradeTimers[ta.id]) { _aiClearOwnedTimeout(_aiDraftGradeTimers[ta.id]); delete _aiDraftGradeTimers[ta.id]; }
                if (!answer) return;
                _aiDraftSaveTimers[ta.id] = _aiSetOwnedTimeout(function () {
                    delete _aiDraftSaveTimers[ta.id];
                    _aiSaveFrqDraft(ta.id, answer);
                }, 400);
            }
            function _aiStopDraftTimers() {
                Object.keys(_aiDraftSaveTimers).forEach(function (id) { _aiClearOwnedTimeout(_aiDraftSaveTimers[id]); });
                Object.keys(_aiDraftGradeTimers).forEach(function (id) { _aiClearOwnedTimeout(_aiDraftGradeTimers[id]); });
                _aiDraftSaveTimers = {};
                _aiDraftGradeTimers = {};
            }
            function _aiInstallAckDraftSaver() {
                if (typeof window.recordReflectionDraft !== 'function' || window.recordReflectionDraft.__aiAckWrapped) return;
                _aiOriginalDraftSaver = window.recordReflectionDraft;
                var wrapped = function (taId, answer) {
                    if (!_aiIsAuthoritative()) return _aiOriginalDraftSaver.apply(this, arguments);
                    return _aiSaveFrqDraft(taId, answer);
                };
                wrapped.__aiAckWrapped = true;
                window.recordReflectionDraft = wrapped;
            }
            function _aiAppealText(questionId) {
                var el = document.getElementById('appeal-text-' + questionId)
                    || document.getElementById('appealText-' + questionId);
                return el ? String(el.value || '').trim() : '';
            }
            function _aiAppealMessage(questionId, message, failed) {
                var id = questionId + '-frq-appeal-status';
                var el = document.getElementById(id);
                if (!el) {
                    el = document.createElement('div');
                    el.id = id;
                    el.className = 'appeal-result ' + (failed ? 'error' : 'maintained');
                    el.setAttribute('role', failed ? 'alert' : 'status');
                    var form = document.getElementById('appeal-form-' + questionId)
                        || document.getElementById('appealForm-' + questionId);
                    var feedback = document.getElementById(questionId + '-feedback');
                    var host = feedback || form;
                    if (host) host.appendChild(el);
                }
                if (el) {
                    el.className = 'appeal-result ' + (failed ? 'error' : 'maintained');
                    el.textContent = message;
                }
            }
            async function _aiSubmitAuthoritativeAppeal(questionId) {
                var token = _aiRosterToken();
                var itemId = _aiFrqItemId(questionId);
                var appealText = _aiAppealText(questionId);
                var base = window.ROSTER_SERVICE_URL;
                if (!token || !itemId || !base || typeof fetch !== 'function') {
                    _aiAppealMessage(questionId, _AI_FRQ_LOCAL_COPY, true);
                    _aiRenderFrqConnection(questionId);
                    return null;
                }
                var form = document.getElementById('appeal-form-' + questionId)
                    || document.getElementById('appealForm-' + questionId);
                var buttons = form ? form.querySelectorAll('button') : [];
                Array.prototype.forEach.call(buttons, function (button) { button.disabled = true; });
                var appealExhausted = false;
                try {
                    var requestBody = { itemId: itemId, appealText: appealText };
                    var item = _aiFrqStates[itemId] || {};
                    var answer = String((document.getElementById(questionId) || {}).value || '').trim();
                    if (item.responseHash) {
                        var answerHash = await _aiSha256Hex(answer);
                        if (answerHash && answerHash !== String(item.responseHash).toLowerCase()) {
                            requestBody.revisedText = answer;
                        }
                    }
                    var res = await fetch(base + '/ledger/frq-appeal', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                        body: JSON.stringify(requestBody)
                    });
                    var data = null;
                    try { data = await res.json(); } catch (_) { data = null; }
                    if (!res || !res.ok) {
                        if (data && data.appealCount !== undefined && _aiFrqStates[itemId]) {
                            _aiFrqStates[itemId].appealCount = _aiFrqAppealCount(data);
                            if (data.appealLimit !== undefined) {
                                _aiFrqStates[itemId].appealLimit = _aiFrqAppealLimit(data);
                            }
                        }
                        if (_aiFrqAppealExhausted(data)) {
                            appealExhausted = true;
                            _aiRemoveFrqAppealControl(questionId);
                            _aiDisableFrqAppealForm(questionId);
                        }
                        _aiAppealMessage(questionId, _aiFrqAppealErrorCopy(data && data.error), true);
                        return data;
                    }
                    var previous = _aiFrqStates[itemId] || {};
                    var queued = {};
                    for (var key in previous) {
                        if (Object.prototype.hasOwnProperty.call(previous, key)) queued[key] = previous[key];
                    }
                    queued.status = 'appeal-queued';
                    if (data && data.appealCount !== undefined) queued.appealCount = _aiFrqAppealCount(data);
                    _aiFrqStates[itemId] = queued;
                    await _aiRenderFrqStatus(itemId, _aiFrqStates[itemId]);
                    _aiAppealMessage(questionId, 'Appeal submitted · waiting for review.', false);
                    _aiStartFrqPolling(true);
                    return data;
                } catch (_) {
                    _aiAppealMessage(questionId, _AI_FRQ_LOCAL_COPY, true);
                    _aiRenderFrqConnection(questionId);
                    return null;
                } finally {
                    if (!appealExhausted) {
                        Array.prototype.forEach.call(buttons, function (button) { button.disabled = false; });
                    }
                }
            }
            function _aiInstallAuthoritativeEntryWrappers() {
                if (typeof window.gradeReflection === 'function') {
                    var originalGradeReflection = window.gradeReflection;
                    var wrappedGradeReflection = async function (questionId, answer) {
                        await _aiEnsureFrqConfig();
                        if (_aiIsAuthoritative()) {
                            await _aiRequestFrqGrade(questionId, answer, true);
                            return null;
                        }
                        return originalGradeReflection.apply(this, arguments);
                    };
                    wrappedGradeReflection.toString = function () { return String(originalGradeReflection); };
                    window.gradeReflection = wrappedGradeReflection;
                }
                if (typeof window.gradeAllReflections === 'function') {
                    var originalGradeAll = window.gradeAllReflections;
                    window.gradeAllReflections = async function () {
                        await _aiEnsureFrqConfig();
                        if (_aiIsAuthoritative()) return _aiRequestAllFrqGrades(true);
                        return originalGradeAll.apply(this, arguments);
                    };
                }
                if (typeof window.submitAppeal === 'function') {
                    var originalAppeal = window.submitAppeal;
                    window.submitAppeal = async function (questionId) {
                        await _aiEnsureFrqConfig();
                        if (_aiIsAuthoritative()) return _aiSubmitAuthoritativeAppeal(questionId);
                        return originalAppeal.apply(this, arguments);
                    };
                }
                if (typeof window.submitAppealForQuestion === 'function') {
                    var originalInlineAppeal = window.submitAppealForQuestion;
                    window.submitAppealForQuestion = async function (questionId) {
                        await _aiEnsureFrqConfig();
                        if (_aiIsAuthoritative()) return _aiSubmitAuthoritativeAppeal(questionId);
                        return originalInlineAppeal.apply(this, arguments);
                    };
                }
            }
            _aiInstallAuthoritativeEntryWrappers();
            _aiInstallAckDraftSaver();
            _aiInstallAuthoritativeAppealDelegation();

            function _aiTeardownFrqTicketClient() {
                if (_aiDisposed) return;
                _aiDisposed = true;
                _aiStopFrqPolling();
                _aiStopDraftTimers();
                _aiClearOwnedTimeout(_aiIdleTimer);
                _aiIdleTimer = null;
                Object.keys(_aiStatusTimers).forEach(function (id) { clearInterval(_aiStatusTimers[id]); });
                _aiStatusTimers = {};
                _aiClearAllOwnedTimeouts();
                _aiRemoveAllOwnedListeners();
                try {
                    if (_aiAuthoritativeAppealClickHandler) {
                        document.removeEventListener('click', _aiAuthoritativeAppealClickHandler, true);
                    }
                } catch (_) {}
                _aiAuthoritativeAppealClickHandler = null;
                try { if (_aiFrqConfigAbortController) _aiFrqConfigAbortController.abort(); } catch (_) {}
                _aiFrqConfigAbortController = null;
                _aiFrqConfig = { mode: 'off', authoritative: false, pollMs: 2000, at: 0 };
                _aiFrqConfigFlight = null;
                _aiPriorScoresPromise = null;
                try { if (_aiPriorScoresCache && typeof _aiPriorScoresCache.clear === 'function') _aiPriorScoresCache.clear(); } catch (_) {}
                _aiPriorScoresCache = null;
                _aiFrqFloor = {};
                _aiBatchCache = {};
                _aiEtaCache = { at: 0, waitMs: null, ahead: 0 };
                _aiFrqStates = {};
                _aiFrqPollStartedAt = 0;
                _aiFrqPollInFlight = false;
                _aiFrqPollBackoffMs = 0;
                _aiFrqRenderedGrade = {};
                _aiFrqAwayShown = {};
                _aiFrqAnnouncedGrade = {};
                _aiFrqTerminalReconciled = {};
                _aiFrqSessionStartedAt = 0;
                _aiDraftSaveVersion = {};
                _aiDraftInFlight = {};
                _aiOriginalDraftSaver = null;
                _aiFrqGlobalTriggersWired = false;
                _AI_AUTO_BUDGET.stamps = [];
            }

            // Small observability surface used by the jsdom contract tests.
            var _aiFrqTicketClient = {
                fetchConfig: _aiFetchFrqConfig,
                isAuthoritative: _aiIsAuthoritative,
                requestAll: _aiRequestAllFrqGrades,
                refreshStatus: _aiRefreshFrqStatus,
                renderStatus: _aiRenderFrqStatus,
                renderConnection: _aiRenderFrqConnection,
                renderUnsaved: _aiRenderFrqUnsaved,
                saveDraft: _aiSaveFrqDraft,
                hash: _aiSha256Hex,
                startPolling: _aiStartFrqPolling,
                stopPolling: _aiStopFrqPolling,
                isPolling: function () { return !!(_aiFrqPollTimer || _aiFrqPollInFlight); },
                setState: function (itemId, item) { _aiFrqStates[itemId] = item; },
                wireTriggers: _aiWireFrqTriggers,
                stopDraftTimers: _aiStopDraftTimers
            };
            if (window.__AI_FRQ_TEST_SEAMS__ === true) {
                _aiFrqTicketClient.pollOnce = _aiPollFrqStatusOnce;
                _aiFrqTicketClient.teardown = _aiTeardownFrqTicketClient;
            }
            window.__aiFrqTicketClient = _aiFrqTicketClient;

            function _aiSetBusy(busy) {
                try {
                    var btn = document.querySelector('.btn-ai-recheck');
                    if (!btn) return;
                    btn.disabled = busy;
                    btn.innerHTML = busy ? '✨ grading…' : '✨ Grade with AI';
                    if (busy && !_aiIsAuthoritative()) {
                        _aiFetchEta().then(function (eta) {
                            if (eta && eta.waitMs != null && btn.disabled) btn.innerHTML = '✨ grading… ~' + Math.max(3, Math.round(eta.waitMs / 1000)) + ' s';
                        }).catch(function () {});
                    }
                } catch (_) {}
            }

            // Local worksheet "Score: X/Y (Z%)" — counts blanks the AI accepted
            // (the .correct class) alongside verbatim-correct ones, so the visible
            // score reflects the AI credit (it otherwise shows only the verbatim
            // count from checkAnswers).
            function _aiBlankStats() {
                var filled = 0, correct = 0, partial = 0;
                document.querySelectorAll('.blank').forEach(function (b) {
                    if (b.classList && b.classList.contains('revealed')) return;
                    if (!(b.value || '').trim()) return;
                    filled++;
                    if (b.classList && b.classList.contains('correct')) correct++;
                    else if (b.classList && b.classList.contains('partial')) partial++;
                });
                return { filled: filled, correct: correct, partial: partial };
            }
            function _aiUpdateScoreDisplay() {
                try {
                    var el = document.getElementById('scoreDisplay');
                    if (!el) return;
                    var s = _aiBlankStats();
                    if (s.filled > 0) {
                        // Grade-equivalent %: a partial is HALF credit (matches the
                        // gradebook). Relabelled so it's clearly THIS page's blanks,
                        // not the student's class grade (which lives on the Desk).
                        var pct = Math.round(((s.correct + 0.5 * s.partial) / s.filled) * 100);
                        el.textContent = "This worksheet's blanks: " + pct + '% — ' + s.correct + ' correct' +
                            (s.partial > 0 ? ', ' + s.partial + ' partial' : '') + ' of ' + s.filled;
                        el.title = "Just this page's fill-in-the-blanks (a partial counts as half). " +
                            'Your real class grade is on the Desk.';
                        el.classList.add('visible');
                    }
                } catch (_) {}
            }
            function _aiToast(msg) {
                try {
                    var t = document.createElement('div');
                    t.textContent = msg;
                    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
                        'z-index:99999;background:#323232;color:#fff;font-size:13px;padding:10px 16px;' +
                        'border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,0.3);font-family:Geneva,Verdana,sans-serif;';
                    document.body.appendChild(t);
                    _aiSetOwnedTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
                } catch (_) {}
            }

            // -- main pass ----------------------------------------------------
            window.aiGradeWorksheet = async function (opts) {
                opts = opts || {};
                var manual = !!opts.manual;
                if (manual) {
                    await _aiEnsureFrqConfig();
                    if (_aiIsAuthoritative()) _aiStartFrqPolling(true);
                }
                if (window._aiGradeBusy) { if (manual) _aiToast('AI grading is already running…'); return; }
                var hash = _aiHash();
                if (hash === window._aiLastGradedHash) {
                    if (_aiIsAuthoritative()) await _aiRequestAllFrqGrades(true);
                    else if (manual) _aiToast('No changes since the last AI check.');
                    return;
                }

                // Collect filled blanks. Send ALL (coherent context); ACT only on
                // those below full credit (upgrade-only).
                var send = [];
                var actMap = {};
                var preCorrect = 0;             // verbatim-correct count (for the win toast)
                document.querySelectorAll('.blank').forEach(function (b) {
                    if (!b.dataset || !b.dataset.questionId) return;
                    if (b.classList && b.classList.contains('revealed')) return;   // Show-Answers, not the student's
                    var val = (b.value || '').trim();
                    if (!val) return;
                    var cur = _aiBlankScore(b);
                    if (cur === 1) preCorrect++;
                    send.push({
                        id: b.dataset.questionId,
                        question: _aiExtractQuestion(b),
                        acceptedAnswers: (b.dataset.answer || '').split('|'),
                        studentAnswer: val,
                        currentScore: cur
                    });
                    if (cur < 1) actMap[b.dataset.questionId] = b;
                });
                var filledTotal = send.length;

                window._aiGradeBusy = true;
                _aiSetBusy(true);
                var aiAccepted = 0, frqUpgraded = 0;
                try {
                    // BLANKS pass — one batched call, but ONLY when at least one
                    // blank is actually upgradeable (below full verbatim credit).
                    // No upgradeable blank ⇒ no API call (anti-spam). Soft-fail
                    // keeps the verbatim grade.
                    if (send.length && Object.keys(actMap).length && window.RAILWAY_SERVER_URL) {
                        try {
                            var resp = await fetch(window.RAILWAY_SERVER_URL + '/api/ai/grade-worksheet', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ scenario: _aiScenario(), blanks: send })
                            });
                            if (resp.ok) {
                                var data = await resp.json();
                                var graded = (data && Array.isArray(data.blanks)) ? data.blanks : [];
                                graded.forEach(function (g) {
                                    if (!g || g.credit !== true) return;         // strict: only explicit true
                                    var b = actMap[g.id];
                                    if (!b) return;                              // already full credit / unknown id
                                    _aiApplyBlankCredit(b, g.reason);
                                    aiAccepted++;
                                });
                            }
                        } catch (_) { /* soft-fail: verbatim grade stands */ }
                    }
                    // FRQ pass (upgrade-only; auto path won't persist a fresh "I").
                    try { frqUpgraded = (await _aiGradeFrqs(manual)) || 0; } catch (_) {}
                    window._aiLastGradedHash = hash;
                    if (manual) {
                        var parts = [];
                        if (aiAccepted > 0) parts.push('accepted ' + aiAccepted + ' more answer' + (aiAccepted > 1 ? 's' : ''));
                        if (frqUpgraded > 0) parts.push('polished ' + frqUpgraded + ' written response' + (frqUpgraded > 1 ? 's' : ''));
                        if (parts.length) {
                            var scorePart = '';
                            if (aiAccepted > 0 && filledTotal > 0) {
                                var pre = Math.round(preCorrect / filledTotal * 100);
                                var post = Math.round((preCorrect + aiAccepted) / filledTotal * 100);
                                scorePart = ' — Score ' + pre + '% → ' + post + '%';
                            }
                            _aiToast('✨ AI ' + parts.join(' and ') + scorePart);
                        } else {
                            _aiToast('✨ AI check complete — no new credit this time.');
                        }
                    }
                } finally {
                    window._aiGradeBusy = false;
                    _aiSetBusy(false);
                    _aiUpdateScoreDisplay();   // visible score now counts the AI-accepted blanks
                    try { if (typeof updateWorksheetCompletion === 'function') updateWorksheetCompletion(); } catch (_) {}
                }
            };

            // -- GUARD 1 (blanks never downgrade): the verbatim blur/Enter feeder
            //    (handleLiveUpdate → recordBlankToGradebook) recomputes the score
            //    purely from value-vs-key and would clobber an AI-credited 1.0 on
            //    a routine re-blur (no edit). Wrap it: if the blank still holds its
            //    AI-credited value, record the full credit instead of the verbatim
            //    score. Editing the blank drops data-ai-credit (via _aiReassertCredits
            //    / the value mismatch), so a genuinely changed answer is graded normally.
            if (typeof window.recordBlankToGradebook === 'function') {
                var _aiOrigRecordBlank = window.recordBlankToGradebook;
                window.recordBlankToGradebook = function (blank) {
                    try {
                        if (blank && blank.dataset && blank.dataset.aiCredit === '1') {
                            var v = (blank.value || '').trim();
                            if (v && v === (blank.dataset.aiCreditValue || '')) {
                                _aiRecordBlankFull(blank);     // honor the earned AI credit
                                return;
                            }
                        }
                    } catch (_) {}
                    return _aiOrigRecordBlank.apply(this, arguments);
                };
            }

            // -- GUARD 2 (FRQs never downgrade): wrap the single graded-FRQ sink so
            //    EVERY caller — the new AI pass, the legacy "Grade My Reflections"
            //    button, and the per-question appeal — is upgrade-only against the
            //    session+ledger floor (_aiFrqFloor). A verdict at-or-below the floor
            //    is not written; the recorded grade is the floor.
            if (typeof window.recordReflectionToGradebook === 'function') {
                var _aiOrigRecordReflection = window.recordReflectionToGradebook;
                window.recordReflectionToGradebook = function (taId, answer, scoreLetter) {
                    try {
                        var itemId = _aiFrqItemId(taId);
                        var nr = _aiVerdictRank(scoreLetter);
                        if (_aiIsAuthoritative() && itemId && nr !== undefined) {
                            var ta = document.getElementById(taId);
                            var latest = ta ? String(ta.value || '').trim() : String(answer || '').trim();
                            return _aiRequestFrqGrade(taId, latest, false);
                        }
                        if (itemId && nr !== undefined) {
                            var floor = (itemId in _aiFrqFloor) ? _aiFrqFloor[itemId] : -1;
                            if (nr <= floor) return;           // never downgrade a recorded FRQ
                            _aiFrqFloor[itemId] = nr;          // remember the new best
                        }
                    } catch (_) {}
                    return _aiOrigRecordReflection.apply(this, arguments);
                };
            }

            // -- FRQ coverage (2026-08-19): every answered reflection must end up
            //    graded. Three leaks closed here: (1) grading only ran on a button
            //    press → also grade on textarea BLUR / 10 s idle / page hide;
            //    (2) failures were swallowed → bounded retry + remembered in
            //    localStorage so the next load re-runs them; (3) on load, any
            //    prior FRQ row with text but no score is graded automatically.
            var _AI_FRQ_RETRY_DELAYS = [5000];   // one bounded retry — the grader is a shared serialized queue
            async function _aiGradeWithRetry(taId, answer) {
                var lastErr = null;
                var grader = _aiGraderFn();
                if (!grader) return null;
                for (var attempt = 0; attempt <= _AI_FRQ_RETRY_DELAYS.length; attempt++) {
                    try {
                        var r = await grader(taId, answer);
                        // Success ONLY for a valid E/P/I verdict (a truthy junk score must not
                        // clear the pending state and then be silently skipped downstream).
                        if (r && _aiVerdictRank(r.score) !== undefined) return r;
                        lastErr = new Error('invalid verdict: ' + (r && r.score));
                    } catch (e) { lastErr = e; }
                    if (attempt < _AI_FRQ_RETRY_DELAYS.length) {
                        await new Promise(function (res) { _aiSetOwnedTimeout(res, _AI_FRQ_RETRY_DELAYS[attempt]); });
                    }
                }
                if (lastErr) console.warn('[ai-frq] grading failed after retries:', taId, lastErr && lastErr.message);
                return null;
            }
            // Scoped to the signed-in student (shared devices) — no identity → no memory.
            function _aiStudentKey() {
                try {
                    var who = (window.rosterClient && typeof window.rosterClient.current === 'function') ? window.rosterClient.current() : null;
                    if (who && who.username) return String(who.username);
                    var legacy = localStorage.getItem('a2_desk_student_email');
                    return legacy ? String(legacy) : null;
                } catch (_) { return null; }
            }
            function _aiUngradedKey() {
                var prefix = (typeof gbWsPrefix === 'function') ? gbWsPrefix() : null;
                var who = _aiStudentKey();
                return (prefix && who) ? ('a2_frq_ungraded_' + who + '_' + prefix) : null;
            }
            function _aiRememberUngraded(taId, pending) {
                try {
                    var k = _aiUngradedKey(); if (!k) return;
                    var list = JSON.parse(localStorage.getItem(k) || '[]');
                    if (!Array.isArray(list)) list = [];
                    var i = list.indexOf(taId);
                    if (pending && i < 0) list.push(taId);
                    if (!pending && i >= 0) list.splice(i, 1);
                    if (list.length) localStorage.setItem(k, JSON.stringify(list)); else localStorage.removeItem(k);
                } catch (_) {}
            }
            function _aiHasUngradedPending() {
                try { var k = _aiUngradedKey(); return !!(k && JSON.parse(localStorage.getItem(k) || '[]').length); } catch (_) { return false; }
            }
            var _aiIdleTimer = null;
            var _aiFrqGlobalTriggersWired = false;
            // Auto-pass budget: at most 6 automatic passes per 10 minutes per page
            // (manual passes are never budgeted). Keeps a whole class from stampeding
            // the shared grader; the hash guard already skips unchanged content.
            var _AI_AUTO_BUDGET = { max: 6, windowMs: 600000, stamps: [] };
            function _aiAutoBudgetOk() {
                var now = Date.now();
                _AI_AUTO_BUDGET.stamps = _AI_AUTO_BUDGET.stamps.filter(function (t) { return now - t < _AI_AUTO_BUDGET.windowMs; });
                if (_AI_AUTO_BUDGET.stamps.length >= _AI_AUTO_BUDGET.max) return false;
                _AI_AUTO_BUDGET.stamps.push(now);
                return true;
            }
            function _aiScheduleAutoGrade(delayMs) {
                _aiClearOwnedTimeout(_aiIdleTimer);
                if (_aiDisposed) return;
                _aiIdleTimer = _aiSetOwnedTimeout(function () {
                    _aiIdleTimer = null;
                    // A pass is already running → trail: try again shortly (content
                    // that changed mid-pass must not be left ungraded).
                    if (window._aiGradeBusy) { _aiScheduleAutoGrade(3000); return; }
                    if (!_aiAutoBudgetOk()) return;
                    try { if (window.aiGradeWorksheet) window.aiGradeWorksheet({ manual: false }); } catch (_) {}
                }, delayMs);
            }
            function _aiWireFrqTriggers() {
                if (_aiDisposed) return;
                _aiReflectionTextareas().forEach(function (ta) {
                    if (!ta || ta.dataset.aiFrqWired === '1') return;
                    ta.dataset.aiFrqWired = '1';
                    _aiAddOwnedListener(ta, 'input', function () {
                        ta.dataset.aiFrqEdited = '1';
                        if (_aiIsAuthoritative()) {
                            _aiScheduleDraftSave(ta);
                            return;
                        }
                        if ((ta.value || '').trim().length >= 20) _aiScheduleAutoGrade(20000);   // 20 s idle
                    });
                    _aiAddOwnedListener(ta, 'blur', function () {
                        if (_aiIsAuthoritative()) {
                            _aiRequestFrqGrade(ta.id, (ta.value || '').trim(), false);
                            return;
                        }
                        if ((ta.value || '').trim().length >= 20) _aiScheduleAutoGrade(800);     // leaving the box
                    });
                });
                if (_aiFrqGlobalTriggersWired) return;
                _aiFrqGlobalTriggersWired = true;
                try {
                    _aiAddOwnedListener(document, 'visibilitychange', function () {
                        if (_aiIsAuthoritative()) {
                            if (document.visibilityState === 'hidden') {
                                _aiStopFrqPolling();
                                _aiRequestAllFrqGrades(false, true);
                            } else {
                                _aiStartFrqPolling(true);
                            }
                            return;
                        }
                        if (document.visibilityState === 'hidden') _aiScheduleAutoGrade(0);
                    });
                    _aiAddOwnedListener(window, 'pagehide', function () {
                        if (_aiIsAuthoritative()) {
                            _aiStopFrqPolling();
                            _aiRequestAllFrqGrades(false, true);
                        } else {
                            _aiScheduleAutoGrade(0);
                        }
                    });
                    _aiAddOwnedListener(window, 'online', function () {
                        if (_aiIsAuthoritative()) _aiStartFrqPolling(true);
                    });
                } catch (_) {}
            }
            // On load: any prior FRQ row with text but no score (or a remembered
            // failure) → grade it now (hash/single-flight guarded like every pass).
            function _aiRegradeUngradedPrior(prior) {
                try {
                    var need = _aiHasUngradedPending();
                    if (!need && prior && typeof prior.forEach === 'function') {
                        var prefix = (typeof gbWsPrefix === 'function') ? gbWsPrefix() : '';
                        prior.forEach(function (entry, itemId) {
                            if (need) return;
                            if (!prefix || String(itemId).indexOf(prefix + '-') !== 0) return;
                            var taId = String(itemId).slice(prefix.length + 1);
                            var ta = document.getElementById(taId);
                            if (!ta || ta.tagName !== 'TEXTAREA') return;
                            var text = (entry && typeof entry.response === 'string') ? entry.response : '';
                            if (text.trim().length >= 20 && (entry.score === null || entry.score === undefined)) need = true;
                        });
                    }
                    if (need) _aiScheduleWhenHydrated(prior, 0);
                } catch (_) {}
            }
            // Grade only when the DOM holds the exact prior text (hydration finished);
            // re-check a few times, then give up quietly (the next blur/idle covers it).
            function _aiScheduleWhenHydrated(prior, tries) {
                _aiSetOwnedTimeout(function () {
                    var ready = true;
                    try {
                        var prefix = (typeof gbWsPrefix === 'function') ? gbWsPrefix() : '';
                        if (prior && typeof prior.forEach === 'function') {
                            prior.forEach(function (entry, itemId) {
                                if (!prefix || String(itemId).indexOf(prefix + '-') !== 0) return;
                                if (!entry || (entry.score !== null && entry.score !== undefined)) return;
                                var ta = document.getElementById(String(itemId).slice(prefix.length + 1));
                                if (!ta || ta.tagName !== 'TEXTAREA') return;
                                var text = (typeof entry.response === 'string') ? entry.response.trim() : '';
                                if (text.length >= 20 && (ta.value || '').trim() !== text) ready = false;
                            });
                        }
                    } catch (_) {}
                    if (ready) { _aiScheduleAutoGrade(0); return; }
                    if (tries < 3) _aiScheduleWhenHydrated(prior, tries + 1);
                }, 1500);
            }

            // -- on load: restore AI-credit flags + greens from the ledger (so a
            //    post-reload blur can't clobber them) and seed the FRQ floor (so
            //    the legacy button can't downgrade before any AI pass runs).
            async function _aiOnLoad() {
                await _aiEnsureFrqConfig();
                if (_aiDisposed) return;
                try { _aiRestoreBlankCredits(); } catch (_) {}
                try { _aiWireFrqTriggers(); } catch (_) {}
                try {
                    _aiSharedPriorScores().then(async function (prior) {
                        if (_aiDisposed) return;
                        _aiSeedFrqFloor(prior);
                        if (_aiIsAuthoritative()) {
                            await _aiRefreshFrqStatus();
                            _aiStartFrqPolling(false);
                        } else {
                            _aiRegradeUngradedPrior(prior);
                        }
                    });
                } catch (_) {}
            }
            if (document.readyState === 'loading') {
                _aiAddOwnedListener(document, 'DOMContentLoaded', function () { _aiSetOwnedTimeout(_aiOnLoad, 600); });
            } else {
                _aiSetOwnedTimeout(_aiOnLoad, 600);   // let hydration settle first
            }
            try {
                _aiAddOwnedListener(window, 'storage', function (e) {
                    if (e && e.key === 'a2_roster.v1') _aiSetOwnedTimeout(_aiOnLoad, 600);
                });
            } catch (_) {}

            // ==================== CLASS VIEW (named dotplot / frequency table) ===
            // Upgrades the "📊 Class" drawer. When SIGNED IN, show this student's
            // SECTION's actual answers to each blank as a dotplot (≤10 distinct
            // answers) or a frequency table (more), each tagged with a friendly
            // first-name + last-initial (from roster-server /class/blank), with the
            // key answer highlighted. NOT signed in → the original anonymous count
            // view is kept (soft fallback).
            function _aiClassEsc(s) {
                return String(s == null ? '' : s)
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            }
            function _aiClassToken() {
                try { return (window.rosterClient && typeof rosterClient.token === 'function') ? rosterClient.token() : null; }
                catch (_) { return null; }
            }
            async function _aiFetchClassNamed(itemId) {
                try {
                    var base = window.ROSTER_SERVICE_URL, token = _aiClassToken();
                    if (!base || !token) return null;
                    var res = await fetch(base + '/class/blank/' + encodeURIComponent(itemId),
                        { headers: { 'Authorization': 'Bearer ' + token } });
                    if (!res.ok) return null;
                    var data = await res.json();
                    return (data && data.ok && Array.isArray(data.responses)) ? data : null;
                } catch (_) { return null; }
            }
            function _aiNormAns(s) {
                if (typeof normalize === 'function') { try { return normalize(s); } catch (_) {} }
                return String(s == null ? '' : s).toLowerCase().trim();
            }
            function _aiBlankAccepted(blank) {
                var set = {}, raw = (blank && blank.dataset && blank.dataset.answer) ? blank.dataset.answer : '';
                raw.split('|').forEach(function (a) { var n = _aiNormAns(a); if (n) set[n] = true; });
                return set;
            }
            function _aiClassPrompt(blank, itemId) {
                var q = (typeof _aiExtractQuestion === 'function') ? _aiExtractQuestion(blank) : '';
                q = (q || '').slice(0, 90);
                return q || itemId;
            }
            function _aiGroupResponses(responses) {
                var groups = {}, order = [];
                responses.forEach(function (r) {
                    var a = String(r && r.answer != null ? r.answer : '');
                    if (!(a in groups)) { groups[a] = []; order.push(a); }
                    groups[a].push((r && r.label) ? r.label : 'Someone');
                });
                order.sort(function (a, b) { return groups[b].length - groups[a].length; });
                return { groups: groups, order: order };
            }
            function _aiRenderClassNamed(blank, itemId, responses) {
                var g = _aiGroupResponses(responses);
                var accepted = _aiBlankAccepted(blank);
                var total = responses.length, distinct = g.order.length;
                var head = '<div class="class-view"><div class="class-view-head"><strong>' +
                    _aiClassEsc(_aiClassPrompt(blank, itemId)) + '</strong> <span class="class-view-meta">' +
                    total + ' answer' + (total === 1 ? '' : 's') + ' · your class</span></div>';
                if (distinct <= 10) {
                    // DOTPLOT: one column per distinct answer, a stacked dot per student.
                    var cols = g.order.map(function (a) {
                        var who = g.groups[a], n = who.length, correct = !!accepted[_aiNormAns(a)];
                        var shown = Math.min(n, 40), dots = '';
                        for (var k = 0; k < shown; k++) dots += '●';
                        if (n > shown) dots += '…';
                        return '<div class="dot-col">' +
                            '<div class="dot-stack" title="' + _aiClassEsc(who.join(', ')) + '">' + dots + '</div>' +
                            '<div class="dot-count">' + n + '</div>' +
                            '<div class="dot-label' + (correct ? ' correct' : '') + '" title="' + _aiClassEsc(a) + '">' +
                            _aiClassEsc(a) + (correct ? ' ✓' : '') + '</div>' +
                            '<div class="dot-who">' + _aiClassEsc(who.join(', ')) + '</div>' +
                            '</div>';
                    }).join('');
                    return head + '<div class="dotplot">' + cols + '</div></div>';
                }
                // FREQUENCY TABLE: too many distinct / free-text answers for a dotplot.
                var rows = g.order.map(function (a) {
                    var who = g.groups[a], correct = !!accepted[_aiNormAns(a)];
                    return '<tr><td class="freq-ans' + (correct ? ' correct' : '') + '">' + _aiClassEsc(a) +
                        (correct ? ' ✓' : '') + '</td><td class="freq-n">' + who.length +
                        '</td><td class="freq-who">' + _aiClassEsc(who.join(', ')) + '</td></tr>';
                }).join('');
                return head + '<table class="freq-table"><thead><tr><th>Answer</th><th>#</th><th>Who</th></tr></thead><tbody>' +
                    rows + '</tbody></table></div>';
            }
            function _aiRenderClassEmpty(blank, itemId) {
                return '<div class="class-view"><div class="class-view-head"><strong>' +
                    _aiClassEsc(_aiClassPrompt(blank, itemId)) + '</strong></div>' +
                    '<p class="class-empty">No one in your class has answered this yet.</p></div>';
            }
            function _aiInjectClassStyles() {
                if (document.getElementById('ai-class-view-styles')) return;
                var s = document.createElement('style');
                s.id = 'ai-class-view-styles';
                s.textContent = [
                    '.class-view{margin:0 0 16px 0;padding:8px;border:1px solid #d7ddea;border-radius:8px;background:#fbfcff}',
                    '.class-view-head{font-size:0.92em;margin-bottom:6px;color:#243}',
                    '.class-view-meta{color:#789;font-weight:normal;font-size:0.85em}',
                    '.class-empty{color:#789;font-size:0.85em;margin:4px 2px}',
                    '.dotplot{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;padding:4px 2px}',
                    '.dot-col{display:flex;flex-direction:column;align-items:center;min-width:46px;max-width:130px}',
                    '.dot-stack{font-size:12px;line-height:1.05;color:#6b7a99;letter-spacing:1px;word-break:break-all;text-align:center;min-height:14px}',
                    '.dot-count{font-weight:bold;font-size:0.85em;margin-top:2px;color:#334}',
                    '.dot-label{font-size:0.78em;margin-top:2px;text-align:center;overflow-wrap:anywhere}',
                    '.dot-label.correct,.freq-ans.correct{color:#2e7d32;font-weight:bold}',
                    '.dot-who{font-size:0.72em;color:#667;margin-top:3px;text-align:center;overflow-wrap:anywhere}',
                    '.freq-table{width:100%;border-collapse:collapse;font-size:0.82em}',
                    '.freq-table th,.freq-table td{border:1px solid #e2e6f0;padding:3px 6px;text-align:left;vertical-align:top}',
                    '.freq-table td.freq-n{text-align:center;font-weight:bold;width:34px}',
                    '.freq-who{color:#667}'
                ].join('');
                (document.head || document.documentElement).appendChild(s);
            }
            // Override the drawer loader: named class view when signed in, else the
            // original anonymous bars.
            if (typeof window.loadAggregateData === 'function') {
                var _aiOrigLoadAggregate = window.loadAggregateData;
                window.loadAggregateData = async function () {
                    try {
                        if (!_aiClassToken() || !window.ROSTER_SERVICE_URL) return _aiOrigLoadAggregate.apply(this, arguments);
                        var content = document.getElementById('drawerContent');
                        var blanks = (typeof currentQuestionBlanks !== 'undefined' && currentQuestionBlanks) ? currentQuestionBlanks : [];
                        if (!content || !blanks.length) return _aiOrigLoadAggregate.apply(this, arguments);
                        _aiInjectClassStyles();
                        var html = '';
                        for (var i = 0; i < blanks.length; i++) {
                            var blank = blanks[i];
                            var itemId = (blank && blank.dataset) ? blank.dataset.questionId : null;
                            if (!itemId) continue;
                            var named = await _aiFetchClassNamed(itemId);
                            html += (named && named.responses && named.responses.length)
                                ? _aiRenderClassNamed(blank, itemId, named.responses)
                                : _aiRenderClassEmpty(blank, itemId);
                        }
                        content.innerHTML = html || '<p>No responses yet.</p>';
                        if (typeof spawnPeerSnow === 'function') { try { spawnPeerSnow(); } catch (_) {} }
                    } catch (_) {
                        try { return _aiOrigLoadAggregate.apply(this, arguments); } catch (__) {}
                    }
                };
            }

            // -- auto-on-Done: "Check Answers" IS the worksheet's grade/done
            //    action. Wrap it so a check also kicks the AI pass — guarded by
            //    hash dedup + single-flight, so repeat checks don't spam the API.
            //    _aiReassertCredits keeps earned greens stable when the verbatim
            //    pass re-paints (the AI pass skips on an unchanged hash).
            if (typeof window.checkAnswers === 'function') {
                var _aiOrigCheckAnswers = window.checkAnswers;
                window.checkAnswers = function () {
                    var r = _aiOrigCheckAnswers.apply(this, arguments);
                    _aiReassertCredits();
                    _aiUpdateScoreDisplay();   // keep the visible Score counting AI greens
                    try { window.aiGradeWorksheet({ manual: false }); } catch (_) {}
                    return r;
                };
            }
        })();
