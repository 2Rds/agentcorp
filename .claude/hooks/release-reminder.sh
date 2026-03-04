#!/usr/bin/env bash
# Pre-push hook: Remind about /release if HEAD isn't a release commit
#
# This runs as a Claude Code PreToolUse hook on Bash commands.
# It reads the tool input JSON from stdin, checks if it's a git push,
# and reminds about /release if the latest commit isn't a release.

# Read tool input from stdin
INPUT=$(cat)

# Extract the command from JSON (simple grep — no jq dependency)
COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//;s/"$//')

# Only trigger on git push commands
if ! echo "$COMMAND" | grep -qE 'git push'; then
  exit 0
fi

# Check if HEAD commit message starts with "release:"
HEAD_MSG=$(git log -1 --format='%s' 2>/dev/null)

if echo "$HEAD_MSG" | grep -qE '^release:'; then
  # This IS a release commit — all good
  exit 0
fi

# Check if HEAD is tagged (already released)
HEAD_TAG=$(git tag --points-at HEAD 2>/dev/null)
if [ -n "$HEAD_TAG" ]; then
  exit 0
fi

# Not a release commit and not tagged — remind
echo "Reminder: HEAD commit is not a release. If this push includes significant changes, consider running /release <patch|minor|major> first to bump version, update docs, and tag."
exit 0
