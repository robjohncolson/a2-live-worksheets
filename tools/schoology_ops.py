"""schoology_ops.py -- importable live-ops layer for Schoology grade sync.

Extracted from tools/schoology-sync.py (P1b verified, 2026-05-29) so that
higher-level batch-sync code (P2+) can import these without re-implementing
the proven CDP mechanics.

All functions take an EdgeCDP instance as their first argument and perform
I/O against the live page. None of them navigate unless documented.

ASCII only. LF line endings.
"""
from __future__ import annotations

import json
import math
import os
import time
from typing import Optional

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Insert the cdp dir so `from edge import EdgeCDP` resolves the same way
# schoology-sync.py does (tools/cdp/edge.py).
import sys
sys.path.insert(0, os.path.join(SCRIPT_DIR, "cdp"))
from edge import EdgeCDP, DEFAULT_PORT  # type: ignore

SCHOOLOGY_BASE = "https://lynnschools.schoology.com"
HELPERS_PATH   = os.path.join(SCRIPT_DIR, "schoology-dom-helpers.js")


def connect(reuse: bool = True, port: int = DEFAULT_PORT) -> EdgeCDP:
    """Launch/attach the Edge CDP rig for Schoology and return the client.

    reuse=True attaches to an already-running debug session if present (keeps
    the warm Schoology cookie); otherwise it launches Edge. Mirrors how
    schoology-sync.py boots the rig, so P2 orchestration shares one entry point.
    """
    cdp = EdgeCDP(port=port)
    cdp.launch(SCHOOLOGY_BASE, reuse=reuse)
    return cdp


def navigate(cdp, url: str, wait_ms: int = 3500) -> None:
    """Navigate the attached page to `url` and wait for load (thin wrapper)."""
    cdp.attach_url(url, wait_ms=wait_ms)


# --------------------------------------------------------------------------- #
# URLs                                                                         #
# --------------------------------------------------------------------------- #

def gradebook_url(course_id: str) -> str:
    """Return the gradebook URL for a Schoology course id."""
    return f"{SCHOOLOGY_BASE}/course/{course_id}/grades"


def add_assignment_url(course_id: str, is_test: bool = False) -> str:
    """Return the Add Assignment popup form URL for a course.

    is_test=True uses the add_assessment variant (Test/Quiz form); both
    forms share the same field schema (Q4 in P0 discovery).
    """
    suffix = "add_assessment" if is_test else "add"
    return f"{SCHOOLOGY_BASE}/course/{course_id}/materials/assignments/{suffix}?is_popup=1"


# --------------------------------------------------------------------------- #
# Helper injection                                                             #
# --------------------------------------------------------------------------- #

def inject_helpers(cdp: EdgeCDP) -> None:
    """Eval tools/schoology-dom-helpers.js in the live page.

    Attaches window.SchoologyDomHelpers. Safe to call multiple times --
    the IIFE overwrites the existing binding.
    """
    with open(HELPERS_PATH, "r", encoding="utf-8") as f:
        src = f.read()
    cdp.eval_js(src)


def helper_call(cdp: EdgeCDP, expression: str):
    """Eval JSON.stringify(<expression>) and JSON-decode the result.

    Returns a plain Python object. Returns None if the page returns
    undefined or the JSON is empty.
    """
    wrapped = f"JSON.stringify({expression})"
    raw = cdp.eval_js(wrapped)
    if raw is None:
        return None
    return json.loads(raw)


# --------------------------------------------------------------------------- #
# Login                                                                        #
# --------------------------------------------------------------------------- #

def detect_login_state(cdp: EdgeCDP) -> str:
    """Return 'authenticated' | 'login_required' | 'unknown'.

    Requires helpers already injected (call inject_helpers first).
    """
    state = helper_call(cdp, "window.SchoologyDomHelpers.detectLoginState(document)")
    return state or "unknown"


# --------------------------------------------------------------------------- #
# Gradebook readers                                                            #
# --------------------------------------------------------------------------- #

def list_students(cdp: EdgeCDP) -> list:
    """Return [{studentId, rowIndex, name}] from the live gradebook.

    Requires helpers already injected and the gradebook page loaded.
    """
    return helper_call(cdp, "window.SchoologyDomHelpers.listStudents(document)") or []


def list_assignments(cdp: EdgeCDP) -> list:
    """Return [{columnKey, isAggregate}] from the live gradebook.

    Filters out AngularJS placeholder columns (grader-grid-cell-type-none).
    Requires helpers already injected and the gradebook page loaded.
    """
    return helper_call(cdp, "window.SchoologyDomHelpers.listAssignments(document)") or []


def find_cell_selector(cdp: EdgeCDP, column_key: str, row_index: int) -> Optional[str]:
    """Return the CSS selector for a specific grade cell, or None.

    The selector is '#grader-grid-cell-<col>-<row>' -- stable, id-based.
    Requires helpers already injected.
    """
    expr = (
        f"window.SchoologyDomHelpers.findCellSelector("
        f"{{ columnKey: {json.dumps(column_key)}, rowIndex: {int(row_index)} }})"
    )
    return helper_call(cdp, expr)


# --------------------------------------------------------------------------- #
# Grade write                                                                  #
# --------------------------------------------------------------------------- #

def read_grade_from_cell(cdp: EdgeCDP, column_key: str, row_index: int) -> float | None:
    """Read the persistent grade input without focus, typing, or navigation."""
    selector = find_cell_selector(cdp, column_key, row_index)
    if not selector:
        return None
    input_selector = selector + " input.grader-edit-input"
    raw = cdp.eval_js(
        f"document.querySelector({json.dumps(input_selector)})?.value ?? null"
    )
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return value if math.isfinite(value) else None


def write_grade_to_cell(
    cdp: EdgeCDP,
    column_key: str,
    row_index: int,
    value: float,
) -> dict:
    """Write a grade into one gradebook cell.  P1b-VERIFIED mechanism.

    The grade cell (#grader-grid-cell-<col>-<row>) holds a PERSISTENT
    <input class="grade grader-edit-input"> (always in DOM, no ng-model).
    Schoology saves ONLY on a real keystroke sequence committed with Enter.
    Synthetic value setters, insertText, and blur all fail to persist.

    Steps:
      1. Resolve the cell selector via find_cell_selector.
      2. Verify the input exists in the DOM.
      3. Focus via JS .focus() with a retry loop that also tries a
         trusted coordinate-click on the input rect center (Angular init
         is flaky). Up to 6 attempts, re-querying the input each time.
      4. Backspace-clear the existing value.
      5. Type each char via Input.dispatchKeyEvent (keyDown/keyUp with
         text) -- Angular's save handler requires real keystrokes.
      6. Commit with a real Enter key event.

    Returns {'ok': bool, 'typed': <input value after typing>, 'focused': bool}.

    This function is a byte-for-byte extraction of the working p1_write()
    body in schoology-sync.py -- do not change the mechanism without
    updating the P1b record in SCHOOLOGY_SYNC_V1_BUILD.md.
    """
    selector = find_cell_selector(cdp, column_key, row_index)
    if not selector:
        return {"ok": False, "typed": None, "focused": False}

    input_sel = selector + " input.grader-edit-input"
    if not cdp.eval_js(f"!!document.querySelector({json.dumps(input_sel)})"):
        return {"ok": False, "typed": None, "focused": False}

    def _focused() -> bool:
        return bool(cdp.eval_js(
            f"document.activeElement===document.querySelector({json.dumps(input_sel)})"
        ))

    # 2026-09-09 (first live daily run): Chromium DROPS Input.dispatchKeyEvent on a page whose
    # visibilityState is 'hidden' -- the scheduled task launches the rig Edge behind other
    # windows, so every keystroke was silently lost (focus + Enter "succeeded", nothing typed,
    # nothing saved). Bring the page to front and emulate focus first; both are idempotent.
    try:
        cdp.send("Page.bringToFront", {})
        cdp.send("Emulation.setFocusEmulationEnabled", {"enabled": True})
    except Exception:  # noqa: BLE001 -- best effort; the verification below is the real gate
        pass

    # Focus the input. Angular's first-render timing is flaky, so retry a few
    # times, trying BOTH JS .focus() and a trusted coordinate-click, re-querying
    # the input fresh each attempt (the grid can re-render between CDP calls).
    focused = False
    for _ in range(6):
        cdp.eval_js(
            f"(function(){{var a=document.querySelector({json.dumps(input_sel)});"
            "if(a){a.scrollIntoView({block:'center',inline:'center'});a.focus();}})()"
        )
        time.sleep(0.35)
        if _focused():
            focused = True
            break
        rect = cdp.eval_js(
            f"(function(){{var a=document.querySelector({json.dumps(input_sel)});if(!a)return null;"
            "var r=a.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}})()"
        )
        if rect:
            cdp.click(int(rect["x"]), int(rect["y"]))
            time.sleep(0.45)
            if _focused():
                focused = True
                break

    if not focused:
        return {"ok": False, "typed": None, "focused": False}

    def _key(vk: int, key: str, code: str, text: Optional[str] = None) -> None:
        down = {"type": "keyDown", "key": key, "code": code,
                "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk}
        if text is not None:
            down["text"] = text
            down["unmodifiedText"] = text
        cdp.send("Input.dispatchKeyEvent", down)
        cdp.send("Input.dispatchKeyEvent", {
            "type": "keyUp", "key": key, "code": code,
            "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk,
        })

    # Clear any existing value first so a re-sync overwrites cleanly.
    existing = cdp.eval_js(
        f"(function(){{var a=document.querySelector({json.dumps(input_sel)});return a?a.value:'';}})()"
    ) or ""
    for _ in range(len(str(existing)) + 1):
        _key(8, "Backspace", "Backspace")

    # Format the value: drop trailing ".0" so a whole number types as "95".
    val_str = str(int(value)) if float(value).is_integer() else str(value)

    # Type each character via a real key event so Angular's save handler fires.
    code_for = {
        "0": "Digit0", "1": "Digit1", "2": "Digit2", "3": "Digit3", "4": "Digit4",
        "5": "Digit5", "6": "Digit6", "7": "Digit7", "8": "Digit8", "9": "Digit9",
        ".": "Period", "-": "Minus",
    }
    vk_for = {
        "0": 48, "1": 49, "2": 50, "3": 51, "4": 52, "5": 53, "6": 54, "7": 55,
        "8": 56, "9": 57, ".": 190, "-": 189,
    }
    for ch in val_str:
        _key(vk_for.get(ch, 0), ch, code_for.get(ch, ""), text=ch)
    time.sleep(0.3)

    typed = cdp.eval_js(
        f"(function(){{var a=document.querySelector({json.dumps(input_sel)});return a?a.value:null;}})()"
    )

    # Commit with a real Enter key event (triggers Schoology's save).
    _key(13, "Enter", "Enter", text="\r")
    time.sleep(2.0)

    # VERIFY the save instead of trusting the keystrokes: the cell's aria-label carries the
    # persisted grade ('<student>, <title>, <grade> out of <pts>'); the input value is the
    # fallback for cells without that phrasing (overrides). Poll briefly -- the save is async.
    persisted = False
    for _ in range(6):
        state = cdp.eval_js(
            f"(function(){{var c=document.querySelector({json.dumps(selector)});var a=c?c.querySelector('input'):null;"
            f"return {{aria:c?c.getAttribute('aria-label'):null,val:a?a.value:null}};}})()"
        ) or {}
        aria = str(state.get("aria") or "")
        val = str(state.get("val") or "").strip()
        if f", {val_str} out of" in aria or (val and _same_number(val, val_str)):
            persisted = True
            break
        time.sleep(0.5)

    return {"ok": persisted, "typed": typed, "focused": True,
            **({} if persisted else {"error": f"grade {val_str} did not persist (typed={typed!r})"})}


def _same_number(a: str, b: str) -> bool:
    try:
        return abs(float(a) - float(b)) < 0.05
    except ValueError:
        return a == b


def write_override(cdp: EdgeCDP, row_index: int, value: float, *, gp: bool = True) -> dict:
    """Write the computed quarter grade into the gradebook OVERRIDE column (v3.3).

    The override cell holds the SAME persistent <input class="grade
    grader-edit-input"> as a normal grade cell -- verified live 2026-05-30:
    #grader-grid-cell-gp_override-<row> (and overall_override-<row>), type=text,
    not read-only -- so this reuses the P1b-verified write_grade_to_cell
    mechanism unchanged (focus + Backspace-clear + real key events + Enter).

    gp=True  -> gp_override: the grading-PERIOD (quarter) override. This is the
                official grade that flows to PowerSchool SIS -- the v3 delivery
                target (the computed quarter_grade(pc, work) per student, MP).
    gp=False -> overall_override: the year/overall column.

    Returns write_grade_to_cell's {'ok', 'typed', 'focused'}.

    NOT yet live-smoke-tested (the mechanism is identical to the verified grade
    write, and a test override on a student is not cleanly revertible via this
    path); do a single-shot live verify when there is a real value to write.
    """
    column_key = "gp_override" if gp else "overall_override"
    return write_grade_to_cell(cdp, column_key, row_index, value)


# --------------------------------------------------------------------------- #
# Assignment lookup                                                            #
# --------------------------------------------------------------------------- #

def find_assignment_id_by_title(cdp: EdgeCDP, title: str) -> Optional[str]:
    """Scan gradebook column headers for an assignment whose title matches.

    Returns the data-x columnKey string, or None if not found.
    Requires the gradebook page to be loaded and helpers injected.

    Used as a lookup-by-title pre-flight for P2 auto-create to avoid
    creating duplicate assignments (P1b gotcha: 3 duplicate Sync Test 1
    columns appeared when the Add Assignment form was resubmitted).
    """
    # Robust mapping (P2b RE, 2026-05-29): the row-0 grade cells carry
    #   aria-label="<student>, <assignment title>[, <grade> out of <pts> points]"
    # so we scan [role=gridcell][data-y="0"] and match the ", <title>" segment.
    # A header-title scan fails -- the title elements are ng-binding spans NOT
    # inside a [data-x] ancestor, and [role=columnheader] textContent carries
    # menu cruft.
    found = cdp.eval_js(
        "(function(){"
        "var title = " + json.dumps(title) + ";"
        "var needle = ', ' + title;"
        "var cells = document.querySelectorAll('[role=\"gridcell\"][data-y=\"0\"]');"
        "for (var i = 0; i < cells.length; i++) {"
        "  var al = cells[i].getAttribute('aria-label') || '';"
        "  var idx = al.indexOf(needle);"
        "  if (idx >= 0) {"
        "    var after = al.substring(idx + needle.length);"
        "    if (after === '' || after.charAt(0) === ',') {"
        "      return cells[i].getAttribute('data-x');"
        "    }"
        "  }"
        "}"
        "return null;"
        "})()"
    )
    return found or None


# --------------------------------------------------------------------------- #
# Add Assignment form                                                          #
# --------------------------------------------------------------------------- #

def add_assignment(
    cdp: EdgeCDP,
    course_id: str,
    *,
    title: str,
    points: int = 100,
    category_id: str,
    grading_period_id: str,
    due_date: Optional[str] = None,
    publish_scores: bool = True,
    sync_to_sis: bool = True,
) -> dict:
    """Navigate to the Add Assignment form and submit it.

    Fills form id s-grade-item-add-form per the P0 Q4 schema:
      - title (text, required)
      - max_points (default 100)
      - grading_category_id (select-one)
      - grading_period_id (select-one)
      - due_date[date] (optional, YYYY-MM-DD)
      - publish_scores (checkbox, checked when publish_scores=True)
      - sync_to_sis_wrapper[sync_to_sis_option] (checkbox, checked when sync_to_sis=True)

    Sets <select>/<input> values via JS + dispatches change/input events,
    then submits by clicking input#edit-submit (op=Create).

    Returns {'ok': bool, 'assignment_id': str|None, 'error': str|None}.
    assignment_id is captured from the post-submit URL or DOM if possible;
    if not capturable, returns None with ok=True (caller falls back to
    find_assignment_id_by_title).

    s121 teacher decision: sync_to_sis ALWAYS True, publish_scores ALWAYS True.
    """
    cdp.attach_url(add_assignment_url(course_id), wait_ms=3000)

    # Verify the form is present.
    form_present = cdp.eval_js("!!document.querySelector('form#s-grade-item-add-form')")
    if not form_present:
        return {"ok": False, "assignment_id": None, "error": "Add Assignment form not found"}

    def _set_input(name: str, val: str) -> None:
        js = (
            "(function(){"
            f"  var el = document.querySelector('input[name=\"{name}\"], textarea[name=\"{name}\"]');"
            "  if (!el) return;"
            f"  el.value = {json.dumps(val)};"
            "  el.dispatchEvent(new Event('input',  {bubbles:true}));"
            "  el.dispatchEvent(new Event('change', {bubbles:true}));"
            "})()"
        )
        cdp.eval_js(js)

    def _set_select(name: str, val: str) -> None:
        js = (
            "(function(){"
            f"  var el = document.querySelector('select[name=\"{name}\"]');"
            "  if (!el) return;"
            f"  el.value = {json.dumps(val)};"
            "  el.dispatchEvent(new Event('change', {bubbles:true}));"
            "})()"
        )
        cdp.eval_js(js)

    def _set_checkbox(name: str, checked: bool) -> None:
        js = (
            "(function(){"
            f"  var el = document.querySelector('input[name=\"{name}\"]');"
            "  if (!el) return;"
            f"  el.checked = {json.dumps(checked)};"
            "  el.dispatchEvent(new Event('change', {bubbles:true}));"
            "})()"
        )
        cdp.eval_js(js)

    _set_input("title", title)
    _set_input("max_points", str(points))
    _set_select("grading_category_id", category_id)
    _set_select("grading_period_id", grading_period_id)
    if due_date:
        # Schoology's datepicker expects m/dd/y (e.g. 5/15/26), NOT ISO --
        # submitting an ISO YYYY-MM-DD value yields "Field Due date is invalid".
        due_fmt = due_date
        try:
            y, mo, d = due_date.split("-")
            due_fmt = f"{int(mo)}/{d}/{y[2:]}"
        except (ValueError, AttributeError):
            pass
        _set_input("due_date[date]", due_fmt)
        # A date with no time fails validation ("A time is required to enable
        # submissions"), so default to end-of-day.
        _set_input("due_date[time]", "11:59pm")
    _set_checkbox("publish_scores", publish_scores)
    _set_checkbox("sync_to_sis_wrapper[sync_to_sis_option]", sync_to_sis)

    time.sleep(0.5)

    # Submit with a JS click on input#edit-submit (op=Create). Live smoke
    # 2026-05-30: a coordinate-click MISSED -- the long form put the button below
    # the fold and the create never fired -- while a JS .click() fired reliably
    # and includes the button's name/value, so Drupal still gets op=Create. Click
    # ONCE (re-clicking could double-create if the submit is slow); detection of
    # the result is handled below.
    clicked = cdp.eval_js(
        "(function(){var el=document.querySelector('input#edit-submit');"
        "if(!el)return false;el.click();return true;})()"
    )
    if not clicked:
        return {"ok": False, "assignment_id": None, "error": "Submit button not found"}

    # Detection is BEST-EFFORT. A successful submit returns a TRANSIENT JSON blob
    #   {"assignment_nid":"<id>","path":"assignment-creation-complete",...}
    # that the page redirects away from quickly, so it is easy to miss -- and
    # Schoology's gradebook/materials lists are eventually-consistent, so they
    # don't reflect a brand-new create synchronously either. We therefore poll
    # Network response bodies first, then the DOM JSON (and validation errors),
    # but do NOT re-click (re-clicking could double-create). The network
    # fast-path is immune to gradebook DOM lag; live verification is still gated
    # to the single-host Schoology rig. The RELIABILITY mechanism remains the
    # idempotent sync: a re-run reconciles via find_assignment_id_by_title once
    # the column has rendered. So `ok`/`assignment_id` here are a fast-path, not
    # a guarantee.
    import re
    assignment_id = None
    created = False

    # The create POSTs to /course/<id>/materials/assignments/add?is_popup=1, so
    # match THAT url. "assignment-creation-complete" is a token in the JSON
    # response BODY, not the url. Live-verified 2026-05-30: with a reliable
    # submit, this filter matches that one response (out of ~100) and
    # getResponseBody returns the JSON (status 200, assignment_nid present) --
    # the is_popup form yields a normal capturable response, not an evicted
    # navigation, so the fast-path fires. The DOM poll below + find-by-title
    # reconciliation stay as fallback / safety net.
    if hasattr(cdp, "wait_for_response"):
        try:
            captured = cdp.wait_for_response("materials/assignments/add", timeout=8.0)
        except Exception:
            captured = None
        if captured:
            try:
                payload = json.loads(captured.get("body") or "{}")
                nid = payload.get("assignment_nid")
                if nid:
                    assignment_id = str(nid)
                    created = True
            except (TypeError, ValueError):
                pass

    if not created:
        for _ in range(16):  # poll ~5s
            time.sleep(0.3)
            body = cdp.eval_js("(document.body && document.body.textContent) || ''") or ""
            m = re.search(r'"assignment_nid"\s*:\s*"?(\d+)"?', body)
            if m:
                assignment_id = m.group(1)
            if assignment_id or ("assignment-creation-complete" in body):
                created = True
                break
            error_text = cdp.eval_js(
                "(function(){var el=document.querySelector('.messages.error, "
                ".error-messages, .form-item--error-message');"
                "return el ? el.textContent.trim() : null;})()"
            )
            if error_text:
                return {"ok": False, "assignment_id": None, "error": error_text}

    return {"ok": created, "assignment_id": assignment_id,
            "error": None if created else "create not confirmed (best-effort; reconcile via re-sync)"}


def delete_assignment(cdp: EdgeCDP, nid: str, *, course_id: Optional[str] = None,
                      title: Optional[str] = None) -> dict:
    """Delete an assignment by its node id (P2b RE, 2026-05-30).

    GET /assignment/delete/<nid> renders a Drupal confirm form
    (id s-grade-item-delete-form) with a single "Delete" submit
    (input#edit-submit, op=Delete). Clicking it confirms -- and deletes ALL
    grades for the assignment. Returns {'ok': bool, 'error': str|None}.

    Verification: pass course_id + title to verify against GRADEBOOK TRUTH --
    the column is gone iff find_assignment_id_by_title returns None. The
    confirm-form-on-reload check is a FALSE-NEGATIVE: live smoke 2026-05-30
    showed the "Are you sure" form re-renders/caches even after a successful
    delete (the action URL does NOT redirect), so it is only the fallback when
    course_id/title are absent. The submit is a real COORDINATE click: the Drupal
    delete-confirm form does NOT submit on a JS .click() (verified 2026-05-31) --
    unlike the long add form (which needs JS click to dodge a below-the-fold
    miss), the short delete form needs the trusted gesture. It retries (the
    coordinate click is occasionally flaky), and deleting an already-gone
    assignment is a no-op, so the retry is safe.
    """
    for _ in range(3):
        cdp.attach_url(f"{SCHOOLOGY_BASE}/assignment/delete/{nid}", wait_ms=3000)
        if not cdp.eval_js("!!document.querySelector('form#s-grade-item-delete-form')"):
            return {"ok": True, "error": None}  # gone (deleted, or never existed)
        # Coordinate click (NOT a JS .click()): the Drupal delete-confirm form
        # does not submit on el.click() (verified 2026-05-31), unlike the add
        # form. The button is short / in view, so no below-the-fold miss here.
        cdp.eval_js(
            "(function(){var el=document.querySelector('input#edit-submit');"
            "if(el)el.scrollIntoView({block:'center',inline:'center'});})()"
        )
        time.sleep(0.3)
        rect = cdp.eval_js(
            "(function(){var el=document.querySelector('input#edit-submit');"
            "if(!el)return null;var r=el.getBoundingClientRect();"
            "return {x:r.left+r.width/2,y:r.top+r.height/2};})()"
        )
        if rect:
            cdp.click(int(rect["x"]), int(rect["y"]))
            time.sleep(2.5)

    # Final verify. Prefer gradebook truth when we have the course + title: the
    # column is gone iff find_assignment_id_by_title returns None. (The
    # confirm-form check below is a known false-negative -- see the docstring.)
    if course_id and title:
        for _ in range(3):
            cdp.attach_url(gradebook_url(course_id), wait_ms=4000)
            inject_helpers(cdp)
            if find_assignment_id_by_title(cdp, title) is None:
                return {"ok": True, "error": None}
            time.sleep(0.5)
        return {"ok": False, "error": "assignment still present in gradebook after delete retries"}

    cdp.attach_url(f"{SCHOOLOGY_BASE}/assignment/delete/{nid}", wait_ms=2500)
    gone = not cdp.eval_js("!!document.querySelector('form#s-grade-item-delete-form')")
    return {"ok": gone, "error": None if gone else "assignment still present after delete retries"}


# --------------------------------------------------------------------------- #
# Grade setup readers                                                          #
# --------------------------------------------------------------------------- #

def list_categories(cdp: EdgeCDP, course_id: str) -> dict:
    """Navigate to grade setup and return {category_name: category_id}.

    The weight inputs are named categories[<id>][weight]; each category
    row also carries the category name in its title input or row text.
    Returns an empty dict on parse failure.
    """
    cdp.attach_url(f"{SCHOOLOGY_BASE}/course/{course_id}/gradesetup", wait_ms=3000)

    result = cdp.eval_js(
        "(function(){"
        "  var out = {};"
        # Weight inputs: name="categories[<id>][weight]"
        "  var inputs = document.querySelectorAll('input[name*=\"categories[\"]');"
        "  for (var i = 0; i < inputs.length; i++) {"
        "    var inp = inputs[i];"
        "    var m = inp.name.match(/categories\\[(\\d+)\\]/);"
        "    if (!m) continue;"
        "    var id = m[1];"
        # Walk up to the row container and look for the title input or text.
        "    var row = inp.closest('tr, .category-row, li, .form-item');"
        "    if (!row) row = inp.parentElement;"
        "    var nameEl = row.querySelector('input[name*=\"[title]\"], "
        "input[name*=\"[name]\"]');"
        "    var name = nameEl ? nameEl.value.trim() : '';"
        "    if (!name) {"
        "      var spans = row.querySelectorAll('.title, .category-title, td, th');"
        "      for (var j = 0; j < spans.length; j++) {"
        "        var t = spans[j].textContent.trim();"
        "        if (t && t.length < 80) { name = t; break; }"
        "      }"
        "    }"
        "    if (name && id) out[name] = id;"
        "  }"
        "  return out;"
        "})()"
    )
    return result or {}


def list_marking_periods(cdp: EdgeCDP, course_id: str) -> dict:
    """Navigate to the Add Assignment form and read the grading_period_id select.

    Returns { grading_period_id(str): {'start':'YYYY-MM-DD','end':'YYYY-MM-DD'} }.

    First tries to read Drupal.settings grading_period_dates (a JSON map
    { id: {start: ISO8601, end: ISO8601} }). Falls back to parsing the
    select option text (format 'MP N: M/D/YY - M/D/YY').

    The IDs are per-section and differ between Algebra 2 Sec 1 and Sec 2;
    call this once per course_id at the start of a sync run.
    """
    cdp.attach_url(add_assignment_url(course_id), wait_ms=3000)

    # First try Drupal.settings (if the page exposes it).
    drupal_result = cdp.eval_js(
        "(function(){"
        "  try {"
        "    var s = Drupal.settings;"
        "    if (!s) return null;"
        "    var gp = s.grading_period_dates || (s.s_common && s.s_common.grading_period_dates);"
        "    if (!gp) return null;"
        "    var out = {};"
        "    for (var id in gp) {"
        "      var e = gp[id];"
        "      if (!e) continue;"
        "      var start = e.start || e.start_date || '';"
        "      var end   = e.end   || e.end_date   || '';"
        "      if (start && end) {"
        "        out[String(id)] = {"
        "          start: start.substring(0, 10),"
        "          end:   end.substring(0, 10)"
        "        };"
        "      }"
        "    }"
        "    return Object.keys(out).length ? out : null;"
        "  } catch(_) { return null; }"
        "})()"
    )
    if drupal_result:
        return drupal_result

    # Fallback: parse the <select name="grading_period_id"> options.
    # Option text format: "MP N: M/D/YY - M/D/YY"
    select_result = cdp.eval_js(
        "(function(){"
        "  var sel = document.querySelector('select[name=\"grading_period_id\"]');"
        "  if (!sel) return null;"
        "  var out = {};"
        "  var opts = sel.querySelectorAll('option');"
        "  for (var i = 0; i < opts.length; i++) {"
        "    var val = opts[i].value;"
        "    if (!val) continue;"
        "    var text = opts[i].textContent || '';"
        "    var m = text.match(/(\\d+)\\/(\\d+)\\/(\\d{2,4})\\s*-\\s*(\\d+)\\/(\\d+)\\/(\\d{2,4})/);"
        "    if (!m) continue;"
        "    function twoDigitYear(y) { return y < 100 ? 2000 + y : y; }"
        "    function pad(n) { return String(n).padStart(2,'0'); }"
        "    var sy = twoDigitYear(parseInt(m[3],10));"
        "    var ey = twoDigitYear(parseInt(m[6],10));"
        "    var start = sy+'-'+pad(m[1])+'-'+pad(m[2]);"
        "    var end   = ey+'-'+pad(m[4])+'-'+pad(m[5]);"
        "    out[String(val)] = {start: start, end: end};"
        "  }"
        "  return Object.keys(out).length ? out : null;"
        "})()"
    )
    return select_result or {}
