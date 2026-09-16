"""District feeder points survive fixture generation without percentage scaling."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from build_schoology_fixture import build_fixture
from schoology_components import component_grades_from_class_doc

def test_all_four_item_point_values_survive_both_fixture_paths():
    items=[{'itemId':key,'points':points,'attempted':True,'due':True}
           for key,points in [('LC-U1-L1',8),('TI-U1-L1-1',1),('TA-U1',73),('BL-U1-L1-DESK_DONE',1)]]
    doc={'students':[{'studentId':'fixture','formula':'district','items':items}]}
    expected={'fixture/'+item['itemId']:item['points'] for item in items}
    assert build_fixture(doc)==component_grades_from_class_doc(doc)==expected


def test_full_credit_uses_raw_district_maxima():
    maxima = {"LC-U1-L1": 10, "TA-U1": 100, "TI-U1-L1-1": 2, "BL-U1-L1-DESK_DONE": 1}
    doc = {"students": [{"studentId": "fixture", "formula": "district", "items": [
        {"itemId": key, "points": points, "attempted": True, "due": True}
        for key, points in maxima.items()
    ]}]}
    expected = {"fixture/" + key: points for key, points in maxima.items()}
    assert build_fixture(doc) == component_grades_from_class_doc(doc) == expected


def test_latest_zero_teacher_score_survives_fixture_generation():
    # Already-resolved teacher scores must reach sync unchanged, even when lowered.
    doc = {"students": [{"studentId": "fixture", "formula": "district", "items": [
        {"itemId": "TI-U1-L1-1", "points": 0, "attempted": True, "due": True},
    ]}]}
    expected = {"fixture/TI-U1-L1-1": 0}
    assert build_fixture(doc) == component_grades_from_class_doc(doc) == expected
