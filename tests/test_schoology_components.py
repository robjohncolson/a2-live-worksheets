"""A2 Schoology item columns, raw-point grades and synthetic presence loaders."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TESTS_DIR)
TOOLS_DIR = os.path.join(REPO_ROOT, "tools")
sys.path.insert(0, TOOLS_DIR)

import schoology_components as sc  # noqa: E402


class TestPresenceLoaders(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def _write(self, name, doc):
        p = os.path.join(self.tmp, name)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(doc, f)
        return p

    def test_load_quiz_topics_from_answer_key(self):
        # The retained parser accepts synthetic legacy-format IDs.
        # This checks its grammar without requiring an AP answer-key corpus.
        ak = self._write("answer-key.json", {"answerKey": {
            "U1-L1-Q01": {"answerKey": "A"},        # 1.1 has a quiz
            "U1-L2-Q01": {"answerKey": "B"},        # 1.2 has a quiz
            "U1-L2-Q02": {"answerKey": "C"},        # same topic (1.2) -> counts once
            "U1-L3-Q01": {"answerKey": None},       # non-gradable -> excluded
            "unrelated-item": {"answerKey": "D"},   # unrelated ID -> excluded
            "TI-U1-L1-1": {"answerKey": "E"},        # Try-It ID -> excluded by shape
        }})
        self.assertEqual(sc.load_quiz_topics(ak), {"1.1", "1.2"})

    def test_load_blooket_topics(self):
        bl = self._write("bl.json", {"topics": ["1.1", "1.2", "1.3"]})
        self.assertEqual(sc.load_blooket_topics(bl), {"1.1", "1.2", "1.3"})






class TestA2ItemColumns(unittest.TestCase):
    def test_explicit_items_use_district_points_categories_and_identity(self):
        lessons = {
            "1.1": {"unit": 1, "periods": {"D": "2026-09-16"}, "items": [
                {"itemId": "LC-U1-L1", "source": "lesson-check"},
                {"itemId": "TI-U1-L1-1", "source": "try-it"},
                {"itemId": "BL-U1-L1-DESK_DONE", "source": "flashcard"},
            ]},
        }
        columns = sc.component_columns(
            lessons, "D", quiz_topics=set(), blooket_topics=set(),
            topic_assessments=[{
                "itemId": "TA-U1", "source": "topic-assessment", "unit": 1,
                "periods": {"D": "2026-09-18"},
            }],
        )
        by_key = {column["key"]: column for column in columns}
        expected = {
            "LC-U1-L1": ("lesson_check", "Assessments", 10),
            "TI-U1-L1-1": ("try_it", "Assignments", 2),
            "BL-U1-L1-DESK_DONE": ("flashcard", "Engagement", 1),
            "TA-U1": ("topic_assessment", "Assessments", 100),
        }
        self.assertEqual(set(by_key), set(expected))
        for key, (kind, category, points) in expected.items():
            with self.subTest(key=key):
                column = by_key[key]
                self.assertEqual((column["kind"], column["category"], column["points"]),
                                 (kind, category, points))
                self.assertEqual(column["title"], key)
                self.assertEqual(column["due_date"],
                                 "2026-09-18" if key == "TA-U1" else "2026-09-16")
        self.assertEqual(by_key["LC-U1-L1"]["topic_keys"], ["1.1"])
        self.assertEqual(by_key["LC-U1-L1"]["group_label"], "1.1")

    def test_default_items_keep_separate_checks_and_try_its_but_share_one_deck(self):
        lessons = {
            "1.1": {"unit": 1, "worksheetKey": "1-2", "periods": {"C": "2026-09-15"}},
            "1.2": {"unit": 1, "worksheetKey": "1-2", "periods": {"C": "2026-09-15"}},
        }
        columns = sc.component_columns(lessons, "C", quiz_topics=set(), blooket_topics=set())
        keys = [column["key"] for column in columns]
        expected = {"LC-U1-L1", "LC-U1-L2", "BL-U1-L1-2-DESK_DONE"}
        expected.update(f"TI-U1-L{lesson}-{item}" for lesson in (1, 2) for item in range(1, 6))
        self.assertEqual(set(keys), expected)
        self.assertEqual(len(keys), len(expected))

    def test_undated_items_are_opt_in_and_empty_item_lists_stay_empty(self):
        lessons = {
            "1.1": {"unit": 1, "periods": {"G": None}, "items": [
                {"itemId": "LC-U1-L1", "source": "lesson-check"},
            ]},
            "1.2": {"unit": 1, "periods": {"G": "2026-09-16"}, "items": []},
        }
        self.assertEqual(sc.component_columns(lessons, "G", quiz_topics=set(), blooket_topics=set()), [])
        columns = sc.component_columns(
            lessons, "G", quiz_topics=set(), blooket_topics=set(), include_undated=True,
        )
        self.assertEqual([column["key"] for column in columns], ["LC-U1-L1"])
        self.assertIsNone(columns[0]["due_date"])

    def test_columns_sort_by_due_date_then_item_id(self):
        lessons = {
            "1.2": {"unit": 1, "periods": {"G": "2026-09-17"}, "items": [
                {"itemId": "TI-U1-L2-1", "source": "try-it"},
                {"itemId": "LC-U1-L2", "source": "lesson-check"},
            ]},
            "1.1": {"unit": 1, "periods": {"G": "2026-09-16"}, "items": [
                {"itemId": "LC-U1-L1", "source": "lesson-check"},
            ]},
        }
        columns = sc.component_columns(lessons, "G", quiz_topics=set(), blooket_topics=set())
        self.assertEqual([column["key"] for column in columns],
                         ["LC-U1-L1", "LC-U1-L2", "TI-U1-L2-1"])


class TestA2ItemGrades(unittest.TestCase):
    def test_due_attempted_items_keep_raw_points_including_zero(self):
        doc = {"students": [{"studentId": "fixture", "items": [
            {"itemId": "LC-U1-L1", "points": 8.5, "attempted": True, "due": True},
            {"itemId": "TA-U1", "points": 73, "attempted": True, "due": True},
            {"itemId": "TI-U1-L1-1", "points": 0, "attempted": True, "due": True},
            {"itemId": "BL-U1-L1-DESK_DONE", "points": 1, "attempted": True, "due": True},
            {"itemId": "LC-U1-L2", "points": 9, "attempted": True, "due": False},
            {"itemId": "TI-U1-L1-2", "points": 0, "attempted": False, "due": True},
        ]}]}
        self.assertEqual(sc.component_grades_from_class_doc(doc), {
            "fixture/LC-U1-L1": 8.5, "fixture/TA-U1": 73,
            "fixture/TI-U1-L1-1": 0, "fixture/BL-U1-L1-DESK_DONE": 1,
        })

    def test_uid_resolution_prefers_surfaced_uid_then_map_then_roster_id(self):
        item = {"itemId": "LC-U1-L1", "points": 7, "attempted": True, "due": True}
        doc = {"students": [
            {"studentId": "one", "schoologyUid": "live-uid", "items": [item]},
            {"studentId": "two", "items": [item]},
            {"studentId": "three", "items": [item]},
        ]}
        self.assertEqual(sc.component_grades_from_class_doc(doc, {"one": "stale", "two": "mapped"}), {
            "live-uid/LC-U1-L1": 7, "mapped/LC-U1-L1": 7, "three/LC-U1-L1": 7,
        })

    def test_empty_student_lists_emit_no_grades(self):
        self.assertEqual(sc.component_grades_from_class_doc({}), {})
        self.assertEqual(sc.component_grades_from_class_doc({"students": None}), {})
        self.assertEqual(sc.component_grades_from_class_doc({"students": [{"studentId": "one"}]}), {})


if __name__ == "__main__":
    unittest.main()
