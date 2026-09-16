"""Exercise the retained DOK builder with temporary synthetic Algebra 2 data.

The aps identifier and dotted topic follow the builder's legacy input grammar;
they are not a published course taxonomy. No authored corpus or schedule is read.
"""
import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("a2_b21_build_ladder", ROOT / "dok" / "build_ladder.py")
bl = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = bl
SPEC.loader.exec_module(bl)


@pytest.fixture
def ladder(tmp_path, monkeypatch):
    item = {
        "id": "aps-1.1-d3-1", "topic": "1.1", "dok": 3, "role": "focus",
        "stem": "Compare the functions f(x) = x and g(x) = x squared.",
        "first_take": "Predict how their ranges compare.",
        "dok_rationale": "PRIVATE rationale: justify a general claim using the domains and ranges of two functions.",
        "frq_pattern": "compare-functions-justify",
        "parts": [
            {"label": "a", "dok": 1, "prompt": "State the domain of f."},
            {"label": "b", "dok": 2, "prompt": "Compare the ranges."},
            {"label": "c", "dok": 3, "prompt": "Justify whether equal domains imply equal ranges."},
        ],
        "answers": {"a": "PRIVATE answer: all real inputs.", "b": "PRIVATE answer: one range is nonnegative.", "c": "PRIVATE answer: the claim is false."},
        "scoring": {
            "expectedElements": [{"id": "reason", "description": "PRIVATE rubric: explains a counterexample.", "required": True}],
            "scoringGuide": {"E": "PRIVATE complete justification.", "P": "PRIVATE partial justification.", "I": "PRIVATE insufficient justification."},
        },
    }
    lesson = {
        "topic": "1.1", "title": "Compare function ranges", "focus": item["id"],
        "standalone": True, "misconceptions": ["domain versus range"],
        "generated": {"by": "synthetic-test", "on": "2026-09-16", "window_days": 14},
        "worksheet": "a2_1_1_live.html", "tether": ["Synthetic function reasoning fixture."],
    }
    registry_dir = tmp_path / "registry"
    registry_dir.mkdir()
    (registry_dir / "1.1.jsonl").write_text(json.dumps(item) + "\n", encoding="utf-8")
    lesson_path = tmp_path / "lesson.yaml"
    # JSON is also valid YAML; no YAML emitter or real lesson is needed.
    lesson_path.write_text(json.dumps(lesson), encoding="utf-8")
    monkeypatch.setattr(bl, "REGISTRY_DIR", registry_dir)
    return bl.load_lesson(lesson_path), bl.load_registry()


def test_synthetic_schema_and_provenance(ladder):
    lesson, registry = ladder
    assert bl.validate_lesson(lesson, registry) == []
    assert bl.validate_item(registry[lesson["focus"]], set()) == []
    for field, value in [("by", ""), ("on", "invalid"), ("window_days", 0)]:
        altered = {**lesson, "generated": {**lesson["generated"], field: value}}
        assert any(f"generated.{field}" in error for error in bl.validate_lesson(altered, registry))


@pytest.mark.parametrize("edition", ["student", "board"])
def test_student_and_board_do_not_leak_answers(ladder, edition):
    lesson, registry = ladder
    tex = getattr(bl, f"emit_{edition}")(lesson, registry, {})
    assert "PRIVATE" not in tex
    assert r"\answer{" not in tex.replace(r"\renewcommand{\answer}[1]{}", "")
    assert registry[lesson["focus"]]["first_take"] in tex
    for part in registry[lesson["focus"]]["parts"]:
        assert part["prompt"] in tex


def test_teacher_keeps_key_and_scoring(ladder):
    lesson, registry = ladder
    item = registry[lesson["focus"]]
    tex = bl.emit_teacher(lesson, registry, {})
    for answer in item["answers"].values():
        assert answer in tex
    for guide in item["scoring"]["scoringGuide"].values():
        assert guide in tex
    assert item["dok_rationale"] in tex
    assert "SCORING PART (c)" in tex


def test_print_layout_and_determinism(ladder):
    lesson, registry = ladder
    student = bl.emit_student(lesson, registry, {})
    board = bl.emit_board(lesson, registry, {})
    assert student.count(r"\newpage") == 1
    assert "landscape" in board
    assert r"\href" not in board
    assert r"\qrcode" not in board
    assert lesson["worksheet"] not in board
    for emit in (bl.emit_student, bl.emit_board, bl.emit_teacher):
        assert emit(lesson, registry, {}) == emit(lesson, registry, {})


def test_invalid_focus_and_missing_answers_are_rejected(ladder):
    lesson, registry = ladder
    assert any("focus" in error for error in bl.validate_lesson({**lesson, "focus": None}, registry))
    item = registry[lesson["focus"]]
    item["dok"] = 2
    item["parts"][-1]["dok"] = 2
    assert any("1.3" in error for error in bl.validate_item(item, set()))
    item["answers"].pop("b")
    assert any("missing answer for part (b)" in error for error in bl.validate_item(item, set()))


def test_visual_schema_uses_only_data_and_labels():
    spec = {"kind": "scatter", "points": [[0, 0], [1, 1]], "xlabel": "Input", "ylabel": "Output"}
    assert bl.validate_visual(spec) == []
    assert bl.validate_visual({**spec, "answer_annotation": "secret"})
    assert bl.validate_visual({"kind": "unsupported"})
