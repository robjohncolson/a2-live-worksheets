#!/bin/bash
# Pre-commit asset check for Claude Code PreToolUse hook
# Reads tool input from stdin, checks if it's a git commit,
# warns about untracked asset files.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only act on git commit commands
if ! echo "$COMMAND" | grep -q 'git commit'; then
  exit 0
fi

# Check for untracked asset files
untracked=$(git ls-files --others --exclude-standard \
  -- '*.mp3' '*.wav' '*.png' '*.jpg' '*.svg' '*.gif' \
     '*.ico' '*.woff' '*.woff2' '*.ttf' 2>/dev/null | head -20)

if [ -n "$untracked" ]; then
  echo "WARNING: Untracked asset files detected:"
  echo "$untracked"
  echo "Consider staging these before committing."
fi

exit 0
