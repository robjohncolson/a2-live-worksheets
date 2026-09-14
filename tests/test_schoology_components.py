"""test_schoology_components.py -- unit tests for the fine-grained, data-driven
Schoology column generator (tools/schoology_components.py).

Covers:
  - key + title scheme
  - presence loaders (quiz from roadmap-data, blooket from blooket-lessons)
  - component_columns: opener-has-no-quiz, combined dedup, blooket gap,
    include_undated, sort order
  - component_grades_from_class_doc: per-component mapping, quizTotal gate,
    combined dedup, uid resolution

Runnable standalone:
    python tests/test_schoology_components.py

ASCII only. LF line endings.
"""
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


# A tiny schedule: one solo opener (1.1, no quiz), one solo (1.2, quiz),
# one combined pair (6.1 opener + 6.2 quiz, shared worksheet "1-2"), and one
# null-date lesson (4.6) for the include_undated test.
MINI_LESSONS = {
    "1.1": {"unit": 1, "worksheetKey": "1", "periods": {"B": "2026-01-05", "E": "2026-01-07"}},
    "1.2": {"unit": 1, "worksheetKey": "2", "periods": {"B": "2026-01-06", "E": "2026-01-08"}},
    "6.1": {"unit": 6, "worksheetKey": "1-2", "periods": {"B": "2026-03-02", "E": "2026-03-06"}},
    "6.2": {"unit": 6, "worksheetKey": "1-2", "periods": {"B": "2026-03-02", "E": "2026-03-06"}},
    "4.6": {"unit": 4, "worksheetKey": "6", "periods": {"B": None, "E": None}},
}

# 1.1 + 1.2 have Blooket; 6.x do NOT (the units 4-7 gap); 4.6 does not.
BLOOKET_TOPICS = {"1.1", "1.2"}
# Quiz exists for 1.2 and 6.2; NOT for the 1.1 / 6.1 openers.
QUIZ_TOPICS = {"1.2", "6.2"}




class TestPresenceLoaders(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def _write(self, name, doc):
        p = os.path.join(self.tmp, name)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(doc, f)
        return p

    def test_load_quiz_topics_from_answer_key(self):
        # Quiz presence = gradable ^U#-L#-Q items (mirrors engine computeQuizTotals).
        # Excludes PC (U#-PC-Q), worksheet blanks (WS-U#L#-Q), and answerKey==null.
        # Real shape: the item map is nested under a top-level "answerKey" key.
        ak = self._write("answer-key.json", {"answerKey": {
            "U1-L1-Q01": {"answerKey": "A"},        # 1.1 has a quiz
            "U1-L2-Q01": {"answerKey": "B"},        # 1.2 has a quiz
            "U1-L2-Q02": {"answerKey": "C"},        # same topic (1.2) -> counts once
            "U5-L6-Q01": {"answerKey": None},       # non-gradable -> excluded (the 5.6 case)
            "U1-PC-Q01": {"answerKey": "D"},        # PC item -> excluded by shape
            "WS-U1L3-Q01": {"answerKey": "E"},      # worksheet blank -> excluded by shape
        }})
        self.assertEqual(sc.load_quiz_topics(ak), {"1.1", "1.2"})

    def test_load_blooket_topics(self):
        bl = self._write("bl.json", {"topics": ["1.1", "1.2", "8.6"]})
        self.assertEqual(sc.load_blooket_topics(bl), {"1.1", "1.2", "8.6"})






if __name__ == "__main__":
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromModule(sys.modules[__name__])
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    passed = result.testsRun - len(result.failures) - len(result.errors)
    print(f"\n{'='*60}")
    print(f"RESULT: {passed}/{result.testsRun} passed", end="")
    if result.failures or result.errors:
        print(f"  ({len(result.failures)} failures, {len(result.errors)} errors)")
        sys.exit(1)
    else:
        print("  -- ALL PASS")
        sys.exit(0)
