import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import schoology_sync_lib as lib
import schoology_components as components
import schoology_sync_section as sync
from build_schoology_fixture import build_fixture

def test_district_category_names_and_points():
    assert lib.KIND_TO_CATEGORY == {'lesson_check':'Assessments','topic_assessment':'Assessments','try_it':'Assignments','flashcard':'Engagement'}
    assert [lib.assignment_points(k) for k in lib.KIND_TO_CATEGORY] == [10,100,2,1]
    for key,kind in [('LC-U1-L1','lesson_check'),('TA-U1','topic_assessment'),('TI-U1-L1-2','try_it'),('BL-U1-L1-DESK_DONE','flashcard')]:
        assert lib.classify_lesson_key(key)==kind
        assert lib.assignment_title(kind,key)

def test_columns_are_individual_items_and_use_section_dates():
    lessons={'1.1':{'unit':1,'worksheetKey':'1','periods':{'C':'2026-09-10','D':'2026-09-11'}}}
    cols=components.component_columns(lessons,'C',quiz_topics=set(),blooket_topics=set(),topic_assessments=[{'itemId':'TA-U1','source':'topic-assessment','periods':{'C':'2026-10-20'}}])
    assert len(cols)==8
    assert sum(c['points'] for c in cols if c['kind']=='try_it')==10
    assert {c['category'] for c in cols}=={'Assessments','Assignments','Engagement'}
    assert next(c for c in cols if c['kind']=='flashcard')['key']=='BL-U1-L1-DESK_DONE'
    assert next(c for c in cols if c['kind']=='lesson_check')['due_date']=='2026-09-10'

def test_fixture_emits_earned_points_and_excludes_future_missing():
    doc={'students':[{'studentId':'s','schoologyUid':'123','formula':'district','items':[
        {'itemId':'LC-U1-L1','points':8,'attempted':True,'due':True},
        {'itemId':'TI-U1-L1-1','points':1,'attempted':True,'due':True},
        {'itemId':'future','points':10,'attempted':True,'due':False},
        {'itemId':'missing','points':0,'attempted':False,'due':True}]}]}
    assert build_fixture(doc)=={'123/LC-U1-L1':8,'123/TI-U1-L1-1':1}

def test_sync_defaults_to_dry_run():
    assert sync._parse_args(['--sync-section','PeriodC']).dry_run
    assert not sync._parse_args(['--sync-section','PeriodC','--apply']).dry_run
