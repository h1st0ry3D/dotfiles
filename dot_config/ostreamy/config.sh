# ostreamy configuration. Sourced by every ostreamy command; plain bash.

# Name of the persistent headless output that Sunshine captures.
# Must match `output_name` in ~/.config/sunshine/sunshine.conf.
OUTPUT=STREAM

# Mode of that headless output. 16:10 (1200p/1600p) fills a Steam Deck OLED panel
# exactly; 1440p gives a 16:9 image with 40 px bars top/bottom on the Deck but a
# pixel-perfect picture on a 1440p desktop monitor.
MODE=1920x1200@60

# Scale of that headless output. Must stay 1: a monitor rule that omits `scale`
# gets Hyprland's auto scale, which resolves to 2 on a headless 1920x1200 (and on
# 2560x1440) output -- every window then renders into a 960x600 logical desktop
# and the client sees a zoomed, blurry stream.
SCALE=1

# Fallback: seconds without a live client before the layout goes back to native,
# when Sunshine logged no disconnect line.
GRACE=30

# Seconds after a switch-off during which *new short-lived* connections (Moonlight
# menu/status polling after the user quits) cannot re-arm the layout. A real session
# still arms it: a live connection or "New streaming session started" bypasses this.
QUIET=20

# Poll interval for the watcher, seconds.
INTERVAL=0.25

# Sunshine control ports (TCP), used to detect client activity.
PORTS="47984 47989 48010"

# Seconds to let Hyprland settle between layout steps during a switch.
PUMP=1

# Where the headless output is parked while idle. Must stay clear of the panel: a
# parked output flush against it is a pointer-reachable layout region, and crossing
# the edge focuses STREAM, activating its workspace ("mouse at the border switches
# workspace and jumps to the middle"). Hyprland clamps the pointer to the nearest
# monitor, so the gap is the protection. Ostreamy widens this automatically when the
# panel's right edge would come within 1500 px.
PARK_X=6000
