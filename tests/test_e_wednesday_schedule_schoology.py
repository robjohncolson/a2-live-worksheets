"""Shared A2 lesson days retain distinct item identities, including Wednesdays."""
import sys
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from schoology_components import component_columns
from schoology_sync_lib import plan_assignment_work
@pytest.mark.parametrize('period',['C','D','G'])
def test_shared_day_items_are_distinct_and_idempotent(period):
    lessons={f'1.{n}':{'unit':1,'worksheetKey':str(n),'periods':{period:'2026-09-16'}} for n in [1,2]}
    cols=component_columns(lessons,period,quiz_topics=set(),blooket_topics=set())
    keys=[c['key'] for c in cols]
    assert len(keys)==len(set(keys))==14
    assert all(c['due_date']=='2026-09-16' for c in cols)
    existing={key:{'schoology_assignment_id':key} for key in keys}
    assert plan_assignment_work(keys,existing)['create']==[]
