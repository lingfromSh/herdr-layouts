#!/usr/bin/env bash
# Put this layout and its tsk panel into Herdr: <herdr-app home>/layouts and /mods.
#
#   ./install.sh            copy both, back up anything it replaces
#   ./install.sh --dry-run  say what it would copy
#
# Herdr hot-reloads mods and layouts, so a running app picks this up as the files land.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
app_home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
dry=""
case "${1:-}" in
  --dry-run|-n) dry=1 ;;
  "") ;;
  *) echo "usage: $0 [--dry-run]" >&2; exit 2 ;;
esac

stamp=$(date +%Y%m%d-%H%M%S)

say() { printf '%s\n' "$*"; }

copy() { # copy <src> <dest>, keeping dest as <dest>.before-<stamp> when it differs
  local src=$1 dest=$2
  if [ -e "$dest" ] && diff -rq "$src" "$dest" >/dev/null 2>&1; then
    say "  = $dest (already identical)"
    return
  fi
  if [ -n "$dry" ]; then
    say "  → $dest"
    return
  fi
  if [ -e "$dest" ]; then
    mv "$dest" "$dest.before-$stamp"
    say "  ~ $dest (old one kept as $(basename "$dest").before-$stamp)"
  else
    say "  + $dest"
  fi
  mkdir -p "$(dirname "$dest")"
  cp -R "$src" "$dest"
}

if [ ! -d "$app_home" ]; then
  say "no Herdr app home at $app_home"
  say "start Herdr once (it writes AGENTS.md and its d.ts files there), or set HERDR_APP_HOME"
  exit 1
fi

say "Herdr app home: $app_home"
say "tsk panel:"
copy "$here/mods/tsk" "$app_home/mods/tsk"
say "herdr-work layout:"
copy "$here/layouts/herdr-work.json" "$app_home/layouts/herdr-work.json"

if [ -f "$here/layouts/herdr-work.png" ]; then
  copy "$here/layouts/herdr-work.png" "$app_home/layouts/herdr-work.png"
fi

if [ -z "$dry" ] && command -v herdr-app >/dev/null 2>&1; then
  if herdr-app check "$app_home/mods/tsk" >/dev/null 2>&1; then
    say ""
    say "herdr-app check: passed"
  else
    say ""
    say "herdr-app check failed:" >&2
    herdr-app check "$app_home/mods/tsk" >&2 || true
    exit 1
  fi
fi

say ""
say "next: switch to the layout (or pick it in the layout menu):"
say "  herdr-app do layout.switch '{\"name\":\"herdr-work\"}'"
