-- See https://wiki.hypr.land/Configuring/Basics/Monitors/
-- List current monitors and supported resolutions with: hyprctl monitors all

local omarchy_gdk_scale = 1
local omarchy_monitor_scale = 1

hl.env("GDK_SCALE", tostring(omarchy_gdk_scale))
hl.monitor({ output = "", mode = "preferred", position = "auto", scale = omarchy_monitor_scale })

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
-- vrr: 0 = off, 1 = always, 2 = fullscreen windows only, 3 = fullscreen games/video only.
hl.monitor({ output = "desc:Dell Inc. DELL S2725DC", mode = "2560x1440@144", position = "auto", scale = omarchy_monitor_scale, vrr = 1 })

-- Configure a specific monitor.
-- hl.monitor({ output = "DP-2", mode = "2560x1440@144", position = "0x0", scale = 1 })

-- Portrait/rotated secondary monitor (transform: 1 = 90°, 3 = 270°).
-- hl.monitor({ output = "DP-2", mode = "preferred", position = "auto", scale = 1, transform = 1 })
