#!/usr/bin/env python3
"""Claude Code statusline: <branch> | <model> | <dir>.

Warns when the current branch is main/master/detached/unknown, because the
BBH workflow forbids committing on those (Folk=DevFolk, Jinny=DevJinny).
Reads the session JSON on stdin (fields: model.display_name, workspace.current_dir).
"""
import json
import os
import subprocess
import sys

try:
    data = json.load(sys.stdin)
except Exception:
    data = {}

model = (data.get("model") or {}).get("display_name") or "?"
cwd = (data.get("workspace") or {}).get("current_dir") or data.get("cwd") or os.getcwd()

try:
    branch = subprocess.run(
        ["git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
        capture_output=True, text=True, timeout=3,
    ).stdout.strip() or "?"
except Exception:
    branch = "?"

dirname = os.path.basename(cwd.rstrip("/\\")) or cwd

GRN, CYN, YEL, DIM, RST = "\033[32m", "\033[36m", "\033[33m", "\033[2m", "\033[0m"
warn = f"{YEL} [!check-branch]{RST}" if branch in ("main", "master", "HEAD", "?") else ""

sys.stdout.write(f"{GRN}{branch}{RST}{warn} {DIM}|{RST} {CYN}{model}{RST} {DIM}|{RST} {dirname}")
