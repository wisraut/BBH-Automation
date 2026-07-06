#!/usr/bin/env python3
"""Pre-commit content guard for line-dify-bridge.

Scans ADDED lines in staged CODE/UI files and blocks the commit on:
  1. Emoji            -- no-emoji policy (UI uses lucide-react icons,
                         chat replies use plain text / markdown).
  2. BBH-as-clinic    -- BBH is a HOSPITAL. Blocks only when a single
                         added line mentions BBH *and* clinic/คลินิก
                         together, so legitimate references to a 3rd-party
                         clinic a patient visited stay allowed.

Scope: only files whose extension is in CODE_EXT. Markdown (.md) is
exempt on purpose -- internal docs discuss these very rules and use
status emoji (checklists). Widen CODE_EXT to tighten enforcement.

Exit 1 (block) on any violation; exit 0 otherwise.
Emergency bypass: `git commit --no-verify` (use sparingly).
"""
import re
import subprocess
import sys

CODE_EXT = (".py", ".ts", ".tsx", ".js", ".jsx", ".html", ".vue", ".css")
SKIP_PREFIX = (".githooks/",)  # never lint the guard scripts themselves

_BBH = re.compile(r"bbh|better\s*being", re.IGNORECASE)
_CLINIC = re.compile(r"clinic|คลินิก", re.IGNORECASE)  # clinic | คลินิก


def _emoji_char(text):
    for ch in text:
        cp = ord(ch)
        if (0x2600 <= cp <= 0x27BF or cp == 0xFE0F
                or 0x2B00 <= cp <= 0x2BFF or 0x1F000 <= cp <= 0x1FAFF):
            return ch
    return None


def _staged_added_lines():
    """Yield (path, lineno, text) for every added line in the staged diff."""
    diff = subprocess.run(
        ["git", "diff", "--cached", "--unified=0", "--diff-filter=ACM"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    ).stdout
    path, lineno = None, 0
    for line in diff.splitlines():
        if line.startswith("+++ b/"):
            path = line[6:]
        elif line.startswith("@@"):
            m = re.search(r"\+(\d+)", line)
            lineno = int(m.group(1)) if m else 0
        elif line.startswith("+") and not line.startswith("+++"):
            yield path, lineno, line[1:]
            lineno += 1


def main():
    violations = []
    for path, lineno, text in _staged_added_lines():
        if not path or path.startswith(SKIP_PREFIX):
            continue
        if not path.endswith(CODE_EXT):
            continue
        ch = _emoji_char(text)
        if ch:
            violations.append((path, lineno, f"emoji {ch!r} (U+{ord(ch):04X}) -- no-emoji policy", text.strip()))
        if _BBH.search(text) and _CLINIC.search(text):
            violations.append((path, lineno, "BBH described as clinic -- BBH is a HOSPITAL", text.strip()))

    if not violations:
        return 0

    print("COMMIT BLOCKED by .githooks/check_staged.py:\n", file=sys.stderr)
    for path, lineno, why, snippet in violations:
        print(f"  {path}:{lineno}  {why}", file=sys.stderr)
        print(f"      > {snippet[:120]}", file=sys.stderr)
    print("\nFix the lines above, or `git commit --no-verify` to bypass (avoid).", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
