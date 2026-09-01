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
