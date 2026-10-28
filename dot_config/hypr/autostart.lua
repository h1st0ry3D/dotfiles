-- Extra autostart processes.
-- o.launch_on_start("my-service")

-- Persistent headless output so a stream survives the monitor being switched off
-- (see monitors.lua and ~/.local/bin/hypr-stream-headless).
hl.on("hyprland.start", function()
  hl.exec_cmd("hypr-stream-headless")
end)

