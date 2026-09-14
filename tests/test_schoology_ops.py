"""Unit tests for schoology_ops create/delete logic.

Fake cdp only -- no browser, no live Schoology. Pins the two fixes from the
2026-05-30 live smoke: the create fast-path URL filter, and delete verification
against gradebook truth instead of the false-negative confirm-form check.
"""
from __future__ import annotations

import json
import os
import sys
import types
import unittest


TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TESTS_DIR)
sys.path.insert(0, os.path.join(REPO_ROOT, "tools"))
sys.path.insert(0, os.path.join(REPO_ROOT, "tools", "cdp"))

# edge.py imports websocket-client at module load; stub it so importing
# schoology_ops succeeds without the real package (matches test_cdp_edge_network).
sys.modules.setdefault(
    "websocket",
    types.SimpleNamespace(WebSocketTimeoutException=TimeoutError, create_connection=None),
)

import schoology_ops as ops  # noqa: E402


class FakeCDP:
    """Stand-in for EdgeCDP that scripts eval_js + wait_for_response."""

    def __init__(self, *, wfr_result=None, body_text="",
                 delete_form_present=False, title_lookup=None):
        self.wfr_result = wfr_result
        self.wfr_calls = []
        self.body_text = body_text
        self.delete_form_present = delete_form_present
        self.title_lookup = title_lookup     # what find_assignment_id_by_title sees
        self.clicks = []
        self.urls = []
        self.evals = []

    def attach_url(self, url, wait_ms=0):
        self.urls.append(url)

    def click(self, x, y):
        self.clicks.append((x, y))

    def wait_for_response(self, url_substring, timeout=15.0):
        self.wfr_calls.append(url_substring)
        return self.wfr_result

    def eval_js(self, expr):
        self.evals.append(expr)
        if "s-grade-item-add-form" in expr:
            return True
        if "s-grade-item-delete-form" in expr:
            return self.delete_form_present
        if "getBoundingClientRect" in expr:   # submit rect (delete coordinate click)
            return {"x": 10, "y": 10}
        if "edit-submit" in expr:             # JS submit click (add) / scrollIntoView
            return True
        if "document.body" in expr and "textContent" in expr:
            return self.body_text
        if "gridcell" in expr:                # find_assignment_id_by_title scan
            return self.title_lookup
        return None


class TestAddAssignmentFilter(unittest.TestCase):
    def test_fastpath_uses_corrected_filter(self):
        fake = FakeCDP(wfr_result={"body": json.dumps({"assignment_nid": "999"})})
        res = ops.add_assignment(fake, "123", title="T",
                                 category_id="c", grading_period_id="g")
        self.assertEqual(res, {"ok": True, "assignment_id": "999", "error": None})
        self.assertEqual(fake.wfr_calls, ["materials/assignments/add"])
        self.assertNotIn("assignment-creation-complete", fake.wfr_calls)

    def test_falls_back_to_dom_poll_when_capture_misses(self):
        body = json.dumps({"assignment_nid": "777", "path": "assignment-creation-complete"})
        fake = FakeCDP(wfr_result=None, body_text=body)
        res = ops.add_assignment(fake, "123", title="T",
                                 category_id="c", grading_period_id="g")
        self.assertTrue(res["ok"])
        self.assertEqual(res["assignment_id"], "777")
        self.assertEqual(fake.wfr_calls, ["materials/assignments/add"])

    def test_submit_uses_js_click_not_coordinate(self):
        # Live smoke showed the coordinate-click missed; the submit is now a JS
        # click on input#edit-submit (no cdp.click(x,y)).
        fake = FakeCDP(wfr_result={"body": json.dumps({"assignment_nid": "1"})})
        ops.add_assignment(fake, "123", title="T", category_id="c", grading_period_id="g")
        self.assertEqual(fake.clicks, [])
        self.assertTrue(any("edit-submit" in e and "click()" in e for e in fake.evals))

    def test_corrected_filter_matches_real_post_url(self):
        # Documents the root cause: the filter must match the POST URL, not the
        # JSON body token that lives only inside the response.
        url = "/course/123/materials/assignments/add?is_popup=1"
        self.assertIn("materials/assignments/add", url)
        self.assertNotIn("assignment-creation-complete", url)


class TestDeleteVerify(unittest.TestCase):
    def test_uses_gradebook_truth_over_lying_confirm_form(self):
        # Confirm form ALWAYS renders (the false-negative), but the gradebook
        # shows the column gone -> delete should report ok=True.
        fake = FakeCDP(delete_form_present=True, title_lookup=None)
        res = ops.delete_assignment(fake, "555", course_id="123", title="T")
        self.assertEqual(res, {"ok": True, "error": None})

    def test_reports_present_when_gradebook_still_shows_column(self):
        fake = FakeCDP(delete_form_present=True, title_lookup="col-7")
        res = ops.delete_assignment(fake, "555", course_id="123", title="T")
        self.assertFalse(res["ok"])
        self.assertIn("gradebook", res["error"])

    def test_without_course_title_falls_back_to_form_check(self):
        fake = FakeCDP(delete_form_present=True)
        res = ops.delete_assignment(fake, "555")
        self.assertFalse(res["ok"])
        self.assertIn("after delete retries", res["error"])

    def test_early_success_when_confirm_form_absent(self):
        fake = FakeCDP(delete_form_present=False)
        res = ops.delete_assignment(fake, "555")
        self.assertTrue(res["ok"])


class TestWriteOverride(unittest.TestCase):
    def _capture(self):
        calls = []
        orig = ops.write_grade_to_cell
        ops.write_grade_to_cell = lambda cdp, col, row, val: (
            calls.append((col, row, val)), {"ok": True})[1]
        self.addCleanup(lambda: setattr(ops, "write_grade_to_cell", orig))
        return calls

    def test_gp_override_by_default(self):
        calls = self._capture()
        res = ops.write_override(None, 2, 95)
        self.assertEqual(calls, [("gp_override", 2, 95)])
        self.assertTrue(res["ok"])

    def test_overall_override_when_gp_false(self):
        calls = self._capture()
        ops.write_override(None, 4, 88, gp=False)
        self.assertEqual(calls, [("overall_override", 4, 88)])


if __name__ == "__main__":
    unittest.main()
