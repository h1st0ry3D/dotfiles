#!/usr/bin/env sh
# dmenu power menu — logout / reboot / shutdown / suspend / lock
choice=$(printf 'logout\nreboot\nshutdown\nsuspend\nlock' | dmenu -i -p 'power:')
case "$choice" in
  logout)   i3-msg exit ;;
  reboot)   systemctl reboot ;;
  shutdown) systemctl poweroff ;;
  suspend)  systemctl suspend ;;
  lock)     i3lock ;;
esac
