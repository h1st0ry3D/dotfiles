-- See https://wiki.hypr.land/Configuring/Basics/Monitors/
-- List current monitors and supported resolutions with: hyprctl monitors all

local omarchy_gdk_scale = 1
local omarchy_monitor_scale = 1

hl.env("GDK_SCALE", tostring(omarchy_gdk_scale))
hl.monitor({ output = "", mode = "preferred", position = "auto", scale = omarchy_monitor_scale })
hl.monitor({ output = "HDMI-A-1", mode = "preferred", position = "auto", scale = 1.25 })

-- Avalonia apps (SourceGit and other .NET GUIs) only speak X11, and
-- xwayland.force_zero_scaling means Hyprland hands them the raw pixel grid
-- instead of upscaling. They must scale themselves, and Avalonia's own XRandR
-- detection lands on 1, so their UI renders at half size. Pin them to the
-- same factor the compositor uses, per output, e.g. 'eDP-1=2;DP-1=1'.
-- Falls back to 2 when omarchy_monitor_scale is "auto", which is not a value
-- Avalonia can parse.
local omarchy_avalonia_scale = type(omarchy_monitor_scale) == "number" and omarchy_monitor_scale or 2
hl.env("AVALONIA_SCREEN_SCALE_FACTORS", "eDP-1=" .. omarchy_avalonia_scale)

-- After switching the gmux to the Intel iGPU (see apple-gmux.conf),
-- BOTH GPUs report the built-in eDP panel as connected. The dGPU's copy
-- (eDP-2) is a phantom with no real mode (0x0) that Hyprland still hands a
-- workspace, so windows can vanish onto a fake second screen. Disable it.
hl.monitor({ output = "eDP-2", disabled = true })

-- Adaptive-Sync (VRR) on the Dell S2725DC. Shared by both machines, so nothing
-- here may name a connector or a GPU. The panel advertises VRR over every
-- transport it is likely to be plugged into -- an AMD FreeSync VSDB (48-144 Hz)
-- plus an HDMI Forum VSDB (VRRmin 48 / VRRmax 144) -- so the same rule covers
-- amdgpu over DisplayPort on the laptop and nvidia-drm over HDMI on the desktop.
-- Matched by description, not connector, so the cable can move between DP-6 and
-- HDMI-A-1 without editing this file.
-- VRR is off unless a rule asks for it, which is the whole point of vrr = 1.
-- Runs at 144 Hz rather than the 59.95 Hz "preferred" mode: VRR scales with the
-- refresh rate, and at 60 Hz the variable window is squeezed into 48-60 Hz.
-- 144 Hz opens it up to the full 48-144 Hz the panel advertises.
-- With the mirror below the panel is paced by STREAM instead, so adaptive sync
-- no longer adapts; 144 Hz still applies. Worth it: the alternative is a dead
-- stream whenever the panel is switched off.
-- vrr: -1 = follow misc:vrr, 0 = off, 1 = always, 2 = fullscreen windows only,
--      3 = fullscreen windows with video/game content type.
--
-- Set to 2, NOT 1. The S2725DC's panel brightness shifts with refresh rate, so with
-- VRR engaged on the desktop every repaint after an idle period makes the backlight
-- flicker. The trigger is that Hyprland lets the refresh fall to the panel's VRR
-- floor (~48 Hz) while the screen is static, then jumps to 144 Hz on the next
-- damage event -- which is exactly why moving the mouse fast stops the flicker and
-- why it can persist after the game is long closed. 2 keeps the desktop locked at
-- the fixed 144 Hz mode and only hands the panel to VRR while something is
-- fullscreen. This is the fix Hyprland's own FAQ prescribes for VRR brightness
-- flicker. Prefer 2 over 3: 3 needs the client to advertise a game/video content
-- type and many XWayland games never do, so they would silently get no VRR.
-- mirror: applied at runtime by ~/.local/bin/ostreamy (and by the
-- sunshine-stream-watch service) only while a Moonlight client is connected.
-- It is deliberately NOT in this rule: Hyprland can add a mirror with a rule but
-- cannot clear one by re-applying a rule, so keeping it here left the panel
-- stuck mirroring STREAM after a stream ended. Clearing it takes a reload with
-- this rule mirror-free, which is what `ostreamy off` does.
-- While mirroring, the panel holds no workspaces of its own, so switching it off
-- cannot take the desktop with it.
hl.monitor({ output = "desc:Dell Inc. DELL S2725DC", mode = "2560x1440@144", position = "0x0", scale = omarchy_monitor_scale, vrr = 2 })

-- Configure a specific monitor.
-- hl.monitor({ output = "DP-2", mode = "2560x1440@144", position = "0x0", scale = 1 })

-- Portrait/rotated secondary monitor (transform: 1 = 90°, 3 = 270°).
-- hl.monitor({ output = "DP-2", mode = "preferred", position = "auto", scale = 1, transform = 1 })

-- >>> ostreamy >>>
-- Ostreamy: persistent headless output captured by Sunshine.
--
-- Inserted by install.sh between "# >>> Ostreamy >>>" markers, and removed again by
-- uninstall.sh. Keep this block free of mirror settings: a runtime mirror cannot be
-- cleared by re-applying a rule, so Ostreamy switches the mirror at runtime with
-- `hyprctl eval` and clears it with `hyprctl reload` (which lands here, mirror-free).
--
-- The output is parked at a negative x so it can never overlap the primary output:
-- two enabled outputs at the same origin make Hyprland warn about an invalid layout
-- and send pointer input to the invisible one. The primary output's own
-- position = "auto" then places it at 0,0.
--
-- It stays ENABLED at all times. Sunshine resolves output_name only at session
-- start and silently falls back to monitors[0] if the target is missing; the
-- resolution then changes under the live encoder and the video freezes while input
-- keeps working.
hl.monitor({ output = "STREAM", mode = "1920x1200@60", position = "-1920x0", scale = 1 })
-- <<< ostreamy <<<
