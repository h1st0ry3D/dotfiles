#!/usr/bin/env bash
# Verify the Sunshine stream host. Thin wrapper: the checks live in ostreamy-verify.
#
#   verify-sunshine.sh                 checks only
#   verify-sunshine.sh --simulate-off  also disable the panel, screenshot STREAM,
#                                      check the frame is not black, restore
set -uo pipefail
exec "${HOME}/.local/bin/ostreamy-verify" "$@"
