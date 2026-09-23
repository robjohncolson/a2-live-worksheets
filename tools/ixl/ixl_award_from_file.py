# usage: python ixl_award_from_file.py <jsonfile> <code> <section> <due> <label> [--commit]
import json, csv, re, unicodedata, sys
ROOT="C:/Users/rober/Downloads/Projects/school/algebra2-live-worksheet"
F, CODE, SECTION, DUE, LABEL = sys.argv[1:6]; COMMIT = "--commit" in sys.argv
d=json.load(open(F,encoding="utf8"))
def norm(s): return set(re.sub(r"[^a-z ]"," ",unicodedata.normalize("NFD",s).encode("ascii","ignore").decode().lower()).split())
rows=list(csv.DictReader(open(f"{ROOT}/roster-local/roster-view-Period{SECTION}.csv",encoding="utf8")))
src=f"IXL homework {CODE} ({LABEL}), due {DUE}: SmartScore 80+ = 1 pt"
L=json.load(open(f"{ROOT}/roster-local/a2-bonus-ledger.json",encoding="utf8"))
if any(e.get("source")==src for e in L["entries"]): raise SystemExit("ALREADY_RECORDED")
done=[]; unmatched=[]; practiced=[]
for r in rows:
    if "Colson" in r["realName"]: continue
    n=norm(r["realName"]); m=[x for x in d["table"] if norm(x["firstName"]+" "+x["lastName"])==n]
    if not m: m=[x for x in d["table"] if len(n & norm(x["firstName"]+" "+x["lastName"]))>=2 and norm(x["lastName"])<=n and norm(x["firstName"])<=n]
    if len(m)>1: unmatched.append(r["realName"]); continue
    if not m: continue
    sc=m[0]["score"]; practiced.append((r["realName"],sc))
    if sc>=80: done.append((r["realName"],sc)); L["entries"].append({"date":DUE,"quarter":1,"section":SECTION,"student":r["realName"],"source":src,"points":1,"note":f"SmartScore {sc}"})
if COMMIT: json.dump(L,open(f"{ROOT}/roster-local/a2-bonus-ledger.json","w",encoding="utf8"),indent=1,ensure_ascii=False)
print(json.dumps({"section":SECTION,"skill":CODE,"rosterSize":len(rows),"practiced":len(practiced),"awarded":len(done),"ambiguous":len(unmatched),"committed":COMMIT}))
for n,s in practiced: print(("  +1 " if s>=80 else "  --  "), n, "SmartScore", s)
