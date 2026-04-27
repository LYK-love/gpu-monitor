#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[install] Building dashboard"
(cd "$ROOT/app" && npm ci && npm run build)

DATA_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/gpu-monitor"
DATA_DIST="$DATA_ROOT/app/dist"

echo "[install] Installing dashboard assets to $DATA_DIST"
mkdir -p "$(dirname "$DATA_DIST")"
rm -rf "$DATA_DIST"
cp -R "$ROOT/app/dist" "$DATA_DIST"

echo "[install] Building gpu-monitor"
(cd "$ROOT" && cargo build --release)

echo "[install] Installing backend binary"
(cd "$ROOT" && cargo install --path .)

echo "[install] Done"
echo "[install] Run" 
echo "(For web UI) gpu-monitor web"
echo "Or:"
echo "(For TUI) gpu-monitor tui"
