"""Shared A2 lesson days retain distinct item identities, including Wednesdays."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from schoology_components import component_columns
from schoology_sync_lib import plan_assignment_work
from test_schoology_sync_section import FakeOps, FakeStateStore, sync_section


@pytest.mark.parametrize("period,day", [
    ("C", "2026-09-15"),
    ("D", "2026-09-16"),
    ("G", "2026-09-16"),
])
def test_shared_day_items_are_distinct_and_idempotent(period, day):
    lessons = {
        f"1.{n}": {"unit": 1, "worksheetKey": str(n), "periods": {period: day}}
        for n in (1, 2)
    }
    columns = component_columns(lessons, period, quiz_topics=set(), blooket_topics=set())
    keys = [column["key"] for column in columns]
    assert len(keys) == len(set(keys)) == 14
    assert all(column["due_date"] == day for column in columns)
    existing = {key: {"schoology_assignment_id": key} for key in keys}
    plan = plan_assignment_work(keys, existing)
    assert plan["create"] == []
    assert plan["reuse"] == keys


@pytest.mark.parametrize("period", ["D", "G"])
def test_early_release_wednesday_keeps_both_lesson_columns_and_grades(tmp_path, period):
    day = "2026-09-16"
    schedule = {
        "lessons": {
            f"1.{n}": {"unit": 1, "periods": {period: day}, "items": [
                {"itemId": f"LC-U1-L{n}", "source": "lesson-check"},
            ]}
            for n in (1, 2)
        },
        "calendar": {"earlyReleaseDays": [day]},
    }
    path = tmp_path / "schedule.json"
    path.write_text(json.dumps(schedule), encoding="utf-8")
    state = FakeStateStore()
    fake = FakeOps()
    grades = {("S1", "LC-U1-L1"): 8, ("S1", "LC-U1-L2"): 6}
    summary = sync_section(
        "Period" + period, "fixture-course", dry_run=False,
        state=state, grades=grades, ops=fake,
        schedule_path=str(path), through_date=day,
    )
    assert summary["errors"] == []
    assert summary["assignments_created"] == 2
    assert summary["grades_pushed"] == 2
    assert {a["due_date"] for a in fake.created_assignments} == {day}
    assert fake.written_grades == [
        ("EXISTING_LC-U1-L1", 0, 8), ("EXISTING_LC-U1-L2", 0, 6),
    ]

    summary = sync_section(
        "Period" + period, "fixture-course", dry_run=False,
        state=state, grades=grades, ops=fake,
        schedule_path=str(path), through_date=day,
    )
    assert summary["errors"] == []
    assert summary["assignments_created"] == summary["grades_pushed"] == 0
    assert summary["grades_skipped"] == 2
    assert len(fake.written_grades) == 2
