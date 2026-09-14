// tools/schoology-dom-helpers.js
//
// Pure DOM-parsing helpers for the Schoology gradebook + Add Assignment form.
// Loaded into the live page via CDP Runtime.evaluate (attaches to
// window.SchoologyDomHelpers). Tested via tests/schoology-dom-helpers.test.js
// using jsdom + the fixtures in tests/fixtures/schoology-*.html.
//
// Source of truth for selectors: SCHOOLOGY_SYNC_V1_BUILD.md P0 Discovery
// section.
//
// ASCII only. LF line endings.

(function () {
    'use strict';

    var AGGREGATE_KEYS = [
        'overall',
        'overall_override',
        'total_points_awarded',
        'gp',
        'gp_override'
    ];

    // -----------------------------------------------------------------------
    // listStudents(doc) -> [{ studentId, name, rowIndex }]
    //
    // Each student is rendered as a row container carrying
    // [data-uid="<schoology_user_id>"]. The student's display name is the
    // FIRST [aria-label] descendant of the row -- subsequent aria-labels
    // are buttons inside the [role="rowheader"] cell ("Send message",
    // "View student report") so we pick the document-order first match.
    // rowIndex is taken from any gridcell's data-y attribute on the row --
    // the row's 0-based position in the grader grid.
    // -----------------------------------------------------------------------
    function listStudents(doc) {
        var rows = doc.querySelectorAll('[data-uid]');
        var out = [];
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var uid = row.getAttribute('data-uid') || '';
            if (!/^\d+$/.test(uid)) continue;
            var nameEl = row.querySelector('[aria-label]');
            var name = nameEl ? (nameEl.getAttribute('aria-label') || '').trim() : '';
            var cell = row.querySelector('[role="gridcell"][data-y]');
            var rowIndex = cell ? parseInt(cell.getAttribute('data-y'), 10) : null;
            if (rowIndex !== null && isNaN(rowIndex)) rowIndex = null;
            out.push({ studentId: uid, name: name, rowIndex: rowIndex });
        }
        return out;
    }

    // -----------------------------------------------------------------------
    // listAssignments(doc) -> [{ columnKey, isAggregate }]
    //
    // Returns the distinct column keys seen on the page (from
    // [role="gridcell"][data-x]). For an empty gradebook only the 5
    // aggregate columns are real; the AngularJS grid pads with
    // placeholder columns carrying class "grader-grid-cell-type-none" and
    // single-digit data-x values ("0".."9") -- those are filtered out.
    // Once real assignments exist, each assignment id becomes its own
    // data-x key (a Schoology assignment id is a long numeric string).
    // -----------------------------------------------------------------------
    function listAssignments(doc) {
        var cells = doc.querySelectorAll('[role="gridcell"][data-x]');
        var seen = {};
        var out = [];
        for (var i = 0; i < cells.length; i++) {
            var c = cells[i];
            if (c.classList && c.classList.contains('grader-grid-cell-type-none')) continue;
            var key = c.getAttribute('data-x') || '';
            if (!key || seen[key]) continue;
            seen[key] = true;
            out.push({
                columnKey: key,
                isAggregate: AGGREGATE_KEYS.indexOf(key) !== -1
            });
        }
        return out;
    }

    // -----------------------------------------------------------------------
    // findCellSelector({ columnKey, rowIndex }) -> "#grader-grid-cell-<col>-<row>"
    //
    // The cell id is the stable handle on the gradebook. data-x/data-y also
    // identify the cell but the id selector is unambiguous and CSS-safe.
    // Returns null if either input is missing.
    // -----------------------------------------------------------------------
    function findCellSelector(opts) {
        if (!opts) return null;
        var col = opts.columnKey;
        var row = opts.rowIndex;
        if (!col || typeof col !== 'string') return null;
        if (row === null || row === undefined || row === '') return null;
        var rowNum = parseInt(row, 10);
        if (isNaN(rowNum) || rowNum < 0) return null;
        return '#grader-grid-cell-' + col + '-' + String(rowNum);
    }

    // -----------------------------------------------------------------------
    // parseMarkingPeriods(doc) -> [{ mp, startLabel, endLabel }]
    //
    // Reads the [aria-label="Marking Period N: M/D/YY - M/D/YY"] headers
    // rendered in the gradebook (deduplicated by mp number). The form-side
    // grading_period_id lookup is in parseAddAssignmentForm().
    // -----------------------------------------------------------------------
    function parseMarkingPeriods(doc) {
        var headers = doc.querySelectorAll('[aria-label]');
        var out = [];
        for (var i = 0; i < headers.length; i++) {
            var lbl = headers[i].getAttribute('aria-label') || '';
            var m = lbl.match(/^Marking Period (\d+):\s*(\d+\/\d+\/\d+)\s*-\s*(\d+\/\d+\/\d+)$/);
            if (!m) continue;
            out.push({
                mp: parseInt(m[1], 10),
                startLabel: m[2],
                endLabel: m[3]
            });
        }
        var seen = {};
        var unique = [];
        for (var j = 0; j < out.length; j++) {
            if (seen[out[j].mp]) continue;
            seen[out[j].mp] = true;
            unique.push(out[j]);
        }
        return unique;
    }

    // -----------------------------------------------------------------------
    // parseAddAssignmentForm(doc) -> { formId, categories, markingPeriods }
    //
    // Reads the Add Assignment popup form (form#s-grade-item-add-form).
    // Only the PRIMARY-course selects are returned -- the "additional
    // courses" multi-course-create selects use bracket-syntax names
    // (addl_courses[<id>][grading_category_nid]) and are ignored here.
    // -----------------------------------------------------------------------
    function parseAddAssignmentForm(doc) {
        return {
            formId: doc.querySelector('form#s-grade-item-add-form') ? 's-grade-item-add-form' : null,
            categories: readSelectOptions(doc, 'grading_category_id'),
            markingPeriods: readSelectOptions(doc, 'grading_period_id')
        };
    }

    function readSelectOptions(doc, exactName) {
        var sel = doc.querySelector('select[name="' + exactName + '"]');
        if (!sel) return [];
        var opts = sel.querySelectorAll('option');
        var out = [];
        for (var i = 0; i < opts.length; i++) {
            var o = opts[i];
            out.push({
                value: o.getAttribute('value') || '',
                text: (o.textContent || '').trim()
            });
        }
        return out;
    }

    // -----------------------------------------------------------------------
    // findCategoryIdByName(categories, name) -> "<id>" or null
    //
    // Exact text match. categories is the array from parseAddAssignmentForm.
    // -----------------------------------------------------------------------
    function findCategoryIdByName(categories, name) {
        if (!Array.isArray(categories) || !name) return null;
        for (var i = 0; i < categories.length; i++) {
            if (categories[i] && categories[i].text === name) {
                return categories[i].value || null;
            }
        }
        return null;
    }

    // -----------------------------------------------------------------------
    // findMarkingPeriodIdForDate(markingPeriods, isoDate) -> "<id>" or null
    //
    // markingPeriods is the array from parseAddAssignmentForm; each entry's
    // text reads "MP N: M/D/YY - M/D/YY". Find the option whose date range
    // covers isoDate (a YYYY-MM-DD string). The returned id is the
    // grading_period_id form value (per-section, looked up at runtime).
    // -----------------------------------------------------------------------
    function findMarkingPeriodIdForDate(markingPeriods, isoDate) {
        if (!Array.isArray(markingPeriods) || !isoDate) return null;
        var target = parseIsoDate(isoDate);
        if (!target) return null;
        for (var i = 0; i < markingPeriods.length; i++) {
            var t = (markingPeriods[i] && markingPeriods[i].text) || '';
            var m = t.match(/(\d+\/\d+\/\d+)\s*-\s*(\d+\/\d+\/\d+)/);
            if (!m) continue;
            var start = parseUsDate(m[1]);
            var end = parseUsDate(m[2]);
            if (!start || !end) continue;
            if (target.valueOf() >= start.valueOf() && target.valueOf() <= end.valueOf()) {
                return markingPeriods[i].value || null;
            }
        }
        return null;
    }

    function parseIsoDate(s) {
        var m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (!m) return null;
        var year = parseInt(m[1], 10);
        var month = parseInt(m[2], 10);
        var day = parseInt(m[3], 10);
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        return new Date(year, month - 1, day);
    }

    function parseUsDate(s) {
        var m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (!m) return null;
        var month = parseInt(m[1], 10);
        var day = parseInt(m[2], 10);
        var year = parseInt(m[3], 10);
        if (year < 100) year += 2000;
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        return new Date(year, month - 1, day);
    }

    // -----------------------------------------------------------------------
    // detectLoginState(doc) -> 'authenticated' | 'login_required' | 'unknown'
    //
    // Coarse signal so the sync can exit early with a clear message instead
    // of clicking around on a login page. Gradebook DOM has the
    // s-app-gradebook-app body class + the data-uid student rows.
    // -----------------------------------------------------------------------
    function detectLoginState(doc) {
        if (!doc || !doc.body) return 'unknown';
        var body = doc.body;
        var hasGradebookApp = body.classList && (
            body.classList.contains('s-app-gradebook-app-beta') ||
            body.classList.contains('s-app-gradebook-app')
        );
        if (hasGradebookApp) return 'authenticated';
        // MS SSO login page has an input id starting with i0116 (email) or
        // a known Schoology login form.
        if (doc.querySelector('#i0116, #i0118, form#login-form')) return 'login_required';
        return 'unknown';
    }

    var api = {
        AGGREGATE_KEYS: AGGREGATE_KEYS,
        listStudents: listStudents,
        listAssignments: listAssignments,
        findCellSelector: findCellSelector,
        parseMarkingPeriods: parseMarkingPeriods,
        parseAddAssignmentForm: parseAddAssignmentForm,
        findCategoryIdByName: findCategoryIdByName,
        findMarkingPeriodIdForDate: findMarkingPeriodIdForDate,
        detectLoginState: detectLoginState
    };

    if (typeof window !== 'undefined') {
        window.SchoologyDomHelpers = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
