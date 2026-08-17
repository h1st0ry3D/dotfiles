-- Keep only your personal input overrides here. Uncommented settings below
-- replace Omarchy's defaults.

-- Enable natural (inverse) scrolling on the touchpad.
hl.config({
  input = {
    touchpad = {
      -- Use natural (inverse) scrolling.
      natural_scroll = true,
    },
  },
})

-- Keyboard layout and options.
-- See https://wiki.hypr.land/Configuring/Basics/Variables/#input
-- hl.config({
--   input = {
--     -- Use multiple keyboard layouts and switch between them with Left Alt + Right Alt.
--     kb_layout = "us,dk,eu",
--     kb_options = "compose:caps,shift:both_capslock_cancel,grp:alts_toggle",
--
--     -- Use a specific keyboard variant if needed (e.g. intl for international keyboards).
--     kb_variant = "intl",
--
--     -- Change speed of keyboard repeat.
--     repeat_rate = 40,
--     repeat_delay = 250,
--
--     -- Start with numlock on by default.
--     numlock_by_default = true,
--
--     -- Increase sensitivity for mouse/trackpad (default: 0).
--     sensitivity = 0.35,
--
--     -- Turn off mouse acceleration (default: adaptive).
--     accel_profile = "flat",
--
--     touchpad = {
--       -- Use natural (inverse) scrolling.
--       natural_scroll = true,
--
--       -- Use two-finger clicks for right-click instead of lower-right corner.
--       clickfinger_behavior = true,
--
--       -- Control the speed of your scrolling.
--       scroll_factor = 0.4,
--
--       -- Enable the touchpad while typing.
--       disable_while_typing = false,
--
--       -- Left-click-and-drag with three fingers.
--       drag_3fg = 1,
--     },
--   },
-- })

-- App-specific touchpad scroll speeds.
-- o.window("(Alacritty|kitty|foot)", { scroll_touchpad = 1.5 })
-- o.window("com.mitchellh.ghostty", { scroll_touchpad = 0.2 })

-- Enable touchpad gestures for changing workspaces.
-- See https://wiki.hypr.land/Configuring/Advanced-and-Cool/Gestures/
-- hl.gesture({ fingers = 3, direction = "horizontal", action = "workspace" })

-- Enable touchpad gestures for moving focus (natural/inverted: swipe left -> window on the right).
-- Uses the smart-focus script so it also works from a maximized/full-width window
-- (restores the window to its tiled spot, then steps to the spatial neighbor).
hl.gesture({ fingers = 3, direction = "left",  action = function() hl.dispatch(hl.dsp.exec_cmd("$HOME/.config/hypr/omarchy-hyprland-focus-smart right")) end })
hl.gesture({ fingers = 3, direction = "right", action = function() hl.dispatch(hl.dsp.exec_cmd("$HOME/.config/hypr/omarchy-hyprland-focus-smart left")) end })

-- 3-finger swipe up -> full width (maximize); swipe down -> back to half size.
hl.gesture({ fingers = 3, direction = "up",   action = function() hl.dispatch(hl.dsp.window.fullscreen({ mode = "maximized" })) end })
hl.gesture({ fingers = 3, direction = "down", action = function() hl.dispatch(hl.dsp.window.fullscreen_state({ internal = 0, client = 0 })) end })

-- 4-finger swipe left/right -> next/previous workspace (natural: left -> next).
-- Wraps within 1..OMARCHY_WORKSPACE_MAX (default 4) so a 5th workspace is never created.
hl.gesture({ fingers = 4, direction = "left",  action = function() hl.dispatch(hl.dsp.exec_cmd("$HOME/.config/hypr/omarchy-hyprland-workspace-smart next")) end })
hl.gesture({ fingers = 4, direction = "right", action = function() hl.dispatch(hl.dsp.exec_cmd("$HOME/.config/hypr/omarchy-hyprland-workspace-smart prev")) end })
