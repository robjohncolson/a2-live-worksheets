#!/usr/bin/env python3
"""Dispatch a Codex subagent with a prompt read from a file.

Avoids bash single-quote escaping issues by passing the prompt through
subprocess.run's argv list (no shell parsing).
"""
import subprocess
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: dispatch-codex.py <prompt-file> [timeout-seconds]", file=sys.stderr)
        return 2

    prompt_path = Path(sys.argv[1])
    timeout = sys.argv[2] if len(sys.argv) > 2 else "900"

    prompt = prompt_path.read_text(encoding="utf-8")

    cmd = [
        "python",
        "C:/Users/rober/Downloads/Projects/Agent/runner/cross-agent.py",
        "--direction", "cc-to-codex",
        "--task-type", "implement",
        "--prompt", prompt,
        "--working-dir", "C:/Users/rober/Downloads/Projects/school/follow-alongs",
        "--timeout", timeout,
    ]

    print(f"[dispatch-codex] Sending {len(prompt)} chars from {prompt_path.name}, timeout={timeout}s", flush=True)
    result = subprocess.run(cmd)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
