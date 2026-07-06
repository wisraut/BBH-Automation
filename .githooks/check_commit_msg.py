#!/usr/bin/env python3
"""commit-msg guard: reject emoji in the commit message (no-emoji policy).

Usage: check_commit_msg.py <path-to-commit-msg-file>
Comment lines (starting with '#') are ignored.
Exit 1 (block) if the message body contains an emoji; exit 0 otherwise.
"""
import sys


def _emoji_char(text):
    for ch in text:
        cp = ord(ch)
        if (0x2600 <= cp <= 0x27BF or cp == 0xFE0F
                or 0x2B00 <= cp <= 0x2BFF or 0x1F000 <= cp <= 0x1FAFF):
            return ch
    return None


def main():
    if len(sys.argv) < 2:
        return 0
    try:
        with open(sys.argv[1], encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()
    except OSError:
        return 0
    for i, line in enumerate(lines, 1):
        if line.startswith("#"):
            continue
        ch = _emoji_char(line)
        if ch:
            print(f"COMMIT BLOCKED: emoji {ch!r} (U+{ord(ch):04X}) in commit message line {i}.", file=sys.stderr)
            print("Remove it, or `git commit --no-verify` to bypass (avoid).", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
