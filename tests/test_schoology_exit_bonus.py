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
