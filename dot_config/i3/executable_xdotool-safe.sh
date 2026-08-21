#!/bin/sh
# Safe xdotool wrapper: never leaves modifiers stuck.
# Usage: xdotool-safe.sh <keys>   e.g. xdotool-safe.sh Ctrl+Insert
#
# Why: `xdotool key --clearmodifiers` temporarily releases held modifiers,
# sends the key, then restores them. If xdotool dies between release and
# restore, modifier state can be left wrong. This wrapper force-releases
# every modifier on any failure so nothing sticks.

keys="$*"

if ! xdotool key --clearmodifiers $keys; then
    for m in Shift_L Shift_R Control_L Control_R \
             Alt_L Alt_R Super_L Super_R Hyper_L Hyper_R Meta_L Meta_R; do
        xdotool keyup "$m" >/dev/null 2>&1
    done
fi
