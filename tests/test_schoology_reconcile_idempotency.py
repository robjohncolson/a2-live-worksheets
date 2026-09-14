"""tests/test_schoology_reconcile_idempotency.py — property/round-trip checks for
the PURE Schoology reconciliation core (tools/schoology_sync_lib.py), the
grade-integrity modeling program's third target.

The existing test_schoology_sync_lib.py covers these functions with fixed
examples; this file adds the IDEMPOTENCY invariants — "syncing twice == syncing
once, and never a duplicate column" — by generating random reconciliation
states, APPLYING the planned actions, and asserting a re-run is a no-op. This is
the integrity property the dup-column bug (a render hiccup that resubmitted a
create 3×) violated; the pure planner is dup-safe by construction, and this pins
that it stays so. (The CDP layer's own dup guard is the find-by-title pre-flight,
out of scope for the pure core.)

Run:
    python -m unittest tests.test_schoology_reconcile_idempotency -v
"""

import os
import random
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tools'))
import schoology_sync_lib as lib


# A small alphabet of lesson keys to draw scopes/targets from.
KEYS = ['1.1', '1.2', '1.3', '1.4-5', 'PC1', 'QUIZ_U2', 'POSTER_U4']


def _apply_plan(scope_keys, existing, plan):
    """Mutate `existing` as if the planned creates were carried out: each created
    assignment now has a real Schoology id. Mirrors what a real sync does after
    add_assignment succeeds. Returns the updated existing dict (new copy)."""
    updated = {k: dict(v) if isinstance(v, dict) else v for k, v in existing.items()}
    for key in plan['create']:
        updated[key] = {'schoology_assignment_id': 'sid-' + str(key)}
    return updated


def _apply_sync(targets, last_synced, actions):
    """Mutate `last_synced` as if the pushed grades were written: last-synced now
    equals the target for every pushed key. Returns a new dict."""
    updated = dict(last_synced)
    for key in actions['push']:
        updated[key] = targets[key]
    return updated


def _rand_existing(rng):
    """A random `existing` map: each key may be absent, present-with-None-id,
    or present-with-an-id (the three states plan_assignment_work distinguishes)."""
    existing = {}
    for k in KEYS:
        roll = rng.random()
        if roll < 0.34:
            continue                                   # absent → would create
        elif roll < 0.67:
            existing[k] = {'schoology_assignment_id': None}  # present, no id → create
        else:
            existing[k] = {'schoology_assignment_id': 'sid-' + k}  # has id → reuse
    return existing


def _rand_scope(rng):
    """A random scope list, possibly with duplicates and repeats."""
    n = rng.randint(0, 12)
    return [rng.choice(KEYS) for _ in range(n)]


def _rand_value(rng):
    """A random target/last-synced value: None, an int, or a float."""
    roll = rng.random()
    if roll < 0.25:
        return None
    if roll < 0.6:
        return rng.randint(0, 100)
    return round(rng.uniform(0, 100), 3)


def _rand_target_maps(rng):
    keys = [(rng.choice(['s1', 's2', 's3']), rng.choice(KEYS)) for _ in range(rng.randint(0, 12))]
    targets = {k: _rand_value(rng) for k in keys}
    last_synced = {k: _rand_value(rng) for k in keys if rng.random() < 0.6}
    return targets, last_synced


class TestShouldPush(unittest.TestCase):
    def test_equal_values_do_not_push(self):
        self.assertFalse(lib.should_push(85, 85))
        self.assertFalse(lib.should_push(85.0, 85.0))

    def test_first_push_when_never_synced(self):
        self.assertTrue(lib.should_push(85, None))

    def test_none_target_never_pushes(self):
        self.assertFalse(lib.should_push(None, None))
        self.assertFalse(lib.should_push(None, 85))

    def test_within_tolerance_does_not_push(self):
        self.assertFalse(lib.should_push(85.0, 85.0 + 1e-12))

    def test_meaningful_change_pushes(self):
        self.assertTrue(lib.should_push(90, 85))


class TestPlanAssignmentWork(unittest.TestCase):
    def test_create_never_includes_a_key_that_already_has_an_id(self):
        """No duplicate columns: a key with a real id is always reused, never created."""
        rng = random.Random(20260616)
        for _ in range(4000):
            scope, existing = _rand_scope(rng), _rand_existing(rng)
            plan = lib.plan_assignment_work(scope, existing)
            for key in plan['create']:
                row = existing.get(key)
                self.assertTrue(row is None or row.get('schoology_assignment_id') is None,
                                f'planned to create {key} which already has an id')

    def test_partition_is_complete_and_disjoint(self):
        rng = random.Random(1)
        for _ in range(4000):
            scope, existing = _rand_scope(rng), _rand_existing(rng)
            plan = lib.plan_assignment_work(scope, existing)
            create, reuse = plan['create'], plan['reuse']
            # disjoint
            self.assertEqual(set(create) & set(reuse), set())
            # union == unique scope keys (order-preserving dedupe)
            seen, unique = set(), []
            for k in scope:
                if k not in seen:
                    seen.add(k); unique.append(k)
            self.assertEqual(set(create) | set(reuse), set(unique))
            # no key appears twice within create or reuse (dedupe held)
            self.assertEqual(len(create), len(set(create)))
            self.assertEqual(len(reuse), len(set(reuse)))

    def test_idempotency_rerun_creates_nothing(self):
        """THE invariant: plan → apply (creates now have ids) → re-plan creates
        NOTHING (every key reuses). Syncing twice == syncing once, no dup columns."""
        rng = random.Random(42)
        for _ in range(4000):
            scope, existing = _rand_scope(rng), _rand_existing(rng)
            plan1 = lib.plan_assignment_work(scope, existing)
            existing2 = _apply_plan(scope, existing, plan1)
            plan2 = lib.plan_assignment_work(scope, existing2)
            self.assertEqual(plan2['create'], [], 'a second sync proposed new columns')
            # every unique scope key is now a reuse
            self.assertEqual(set(plan2['reuse']),
                             set(plan1['create']) | set(plan1['reuse']))


class TestComputeSyncActions(unittest.TestCase):
    def test_partition_is_complete_and_disjoint(self):
        rng = random.Random(7)
        for _ in range(4000):
            targets, last_synced = _rand_target_maps(rng)
            actions = lib.compute_sync_actions(targets, last_synced)
            push, skip = actions['push'], actions['skip']
            self.assertEqual(set(push) & set(skip), set())
            non_none = {k for k, v in targets.items() if v is not None}
            self.assertEqual(set(push) | set(skip), non_none)

    def test_idempotency_rerun_pushes_nothing(self):
        """THE invariant: compute → apply (push writes last-synced=target) →
        re-compute pushes NOTHING (all skip). Syncing the same grades twice is a
        no-op the second time."""
        rng = random.Random(99)
        for _ in range(4000):
            targets, last_synced = _rand_target_maps(rng)
            actions1 = lib.compute_sync_actions(targets, last_synced)
            last2 = _apply_sync(targets, last_synced, actions1)
            actions2 = lib.compute_sync_actions(targets, last2)
            self.assertEqual(actions2['push'], [], 'a second sync re-pushed unchanged grades')


if __name__ == '__main__':
    unittest.main()
