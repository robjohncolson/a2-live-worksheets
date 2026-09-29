"""Decide who earns the IXL quiz replacement (Sep 28 2026 rule).

Rule: SmartScore 80+ on EVERY listed skill replaces the lesson quiz score with full
marks (20/20). Reads the saved analytics JSON per skill (roster-local/ixl-<CODE>-<date>.json,
shape {"table": [{firstName, lastName, score, questionsAnswered, last}]}) and the section
roster view (roster-local/roster-view-Period<S>.csv), prints one row per student, and
writes roster-local/quiz/<date>-Period<S>-ixl-replace.json with the qualifiers.

usage: python tools/ixl/ixl_quiz_replace.py <section> <date> <CODE1> <CODE2> ... [--quiz roster-local/quiz/<file>.json]
   e.g. python tools/ixl/ixl_quiz_replace.py D 2026-10-02 W42 BNH PHD --quiz roster-local/quiz/2026-09-28-PeriodD-1-1-quiz.json
"""
import csv, json, re, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.stdout.reconfigure(encoding="utf-8")

def norm(s):
    return set(re.sub(r"[^a-z ]", " ", unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()).split())

def match(name, table):
    n = norm(name)
    m = [x for x in table if norm(x["firstName"] + " " + x["lastName"]) == n]
    if not m:
        m = [x for x in table if len(n & norm(x["firstName"] + " " + x["lastName"])) >= 2
             and norm(x["lastName"]) <= n and norm(x["firstName"]) <= n]
    return m[0] if len(m) == 1 else None

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    section, date, codes = args[0], args[1], args[2:]
    quiz_path = None
    if "--quiz" in sys.argv:
        quiz_path = ROOT / sys.argv[sys.argv.index("--quiz") + 1]
    roster = [r for r in csv.DictReader(open(ROOT / f"roster-local/roster-view-Period{section}.csv", encoding="utf8"))
              if r.get("role", "student") == "student" and "colson" not in r["realName"].lower()]
    tables = {}
    for code in codes:
        f = ROOT / f"roster-local/ixl-{code}-{date}.json"
        tables[code] = json.load(open(f, encoding="utf8"))["table"]
    quiz = {}
    if quiz_path and quiz_path.exists():
        q = json.load(open(quiz_path, encoding="utf8"))
        quiz = {s["name"]: s for s in q["students"]}
    out = []
    print(f"{'Student':32} " + " ".join(f"{c:>5}" for c in codes) + "   quiz  -> result")
    for r in roster:
        name = r["realName"]
        scores = {}
        for code in codes:
            m = match(name, tables[code])
            scores[code] = None if m is None else m["score"]
        qualifies = all(s is not None and s >= 80 for s in scores.values())
        current = quiz.get(name, {}).get("capped")
        cur_txt = "abs" if name in quiz.get("_absent", []) else (str(current) if current is not None else "  -")
        result = "20 (IXL)" if qualifies else ("keep" if current is not None else "-")
        print(f"{name:32} " + " ".join(f"{('-' if s is None else s):>5}" for s in scores.values()) + f"   {cur_txt:>4}  -> {result}")
        out.append({"name": name, "scores": scores, "qualifies": qualifies, "currentQuiz": current})
    qual = [o["name"] for o in out if o["qualifies"]]
    lift = [o["name"] for o in out if o["qualifies"] and (o["currentQuiz"] is None or o["currentQuiz"] < 20)]
    print(f"\nqualify: {len(qual)} of {len(roster)}; lifted to 20: {len(lift)} -> {', '.join(lift) or 'none'}")
    dest = ROOT / f"roster-local/quiz/{date}-Period{section}-ixl-replace.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    json.dump({"section": section, "date": date, "skills": codes, "rule": "SmartScore 80+ on every skill -> quiz 20/20",
               "students": out, "lifted": lift}, open(dest, "w", encoding="utf8"), indent=2, ensure_ascii=False)
    print("wrote", dest.relative_to(ROOT))

if __name__ == "__main__":
    main()
