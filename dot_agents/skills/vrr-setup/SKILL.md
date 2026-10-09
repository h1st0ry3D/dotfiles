---
name: vrr-setup
description: >
  Diagnose, enable, and verify VRR (variable refresh rate) on Linux/Hyprland —
  AMD FreeSync, NVIDIA G-Sync Compatible, Adaptive-Sync. Covers checking whether a
  monitor and GPU can do VRR at all, writing the Hyprland monitor rule, confirming
  the kernel accepted it, and testing that the panel actually varies refresh.
  Triggers: VRR, FreeSync, Adaptive Sync, adaptive-sync, variable refresh, G-Sync
  Compatible, monitor flickering, screen tearing, judder, "raise refresh rate",
  Hyprland monitor config, vrr in monitors.lua, gamescope VRR, "is VRR working".
  Pairs with the omarchy skill for editing ~/.config/hypr/.
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
| 4 | The *panel physically varies* | Measurement (gamescope / probe) or A/B perception |

Most troubleshooting never gets past #2. Only #4 proves the display hardware responded.

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

Expect the target refresh **and** `vrr: true` on the same monitor.

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
sudo ./scripts/vrrcheck /dev/dri/card1        # prints VRR_CAPABLE and VRR_ENABLED
```

### Step 4 — Prove the panel responds

Software state cannot tell you the panel is varying. Use one or both:

**A/B judder test** — `scripts/vrr-judder-test.html`. Locks content to a chosen framerate with
smoothly scrolling rows. Above the panel's fixed refresh the rows judder visibly; with VRR the
window is wide enough that low framerates stay smooth. Toggle `vrr` and compare at the same rate.

**Refresh-rate probe** — `scripts/vrr-probe.html`. Measures real `requestAnimationFrame`
cadence. Confirms the high-refresh mode is genuinely being scanned out rather than merely declared.

**gamescope (best evidence)** — reports actual refresh as it changes:

```bash
omarchy pkg add gamescope
gamescope --vrr 1 -- gamescope --stats
```

---

## Gotchas that cost real time

These are verified against Hyprland 0.56.2 and a Radeon 5500M (Navi 14) on amdgpu.

**1. Changing only `vrr` at runtime is a silent no-op.** `CMonitorRule::compare()` does not include
`m_vrr`, and `ensureMonitorStatus()` skips the monitor entirely on `COMPARISON_FULL_MATCH`. So:

```lua
-- THIS DOES NOTHING. No error, no warning.
hyprctl eval 'hl.monitor({ output = "DP-6", mode = "2560x1440@144", position = "auto", scale = 1, vrr = 0 })'
```

Edit the file and `hyprctl reload` instead. This is the single most common wasted hour here.

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

## References

- `references/hyprland-vrr-internals.md` — source paths and exact code for `ensureVRR`,
  rule comparison, and why runtime `vrr` toggles fail.