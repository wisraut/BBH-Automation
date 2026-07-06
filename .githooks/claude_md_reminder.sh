#!/bin/sh
# PostToolUse(Bash) hook -> reminds Claude to update CLAUDE.md after a
# feat/fix/refactor commit (root CLAUDE.md rule 2). Reads the PostToolUse
# JSON payload on stdin; only fires for git-commit tool calls. Non-blocking:
# always exits 0, just prints a reminder that lands in Claude's context.
payload=$(cat 2>/dev/null)
case "$payload" in
  *'git commit'*) : ;;
  *) exit 0 ;;
esac

subject=$(git log -1 --format=%s 2>/dev/null)
case "$subject" in
  feat*|fix*|refactor*) : ;;
  *) exit 0 ;;
esac

# Did this commit already touch CLAUDE.md (root or nested)?
if git show --name-only --format= HEAD 2>/dev/null | grep -qiE '(^|/)CLAUDE\.md$'; then
  exit 0
fi

echo "REMINDER (CLAUDE.md rule 2): commit \"$subject\" is feat/fix/refactor but did not touch any CLAUDE.md. Update the Changelog + Status now, before starting the next task."
exit 0
