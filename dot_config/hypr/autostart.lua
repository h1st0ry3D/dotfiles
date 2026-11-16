-- Extra autostart processes.
-- o.launch_on_start("my-service")

o.launch_on_start("t3code")

-- Persistent headless output so a stream survives the monitor being switched off
-- (see monitors.lua and the ostreamy-cli repo). ostreamy ensure is idempotent.
hl.on("hyprland.start", function()
  hl.exec_cmd("ostreamy ensure")
end)

