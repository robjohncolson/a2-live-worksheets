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

import re
import schoology_ops as ops  # noqa: E402
from unittest import mock  # noqa: E402


class FakeCDP:
    """Stand-in for EdgeCDP that scripts eval_js + wait_for_response."""

    def __init__(self, *, wfr_result=None, body_text="",
                 delete_form_present=False, title_lookup=None,
                 select_ready=True, reject_fields=(), materials=None, stubborn=()):
        self.wfr_result = wfr_result
        self.wfr_calls = []
        self.body_text = body_text
        self.delete_form_present = delete_form_present
        self.title_lookup = title_lookup     # what find_assignment_id_by_title sees
        self.select_ready = select_ready     # do the <select>s carry the wanted options?
        self.reject_fields = set(reject_fields)   # field names whose set value is silently dropped
        self.form_values = {}                # name -> value the form actually holds
        # materials: {folder_id_or_None: [rows]} served to list_materials by the page URL.
        self.materials = materials if materials is not None else {None: []}
        self.stubborn = set(stubborn)        # nids whose Move submit never takes
        self.current_url = None
        self.clicks = []
        self.urls = []
        self.evals = []

    def attach_url(self, url, wait_ms=0):
        self.urls.append(url)
        self.current_url = url

    def click(self, x, y):
        self.clicks.append((x, y))

    def wait_for_response(self, url_substring, timeout=15.0):
        self.wfr_calls.append(url_substring)
        return self.wfr_result

    def eval_js(self, expr):
        self.evals.append(expr)
        if "s-grade-item-add-form" in expr:
            return True
        # list_materials: rows for the folder named in the current page URL.
        if "a.move-material" in expr and "var out = [], seen = {}" in expr:
            m = re.search(r"[?&]f=([^&]+)", self.current_url or "")
            return list(self.materials.get(m.group(1) if m else None, []))
        # Move / delete form submits mutate the scripted materials.
        if "move-item-form" in expr and "click()" in expr:
            m = re.search(r"materials/move/([^/?]+)", self.current_url or "")
            nid = m.group(1) if m else None
            dest = self.form_values.get("destination_folder")
            if nid and nid not in self.stubborn:
                row = next((r for r in self.materials.get(None, []) if r["nid"] == nid), None)
                if row:
                    self.materials[None].remove(row)
                    self.materials.setdefault(dest, []).append(row)
            return None
        # add_assignment readiness poll: every wanted <option> present?
        if "el.options" in expr:
            return self.select_ready
        # add_assignment form fill: remember what the form now holds (unless rejected).
        m = re.search(r'\[name="([^"]+)"\]', expr)
        if m and re.search(r'el\.value\s*=\s*"', expr):
            v = re.search(r'el\.value\s*=\s*(".*?");', expr)
            if m.group(1) not in self.reject_fields and v:
                self.form_values[m.group(1)] = json.loads(v.group(1))
            return None
        # add_assignment read-back before submit.
        if "String(el.value)" in expr:
            sel = re.search(r'querySelector\((".*?")\)', expr)
            name = re.search(r'\[name="([^"]+)"\]', json.loads(sel.group(1))) if sel else None
            return self.form_values.get(name.group(1)) if name else None
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

    def test_waits_for_select_options_and_never_submits_a_half_rendered_form(self):
        # 2026-09-15: the first create after a cold form load failed twice because the
        # category <select> had no options yet; the value went blank and the submit hung.
        fake = FakeCDP(wfr_result={"body": json.dumps({"assignment_nid": "1"})}, select_ready=False)
        with mock.patch.object(ops.time, "sleep"), mock.patch.object(ops.time, "time",
                                                                     side_effect=[0, 0, 5, 11, 12, 13]):
            res = ops.add_assignment(fake, "123", title="T", category_id="c", grading_period_id="g")
        self.assertFalse(res["ok"])
        self.assertIn("category/period options", res["error"])
        self.assertFalse(any("edit-submit" in e and "click()" in e for e in fake.evals))
        self.assertEqual(fake.wfr_calls, [])

    def test_reads_the_form_back_and_refuses_a_rejected_select_value(self):
        fake = FakeCDP(wfr_result={"body": json.dumps({"assignment_nid": "1"})},
                       reject_fields=("grading_category_id",))
        res = ops.add_assignment(fake, "123", title="T", category_id="c", grading_period_id="g")
        self.assertFalse(res["ok"])
        self.assertIn("rejected", res["error"])
        self.assertIn("grading_category_id", res["error"])
        self.assertFalse(any("edit-submit" in e and "click()" in e for e in fake.evals))

    def test_corrected_filter_matches_real_post_url(self):
        # Documents the root cause: the filter must match the POST URL, not the
        # JSON body token that lives only inside the response.
        url = "/course/123/materials/assignments/add?is_popup=1"
        self.assertIn("materials/assignments/add", url)
        self.assertNotIn("assignment-creation-complete", url)


class TestAssignmentsFolder(unittest.TestCase):
    """Materials-folder ops (2026-09-16): moves are verified against the root and retried."""

    def _root(self):
        return {None: [
            {"nid": "F1", "kind": "folder", "title": "Assignments"},
            {"nid": "A1", "kind": "assignment", "title": "Lesson check 1-1"},
            {"nid": "A2", "kind": "assignment", "title": "Try-It 1-1"},
            {"nid": "D1", "kind": "other", "title": ""},
        ]}

    def test_moves_every_top_level_assignment_and_leaves_other_materials(self):
        fake = FakeCDP(materials=self._root())
        with mock.patch.object(ops.time, "sleep"):
            res = ops.move_assignments_into_folder(fake, "123")
        self.assertTrue(res["ok"])
        self.assertEqual(res["folder_id"], "F1")
        self.assertEqual(sorted(m["nid"] for m in res["moved"]), ["A1", "A2"])
        self.assertEqual([r["nid"] for r in fake.materials[None]], ["F1", "D1"])
        self.assertEqual(sorted(r["nid"] for r in fake.materials["F1"]), ["A1", "A2"])

    def test_only_nids_limits_the_move(self):
        fake = FakeCDP(materials=self._root())
        with mock.patch.object(ops.time, "sleep"):
            res = ops.move_assignments_into_folder(fake, "123", only_nids={"A2"})
        self.assertEqual([m["nid"] for m in res["moved"]], ["A2"])
        self.assertIn("A1", [r["nid"] for r in fake.materials[None]])

    def test_a_move_that_never_takes_is_retried_then_reported(self):
        fake = FakeCDP(materials=self._root(), stubborn={"A1"})
        with mock.patch.object(ops.time, "sleep"):
            res = ops.move_assignments_into_folder(fake, "123")
        self.assertFalse(res["ok"])
        self.assertEqual([m["nid"] for m in res["moved"]], ["A2"])
        self.assertEqual(len(res["errors"]), 1)
        self.assertIn("A1", res["errors"][0])
        self.assertEqual(sum(1 for u in fake.urls if u.endswith("/materials/move/A1")), 2)


class FolderCreationCDP(FakeCDP):
    """Script the folder creation form while retaining the real Move flow."""

    def __init__(self, *, folder_form_present=True, folder_create_ok=True, **kwargs):
        super().__init__(**kwargs)
        self.folder_form_present = folder_form_present
        self.folder_create_ok = folder_create_ok

    def eval_js(self, expr):
        if "s-course-materials-folder-create-form" in expr:
            if expr.startswith("!!document.querySelector"):
                self.evals.append(expr)
                return self.folder_form_present
            if "click()" in expr:
                self.evals.append(expr)
                if self.folder_create_ok:
                    self.materials.setdefault(None, []).append({
                        "nid": "F1", "kind": "folder",
                        "title": self.form_values.get("title", ""),
                    })
                return None
        return super().eval_js(expr)


class TestFolderCreationAndMoveFailures(unittest.TestCase):
    """Exercise real folder ops through the caller that restores the gradebook."""

    def _file_created_assignment(self, fake):
        from schoology_sync_section import _ensure_assignment

        state = mock.Mock()
        state.get_assignment.return_value = None
        errors = []
        # Only assignment creation and gradebook DOM reads are stubbed. Folder
        # discovery, creation, Move guards, and page restoration use real ops.
        with mock.patch.object(ops, "add_assignment", return_value={
            "ok": True, "assignment_id": "A1", "error": None,
        }), mock.patch.object(ops, "find_assignment_id_by_title", return_value=None), \
                mock.patch.object(ops, "inject_helpers") as inject, \
                mock.patch.object(ops.time, "sleep"), \
                mock.patch.object(ops.time, "time", side_effect=range(0, 1000, 5)):
            assignment_id = _ensure_assignment(
                {"key": "A2-item", "kind": "try_it", "title": "Try-It 1-1",
                 "due_date": "2026-09-16"},
                "PeriodC", "123", {"Assignments": "CAT"},
                {"MP1": {"start": "2026-09-01", "end": "2026-11-30"}},
                state, ops, fake, False, errors,
            )
        self.assertEqual(assignment_id, "A1")
        self.assertEqual(fake.current_url, ops.gradebook_url("123"))
        inject.assert_called_with(fake)
        state.upsert_assignment.assert_called_once()
        return errors

    def test_missing_folder_is_created_and_assignment_is_filed(self):
        assignment = {"nid": "A1", "kind": "assignment", "title": "Try-It 1-1"}
        fake = FolderCreationCDP(materials={None: [assignment]})

        errors = self._file_created_assignment(fake)

        self.assertEqual(errors, [])
        self.assertEqual(fake.materials[None], [
            {"nid": "F1", "kind": "folder", "title": "Assignments"},
        ])
        self.assertEqual(fake.materials["F1"], [assignment])
        self.assertEqual(sum("folder-create-form" in e and "click()" in e
                             for e in fake.evals), 1)
        self.assertEqual(sum("move-item-form" in e and "click()" in e
                             for e in fake.evals), 1)

    def test_failed_folder_creation_reports_error_without_submitting_move(self):
        for form_present in (False, True):
            with self.subTest(folder_form_present=form_present):
                assignment = {"nid": "A1", "kind": "assignment", "title": "Try-It 1-1"}
                fake = FolderCreationCDP(
                    materials={None: [assignment]},
                    folder_form_present=form_present, folder_create_ok=False,
                )

                errors = self._file_created_assignment(fake)

                self.assertEqual(len(errors), 1)
                self.assertIn("Could not find or create folder 'Assignments'", errors[0])
                self.assertEqual(fake.materials, {None: [assignment]})
                self.assertFalse(any("/materials/move/" in u for u in fake.urls))
                self.assertFalse(any("move-item-form" in e and "click()" in e
                                     for e in fake.evals))
                self.assertEqual(sum("folder-create-form" in e and "click()" in e
                                     for e in fake.evals), int(form_present))

    def test_unready_or_rejected_move_select_never_submits(self):
        cases = [
            ({"select_ready": False}, "has no folder option F1"),
            ({"reject_fields": ("destination_folder",)}, "Move form rejected"),
        ]
        for options, expected_error in cases:
            with self.subTest(options=options):
                assignment = {"nid": "A1", "kind": "assignment", "title": "Try-It 1-1"}
                folder = {"nid": "F1", "kind": "folder", "title": "Assignments"}
                fake = FolderCreationCDP(materials={None: [folder, assignment]}, **options)

                errors = self._file_created_assignment(fake)

                self.assertEqual(len(errors), 1)
                self.assertIn(expected_error, errors[0])
                self.assertEqual(fake.materials, {None: [folder, assignment]})
                self.assertTrue(any(u.endswith("/materials/move/A1") for u in fake.urls))
                self.assertFalse(any("move-item-form" in e and "click()" in e
                                     for e in fake.evals))


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
