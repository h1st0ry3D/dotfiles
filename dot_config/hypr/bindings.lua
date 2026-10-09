-- Keep only your personal keybinding overrides here. Add new bindings or
-- unbind defaults before replacing them.

-- See current bindings and descriptions:
--   omarchy menu keybindings --print

-- To disable every Omarchy default binding, set this in
-- ~/.config/hypr/hyprland.lua before require("default.hypr.omarchy"), then add
-- only the bindings you want below:
--   omarchy_default_bindings = false

-- To disable all preinstalled app/webapp bindings, set:
--   omarchy_preinstalled_bindings = false

-- Add a new binding.
-- o.bind("SUPER + SHIFT + R", "SSH", "alacritty -e ssh your-server")

-- Change an existing binding by unbinding it first, then binding the key again.
-- This example changes SUPER+SPACE from the launcher to the Omarchy root menu.
-- hl.unbind("SUPER + SPACE")
-- o.bind("SUPER + SPACE", "Omarchy menu", "omarchy-menu toggle root")

-- Disable a default binding without replacing it.
-- hl.unbind("SUPER + SHIFT + B")

-- Logitech MX Keys examples:
-- o.bind("SUPER + SHIFT + S", nil, "omarchy-capture-screenshot")
-- o.bind("SUPER + H", nil, "voxtype record toggle")
-- o.bind("SUPER + PERIOD", nil, "omarchy-shell shell toggle omarchy.emojis")

-- Rebind the clipboard manager from SUPER+CTRL+V to SUPER+Y.
-- hl.unbind("SUPER + CTRL + V")
o.bind("SUPER + Y", "Clipboard manager", "omarchy-shell shell toggle omarchy.clipboard")
o.bind("ALT + SHIFT + 4", "Screenshot", "omarchy-capture-screenshot")

-- Additional close-window binding (SUPER+W is the default).
o.bind("SUPER + Q", "Close window", hl.dsp.window.close())

-- Additional Omarchy menu binding (SUPER+SPACE is the default).
o.bind("ALT + SPACE", "Omarchy menu", "omarchy-menu toggle")

-- VT switch fix: Hyprland does not bind CTRL+ALT+Fx by default.
-- Without this, CTRL+ALT+F2/F3 loses focus (dots vanish) but stays on compositor overlay.
-- Busctl SwitchTo via logind (polkit allows), fallback to sudo chvt (sudoers).
o.bind("CTRL + ALT + F1", "Switch to VT1 (greeter)", "sh -c 'busctl call org.freedesktop.login1 /org/freedesktop/login1/seat/seat0 org.freedesktop.login1.Seat SwitchTo u 1 || sudo chvt 1'", { locked = true })
o.bind("CTRL + ALT + F2", "Switch to VT2 (tty2)", "sh -c 'busctl call org.freedesktop.login1 /org/freedesktop/login1/seat/seat0 org.freedesktop.login1.Seat SwitchTo u 2 || sudo chvt 2'", { locked = true })
o.bind("CTRL + ALT + F3", "Switch to VT3 (tty3)", "sh -c 'busctl call org.freedesktop.login1 /org/freedesktop/login1/seat/seat0 org.freedesktop.login1.Seat SwitchTo u 3 || sudo chvt 3'", { locked = true })
o.bind("CTRL + ALT + F4", "Switch to VT4 (graphical - Hyprland)", "sh -c 'busctl call org.freedesktop.login1 /org/freedesktop/login1/seat/seat0 org.freedesktop.login1.Seat SwitchTo u 4 || sudo chvt 4'", { locked = true })
-- After enabling getty@tty2/3, user session moves from VT1 to VT4 (next free VT). F4 is now graphical.

-- Remap SUPER+SHIFT+ENTER from Browser -> Terminal
hl.unbind("SUPER + SHIFT + RETURN")
o.bind("SUPER + SHIFT + RETURN", "Terminal", { omarchy = "terminal" })

-- Direct shutdown on physical power button, no menu
hl.unbind("XF86PowerOff")
o.bind("XF86PowerOff", "Shutdown", "omarchy system shutdown", { locked = true })

-- Caps Lock is remapped to Hyper (Mod3) in input.lua, so it no longer types
-- and is free to use as a modifier.

-- Caps + 1..4: launch the app, or focus it if it is already running.
o.bind("MOD3 + 1", "T3 Code", { focus = "t3code", launch = "t3code" })
o.bind("MOD3 + 2", "VS Code", { focus = "^Code$", launch = "code" })
o.bind("MOD3 + 3", "SourceGit", { focus = "sourcegit", launch = "sourcegit" })
o.bind("MOD3 + 4", "Brave Origin", { focus = "brave-origin", launch = "brave-origin" })

-- Hyprland's send_shortcut can lose the release of its synthetic key, making
-- the focused app repeat the character forever until another key is pressed.
-- Send an explicit key-down and key-up instead (same workaround Omarchy ships
-- for its Universal copy/paste/cut binds in default/hypr/bindings/clipboard.lua).
-- https://github.com/hyprwm/Hyprland/discussions/14099
local function send_shortcut_once(mods, key)
  return function()
    hl.dispatch(hl.dsp.send_key_state({ mods = mods, key = key, state = "down" }))
    hl.timer(function()
      hl.dispatch(hl.dsp.send_key_state({ mods = mods, key = key, state = "up" }))
    end, { timeout = 50, type = "oneshot" })
  end
end

-- Caps + F/T/A: forward the matching Ctrl shortcut to the focused window.
o.bind("MOD3 + F", "Find (as Ctrl+F)", send_shortcut_once("CTRL", "f"))
o.bind("MOD3 + T", "New tab (as Ctrl+T)", send_shortcut_once("CTRL", "t"))
o.bind("MOD3 + A", "Select all (as Ctrl+A)", send_shortcut_once("CTRL", "a"))
o.bind("MOD3 + W", "Close tab (as Ctrl+W)", send_shortcut_once("CTRL", "w"))
o.bind("MOD3 + C", "Copy (as Ctrl+C)", send_shortcut_once("CTRL", "c"))
o.bind("MOD3 + X", "Cut (as Ctrl+X)", send_shortcut_once("CTRL", "x"))
o.bind("MOD3 + V", "Paste (as Ctrl+V)", send_shortcut_once("CTRL", "v"))

-- Super + F/A/S: forward the Ctrl shortcut (repurposes Omarchy's Super+F
-- fullscreen and Super+S scratchpad; Super+A had no default binding).
hl.unbind("SUPER + F")
o.bind("SUPER + F", "Find (as Ctrl+F)", send_shortcut_once("CTRL", "f"))
o.bind("SUPER + A", "Select all (as Ctrl+A)", send_shortcut_once("CTRL", "a"))
hl.unbind("SUPER + S")
o.bind("SUPER + S", "Save (as Ctrl+S)", send_shortcut_once("CTRL", "s"))

-- Super + T/W: forward Ctrl+T / Ctrl+W. Float moves to Super+U; close stays
-- on Super+Q.
hl.unbind("SUPER + T")
o.bind("SUPER + T", "New tab (as Ctrl+T)", send_shortcut_once("CTRL", "t"))
hl.unbind("SUPER + W")
o.bind("SUPER + W", "Close tab (as Ctrl+W)", send_shortcut_once("CTRL", "w"))
o.bind("SUPER + U", "Toggle window floating/tiling", hl.dsp.window.float({ action = "toggle" }))

-- Alt + arrows: forward the matching Ctrl+arrow shortcut (word/line jumps,
-- paragraph moves) to the focused window.
o.bind("ALT + UP", "Ctrl+Up", send_shortcut_once("CTRL", "Up"))
o.bind("ALT + DOWN", "Ctrl+Down", send_shortcut_once("CTRL", "Down"))
o.bind("ALT + LEFT", "Ctrl+Left", send_shortcut_once("CTRL", "Left"))
o.bind("ALT + RIGHT", "Ctrl+Right", send_shortcut_once("CTRL", "Right"))

-- Alt + Shift + arrows: same, with Shift (extend selection by word/line).
o.bind("ALT + SHIFT + LEFT", "Ctrl+Shift+Left", send_shortcut_once("CTRL SHIFT", "Left"))
o.bind("ALT + SHIFT + RIGHT", "Ctrl+Shift+Right", send_shortcut_once("CTRL SHIFT", "Right"))

-- Mac-style symbol shortcuts on the German layout (AltGr is Mod5):
-- AltGr+Q = @, AltGr+< = |, AltGr++ = ~.
o.bind("ALT + L", "@ symbol", send_shortcut_once("MOD5", "q"))
o.bind("ALT + 7", "| pipe symbol", send_shortcut_once("MOD5", "less"))
o.bind("ALT + N", "~ tilde symbol", send_shortcut_once("MOD5", "plus"))

-- Mac-style brackets/braces on the German layout (AltGr is Mod5):
-- AltGr+8 = [, AltGr+9 = ], AltGr+7 = {, AltGr+0 = }.
o.bind("ALT + 5", "[ bracket", send_shortcut_once("MOD5", "8"))
o.bind("ALT + 6", "] bracket", send_shortcut_once("MOD5", "9"))
o.bind("ALT + 8", "{ brace", send_shortcut_once("MOD5", "7"))
o.bind("ALT + 9", "} brace", send_shortcut_once("MOD5", "0"))
