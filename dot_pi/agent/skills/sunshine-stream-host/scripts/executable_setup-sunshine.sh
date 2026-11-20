#!/usr/bin/env bash
# Idempotent setup for the Sunshine stream host (Ostreamy).
#
#   setup-sunshine.sh              install/repair everything except the Hyprland block
#   setup-sunshine.sh --with-hypr  also rewrite the managed monitors.lua block
#
# The real installer lives in the repo; this is the skill's entry point for it.
# Firewall rules need root, so they are printed, never applied.
set -uo pipefail

REPO="$HOME/github/ostreamy-cli"
say() { printf '%-6s %s\n' "$1" "$2"; }

[ -x "$REPO/install.sh" ] || { say FAIL "missing $REPO (git clone ostreamy-cli)"; exit 1; }

args=(--no-sunshine)
case "${1:-}" in
  --with-hypr) ;;
  "") args+=(--no-hypr) ;;
  *) printf 'usage: %s [--with-hypr]\n' "${0##*/}" >&2; exit 2 ;;
esac

"$REPO/install.sh" "${args[@]}" || exit 1

say INFO "ensure unit state"
systemctl --user enable --now ostreamy-watch.service >/dev/null 2>&1 || say FAIL "could not enable ostreamy-watch"
systemctl --user is-enabled --quiet sunshine && say OK "sunshine enabled" \
  || say WARN "sunshine unit not enabled: systemctl --user enable --now sunshine"

~/.local/bin/ostreamy ensure >/dev/null 2>&1 && say OK "STREAM present" || say FAIL "ostreamy ensure failed"

cat <<'TXT'

INFO   firewall rules need root (LAN-scoped):
  sudo ufw allow from 192.168.0.0/16 to any port 47984 proto tcp comment 'sunshine https'
  sudo ufw allow from 192.168.0.0/16 to any port 47989 proto tcp comment 'sunshine http'
  sudo ufw allow from 192.168.0.0/16 to any port 48010 proto tcp comment 'sunshine rtsp'
  sudo ufw allow from 192.168.0.0/16 to any port 47998:48002 proto udp comment 'sunshine stream'
  sudo ufw allow from 192.168.0.0/16 to any port 47990 proto tcp comment 'sunshine webui'

Then verify: ~/.local/bin/ostreamy-verify --simulate-off
TXT
