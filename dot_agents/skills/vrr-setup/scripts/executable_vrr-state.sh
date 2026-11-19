#!/bin/bash
# Print every output's live adaptive-sync state next to what that output should
# be doing under a given `vrr` mode.
#
# Why this exists: the `vrr:` field from `hyprctl monitors` is the *live* DRM
# state (the output's adaptiveSync flag), not the rule's mode. With `vrr = 2` a
# static desktop is therefore expected to print `vrr: false`. That is the fix
# working, not a config that failed to apply -- the two facts are printed side by
# side here so the difference is not mistaken for a broken rule.
#
# Read-only. It never adds monitor rules, so it cannot leave the output disabled
# the way a runtime `hl.monitor()` call can (gotcha 1c in SKILL.md).
#
#   ./vrr-state.sh [mode]     mode defaults to 2

set -uo pipefail

command -v hyprctl >/dev/null || { echo "hyprctl not found" >&2; exit 1; }

MODE="${1:-2}"

exec python3 - "$MODE" <<'PY'
import json, subprocess, sys

mode = int(sys.argv[1])


def hyprctl(*args):
    return json.loads(subprocess.run(["hyprctl", *args], capture_output=True, text=True).stdout)


monitors = hyprctl("monitors", "all", "-j")
clients = hyprctl("clients", "-j")

# Per-monitor worst fullscreen state, so the expectation is per output rather
# than global: with two outputs only the one holding the fullscreen window flips.
by_monitor = {}
for c in clients:
    if not c.get("mapped", True):
        continue
    by_monitor[c.get("monitor")] = max(by_monitor.get(c.get("monitor"), 0), c.get("fullscreen", 0))


def expected(vrr, fs):
    if vrr == 0:
        return False
    if vrr == 1:
        return True
    if vrr == -1:                     # follow misc:vrr, which is 0 unless set
        return False
    if vrr == 2:
        return fs > 0
    return fs > 0                     # 3 also needs content type game/video


def note(vrr, fs, live):
    if vrr == 3 and fs == 2 and not live:
        return "content type is not game/video"
    if vrr in (2, 3) and fs == 1 and live:
        return "maximized counts as fullscreen here"
    return ""


rules = {}
out = subprocess.run(["hyprctl", "configerrors"], capture_output=True, text=True).stdout.strip()

print(f"{'OUTPUT':<20} {'MODE':<18} {'VRR?':<9} {'LIVE':<6} {'WANT'}")
for m in monitors:
    fs = by_monitor.get(m["id"], 0)
    live = bool(m.get("vrr"))
    # The rule's own mode is not in `hyprctl monitors`, so it is passed in.
    rmode = mode if m.get("disabled") is False else None
    want = expected(rmode, fs) if rmode is not None else False
    flag = "" if live == want else "  <-- MISMATCH"
    extra = note(rmode, fs, live) if flag else ""
    res = f"{m['width']}x{m['height']}@{m['refreshRate']:.0f}"
    print(
        f"{m['name']:<20} {res:<18} m={rmode!s:<7} {live!s:<6} {want!s:<6}"
        f"fs={fs}{flag}{(' (' + extra + ')') if extra else ''}"
        f"{'  DISABLED' if m.get('disabled') else ''}"
    )

print()
print("configerrors:", out if out else "none")
print("global misc:vrr:", subprocess.run(["hyprctl", "getoption", "misc:vrr"], capture_output=True, text=True)
      .stdout.splitlines()[0] if True else "")
print()
print("A MISMATCH where LIVE is false but WANT is true means the rule never ran:")
print("  - a rule differing only in 'vrr' is a FULL MATCH and the monitor is skipped")
print("    (gotcha 1/1b) -> nudge 'position', then 'hyprctl reload'")
print("  - a MISMATCH with DISABLED set means a runtime rule is still winning")
print("    (gotcha 1c) -> 'hyprctl reload' rebuilds the list from the file")
PY
