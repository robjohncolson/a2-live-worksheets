"""tests/test_schoology_sync_lib.py -- unit tests for schoology_sync_lib.

Run from repo root:
    python -m unittest tests.test_schoology_sync_lib -v
Or directly:
    python tests/test_schoology_sync_lib.py
"""

import sys
import os
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tools'))
import schoology_sync_lib as lib


# ---------------------------------------------------------------------------
# classify_lesson_key
# ---------------------------------------------------------------------------



# ---------------------------------------------------------------------------
# assignment_title
# ---------------------------------------------------------------------------



# ---------------------------------------------------------------------------
# assignment_points
# ---------------------------------------------------------------------------



# ---------------------------------------------------------------------------
# marking_period_for_date
# ---------------------------------------------------------------------------

class TestMarkingPeriodForDate(unittest.TestCase):

    MP_RANGES = {
        'q1': {'start': '2026-09-01', 'end': '2026-11-15'},
        'q2': {'start': '2026-11-16', 'end': '2027-01-31'},
    }

    def test_inside_q1(self):
        self.assertEqual(
            lib.marking_period_for_date('2026-10-01', self.MP_RANGES),
            'q1',
        )

    def test_on_start_boundary_q1(self):
        self.assertEqual(
            lib.marking_period_for_date('2026-09-01', self.MP_RANGES),
            'q1',
        )

    def test_on_end_boundary_q1(self):
        self.assertEqual(
            lib.marking_period_for_date('2026-11-15', self.MP_RANGES),
            'q1',
        )

    def test_inside_q2(self):
        self.assertEqual(
            lib.marking_period_for_date('2026-12-01', self.MP_RANGES),
            'q2',
        )

    def test_on_start_boundary_q2(self):
        self.assertEqual(
            lib.marking_period_for_date('2026-11-16', self.MP_RANGES),
            'q2',
        )

    def test_on_end_boundary_q2(self):
        self.assertEqual(
            lib.marking_period_for_date('2027-01-31', self.MP_RANGES),
            'q2',
        )

    def test_outside_all_ranges(self):
        self.assertIsNone(
            lib.marking_period_for_date('2025-01-01', self.MP_RANGES),
        )

    def test_between_q1_and_q2_is_none(self):
        # There is no gap in this range set, but an edge case: what if date == q1.end+1?
        # Already covered by q2 start test above; add an explicit gap scenario.
        ranges_with_gap = {
            'q1': {'start': '2026-09-01', 'end': '2026-10-31'},
            'q2': {'start': '2026-12-01', 'end': '2027-01-31'},
        }
        self.assertIsNone(
            lib.marking_period_for_date('2026-11-15', ranges_with_gap),
        )

    def test_none_date_returns_none(self):
        self.assertIsNone(
            lib.marking_period_for_date(None, self.MP_RANGES),
        )

    def test_empty_date_returns_none(self):
        self.assertIsNone(
            lib.marking_period_for_date('', self.MP_RANGES),
        )

    def test_multi_range_picks_correct(self):
        ranges = {
            'fall': {'start': '2026-09-01', 'end': '2026-12-31'},
            'spring': {'start': '2027-01-01', 'end': '2027-05-31'},
        }
        self.assertEqual(
            lib.marking_period_for_date('2027-03-15', ranges),
            'spring',
        )


# ---------------------------------------------------------------------------
# should_push
# ---------------------------------------------------------------------------

class TestShouldPush(unittest.TestCase):

    def test_target_none_is_false(self):
        self.assertFalse(lib.should_push(None, 85.0))

    def test_target_none_last_none_is_false(self):
        self.assertFalse(lib.should_push(None, None))

    def test_last_none_target_not_none_is_true(self):
        self.assertTrue(lib.should_push(85.0, None))

    def test_equal_floats_is_false(self):
        self.assertFalse(lib.should_push(85.0, 85.0))

    def test_different_floats_is_true(self):
        self.assertTrue(lib.should_push(85.0, 84.9))

    def test_within_tolerance_is_false(self):
        self.assertFalse(lib.should_push(85.0, 85.0 + 1e-10))

    def test_beyond_tolerance_is_true(self):
        self.assertTrue(lib.should_push(85.0, 85.0 + 1e-8))

    def test_integer_equal_is_false(self):
        self.assertFalse(lib.should_push(100, 100))

    def test_integer_diff_is_true(self):
        self.assertTrue(lib.should_push(100, 99))

    def test_string_equal_is_false(self):
        # Non-numeric strings fall back to string comparison
        self.assertFalse(lib.should_push('E', 'E'))

    def test_string_diff_is_true(self):
        self.assertTrue(lib.should_push('E', 'P'))

    def test_numeric_string_equality(self):
        # "85.0" and 85.0 should be treated as equal
        self.assertFalse(lib.should_push('85.0', 85.0))

    def test_zero_target_last_none_is_true(self):
        # 0 is a valid grade (not None)
        self.assertTrue(lib.should_push(0, None))


# ---------------------------------------------------------------------------
# plan_assignment_work
# ---------------------------------------------------------------------------

class TestPlanAssignmentWork(unittest.TestCase):

    def test_no_existing_all_create(self):
        result = lib.plan_assignment_work(['U1.1', 'U1.2'], {})
        self.assertEqual(result['create'], ['U1.1', 'U1.2'])
        self.assertEqual(result['reuse'], [])

    def test_all_existing_all_reuse(self):
        existing = {
            'U1.1': {'schoology_assignment_id': 'abc'},
            'U1.2': {'schoology_assignment_id': 'def'},
        }
        result = lib.plan_assignment_work(['U1.1', 'U1.2'], existing)
        self.assertEqual(result['create'], [])
        self.assertEqual(result['reuse'], ['U1.1', 'U1.2'])

    def test_null_id_goes_to_create(self):
        existing = {
            'U1.1': {'schoology_assignment_id': None},
            'U1.2': {'schoology_assignment_id': 'def'},
        }
        result = lib.plan_assignment_work(['U1.1', 'U1.2'], existing)
        self.assertIn('U1.1', result['create'])
        self.assertIn('U1.2', result['reuse'])

    def test_mixed_create_and_reuse(self):
        existing = {
            'U2.1': {'schoology_assignment_id': 'xyz'},
        }
        result = lib.plan_assignment_work(['U1.1', 'U2.1', 'U3.1'], existing)
        self.assertEqual(result['create'], ['U1.1', 'U3.1'])
        self.assertEqual(result['reuse'], ['U2.1'])

    def test_order_preserved(self):
        existing = {'B': {'schoology_assignment_id': 'id1'}}
        result = lib.plan_assignment_work(['A', 'B', 'C'], existing)
        self.assertEqual(result['create'], ['A', 'C'])
        self.assertEqual(result['reuse'], ['B'])

    def test_dedupe(self):
        existing = {}
        result = lib.plan_assignment_work(['U1.1', 'U1.1', 'U1.2'], existing)
        self.assertEqual(result['create'], ['U1.1', 'U1.2'])

    def test_empty_scope(self):
        result = lib.plan_assignment_work([], {'U1.1': {'schoology_assignment_id': 'x'}})
        self.assertEqual(result['create'], [])
        self.assertEqual(result['reuse'], [])


# ---------------------------------------------------------------------------
# compute_sync_actions
# ---------------------------------------------------------------------------

class TestComputeSyncActions(unittest.TestCase):

    def test_push_when_last_is_none(self):
        targets = {('s1', 'U1.1'): 85.0}
        last_synced = {}
        result = lib.compute_sync_actions(targets, last_synced)
        self.assertIn(('s1', 'U1.1'), result['push'])
        self.assertEqual(result['skip'], [])

    def test_skip_when_values_equal(self):
        key = ('s1', 'U1.1')
        targets = {key: 85.0}
        last_synced = {key: 85.0}
        result = lib.compute_sync_actions(targets, last_synced)
        self.assertIn(key, result['skip'])
        self.assertEqual(result['push'], [])

    def test_push_when_value_changed(self):
        key = ('s1', 'U1.1')
        targets = {key: 90.0}
        last_synced = {key: 85.0}
        result = lib.compute_sync_actions(targets, last_synced)
        self.assertIn(key, result['push'])

    def test_omit_when_target_none(self):
        key = ('s1', 'U1.1')
        targets = {key: None}
        last_synced = {}
        result = lib.compute_sync_actions(targets, last_synced)
        self.assertEqual(result['push'], [])
        self.assertEqual(result['skip'], [])

    def test_order_follows_targets(self):
        targets = {
            'a': 80.0,
            'b': None,
            'c': 90.0,
            'd': 90.0,
        }
        last_synced = {'a': 75.0, 'c': None, 'd': 90.0}
        result = lib.compute_sync_actions(targets, last_synced)
        # 'a' changed -> push; 'b' None -> omit; 'c' new -> push; 'd' equal -> skip
        self.assertEqual(result['push'], ['a', 'c'])
        self.assertEqual(result['skip'], ['d'])

    def test_mixed_push_skip_omit(self):
        targets = {
            'k1': 100,   # changed (last=99) -> push
            'k2': 50,    # equal              -> skip
            'k3': None,  # None               -> omit
            'k4': 75,    # new (no last)      -> push
        }
        last_synced = {'k1': 99, 'k2': 50}
        result = lib.compute_sync_actions(targets, last_synced)
        self.assertEqual(result['push'], ['k1', 'k4'])
        self.assertEqual(result['skip'], ['k2'])


if __name__ == '__main__':
    unittest.main()
