"""Authoring guard and legacy schema names for self-contained DOK sheets."""
import json
import re
from pathlib import Path

LEGACY_EXPLORE_KEY = "video_worksheet"
FORBIDDEN = re.compile("video", re.IGNORECASE)
WORKSHEET_FILENAME = re.compile(r"[\w.-]+_live\.html", re.IGNORECASE)
SELF_PACED_PHRASES = json.loads(Path(__file__).with_name("self_paced_phrases.json").read_text(encoding="utf-8"))


def validate_self_paced_text(text, path):
    """Literal flow phrases only: measurement units and problem data stay intact."""
    return [f"{path}: forbidden self-paced phrase {phrase!r}"
            for phrase in SELF_PACED_PHRASES if phrase.lower() in text.lower()]


def validate_field_values(value, path="", worksheet=False):
    """Check every nested value; only actual worksheet filenames are exempt."""
    if isinstance(value, dict):
        errors = []
        for key, child in value.items():
            child_path = f"{path}.{key}" if path else str(key)
            errors.extend(validate_field_values(child, child_path, key in ("worksheet", "worksheets")))
        return errors
    if isinstance(value, list):
        return [error for i, child in enumerate(value)
                for error in validate_field_values(child, f"{path}[{i}]", worksheet)]
    if not isinstance(value, str):
        return []
    if worksheet and WORKSHEET_FILENAME.fullmatch(value):
        return []
    if FORBIDDEN.search(value):
        return [f"{path}: forbidden video reference; use the printed rules, stem, or visual"]
    return validate_self_paced_text(value, path)


def validate_printed_text(text):
    """Every emitted character is checked; filename exemptions are metadata-only."""
    if FORBIDDEN.search(text):
        return ["emitted TeX: forbidden video reference"]
    return validate_self_paced_text(text, "emitted TeX")
