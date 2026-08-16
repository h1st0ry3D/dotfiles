-- See https://wiki.hypr.land/Configuring/Basics/Monitors/
-- List current monitors and supported resolutions with: hyprctl monitors all

local omarchy_gdk_scale = 2
local omarchy_monitor_scale = "auto"

hl.env("GDK_SCALE", tostring(omarchy_gdk_scale))
hl.monitor({ output = "", mode = "preferred", position = "auto", scale = omarchy_monitor_scale })

-- After switching the gmux to the Intel iGPU (see apple-gmux.conf),
-- BOTH GPUs report the built-in eDP panel as connected. The dGPU's copy
-- (eDP-2) is a phantom with no real mode (0x0) that Hyprland still hands a
-- workspace, so windows can vanish onto a fake second screen. Disable it.
hl.monitor({ output = "eDP-2", disabled = true })

-- Configure a specific monitor.
-- hl.monitor({ output = "DP-2", mode = "2560x1440@144", position = "0x0", scale = 1 })

-- Portrait/rotated secondary monitor (transform: 1 = 90°, 3 = 270°).
-- hl.monitor({ output = "DP-2", mode = "preferred", position = "auto", scale = 1, transform = 1 })
