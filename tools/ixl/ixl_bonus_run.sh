#!/bin/bash
# usage: ixl_bonus_run.sh <skillId> <code> <section> <due> <label>
set -e -o pipefail
cd "C:/Users/rober/Downloads/Projects/school/algebra2-live-worksheet"; unset ROSTER_TEACHER_SECRET
U=https://a2-live-worksheets-production.up.railway.app
node scripts/teacher-roster.mjs --view --section Period$3 --url $U --out roster-local/roster-view-Period$3.csv >/dev/null
export IXL_SECTION="$3"; IXL_SKILL="$1" IXL_CODE="$2" IXL_SECTION="$3" IXL_DUE="$4" IXL_LABEL="$5" IXL_DRY="${IXL_DRY:-0}" browser-harness < "$TEMP/a2/ixl_bonus.py" 2>&1 | grep -v SyntaxWarning
node scripts/a2-bonus-totals.mjs --commit --url $U
node -e "import('./scripts/a2-bonus-totals.mjs').then(m=>{const L=JSON.parse(require('fs').readFileSync('roster-local/a2-bonus-ledger.json','utf8'));const e=L.entries.map(x=>({...x,section:String(x.section).replace(/^Period/i,'')}));require('fs').writeFileSync(process.env.TEMP+'/a2/totals.json',JSON.stringify(m.bonusTotals(e,1)))})"
browser-harness <<'PY' 2>&1 | grep -v SyntaxWarning | grep -v " OK$"
import os
exec(open(os.environ["TEMP"]+"/a2/enter.py").read(), globals())
sec=os.environ["IXL_SECTION"]; cid={"C":"8537065947","D":"8537065922","G":"8537065934"}[sec]
enter_section(sec,cid,None)
PY
