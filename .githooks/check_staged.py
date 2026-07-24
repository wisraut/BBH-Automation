#!/usr/bin/env python3
"""Pre-commit content guard for line-dify-bridge.

Scans ADDED lines in staged CODE/UI files and blocks the commit on:
  1. Emoji            -- no-emoji policy (UI uses lucide-react icons,
                         chat replies use plain text / markdown).
  2. BBH-as-clinic    -- BBH is a HOSPITAL. Blocks only when a single
                         added line mentions BBH *and* clinic/คลินิก
                         together, so legitimate references to a 3rd-party
                         clinic a patient visited stay allowed.

Also runs build/lint gates on the staged files (rule 11, layer 1 -- so a
commit can never contain code that fails to compile or lint):
  3. Python           -- `py_compile` on staged .py (syntax only, no deps).
  4. Frontend         -- `tsc -b --noEmit` + `eslint` on staged frontend
                         .ts/.tsx (skipped with a warning if node/npx absent,
                         so a missing toolchain never false-blocks a commit).

Scope: content checks only for files whose extension is in CODE_EXT. Markdown
(.md) is exempt on purpose -- internal docs discuss these very rules and use
status emoji (checklists). Widen CODE_EXT to tighten enforcement.

Exit 1 (block) on any violation; exit 0 otherwise.
Emergency bypass: `git commit --no-verify` (use sparingly).
"""
import re
import shutil
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


def _staged_files():
    out = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    ).stdout
    return [f for f in out.splitlines() if f.strip()]


def _run(cmd, cwd=None, shell=False):
    r = subprocess.run(
        cmd, cwd=cwd, shell=shell,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    return r.returncode, ((r.stdout or "") + (r.stderr or "")).strip()


def _tooling_checks():
    """Return a list of failure messages (empty = all good)."""
    errors = []
    files = _staged_files()
    py = [f for f in files if f.endswith(".py")]
    fe = [f for f in files if f.startswith("frontend/") and f.endswith((".ts", ".tsx"))]

    if py:
        code, out = _run([sys.executable, "-m", "py_compile", *py])
        if code != 0:
            errors.append("python py_compile failed:\n" + out)

    if fe:
        if shutil.which("npx") is None:
            print("[pre-commit] npx not found -- skipping frontend tsc/eslint", file=sys.stderr)
        else:
            code, out = _run("npx tsc -b --noEmit", cwd="frontend", shell=True)
            if code != 0:
                errors.append("frontend tsc failed:\n" + out[-2000:])
            rel = " ".join(f[len("frontend/"):] for f in fe)
            code, out = _run("npx eslint " + rel, cwd="frontend", shell=True)
            if code != 0:
                errors.append("frontend eslint failed:\n" + out[-2000:])

    return errors


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

    tooling = _tooling_checks()

    if not violations and not tooling:
        return 0

    if violations:
        print("COMMIT BLOCKED by .githooks/check_staged.py (content):\n", file=sys.stderr)
        for path, lineno, why, snippet in violations:
            print(f"  {path}:{lineno}  {why}", file=sys.stderr)
            print(f"      > {snippet[:120]}", file=sys.stderr)
    if tooling:
        print("COMMIT BLOCKED -- build/lint checks failed:\n", file=sys.stderr)
        for e in tooling:
            print("  " + e.replace("\n", "\n  "), file=sys.stderr)
    print("\nFix the above, or `git commit --no-verify` to bypass (avoid).", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
