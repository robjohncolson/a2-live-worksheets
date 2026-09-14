r"""dok/build_ladder.py — one DOK-3 problem per lesson day, three editions.

    python dok/build_ladder.py dok/lessons/1.6.yaml            # student + board + teacher .tex
    python dok/build_ladder.py dok/lessons/1.6.yaml --edition board
    python dok/build_ladder.py --all                            # every YAML in dok/lessons/
    python dok/build_ladder.py --validate                       # registry + YAML checks, exit 1 on any problem

Spec: APS_DOK_LADDER_SPEC.md. Ported 2026-09-03 from
Lesson_planning/build_lesson_from_yaml.py and trimmed to the ladder.

Inputs
  dok/registry/{topic}.jsonl  one file per lesson day, one JSON object per line (spec §2.1)
  dok/lessons/{topic}.yaml  one per dated lesson day (spec §2.2)
  ai-tutor/u{u}_l{n}.md     the CED tether (LO / EK lines) printed on the teacher key
  data/lesson-schedule.json topic -> unit + dates (for the header + coverage)

Outputs
  dok/tex/aps_{topic}_{student,board,teacher}.tex
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import yaml

if __package__:
    from .content_policy import validate_field_values, validate_printed_text
else:
    # Direct CLI execution and file-based test imports both load this sibling.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from content_policy import validate_field_values, validate_printed_text

ROOT = Path(__file__).resolve().parent.parent
DOK = ROOT / "dok"
REGISTRY_DIR = DOK / "registry"   # one {topic}.jsonl per lesson day — parallel authors never collide
LESSONS = DOK / "lessons"
TEX_DIR = DOK / "tex"
SCHEDULE = ROOT / "data" / "lesson-schedule.json"
TUTOR_DIR = ROOT / "ai-tutor"

SKILL_RE = re.compile(r"^[1-4]\.[A-F]$")
ID_RE = re.compile(r"^aps-\d+\.\d+(?:_\d+\.\d+)*-d[123]-\d+$")
BANNED_RATIONALE_WORDS = ("hard", "easy", "difficult")
DEFAULT_SPACE = {"first_take": "1.2in", "a": "0.9in", "b": "1.4in", "c": "2.4in"}


# ---- Loading -------------------------------------------------------------


def load_registry() -> dict[str, dict]:
    """All rows from dok/registry/*.jsonl. A row must live in the file named for its topic."""
    out: dict[str, dict] = {}
    for path in sorted(REGISTRY_DIR.glob("*.jsonl")):
        with path.open(encoding="utf-8") as f:
            for lineno, line in enumerate(f, start=1):
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError as e:
                    hint = line[:80] + ("..." if len(line) > 80 else "")
                    raise SystemExit(
                        f"{path.name} line {lineno}: JSON decode error ({e.msg} at col {e.colno}).\n"
                        f"  first 80 chars: {hint}"
                    ) from e
                if str(row.get("topic", "")).replace("+", "_") != path.stem:
                    raise SystemExit(f"{path.name} line {lineno}: row topic {row.get('topic')!r} must equal the file name")
                if row["id"] in out:
                    raise SystemExit(f"{path.name} line {lineno}: duplicate id {row['id']}")
                out[row["id"]] = row
    return out


def load_schedule() -> dict:
    return json.loads(SCHEDULE.read_text(encoding="utf-8"))


def load_lesson(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def tutor_path(topic: str) -> Path:
    unit, n = topic.split(".")
    return TUTOR_DIR / f"u{unit}_l{n}.md"


LATEX_ESCAPES = {
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "^": r"\textasciicircum{}",
}
UNICODE_TO_LATEX = {
    "≥": r"$\geq$", "≤": r"$\leq$", "≠": r"$\neq$", "±": r"$\pm$", "×": r"$\times$", "−": "-",
    "→": r"$\rightarrow$", "μ": r"$\mu$", "σ": r"$\sigma$", "α": r"$\alpha$", "β": r"$\beta$",
    "χ": r"$\chi$", "Σ": r"$\sum$", "√": r"$\surd$", "·": r"$\cdot$", "∩": r"$\cap$", "∪": r"$\cup$", "…": r"\ldots{}", "—": "---", "–": "--", "’": "'", "“": "``", "”": "''",
}
UNICODE_STAT_SEQUENCES = {
    "x̄₁": r"$\bar{x}_1$",
    "x̄₂": r"$\bar{x}_2$",
    "μ₀": r"$\mu_0$",
    "μ₁": r"$\mu_1$",
    "μ₂": r"$\mu_2$",
    "μ_D": r"$\mu_D$",
    "σ₁²": r"$\sigma_1^2$",
    "σ₂²": r"$\sigma_2^2$",
    "σ₁": r"$\sigma_1$",
    "σ₂": r"$\sigma_2$",
    "s₁²": r"$s_1^2$",
    "s₂²": r"$s_2^2$",
    "s₁": r"$s_1$",
    "s₂": r"$s_2$",
    "ȳ": r"$\bar{y}$",
    "ŷ": r"$\widehat{y}$",
    "p̂₁": r"$\widehat p_1$",
    "p̂₂": r"$\widehat p_2$",
    "p̂_c": r"$\widehat p_c$",
    "p̂1": r"$\widehat p_1$",
    "p̂2": r"$\widehat p_2$",
    "p₁": r"$p_1$",
    "p₂": r"$p_2$",
    "n₁": r"$n_1$",
    "n₂": r"$n_2$",
    "N₁": r"$N_1$",
    "N₂": r"$N_2$",
    "H₀": r"$H_0$",
    "Hₐ": r"$H_a$",
    "np₀": r"$np_0$",
    "p₀": r"$p_0$",
    "μ_X": r"$\mu_X$",
    "σ_X": r"$\sigma_X$",
    "x_i": r"$x_i$",
    "x̄": r"$\bar{x}$",
    "xᵢ": r"$x_i$",
    "iᵗʰ": r"$i^{\mathrm{th}}$",
    "sₓ": r"$s_x$",
    "s²": r"$s^2$",
    "ᵗʰ": r"\textsuperscript{th}",
    "²": r"\textsuperscript{2}",
}


def latex_text(s: str) -> str:
    """Escape prose (NOT author-written LaTeX) for pdflatex."""
    protected: dict[str, str] = {}
    for index, (source, replacement) in enumerate(UNICODE_STAT_SEQUENCES.items()):
        marker = f"\x00STAT{index}\x00"
        s = s.replace(source, marker)
        protected[marker] = replacement
    out = []
    for ch in s:
        if ch in LATEX_ESCAPES:
            out.append(LATEX_ESCAPES[ch])
        elif ch in UNICODE_TO_LATEX:
            out.append(UNICODE_TO_LATEX[ch])
        else:
            out.append(ch)
    rendered = "".join(out)
    for marker, replacement in protected.items():
        rendered = rendered.replace(marker, replacement)
    return rendered


def tether_lines(topic: str | list[str]) -> list[str]:
    """The Skill / EU / LO / EK lines from the tutor artifact, LaTeX-escaped.

    Tutor files come in three shapes (bullets, bold bullets with nested EKs, and a
    two-column LO | EK table); all are reduced to one flat list of statements.
    """
    if isinstance(topic, list):
        return list(dict.fromkeys(line for member in topic for line in tether_lines(member)))
    p = tutor_path(topic)
    if not p.exists():
        return []
    text = p.read_text(encoding="utf-8")
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.IGNORECASE)
    start = text.find("THE CONCEPTS THIS LESSON")
    end = text.find("HOW YOU MUST BEHAVE")
    block = text[start:end] if start >= 0 and end > start else text
    out: list[str] = []
    for raw in block.splitlines():
        line = raw.strip()
        if not line or line.startswith("THE CONCEPTS") or line.startswith("back to one of"):
            continue
        if line.startswith("|"):
            if set(line) <= set("|:- "):
                continue  # table rule
            cells = [c.strip() for c in line.strip("|").split("|")]
            if cells and cells[0].upper().startswith("LEARNING OBJECTIVE"):
                continue  # header
            out.extend(c for c in cells if c)
            continue
        if line.startswith("- "):
            out.append(line[2:].strip())
            continue
        if line.startswith("**"):
            out.append(line)
            continue
        if out and not out[-1].endswith("."):
            out[-1] = out[-1] + " " + line  # wrapped EU sentence
        else:
            out.append(line)
    cleaned = [re.sub(r"\*\*(.+?)\*\*", r"\1", s) for s in out]
    cleaned = [re.sub(r"(?<!\w)\*([^*\n]+?)\*(?!\w)", r"\1", s) for s in cleaned]
    return [r"\textbf{" + latex_text(s.split(" — ")[0]) + "}" + latex_text(" — " + " — ".join(s.split(" — ")[1:])) if " — " in s else latex_text(s) for s in cleaned]


# ---- Validation (spec §2.1 / §7 T1) -------------------------------------


def validate_item(row: dict, skill_codes: set[str]) -> list[str]:
    e: list[str] = []
    iid = row.get("id", "?")
    e.extend(validate_field_values(row, str(iid)))
    if not ID_RE.match(iid):
        e.append(f"{iid}: id must match aps-{{topic}}-d{{1|2|3}}-{{k}}")
    topics = row.get("topics") or [row.get("topic")]
    if "+" in str(row.get("topic", "")):
        if topics != str(row["topic"]).split("+"):
            e.append(f"{iid}: topics must match the group key in teaching order")
        parts = row.get("parts") or []
        if any(part.get("topic") not in topics for part in parts):
            e.append(f"{iid}: each part must name a member topic")
        if parts and parts[-1].get("topic") != topics[-1] and not parts[-1].get("integrates"):
            e.append(f"{iid}: last part must use the last topic or integrate the group")
    if row.get("dok") not in (1, 2, 3):
        e.append(f"{iid}: dok must be 1, 2 or 3")
    if row.get("role") not in ("focus", "reinforcement"):
        e.append(f"{iid}: role must be focus | reinforcement")
    rationale = row.get("dok_rationale", "")
    if len(rationale) < 40:
        e.append(f"{iid}: dok_rationale must be at least 40 chars")
    if any(w in rationale.lower() for w in BANNED_RATIONALE_WORDS):
        e.append(f"{iid}: dok_rationale describes difficulty, not the kind of thinking (R2)")
    for code in [row.get("skill")] + [p.get("skill") for p in row.get("parts", [])]:
        if code is not None and (not SKILL_RE.match(str(code)) or code not in skill_codes):
            e.append(f"{iid}: unknown CED skill code {code!r}")
    if re.search(r"\d", row.get("stem", "")) and row.get("hypothetical") is not True:
        e.append(f"{iid}: a stem with numbers must declare hypothetical: true (R6)")

    if row.get("role") == "focus":
        parts = row.get("parts") or []
        if not row.get("first_take"):
            e.append(f"{iid}: focus needs a first_take prompt")
        if not 2 <= len(parts) <= 4:
            e.append(f"{iid}: focus needs 2-4 parts")
        doks = [p.get("dok") for p in parts]
        if doks != sorted(doks):
            e.append(f"{iid}: part DOKs must be non-decreasing")
        if parts and doks[-1] != row.get("dok"):
            e.append(f"{iid}: last part's dok must equal the item's top dok")
        if row.get("dok") != 3:
            e.append(f"{iid}: every lesson's focus problem tops out at DOK 3 (spec §1.3)")
        if not row.get("frq_pattern"):
            e.append(f"{iid}: DOK-3 focus needs frq_pattern")
        sc = row.get("scoring") or {}
        if not (sc.get("expectedElements") and sc.get("scoringGuide")):
            e.append(f"{iid}: DOK-3 focus needs scoring.expectedElements + scoring.scoringGuide")
        answers = row.get("answers") or {}
        for p in parts:
            if p.get("label") not in answers:
                e.append(f"{iid}: missing answer for part ({p.get('label')})")
    return e


def validate_lesson(lesson: dict, registry: dict) -> list[str]:
    e: list[str] = []
    topic = str(lesson.get("topic", "?"))
    e.extend(validate_field_values(lesson, topic))
    for field in ("minutes", "exit_reflection"):
        if field in lesson:
            e.append(f"{topic}: retired self-paced field {field} must be deleted")
    for field in ("phase_tag", "teacher_does", "students_do", "adult_role"):
        if field in (lesson.get("teacher") or {}):
            e.append(f"{topic}: retired self-paced field teacher.{field} must be deleted")
    focus = lesson.get("focus")
    if not focus or focus not in registry:
        e.append(f"{topic}: focus must name a registry id (got {focus!r})")
    elif registry[focus].get("role") != "focus" or registry[focus].get("dok") != 3:
        e.append(f"{topic}: focus item must be role=focus, dok=3")
    for rid in lesson.get("reinforcement") or []:
        if rid not in registry:
            e.append(f"{topic}: reinforcement id {rid} not in registry")
    if focus in registry:
        vis = registry[focus].get("visual")
        if vis and vis not in (lesson.get("visuals") or {}):
            e.append(f"{topic}: focus visual {vis!r} has no visuals block")
    for name, spec in (lesson.get("visuals") or {}).items():
        e.extend(f"{topic}: visual {name}: {msg}" for msg in validate_visual(spec))
    if "+" in topic:
        topics = lesson.get("topics") or []
        if topics != topic.split("+"):
            e.append(f"{topic}: topics must match the group key in teaching order")
    if lesson.get("standalone") is not True:
        e.append(f"{topic}: active sheets require standalone: true")
    misconceptions = lesson.get("misconceptions")
    if not isinstance(misconceptions, list) or not misconceptions or any(
        not isinstance(key, str) or not key.strip() for key in misconceptions
    ):
        e.append(f"{topic}: misconceptions must be a non-empty list of panel keys or labels")
    generated = lesson.get("generated")
    if not isinstance(generated, dict):
        e.append(f"{topic}: generated metadata requires by, on and window_days")
    else:
        if not isinstance(generated.get("by"), str) or not generated["by"].strip():
            e.append(f"{topic}: generated.by must name the author")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(generated.get("on", ""))):
            e.append(f"{topic}: generated.on must be an ISO date")
        if type(generated.get("window_days")) is not int or generated["window_days"] <= 0:
            e.append(f"{topic}: generated.window_days must be a positive integer")
    if not (lesson.get("worksheet") or lesson.get("worksheets")):
        e.append(f"{topic}: worksheet filename required (manifest metadata)")
    return e


VISUAL_KEYS = {
    "pgfplot_hist": {"kind", "bins", "counts", "xlabel", "ylabel", "scale"},
    "dotplot": {"kind", "values", "xlabel", "scale"},
    "boxplot": {"kind", "five", "xlabel", "scale", "outliers", "series"},
    "two_way_table": {"kind", "rows", "cols", "cells", "row_label", "col_label"},
    "scatter": {"kind", "points", "xlabel", "ylabel", "xmin", "xmax", "ymin", "ymax", "scale"},
    "raw_tikz": {"kind", "body", "wrap_center"},
}


def validate_visual(spec: dict) -> list[str]:
    """T4: a visual carries data + labels only (no answer-bearing annotations)."""
    kind = spec.get("kind")
    if kind not in VISUAL_KEYS:
        return [f"unknown kind {kind!r}"]
    extra = set(spec) - VISUAL_KEYS[kind]
    return [f"unexpected keys {sorted(extra)} (data + labels only)"] if extra else []


def all_skill_codes() -> set[str]:
    """Every skill code that appears in the parsed CED frameworks (via the tutor tethers)."""
    codes: set[str] = set()
    for p in TUTOR_DIR.glob("u*_l*.md"):
        for m in re.finditer(r"Skill[s]? ([1-4]\.[A-F])", p.read_text(encoding="utf-8")):
            codes.add(m.group(1))
    # The four categories always exist even if a tutor file misses one.
    codes.update(f"{c}.{l}" for c in "1234" for l in "ABCDEF")
    return codes


# ---- Visual renderers ----------------------------------------------------


def render_visual(spec: dict, scale: float = 1.0) -> str:
    scale *= float(spec.get("scale", 1.0))
    kind = spec.get("kind")
    if kind == "pgfplot_hist":
        return render_hist(spec, scale)
    if kind == "dotplot":
        return render_dotplot(spec, scale)
    if kind == "boxplot":
        return render_boxplot(spec, scale)
    if kind == "two_way_table":
        return render_two_way(spec)
    if kind == "scatter":
        return render_scatter(spec, scale)
    if kind == "raw_tikz":
        body = spec.get("body", "").rstrip()
        return f"\\begin{{center}}\n{body}\n\\end{{center}}\n" if spec.get("wrap_center", True) else body + "\n"
    return f"% unknown visual kind: {kind}\n"


def _axis_size(scale: float, w: float = 0.85, h: float = 2.3) -> str:
    return f"  width={w * scale:.2f}\\linewidth,\n  height={h * scale:.2f}in,\n"


def render_hist(s: dict, scale: float) -> str:
    bins, counts = s["bins"], s["counts"]
    width = bins[1] - bins[0]
    bars = "\n".join(f"  ({bins[i]},{counts[i]})" for i in range(len(counts)))
    return (
        "\\begin{center}\n\\begin{tikzpicture}\n\\begin{axis}[\n"
        + _axis_size(scale)
        + f"  ybar interval, ymin=0, ymax={max(counts) + 2},\n"
        + f"  xmin={bins[0]}, xmax={bins[-1]}, xtick={{{','.join(str(b) for b in bins)}}},\n"
        + f"  xlabel={{{s.get('xlabel', '')}}}, ylabel={{{s.get('ylabel', '')}}},\n"
        + "  ymajorgrids, tick label style={font=\\small}, label style={font=\\small},\n"
        + "  bar shift=0pt, x tick label as interval=false\n]\n"
        + f"\\addplot[fill=calloutblue, draw=dayblue] coordinates {{\n{bars}\n  ({bins[-1]},0)\n}};\n"
        + "\\end{axis}\n\\end{tikzpicture}\n\\end{center}\n"
    )


def render_dotplot(s: dict, scale: float) -> str:
    values = sorted(s["values"])
    stacks: dict[float, int] = {}
    pts = []
    for v in values:
        stacks[v] = stacks.get(v, 0) + 1
        pts.append(f"  ({v},{stacks[v]})")
    return (
        "\\begin{center}\n\\begin{tikzpicture}\n\\begin{axis}[\n"
        + _axis_size(scale, h=1.6)
        + f"  ymin=0, ymax={max(stacks.values()) + 1}, ytick=\\empty, axis y line=none, axis x line=bottom,\n"
        + f"  xlabel={{{s.get('xlabel', '')}}}, tick label style={{font=\\small}}, label style={{font=\\small}}\n]\n"
        + f"\\addplot[only marks, mark=*, mark size={2.4 * scale:.1f}pt, color=dayblue] coordinates {{\n"
        + "\n".join(pts) + "\n};\n\\end{axis}\n\\end{tikzpicture}\n\\end{center}\n"
    )


def render_boxplot(s: dict, scale: float) -> str:
    """One boxplot (`five` + `outliers`) or several side by side (`series: [{label, five, outliers}]`)."""
    series = s.get("series") or [{"label": "", "five": s["five"], "outliers": s.get("outliers", [])}]
    n = len(series)
    labels = ",".join(f"{{{sr.get('label', '')}}}" for sr in series)
    plots = []
    for i, sr in enumerate(series):
        lo, q1, med, q3, hi = sr["five"]
        y = n - i  # first series on top
        plots.append(
            f"\\addplot[boxplot prepared={{lower whisker={lo}, lower quartile={q1}, median={med}, "
            f"upper quartile={q3}, upper whisker={hi}, draw position={y}}}, fill=calloutblue, draw=dayblue] coordinates {{}};\n"
        )
        outs = " ".join(f"({v},{y})" for v in sr.get("outliers", []))
        if outs:
            plots.append(f"\\addplot[only marks, mark=*, color=warmred] coordinates {{{outs}}};\n")
    return (
        "\\begin{center}\n\\begin{tikzpicture}\n\\begin{axis}[\n"
        + _axis_size(scale, h=0.9 + 0.55 * n)
        + f"  ytick={{{','.join(str(n - i) for i in range(n))}}}, yticklabels={{{labels}}}, ymin=0.4, ymax={n + 0.6},\n"
        + "  axis x line=bottom, axis y line*=left, y axis line style={draw=none}, boxplot/box extend=0.5, xmajorgrids, enlarge x limits=0.06,\n"
        + f"  xlabel={{{s.get('xlabel', '')}}}, tick label style={{font=\\small}}, label style={{font=\\small}},\n"
        + "  ytick style={draw=none}, yticklabel style={font=\\small\\bfseries}\n]\n"
        + "".join(plots)
        + "\\end{axis}\n\\end{tikzpicture}\n\\end{center}\n"
    )


def render_two_way(s: dict) -> str:
    cols = s["cols"]
    head = " & ".join([f"\\textbf{{{s.get('row_label', '')}}}"] + [f"\\textbf{{{c}}}" for c in cols])
    body = "".join(
        f"\\textbf{{{r}}} & " + " & ".join(str(v) for v in s["cells"][i]) + " \\\\ \\hline\n"
        for i, r in enumerate(s["rows"])
    )
    return (
        "\\begin{center}\n"
        f"\\textbf{{{s.get('col_label', '')}}}\\par\\smallskip\n"
        f"\\begin{{tabular}}{{|l|{'c|' * len(cols)}}}\n\\hline\n{head} \\\\ \\hline\n{body}"
        "\\end{tabular}\n\\end{center}\n"
    )


def render_scatter(s: dict, scale: float) -> str:
    pts = "\n".join(f"  ({x},{y})" for x, y in s["points"])
    return (
        "\\begin{center}\n\\begin{tikzpicture}\n\\begin{axis}[\n"
        + _axis_size(scale)
        + f"  xmin={s['xmin']}, xmax={s['xmax']}, ymin={s['ymin']}, ymax={s['ymax']},\n"
        + f"  xlabel={{{s.get('xlabel', '')}}}, ylabel={{{s.get('ylabel', '')}}}, grid=major,\n"
        + "  tick label style={font=\\small}, label style={font=\\small}\n]\n"
        + f"\\addplot[only marks, mark=*, mark size={2.2 * scale:.1f}pt, color=dayblue] coordinates {{\n{pts}\n}};\n"
        + "\\end{axis}\n\\end{tikzpicture}\n\\end{center}\n"
    )


# ---- Small blocks --------------------------------------------------------


def callout_block(title: str, color: str, body: str) -> str:
    return f"\\begin{{callout}}{{{title}}}{{{color}}}\n{body.rstrip()}\n\\end{{callout}}\n\n"


def bulleted(items: list[str]) -> str:
    if not items:
        return ""
    return (
        "\\begin{itemize}[leftmargin=1.5em,itemsep=2pt,topsep=2pt]\n"
        + "".join(f"  \\item {it}\n" for it in items)
        + "\\end{itemize}\n"
    )


def ced_topic_label(lesson: dict) -> str:
    ced = lesson.get("ced2026") or {}
    if lesson.get("worksheets"):
        old = "--".join([lesson["topics"][0], lesson["topics"][-1]])
        new = "--".join([ced["topics"][0], ced["topics"][-1]])
        return f"Unit {ced.get('unit', '?')} \\textperiodcentered\\ Topics {old} (CED {new})"
    return f"Unit {ced.get('unit', '?')} \\textperiodcentered\\ Topic {ced.get('topic', '?')}"


def header_line(lesson: dict, schedule: dict) -> str:
    return f"Algebra 2 \\textperiodcentered\\ {ced_topic_label(lesson)}"


def part_block(part: dict, space: dict, answers: dict | None) -> str:
    label = part["label"]
    out = [f"\\dokbadge{{{part['dok']}}}~\\textbf{{({label})}} {part['prompt'].strip()}\\par"]
    if answers is not None:
        out.append(f"\\answer{{{answers.get(label, '(no key)')}}}")
    else:
        out.append(f"\\workspace{{{space.get(label, '1in')}}}")
    return "\n".join(out) + "\n\n"


def scoring_table(sc: dict, top_label: str = "c") -> str:
    els = bulleted([
        f"\\textbf{{{el['id']}}}{' (required)' if el.get('required') else ''} --- {el['description']}"
        for el in sc.get("expectedElements", [])
    ])
    guide = sc.get("scoringGuide", {})
    rows = "".join(
        f"\\textbf{{{k}}} & {guide.get(k, '')} \\\\ \\hline\n" for k in ("E", "P", "I")
    )
    mistakes = bulleted(sc.get("commonMistakes", []))
    return (
        f"\\sectionbanner{{SCORING PART ({top_label}) --- E / P / I}}\n\n"
        "\\textbf{Expected elements}\n" + els + "\n"
        "{\\small\\renewcommand{\\arraystretch}{1.25}\n"
        "\\noindent\\begin{tabular}{|p{0.5in}|p{5.9in}|}\n\\hline\n" + rows + "\\end{tabular}}\n\n"
        + ("\\textbf{Common mistakes}\n" + mistakes + "\n" if mistakes else "")
    )


# ---- Editions ------------------------------------------------------------


def shared_problem(lesson: dict, item: dict, scale: float) -> str:
    """Stem + visual, identical across the three editions (R5: same TikZ source)."""
    out = [item["stem"].strip() + "\\par\n"]
    vis = item.get("visual")
    if vis:
        out.append(render_visual(lesson["visuals"][vis], scale))
    return "".join(out)


def emit_student(lesson: dict, registry: dict, schedule: dict) -> str:
    item = registry[lesson["focus"]]
    space = {**DEFAULT_SPACE, **(lesson.get("space") or {})}
    rules = lesson.get("rules_callout") or {}
    parts = [
        "\\documentclass[11pt]{article}\n\\usepackage{preamble}\n\\renewcommand{\\answer}[1]{}\n\n",
        "\\begin{document}\n\n",
        f"\\ladderheading{{{header_line(lesson, schedule)}}}{{{lesson['title']}}}\n\n",
        "\\focusbanner{THE PROBLEM}\n\n",
        shared_problem(lesson, item, 1.0),
        "\\begin{firsttakebox}{FIRST TAKE --- one sentence before you work the parts}\n"
        f"{item['first_take'].strip()}\n\\workspace{{{space['first_take']}}}\n\\end{{firsttakebox}}\n\n",
    ]
    if rules:
        parts.append(callout_block(f"\\IconBook\\ {rules['title']}", "calloutgreen", rules["body"]))
    # Front = read + commit. Back = finish + turn in. A deliberate two-sided sheet.
    part_range = f"({item['parts'][0]['label']})--({item['parts'][-1]['label']})"
    parts.append(f"\\newpage\n\\textbf{{Work {part_range}.}}\\par\\smallskip\n\n")
    for p in item["parts"]:
        parts.append(part_block(p, space, answers=None))
    for frame in item.get("sentence_frames", []):
        parts.append(f"\\begin{{sentenceframebox}}\\raggedright\\textbf{{Frame:}} {frame}\\end{{sentenceframebox}}\n\n")
    parts.append(
        "\\textbf{Turn this sheet in whenever you finish --- bonus credit. "
        f"Part ({item['parts'][-1]['label']}) is scored E / P / I.}}\\par\n\n"
    )
    for k, rid in enumerate(lesson.get("reinforcement") or [], start=1):
        r = registry[rid]
        parts.append(
            f"\\bankitem{{Optional \\#{k} --- not collected}}{{\\dokbadge{{{r['dok']}}}~{r['stem'].strip()}}}{{}}\n\n"
        )
    parts.append("\\end{document}\n")
    return "".join(parts)


def emit_board(lesson: dict, registry: dict, schedule: dict) -> str:
    item = registry[lesson["focus"]]
    part_range = f"({item['parts'][0]['label']})--({item['parts'][-1]['label']})"
    part_lines = "".join(
        f"  \\item[\\dokbadge{{{p['dok']}}}~({p['label']})] {p['prompt'].strip()}\n" for p in item["parts"]
    )
    output = (
        "\\documentclass[14pt]{extarticle}\n\\usepackage{preamble}\n"
        "\\geometry{letterpaper, landscape, margin=0.5in}\n"
        "\\renewcommand{\\answer}[1]{}\n\\setlength{\\parskip}{4pt}\n\n\\begin{document}\n\\pagestyle{empty}\n\n"
        f"\\daybanner{{{ced_topic_label(lesson)} \\textperiodcentered\\ THE PROBLEM}}{{{lesson['title']}}}\n\n"
        "\\noindent\\begin{minipage}[t]{0.57\\linewidth}\n\\vspace{0pt}\n"
        + item["stem"].strip() + "\\par\n"
        + "\\end{minipage}\\hfill\n"
        "\\begin{minipage}[t]{0.40\\linewidth}\n\\vspace{0pt}\n"
        + (render_visual(lesson["visuals"][item["visual"]], 1.0) if item.get("visual") else "")
        + "\\end{minipage}\n\n"
        "\\begin{firsttakebox}{FIRST TAKE --- one sentence before you work the parts}\n"
        f"{item['first_take'].strip()}\n\\end{{firsttakebox}}\n\n"
        "\\begin{description}[leftmargin=1.15in, labelwidth=1in, itemsep=2pt, topsep=2pt]\n" + part_lines + "\\end{description}\n\n"
        "\\vfill\n\\textbf{Self-paced bonus problem. "
        f"Work {part_range} from this sheet; turn it in whenever you finish.}}\n\n\\end{{document}}\n"
    )

    if lesson.get("worksheets"):
        output = output.replace("[14pt]", "[12pt]")
    return output


def emit_teacher(lesson: dict, registry: dict, schedule: dict) -> str:
    item = registry[lesson["focus"]]
    space = {**DEFAULT_SPACE, **(lesson.get("space") or {})}
    t = lesson.get("teacher") or {}
    rules = lesson.get("rules_callout") or {}
    top = item["parts"][-1]["label"]
    ladder = " and ".join(f"({part['label']})" for part in item["parts"][:-1])
    # A YAML `tether:` list (LaTeX-safe lines) overrides the tutor artifact — for topics without one.
    tether = [str(x) for x in (lesson.get("tether") or [])] or tether_lines(lesson.get("topics") or str(lesson["topic"]))
    frq_pattern = str(item.get("frq_pattern", "")).replace("-", r"-\allowbreak{}")
    tether_block = "\\sectionbanner{CED TETHER}\n\n{\\small\n" + (bulleted(tether) if tether else "\\textit{(no tutor artifact for this topic)}\n") + "}\n"
    extra_packages = ""
    if lesson.get("topics"):
        extra_packages = "\\usepackage{multicol}\n"
        tether_block = (
            "\\sectionbanner{CED TETHER}\n\\begin{multicols}{2}\n"
            "{\\footnotesize\\setlength{\\parskip}{0pt}\n"
            "\\begin{itemize}[leftmargin=*,itemsep=0pt,topsep=0pt]\n"
            + "\n".join("\\item " + line for line in tether)
            + "\n\\end{itemize}}\n\\end{multicols}\n\\clearpage\n\\small\n"
        )
    parts = [
        "\\documentclass[11pt]{article}\n\\usepackage{preamble}\n" + extra_packages + "\\setlength{\\parskip}{4pt}\n\n\\begin{document}\n\n",
        f"\\daybanner{{{header_line(lesson, schedule)} \\textperiodcentered\\ TEACHER KEY}}{{{lesson['title']}}}\n\n",
        tether_block,
        f"\\textbf{{Essential question:}} {lesson.get('essential_question', '')}\\par\n",
        f"\\textbf{{DOK-3 skill:}} {item.get('skill')} \\textperiodcentered\\ \\textbf{{FRQ pattern:}} {{\\small\\texttt{{{frq_pattern}}}}}\\par\n",
        f"\\textbf{{DOK rationale:}} {item.get('dok_rationale')}\\par\n\n",
        "\\textbf{Self-paced bonus sheet.} Students take it when they choose and turn it in when they finish. "
        "Everything they need is printed on the sheet. "
        f"Score part ({top}) only, E / P / I, by hand --- never AI-graded or auto-scored. "
        f"{ladder} are the ladder up; use them to see where a thin ({top}) came from.\\par\n\n",
        "\\textbf{Questions to ask}\n" + bulleted(t.get("questions_to_ask", [])) + "\n",
    ]
    if t.get("watch_for"):
        parts.append(callout_block("\\IconWarn\\ LOOK FOR", "calloutred", bulleted(t["watch_for"])))
    parts.append(scoring_table(item.get("scoring") or {}, (item.get("parts") or [{"label": "c"}])[-1]["label"]))
    for k, rid in enumerate(lesson.get("reinforcement") or [], start=1):
        r = registry[rid]
        parts.append(f"\\bankitem{{Optional \\#{k} --- not collected}}{{\\dokbadge{{{r['dok']}}}~{r['stem'].strip()}}}{{}}\n")
        parts.append(f"\\answer{{{(r.get('answers') or {}).get('a', r.get('answer', '(no key)'))}}}\n\n")
    parts.append("\\clearpage\n" + ("\\normalsize\n" if lesson.get("topics") else "") + "\\focusbanner{THE PROBLEM --- annotated}\n\n")
    parts.append(shared_problem(lesson, item, 0.8))
    parts.append(
        "\\begin{firsttakebox}{FIRST TAKE --- one sentence before you work the parts}\n"
        f"{item['first_take'].strip()}\\par\n"
        f"\\answer{{{t.get('first_take_note', 'Not graded. Any committed sentence counts.')}}}\n\\end{{firsttakebox}}\n\n"
    )
    if rules:
        parts.append(callout_block(f"\\IconBook\\ {rules['title']}", "calloutgreen", rules["body"]))
    for p in item["parts"]:
        parts.append(part_block(p, space, answers=item.get("answers") or {}))
    parts.append("\\end{document}\n")
    return "".join(parts)


# ---- Main ----------------------------------------------------------------


def build(path: Path, editions: tuple[str, ...], registry: dict, schedule: dict) -> None:
    lesson = load_lesson(path)
    problems = validate_lesson(lesson, registry)
    for iid in [lesson.get("focus"), *(lesson.get("reinforcement") or [])]:
        if iid in registry:
            problems.extend(validate_item(registry[iid], all_skill_codes()))
    if problems:
        raise SystemExit("\n".join(problems))
    TEX_DIR.mkdir(exist_ok=True)
    topic = str(lesson["topic"])
    emitters = {"student": emit_student, "board": emit_board, "teacher": emit_teacher}
    for ed in editions:
        out = emitters[ed](lesson, registry, schedule)
        problems = validate_printed_text(out)
        if problems:
            raise SystemExit(f"{path.name} ({ed}): " + "\n".join(problems))
        target = TEX_DIR / f"aps_{topic.replace('+', '_')}_{ed}.tex"
        target.write_text(out, encoding="utf-8", newline="\n")
        print(f"wrote {target.relative_to(ROOT)} ({len(out)} chars)")


def write_manifest(registry: dict) -> None:
    """dok/manifest.json — what dok/index.html renders: built topics -> title + DOK-3 skill."""
    out = {}
    for path in sorted(LESSONS.glob("*.yaml")):
        lesson = load_lesson(path)
        item = registry.get(lesson.get("focus"), {})
        ced = lesson.get("ced2026") or {}
        out[str(lesson["topic"])] = {
            "ced_unit": ced.get("unit"),
            "ced_topic": ced.get("topic"),
            "title": lesson["title"],
            "skill": item.get("skill"),
            "frq_pattern": item.get("frq_pattern"),
            "worksheet": lesson.get("worksheet"),
            "misconceptions": lesson["misconceptions"],
            "generated": lesson["generated"],
        }
        if lesson.get("worksheets"):
            out[str(lesson["topic"])].update({
                "topics": lesson["topics"], "worksheets": lesson["worksheets"],
                "ced_topics": ced["topics"], "slug": str(lesson["topic"]).replace("+", "_"),
            })
        if lesson.get("standalone") is True:
            out[str(lesson["topic"])]["standalone"] = True
    (DOK / "manifest.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote dok/manifest.json ({len(out)} built)")


def validate_all() -> int:
    registry = load_registry()
    codes = all_skill_codes()
    problems: list[str] = []
    for row in registry.values():
        problems.extend(validate_item(row, codes))
    for path in sorted(LESSONS.glob("*.yaml")):
        problems.extend(validate_lesson(load_lesson(path), registry))
    if problems:
        print("\n".join(problems))
        return 1
    print(f"ok: {len(registry)} registry rows, {len(list(LESSONS.glob('*.yaml')))} lessons")
    return 0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("yaml_path", nargs="?", help="dok/lessons/{topic}.yaml")
    p.add_argument("--edition", choices=("student", "board", "teacher", "all"), default="all")
    p.add_argument("--all", action="store_true", help="build every lesson YAML")
    p.add_argument("--validate", action="store_true", help="registry + lesson checks only")
    args = p.parse_args()

    if args.validate:
        return validate_all()

    registry = load_registry()
    schedule = load_schedule()
    editions = ("student", "board", "teacher") if args.edition == "all" else (args.edition,)
    paths = sorted(LESSONS.glob("*.yaml")) if args.all else [Path(args.yaml_path)] if args.yaml_path else []
    if not paths:
        p.error("give a YAML path or --all")
    for path in paths:
        build(path, editions, registry, schedule)
    write_manifest(registry)
    return 0


if __name__ == "__main__":
    sys.exit(main())
