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

-- Caps Lock: no longer Compose and no Caps Lock toggling. It becomes a
-- Hyper (Mod3) modifier used by the Caps + <key> bindings in bindings.lua.
-- Both Shifts together still toggles Caps Lock (Omarchy default escape hatch).
hl.config({
  input = {
    kb_options = "caps:hyper,shift:both_capslock_cancel",
  },
})

-- Numpad "," -> "." lives in a custom XKB keymap, not in a keybind.
-- Hyprland's synthetic key injection (send_shortcut / send_key_state) finishes
-- with sendKeyboardMods(0, 0, 0, 0), which reports "no NumLock" to every
-- client. After one injected key the numpad digits decode as KP_Home/KP_End/...
-- and stop typing digits until NumLock is toggled off and on again. Remapping
-- the keysym in the keymap produces "." without touching the modifier state.
-- NOTE: while kb_file is set, kb_layout/kb_variant/kb_options above are ignored;
-- they are baked into ~/.config/hypr/keymap.xkb instead. Hyprland expands a
-- leading "~" itself; it does not expand $HOME.
hl.config({
  input = {
    kb_file = "~/.config/hypr/keymap.xkb",
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
hl.gesture({ fingers = 4, direction = "horizontal", action = "workspace" })

-- Enable touchpad gestures for moving focus (helpful on scrolling layout).
hl.gesture({ fingers = 3, direction = "left", action = function() hl.dispatch(hl.dsp.focus({ direction = "r" })) end })
hl.gesture({ fingers = 3, direction = "right", action = function() hl.dispatch(hl.dsp.focus({ direction = "l" })) end })
hl.gesture({ fingers = 3, direction = "up", action = function() hl.dispatch(hl.dsp.focus({ direction = "d" })) end })
hl.gesture({ fingers = 3, direction = "down", action = function() hl.dispatch(hl.dsp.focus({ direction = "u" })) end })
