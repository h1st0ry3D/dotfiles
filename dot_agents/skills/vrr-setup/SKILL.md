---
name: vrr-setup
description: >
  Diagnose, enable, and verify VRR (variable refresh rate) on Linux/Hyprland —
  AMD FreeSync, NVIDIA G-Sync Compatible, Adaptive-Sync. Covers checking whether a
  monitor and GPU can do VRR at all, writing the Hyprland monitor rule, confirming
  the kernel accepted it, and testing that the panel actually varies refresh. Also
  the fast path for the classic complaint: brightness flicker that appears in a
  game, persists after it closes, and stops while the mouse moves — that is a
  `vrr = 1` rule on a refresh-sensitive panel, fixed by `vrr = 2`. Triggers: VRR,
  FreeSync, Adaptive Sync, adaptive-sync, variable refresh, G-Sync Compatible,
  monitor flickering, flickering brightness, backlight flicker, "flicker stops when
  I move the mouse", screen flickers after quitting a game, desktop flicker, screen
  tearing, judder, "raise refresh rate", Hyprland monitor config, vrr in
  monitors.lua, gamescope VRR, "is VRR working". Pairs with the omarchy skill for
  editing ~/.config/hypr/.
metadata:
  tags: vrr, freesync, adaptive-sync, gsync, hyprland, monitors, amdgpu, drm, wayland, omarchy
---

# VRR Setup, Verification & Testing

Four separate claims get conflated when people say "is VRR working". Keep them apart:

| # | Claim | How to prove it |
|---|-------|-----------------|
| 1 | Monitor *can* do VRR | EDID contains a vendor FreeSync/Adaptive-Sync VSDB |
| 2 | Kernel *accepted* VRR on this connector | `hyprctl monitors` shows `vrr: true` |
| 3 | Mode + VRR coexist at the target refresh | `hyprctl monitors` shows the high refresh *and* `vrr: true` |
| 4 | The *panel physically varies* | Human A/B perception, or root + a DRM state read |

Most troubleshooting never gets past #2. Only #4 proves the display hardware responded.

## Flicker first: `vrr = 2`, not `1`

Before any of the four claims: **"my screen flickers, and it stops when I move the mouse"** is a
VRR *mode* problem, and the fix is one integer. This is the single highest-yield thing in this skill.

Symptom signature (all of it, on a panel whose brightness tracks refresh rate):

- flicker appears while gaming and **persists after the game is closed** — `vrr = 1` never hands the
  panel back, so a static desktop keeps adaptive sync engaged
- flicker **stops while the mouse moves** — damage raises the refresh, and the flicker band is the
  low end of the range, not the high end
- flicker is brightness modulation, not tearing, not blanking, not a lost signal
- switching the monitor to **another input** stops it — the other source is not driving VRR

Mechanism: on a static screen Hyprland stops committing frames, the panel latches to its VRR floor
(~48 Hz on a 48–144 panel), and each isolated repaint jumps back to 144 Hz. Panels whose backlight
or gamma shifts with refresh rate turn that step into visible flicker. Hyprland's own FAQ names it:

> If your monitor has flickering brightness when you turn on VRR, change the VRR option to 2
> (fullscreen), so that it is only used in games. This happens because the brightness on some
> monitors can depend on the refresh rate, and rapidly changing refresh rates … will cause rapid
> changes in brightness.

So the rule that ends most of these tickets is:

```lua
hl.monitor({ output = "desc:...", mode = "2560x1440@144", position = "0x0", scale = 1, vrr = 2 })
```

`2` vs `3`: `2` is "fullscreen only", `3` additionally requires the client to advertise a `game` or
`video` content type. Many XWayland games never set one, so `3` silently means "no VRR" for them.
Prefer `2` unless you have checked that the games you care about report a content type.

Verify both halves with `scripts/vrr-state.sh 2`, which cross-references `hyprctl monitors` with
`hyprctl clients` and prints whether the live state matches the mode per output:

| state | expected `vrr:` with mode 2 |
|---|---|
| static desktop | `false` |
| maximized / full-width window | `false` (not fullscreen) |
| fullscreen window | `true` |

Residual flicker *inside* games at low framerate is the same panel behaviour, not a config error —
the fixes are the game's own VRR switch, a monitor OSD "VRR off" profile, a higher in-game frame
cap (keeps the panel in its quiet band), or raising VRRmin in the EDID (ArchWiki, "Variable refresh
rate") which narrows the variable window at the cost of low-framerate smoothness.

## Workflow

### Step 1 — Can this monitor do VRR?

VRR needs DisplayPort (HDMI on Linux is unreliable for FreeSync) **and** an EDID that advertises
the vendor VSDB. Check the EDID first; if this fails, nothing else matters.

```bash
# Which DRM card drives which connector, and with what driver
for c in /sys/class/drm/card[0-9]; do
  printf '%s -> %s\n' "$(basename $c)" "$(readlink -f $c/device/driver | xargs basename)"
done

# Cross-reference with the compositor to find the connector for your monitor
hyprctl monitors all | grep -E '^Monitor|^\s+model:'

# Decode that connector's EDID (substitute the real card/connector)
edid-decode /sys/class/drm/card1-DP-1/edid
```

Look in the extension block for:

```
Vendor-Specific Data Block (AMD), OUI 00-00-1A:      # FreeSync
    Minimum Refresh Rate: 48 Hz
    Maximum Refresh Rate: 144 Hz
```

NVIDIA/Adaptive-Sync monitors expose a similar block; some newer panels use DisplayID instead.
If only the base block's "Display Range Limits" appears and no vendor VSDB, **stop** — Linux cannot
drive VRR on that monitor without an EDID override.

Note: `amdgpu.vrr_support` as a kernel module parameter is **not** a signal of anything. It was
removed once VRR became always-compiled-in. Its absence on a modern kernel is normal and fine.

### Step 2 — Write the monitor rule

Hyprland only enables VRR when a monitor rule asks for it. Add a rule to
`~/.config/hypr/monitors.lua` (Omarchy loads this after its own defaults):

```lua
hl.monitor({ output = "desc:DEL S2725DC", mode = "2560x1440@144", position = "auto", scale = 1, vrr = 1 })
```

- `output` — exact connector name (`DP-6`) or `desc:` prefix match against the monitor
  description. Prefer `desc:`; it survives the cable moving to another port.
- `vrr` — `0` off, `1` always, `2` fullscreen windows only, `3` fullscreen games/video only.
  Start with `1`; drop to `2`/`3` if desktop flicker appears.
- **Rules are not merged.** The matched rule is used whole, so carry over the `mode`,
  `position`, and `scale` your other rules use, or you will silently reset them.
- **Last matching rule wins** (`m_rules` is iterated in reverse). Put specific rules *after*
  your catch-all `output = ""` rule, or they will never apply.
- Omitting `mode` gives the preferred mode; omitting `scale` gives auto-scale.

Then apply:

```bash
hyprctl reload          # plain reload — NOT `reload config-only`, which skips monitors
hyprctl configerrors    # must be empty
```

### Step 3 — Confirm the kernel took it

```bash
hyprctl monitors all | grep -E '^Monitor|^\s+model:|vrr:|^[0-9]+x'
```

Expect the target refresh **and** `vrr: true` on the same monitor — but only for `vrr = 1`. The
field is the *live* `adaptiveSync` flag, not the rule's mode, so with `vrr = 2`/`3` a static desktop
correctly prints `vrr: false`. Judge those modes with a fullscreen window present (see the table in
the flicker section above), never by the desktop value alone.

This is stronger evidence than it looks. In `MonitorRuleManager.cpp`, `ensureVRR()` does:

```cpp
m->m_output->state->setAdaptiveSync(true);
if (!m_state.test()) {                              // real DRM atomic test
    m->m_output->state->setAdaptiveSync(false);
}
```

`m_state.test()` asks the kernel to validate the state. If VRR were rejected it would revert,
and `adaptiveSync` is precisely what `hyprctl monitors` prints. So `vrr: true` means the driver
accepted `VRR_ENABLED` — not merely that the config asked for it.

For a direct kernel read (see `scripts/vrrcheck.c`), which requires root:

```bash
gcc -O2 -I/usr/include/libdrm -o /tmp/vrrcheck scripts/vrrcheck.c -ldrm   # -I is required on Arch
sudo /tmp/vrrcheck /dev/dri/card1        # prints VRR_CAPABLE and VRR_ENABLED
```

### Step 4 — Prove the panel responds

Software state cannot tell you the panel is varying. Use one or both:

**A/B judder test** — `scripts/vrr-judder-test.html`. Locks content to a chosen framerate with
smoothly scrolling rows. Above the panel's fixed refresh the rows judder visibly; with VRR the
window is wide enough that low framerates stay smooth. Toggle `vrr` and compare at the same rate.

Always run **both** halves. "It looked smooth" alone proves nothing — a rate too close to the panel's
refresh, or a window too small, reads as smooth with VRR off. Pick a rate well below the refresh
(70 or 100 on a 144 Hz panel) and confirm the control judders. When toggling, remember gotcha 1b: a
`vrr`-only file edit plus reload is silently ignored, so nudge `position` and verify `hyprctl monitors`
actually flipped.

**Refresh-rate probe** — `scripts/vrr-probe.html`. Measures real `requestAnimationFrame`
cadence. Confirms the high-refresh mode is genuinely being scanned out rather than merely declared.

**gamescope — only when it can take a DRM lease.** gamescope is the best evidence *in principle*
(it owns the scanout, so it can report the refresh actually being scanned out), but nested under
Hyprland it needs a `drm_lease_v1` lease on the parent's output, and the NVIDIA proprietary driver
does not implement DRM leasing at all — `nvidia.ko` ships zero `drm_lease` / `lessee` symbols. So on
NVIDIA this is a no-op; do not burn time on it.

```bash
omarchy pkg add gamescope
```

Flag names changed in gamescope 3.x — `--vrr` and `--stats` were **removed** and will abort the run
with `unrecognized option`:

| Old (pre-3.x) | Current |
|---|---|
| `gamescope --vrr 1` | `gamescope --adaptive-sync` |
| `gamescope --stats` | gone; `--stats-path PATH` now takes an argument |

Note `--stats` prefix-matches `--stats-path`, so `gamescope --stats` fails as
`option '--stats-path' requires an argument`, not `unrecognized option` — easy to misread.

Even with correct flags, confirm it actually engaged rather than assuming. A nested run that fell
back to virtual connectors logs `Creating headless backend` and sets no `GAMESCOPE_VRR_ENABLED` in
the child environment. Check with:

```bash
timeout -s KILL 12 gamescope --adaptive-sync -b -- sh -c 'env | grep -i GAMESCOPE' 2>&1 | grep -E 'headless|lease|VRR'
```

Absent `GAMESCOPE_VRR_ENABLED` / `_CAPABLE` / `_FEEDBACK` means no VRR — those are only injected
when gamescope owns the output.

---

## Gotchas that cost real time

These are verified against Hyprland 0.56.2 and a Radeon 5500M (Navi 14) on amdgpu.

**1. Changing only `vrr` at runtime is a silent no-op.** `CMonitorRule::compare()` does not include
`m_vrr`, and `ensureMonitorStatus()` skips the monitor entirely on `COMPARISON_FULL_MATCH`. So:

```lua
-- THIS DOES NOTHING. No error, no warning.
hyprctl eval 'hl.monitor({ output = "DP-6", mode = "2560x1440@144", position = "auto", scale = 1, vrr = 0 })'
```

Edit the file and `hyprctl reload` — **but that is not sufficient on its own, see below.**

**1b. Editing the file and reloading does NOT change `vrr` either.** This is the part that wastes the
most time, because it is counter-intuitive: the file clearly says `vrr = 0`, the reload reports no
error, and `hyprctl monitors` still prints `vrr: true`. Verified empirically on 0.56.2.

`ensureMonitorStatus()` skips the monitor when the new rule compares `COMPARISON_FULL_MATCH` against
the *active* rule, and `m_vrr` is in neither the hard nor the soft list. A rule differing only in
`vrr` is a full match, so the monitor is skipped and `ensureVRR` never runs. This applies to the file
path exactly as it does to `hyprctl eval`.

Workaround — nudge a field that *is* in `compare()`, so the comparison no longer fully matches.
`position` is in the soft list, so `"auto"` → `"0x0"` is enough for a single monitor at the origin:

```lua
hl.monitor({ output = "desc:...", mode = "2560x1440@144", position = "0x0", scale = 1, vrr = 0 })
```

After `hyprctl reload`, **always confirm the live state actually flipped** — do not trust that the
reload took:

```bash
hyprctl monitors all | grep -E '^Monitor|vrr:'
```

Anything in the hard list (`mode`, `scale`, `enable10bit`, `drmMode`, `disabled`) works too, but
those change what you are testing. `position` is the cheapest nudge that is visually a no-op.

Do **not** use `disabled` as the nudge unless you are ready to reload afterwards. Flipping it
re-creates the output, and on a marginal link the monitor can come back disabled — see gotcha 1c for
the recovery and why a plain re-apply does not clear it.

**1c. A rule added at runtime outlives the config file — including `disabled`.** `hl.monitor()`
from `hyprctl eval` is not ephemeral: `CMonitorRuleManager::add()` stores it in `m_rules` like any
file rule, and because rules are scanned in reverse, a later runtime rule wins over the file's rule
for the rest of the session. Observed on 0.56.2 with a Dell S2725DC on nvidia-drm/HDMI: after
`hyprctl eval 'hl.monitor({ output = "desc:...", disabled = true })'`, re-applying the full
enabled rule printed `ok`, showed the monitor enabled for a moment, and then the output was back to
`disabled: true` — with nothing in journald, because core log output goes to UWSM stdout (gotcha 3).

```bash
hyprctl monitors all | grep -E '^Monitor|disabled:'   # the only reliable check
hyprctl reload                                        # rebuilds m_rules from the file -> recovers
```

So: runtime `hl.monitor()` calls are a scratchpad for *verification*, and a `disabled`/`mirror`
runtime rule should always be followed by a `reload` before you call the work done. Nudge `position`
instead when all you want is a `vrr` re-evaluation.

**2. `hyprctl keyword` is dead on the Lua config parser.** You will see
`keyword can't work with non-legacy parsers`. Use `hyprctl eval '<lua>'`.

**3. `hyprland.log` does not contain Hyprland's own log messages.** That file only collects
aquamarine and libinput output. Hyprland's core logger writes to stdout, which is a socket into
UWSM that nothing captures. Do not grep it for `ensureVRR` or other core messages — an empty grep
result proves nothing.

**4. DRM property queries need root.** `drmModeObjectGetProperties` is restricted to the DRM
master (the compositor) or `CAP_SYS_ADMIN`. A userspace probe returns nothing at all unprivileged —
that is the kernel enforcing a boundary, not a broken script.

**5. VRR without a high refresh mode is nearly useless.** At a 60 Hz mode the variable range is
squeezed to roughly 48–60 Hz and the effect is subtle. Raising to the panel's max opens the full
advertised range and makes both real use and testing obvious.

**6. Lua dispatcher namespacing.** Dispatchers are `hl.dsp.<name>({...})`, e.g.
`hl.dsp.focus({ window = "title:Foo" })`. Passing a bare `hyprctl dispatch focuswindow ...`
gets wrapped into `hl.dispatch(...)` and fails to parse.

A legacy positional dispatcher fails the same way, with a message that does not mention the fix:

```bash
hyprctl dispatch fullscreen 0
# error: [string "return hl.dispatch(fullscreen 0)"]:1: ')' expected near '0'
#  → Note: dispatch in lua is a shorthand for hl.dispatch(...), your syntax might need to be updated.
```

Use the namespaced form to create the fullscreen window the flicker test needs:

```bash
hyprctl eval 'hl.dispatch(hl.dsp.window.fullscreen({ mode = "fullscreen" }))'   # toggle
hyprctl eval 'hl.dispatch(hl.dsp.window.fullscreen({ mode = "maximized" }))'    # full width
```

Running the failing form and then checking `hyprctl monitors` reads as "mode 2 does not engage VRR",
because no window ever went fullscreen. Confirm the window state too, not just the panel:
`hyprctl activewindow -j | jq .fullscreen` should be `2`.

## References

- `references/hyprland-vrr-internals.md` — source paths and exact code for `ensureVRR`,
  rule comparison, rule storage/precedence, and why runtime `vrr` toggles fail.
- `scripts/vrr-state.sh` — read-only: per-output live `vrr:` vs what the mode implies, plus
  `configerrors`. The fastest way to answer "did my fix actually land".
- Hyprland FAQ, "My monitor has flickering brightness when I turn on VRR" — the upstream wording
  behind the `vrr = 2` fix.