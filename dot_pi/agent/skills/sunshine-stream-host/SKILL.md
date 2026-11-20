---
name: sunshine-stream-host
description: >
  Set up, change, and re-verify the Sunshine/Moonlight stream host on this
  Omarchy/Hyprland + NVIDIA desktop, where streaming must survive the monitor
  being switched off. Triggers: sunshine, moonlight, stream host, game streaming,
  black stream, black screen when monitor off, STREAM output, headless output,
  ostreamy, ostreamy-cli, ostreamy-watch, ostreamy-verify, PARK_X, pointer dead
  zone, "mouse at the border changes workspace", monitor mirror source crash,
  wlgrab, sunshine.service, nvenc/vaapi encoder choice, Steam Deck Moonlight.
  Covers why the capture target must be a persistent headless output, why the
  panel may never be a mirror source, and why the idle output is parked beyond a
  pointer-unreachable gap.
---

# Sunshine stream host (this desktop)

Host: Arch/Omarchy, Hyprland 0.56.2 (Lua config), **RTX 4070** (`renderD128`).
Client: **Steam Deck OLED (Sephiroth)** — 1280x800@90, HEVC, **no AV1 decode**.
Panel: Dell S2725DC on `HDMI-A-1`, 2560x1440@144.
Capture target: persistent headless output `STREAM`, 1920x1200@60.

Implementation and docs live in `~/github/ostreamy-cli` (CLI, watcher, verifier,
Hyprland snippet, install/uninstall) and `~/github/ostreamy` (Omarchy bar plugin).
Those repos are the source of truth; this skill is the map to them.

## Topology

```
                   workspaces move here while streaming
                                │
                            ┌───▼────┐
              Moonlight ◄───┤ STREAM │  headless, 1920x1200@60, always enabled
                            └───┬────┘
                                │ mirror (holds no workspaces of its own)
                            ┌───▼────┐
                            │ panel  │  free to be switched off or unplugged
                            └────────┘
```

| state | `STREAM` | panel | workspaces |
|---|---|---|---|
| idle | parked at `PARK_X` (`6000x0`), unmirrored | native mode, focused | on the panel |
| streaming | mirror source | mirrors `STREAM` | on `STREAM` |

`STREAM` may show one **empty** workspace while idle. Hyprland gives every enabled
monitor an active workspace; that is normal, not a stranded window.

### Pointer rule (do not regress this)

A parked output is a real layout region. Parked flush against the panel, the pointer
leaves the panel at the shared edge, `input:follow_mouse = 1` focuses `STREAM`, its
workspace becomes active and `cursor:warp_on_monitor_change` warps the pointer to the
middle of the screen — "the mouse at the left border changes workspace and jumps back".

Hyprland clamps the pointer to the **nearest** monitor, so the gap is the fix:
`PARK_X=6000` leaves 3440 px on a 2560-wide panel (a 1000 Hz mouse reports ≤ ~250 px
per event). `park_position()` widens it automatically when a wider panel would leave
< 1500 px. Verify reports the gap; smoke asserts it.

Idle cost of the gap: none. Do **not** "simplify" it into an idle mirror of the panel
— see hard rule 3.

## Files

| Path | Role |
|---|---|
| `~/.config/ostreamy/config.sh` | `OUTPUT=STREAM`, `MODE=1920x1200@60`, `SCALE=1`, `PARK_X=6000`, quiet window, ports |
| `~/.local/bin/ostreamy` | `status`/`on`/`off`/`mirror`/`recover`/`fix`/`ensure`/`mode`/`state`/`edit` |
| `~/.local/bin/ostreamy-watch` | Moonlight watcher (systemd user unit, `INTERVAL=0.25`) |
| `~/.local/bin/ostreamy-verify` | health checks, `--simulate-off` = panel-off capture test |
| `~/.local/bin/ostreamy-ensure-wait` | `ExecStartPre` helper: waits for Hyprland, runs `ostreamy ensure`, always exits 0 |
| `~/.local/lib/ostreamy/common.sh` | monitor/workspace/socket helpers |
| `~/.config/systemd/user/ostreamy-watch.service` | watcher unit, enabled |
| `~/.config/systemd/user/app-dev.lizardbyte.app.Sunshine.service.d/10-headless-startup.conf` | `ExecStartPre=ostreamy-ensure-wait`; hides the session bus so Sunshine's portal probe fails fast instead of blocking on an invisible picker |
| `~/.config/hypr/monitors.lua` | ostreamy block: `STREAM` rule parked at `PARK_X`, no mirror in the file |
| `~/.config/sunshine/sunshine.conf` | `output_name = STREAM`, `encoder = nvenc`, `adapter_name = /dev/dri/renderD128` |
| `~/github/ostreamy-cli/docs/` | DESIGN (evidence), TROUBLESHOOTING, UPSTREAM-BUGS, CLIENT |

`sunshine.service` is the alias of `app-dev.lizardbyte.app.Sunshine.service`; it must
be **enabled**. `loginctl enable-linger "$USER"` is set, so the host is streamable
before login.

## Commands

```bash
ostreamy status                  # configured mode, monitors, mirrors, workspaces
ostreamy on | off                # switch layout manually (bar plugin does the same)
ostreamy fix                     # pull workspaces/focus back to the panel
ostreamy ensure                  # create/park STREAM (idempotent; watcher does this)
ostreamy mode 1920x1200@90       # change captured size/refresh + update the rule
ostreamy-verify                  # checks only
ostreamy-verify --simulate-off   # disable the panel, screenshot STREAM, restore
```

Full test: `cd ~/github/ostreamy-cli && make check` (lint + smoke + verify). The smoke
test arms the layout with a real TCP connection and injects a `CLIENT DISCONNECTED`
line into `sunshine.log`; it leaves the layout native.

Install/repair (idempotent): `~/github/ostreamy-cli/install.sh`
(`--no-hypr`, `--no-sunshine` to skip parts). It rewrites only the managed block in
`monitors.lua`; keep backups are made automatically.

Manual checks:

```bash
systemctl --user is-enabled --quiet sunshine && echo enabled
hyprctl monitors all -j | jq -r '.[] | "\(.name) \(.width)x\(.height) at \(.x),\(.y) mirrorOf=\(.mirrorOf) disabled=\(.disabled)"'
hyprctl workspaces -j | jq -r '.[] | "ws \(.id) -> \(.monitor) (\(.windows) windows)"'
grep -E '\[wlgrab\] Selected monitor|Name: STREAM' ~/.config/sunshine/sunshine.log | tail -4
ss -tulpn | grep -E ':(47984|47989|47990|48010)\b'
```

`[wlgrab] Selected monitor []` is correct: Sunshine prints the EDID description and a
headless output has none; selection is by Wayland name via `output_name`.

Firewall (root, LAN-scoped):

```bash
sudo ufw allow from 192.168.0.0/16 to any port 47984 proto tcp comment 'sunshine https'
sudo ufw allow from 192.168.0.0/16 to any port 47989 proto tcp comment 'sunshine http'
sudo ufw allow from 192.168.0.0/16 to any port 48010 proto tcp comment 'sunshine rtsp'
sudo ufw allow from 192.168.0.0/16 to any port 47998:48002 proto udp comment 'sunshine stream'
sudo ufw allow from 192.168.0.0/16 to any port 47990 proto tcp comment 'sunshine webui'
```

## Hard rules (each is a crash or a freeze if broken)

1. **Never create, destroy, disable or resize `STREAM` while Sunshine runs.** First
   attempt created it on connect and removed it on disconnect:
   `Sunshine SIGABRT` under capture and `Hyprland SIGSEGV` in
   `CFocusState::fullWindowFocus` / `unmapWindow` with
   `std::__throw_bad_variant_access`. Sunshine resolves `output_name` once, at session
   start, and falls back to `monitors[0]`, so a missing target also captures the panel.
2. **Keep the mode constant across a session.** A resolution change under a live
   encoder freezes video while input keeps working. Only the *layout* moves.
3. **The panel may never be a mirror source.** Mirroring is applied to the panel, never
   the reverse. Disabling/unplugging an output that is a mirror source aborts
   Hyprland:
   `CInputManager::refocusLastWindow` <- `Desktop::View::CLayerSurface::onUnmap` ->
   `abort` (see `docs/UPSTREAM-BUGS.md`). The panel is the output that vanishes.
   The idle layout therefore parks `STREAM` behind a gap instead of mirroring the panel.
4. **No overlapping enabled outputs.** Two at the same origin make Hyprland warn and
   send input to the invisible one. The gap also covers this.
5. **Mirrors are runtime-only.** A rule can add a mirror; re-applying the rule without
   `mirror` does *not* clear it, but `mirror = ""` does (measured on 0.56.2), and
   `hyprctl reload` against a mirror-free rule clears it. Apply the panel mirror after
   workspace moves, because moving re-applies the config and drops it.
6. **Workspace ids must be numbers.** `hl.dsp.workspace.move({ workspace = "1" })` is
   accepted and does nothing; the window then lands on `mon=-1`.
7. **Resolve `HYPRLAND_INSTANCE_SIGNATURE`** from `hyprctl instances` in every script;
   a compositor restart leaves long-lived shells and units with a stale socket.

Ordering that avoids the overlap warning and mirror races is in
`docs/DESIGN.md`; `ostreamy on/off` already implements it.

## Mode, aspect, refresh

`MODE` is the captured output size. The Deck OLED panel is 16:10, the Dell 16:9, and
Hyprland *stretches* a mirror into its target, so the local panel is squashed while
streaming a 16:10 output.

| `MODE` | Deck | Dell while streaming |
|---|---|---|
| `1920x1200@60` (default) | fills exactly, no bars | vertically squashed |
| `2560x1440@144` | 40 px bars top/bottom | pixel-correct |

Change it with `ostreamy mode WxH@Hz` (saved; applied immediately only when no session
is live). `SCALE` must stay `1`: omitting `scale` makes Hyprland auto-scale a headless
1200p/1440p output to 2, halving the logical desktop the client sees.

## Codec, HDR, client

**HEVC only.** `hevc_mode = 0`. `av1_mode`: `0` = advertise per encoder capabilities,
`1` = do not advertise (Sunshine web UI). The Deck has no AV1 hardware decoder, so keep
`1` if the goal is certainty; Moonlight cannot request AV1 without a decoder either
way. Do not reintroduce `encoder = vaapi` / `vaapi_quality` lines from the laptop
config — `adapter_name = /dev/dri/renderD128` **is** the 4070 here, and those only add a
`libva-nvidia-driver` layer in front of NVENC.

**HDR is unavailable end to end**: `STREAM` is a headless SDR output
(`XRGB8888`, `srgb`, no HDR metadata); Sunshine's Linux HDR path needs the KMS backend
(not `wlr`); its HDR support is scoped to Intel/AMD VAAPI Main10/AV1; and the S2725DC
reports no HDR in its EDID. Keep `dd_hdr_option = disabled`.

| Moonlight setting | Value |
|---|---|
| Resolution | 1280x800 |
| FPS | 90 (OLED); 60 if a game cannot hold it |
| Codec | HEVC |
| Bitrate | 40 Mbps LAN, 25-30 if WiFi is weak |
| Hardware decoding | on |
| V-Sync / frame pacing | on |
| HDR | off |

Pairing: Moonlight shows a PIN, enter it at `https://localhost:47990`.

VRR note: adaptive sync is inert while the panel mirrors `STREAM` (pacing comes from
the mirror source at a fixed rate); `vrr = 2` in `monitors.lua` keeps the desktop from
flickering outside fullscreen.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Stream black, panel on/off | capturing the panel, or `STREAM` missing | `ostreamy status`; `ostreamy ensure`; `systemctl --user restart sunshine` |
| Sunshine selected the panel | it started before `STREAM` existed | drop-in `ExecStartPre`; restart the unit |
| Stream freezes after a few seconds, controller works | resolution changed under the live encoder | keep `MODE` constant; `ostreamy mode` saves for the next session |
| Mouse at the panel edge switches workspace, cursor jumps to the middle | `STREAM` parked flush: it is a pointer-reachable region | `ostreamy status` should show the gap; `ostreamy ensure` re-parks; re-run `install.sh` if `monitors.lua` is stale |
| Panel stuck mirroring `STREAM` | `off` did not run / mirror rule in a config | `ostreamy off`; `hyprctl reload` against the mirror-free block |
| No pointer input, shortcuts dead | focus on the invisible `STREAM` workspace | `ostreamy fix` |
| Desktop squashed at 60 Hz after quitting | panel still mirroring the stream | `ostreamy off`; check the watcher log |
| `off` does not stick | Moonlight menu polling re-armed it | only a new client outside the 20 s quiet window arms; `ostreamy off` is remembered |
| Window vanished after a session | workspace stranded on a removed output (`mon=-1`) | `ostreamy off`/`fix` rescues it |
| Stream from LAN fails | ufw | allow the ports above |
| Decode stutter on Deck | AV1 negotiated or bitrate too high | keep HEVC, lower bitrate |
| Washed-out picture | someone set `hevc_mode = 3` expecting HDR | HDR is unavailable; keep `hevc_mode = 0` |
| Hyprland aborted right after a stream started/ended | `STREAM` was disabled/resized mid-session, or the panel was a mirror source | rules 1-3; see `docs/UPSTREAM-BUGS.md` |

`journalctl --user -u ostreamy-watch -n 30` shows the switch decisions; the watcher
logs `client connected -> stream-ready layout`, `Sunshine reported disconnect -> native
layout`, `stream layout drifted -> moving windows back`.

## Revert

```bash
~/github/ostreamy-cli/uninstall.sh              # scripts, unit, managed blocks
~/github/ostreamy-cli/uninstall.sh --purge      # also ~/.config/ostreamy
```

Then uninstall the Omarchy plugin (`~/.config/omarchy/plugins/h1st0ry3d.ostreamy` link
and its `shell.json` entries), and remove `output_name` from `sunshine.conf` if
streaming will not be used. Remove `PARK_X`/`STREAM` rules only after `STREAM` is gone.

## Chezmoi

`~/.config/hypr/monitors.lua`, `~/.config/ostreamy/config.sh`,
`~/.config/sunshine/sunshine.conf` and `~/.config/omarchy/shell.json` are chezmoi-managed
(`~/.local/share/chezmoi`). After `install.sh` or any of the ostreamy commands rewrite
them, re-add before the next `chezmoi apply`, or the apply will restore the old
`STREAM` park and the old `PARK_X`-less config.
