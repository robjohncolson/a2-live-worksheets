#!/usr/bin/env bash
# dok/compile.sh — POSIX twin of compile.ps1.  ./dok/compile.sh 1.6   |   ./dok/compile.sh --all
set -euo pipefail
dok="$(cd "$(dirname "$0")" && pwd)"
repo="$(dirname "$dok")"
mkdir -p "$dok/pdf"

if [ "${1:-}" = "--all" ]; then
  topics=$(ls "$dok/lessons"/*.yaml | xargs -n1 basename | sed 's/\.yaml$//')
elif [ -n "${1:-}" ]; then
  topics="$1"
else
  echo "usage: $0 <topic>|--all" >&2; exit 1
fi

failed=""
for t in $topics; do
  (cd "$repo" && python "$dok/build_ladder.py" "$dok/lessons/$t.yaml") || { failed="$failed $t(build)"; continue; }
  for ed in student board teacher; do
    name="aps_${t}_${ed}"
    if (cd "$dok/tex" && pdflatex --miktex-enable-installer -interaction=nonstopmode -halt-on-error "$name.tex" >/dev/null \
                      && pdflatex --miktex-enable-installer -interaction=nonstopmode -halt-on-error "$name.tex" >/dev/null); then
      mv -f "$dok/tex/$name.pdf" "$dok/pdf/$name.pdf"; echo "ok  dok/pdf/$name.pdf"
    else
      failed="$failed $name"; echo "FAIL $name (see dok/tex/$name.log)"
    fi
  done
done
[ -z "$failed" ] || { echo "failed:$failed"; exit 1; }
echo "all compiled."
