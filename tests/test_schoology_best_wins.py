"""Best-wins integration and DOM reads: fake ops only, no Schoology access."""
import json
from pathlib import Path
import subprocess

import pytest

from test_schoology_sync_section import FakeOps, FakeStateStore, sync_section
from test_schoology_ops import FakeCDP, ops
from schoology_sync_section import _push_grades
import schoology_sync_lib as lib


class CellOps(FakeOps):
    def __init__(self, values, *, write_ok=True):
        super().__init__(
            students=[{"studentId": f"S{i}", "rowIndex": i, "name": f"Fixture {i}"}
                      for i in range(len(values))],
            marking_periods={"MP1": {"start": "2026-01-01", "end": "2027-06-30"}},
        )
        self.values = dict(enumerate(values))
        self.reads = []
        self.write_ok = write_ok

    def read_grade_from_cell(self, cdp, column_key, row_index):
        self._require_page("gradebook", "read_grade_from_cell")
        self.reads.append((column_key, row_index))
        return self.values[row_index]

    def write_grade_to_cell(self, cdp, column_key, row_index, value):
        result = super().write_grade_to_cell(cdp, column_key, row_index, value)
        if not self.write_ok:
            return {"ok": False, "error": "fixture write failed"}
        self.values[row_index] = value
        return result


def run_sync(tmp_path, values, *, dry_run=False, state=None, cell_ops=None, target=92):
    path = tmp_path / "schedule.json"
    path.write_text(json.dumps({"lessons": {"1.1": {"unit": 1, "items": [{"itemId": "TA-U1", "source": "topic-assessment"}], "periods": {"C": "2026-09-08"}}}}))
    state = state or FakeStateStore()
    cell_ops = cell_ops or CellOps(values)
    summary = sync_section(
        "PeriodC", "fixture-course", dry_run=dry_run, state=state,
        grades={(f"S{i}", "TA-U1"): target for i in range(len(values))},
        ops=cell_ops, schedule_path=str(path),
    )
    return summary, state, cell_ops


def test_best_wins_decision_matrix_and_logged_summary(tmp_path, capsys):
    summary, state, fake = run_sync(tmp_path, [None, 95, 100, 40])
    assert summary["errors"] == []
    assert (summary["grades_pushed"], summary["grades_kept"], summary["grades_skipped"]) == (2, 2, 0)
    assert [(row, value) for _, row, value in fake.written_grades] == [(0, 92), (3, 92)]
    assert [state.get_last_synced(f"S{i}", "TA-U1") for i in range(4)] == [92, 95, 100, 92]
    assert state.runs[-1]["grades_kept"] == 2
    output = capsys.readouterr().out
    assert "[KEEP] student=S1 key=TA-U1 existing=95 >= target=92" in output
    assert "[KEEP] student=S2 key=TA-U1 existing=100 >= target=92" in output


def test_repeat_run_skips_kept_cells_without_reading_and_later_raise_pushes(tmp_path):
    values = [None, 95, 100, 40]
    _, state, fake = run_sync(tmp_path, values)
    fake.reads.clear()
    fake.written_grades.clear()
    summary, _, _ = run_sync(tmp_path, values, state=state, cell_ops=fake)
    assert (summary["grades_pushed"], summary["grades_kept"], summary["grades_skipped"]) == (0, 0, 4)
    assert fake.reads == []
    assert fake.written_grades == []
    summary, _, _ = run_sync(tmp_path, values, state=state, cell_ops=fake, target=98)
    assert (summary["grades_pushed"], summary["grades_kept"], summary["grades_skipped"]) == (3, 0, 1)
    assert [row for _, row in fake.reads] == [0, 1, 3]
    assert state.get_last_synced("S2", "TA-U1") == 100


def test_dry_run_decisions_include_both_numbers_and_do_not_mutate(tmp_path, capsys):
    fake = CellOps([None, 95, 100, 40])
    fake._existing_titles.add("TA-U1")
    summary, state, fake = run_sync(tmp_path, [None, 95, 100, 40], dry_run=True, cell_ops=fake)
    assert summary["errors"] == []
    assert summary["grades_kept"] == 0
    assert summary["grades_pushed"] == 0
    assert len(fake.reads) == 4
    output = capsys.readouterr().out
    for i, (existing, decision) in enumerate([(None, "PUSH"), (95, "KEEP"), (100, "KEEP"), (40, "PUSH")]):
        assert f"[DRY-RUN] WOULD {decision} student=S{i} key=TA-U1 existing={existing} target=92" in output
    assert fake.written_grades == []
    assert not state.runs
    assert all(state.get_last_synced(f"S{i}", "TA-U1") is None for i in range(4))


@pytest.mark.parametrize("existing,kept", [(92, True), (92-5e-10, True), (92-2e-9, False), (0, False)])
def test_equality_tolerance_and_zero(tmp_path, existing, kept):
    summary, state, fake = run_sync(tmp_path, [existing])
    assert summary["grades_kept"] == int(kept)
    assert summary["grades_pushed"] == int(not kept)
    assert state.get_last_synced("S0", "TA-U1") == (existing if kept else 92)


@pytest.mark.parametrize("key,kind,maximum", [
    ("LC-U1-L1", "lesson_check", 10),
    ("TA-U1", "topic_assessment", 100),
    ("BL-U1-L1-DESK_DONE", "flashcard", 1),
])
def test_rule_applies_to_every_component_column(key, kind, maximum):
    state = FakeStateStore()
    fake = CellOps([maximum])
    fake.current_page = "gradebook"
    fake._existing_titles.add("fixture column")
    result = _push_grades({("S0", key): 0}, {key: {"title": "fixture column", "kind": kind}},
                          {"S0": fake._students[0]}, "PeriodC", state, fake, None, False, [])
    assert result == (0, 0, 1)
    assert fake.written_grades == []
    assert state.get_last_synced("S0", key) == maximum


def test_unsuccessful_write_is_not_recorded(tmp_path):
    summary, state, fake = run_sync(tmp_path, [40], cell_ops=CellOps([40], write_ok=False))
    assert summary["grades_pushed"] == 0
    assert summary["grades_kept"] == 0
    assert len(summary["errors"]) == 1
    assert state.get_last_synced("S0", "TA-U1") is None


class ReadCDP(FakeCDP):
    def __init__(self, raw, *, selector="#grader-grid-cell-overall_override-0"):
        super().__init__()
        self.raw = raw
        self.selector = selector

    def eval_js(self, expr):
        self.evals.append(expr)
        if "findCellSelector" in expr:
            return json.dumps(self.selector)
        assert "input.grader-edit-input" in expr
        assert ".value" in expr
        assert ".focus(" not in expr and ".click(" not in expr
        return self.raw


@pytest.mark.parametrize("raw,expected", [("92", 92), ("92.5", 92.5), ("", None), ("\u2014", None),
                                         ("not a grade", None), ("NaN", None), ("Infinity", None), (None, None)])
def test_grade_reader_parses_numeric_inputs_only(raw, expected):
    fake = ReadCDP(raw)
    assert ops.read_grade_from_cell(fake, "overall_override", 0) == expected
    assert fake.clicks == []
    assert fake.urls == []


def test_missing_cell_selector_returns_none_without_reading():
    fake = ReadCDP("100", selector=None)
    assert ops.read_grade_from_cell(fake, "overall_override", 0) is None
    assert len(fake.evals) == 1


@pytest.mark.parametrize("raw,expected", [("92", 92), ("92.5", 92.5), ("", None), ("\u2014", None)])
def test_reader_executes_against_captured_gradebook_dom(raw, expected):
    class DomCDP(ReadCDP):
        def eval_js(self, expr):
            if "findCellSelector" in expr:
                return super().eval_js(expr)
            self.evals.append(expr)
            # No resources or page scripts run; only our read expression executes.
            script = r"""
const fs = require('fs');
const {JSDOM} = require('jsdom');
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const {pathToFileURL} = require('url');
const html = '<div id="grader-grid-cell-overall_override-0"><input class="grader-edit-input"></div>';
const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: pathToFileURL(process.cwd() + '/tests/schoology-gradebook.html').href,
});
const input = dom.window.document.querySelector('#grader-grid-cell-overall_override-0 input.grader-edit-input');
if (!input) throw Error('Fixture persistent input not found');
input.value = payload.raw;
const active = dom.window.document.activeElement;
const value = dom.window.eval(payload.expr);
if (active !== dom.window.document.activeElement || input.value !== payload.raw) throw Error('Read mutated DOM');
process.stdout.write(JSON.stringify(value));
dom.window.close();
"""
            result = subprocess.run(["node", "-e", script], input=json.dumps({"raw": self.raw, "expr": expr}),
                                    text=True, encoding="utf-8", capture_output=True, check=True,
                                    cwd=Path(__file__).resolve().parents[1], timeout=30)
            return json.loads(result.stdout)
    fake = DomCDP(raw)
    assert ops.read_grade_from_cell(fake, "overall_override", 0) == expected
    assert fake.clicks == []
    assert fake.urls == []


@pytest.mark.parametrize("dry_run", [False, True])
def test_latest_try_it_teacher_score_can_replace_a_higher_score(dry_run):
    key = "TI-U1-L1-1"
    state = FakeStateStore()
    state.set_last_synced("S0", key, 2)
    fake = CellOps([2])
    fake.current_page = "gradebook"
    fake._existing_titles.add(key)
    scope = {key: {"title": key, "kind": "try_it"}}
    errors = []

    result = _push_grades(
        {("S0", key): 0}, scope, {"S0": fake._students[0]},
        "PeriodC", state, fake, None, dry_run, errors,
    )

    assert errors == []
    assert result == ((0, 0, 0) if dry_run else (1, 0, 0))
    assert state.get_last_synced("S0", key) == (2 if dry_run else 0)
    assert [value for _, _, value in fake.written_grades] == ([] if dry_run else [0])
    if not dry_run:
        fake.reads.clear()
        assert _push_grades(
            {("S0", key): 0}, scope, {"S0": fake._students[0]},
            "PeriodC", state, fake, None, False, errors,
        ) == (0, 1, 0)
        assert fake.reads == []


def test_failed_grade_write_is_retried_until_success(tmp_path):
    fake = CellOps([40], write_ok=False)
    summary, state, _ = run_sync(tmp_path, [40], cell_ops=fake)
    assert len(summary["errors"]) == 1
    assert state.get_last_synced("S0", "TA-U1") is None

    fake.write_ok = True
    summary, _, _ = run_sync(tmp_path, [40], state=state, cell_ops=fake)
    assert summary["errors"] == []
    assert summary["assignments_created"] == 0
    assert summary["grades_pushed"] == 1
    assert state.get_last_synced("S0", "TA-U1") == 92
