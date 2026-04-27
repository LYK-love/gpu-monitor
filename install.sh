#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[install] Building dashboard"
(cd "$ROOT/app" && npm ci && npm run build)

echo "[install] Building gpu-monitor"
(cd "$ROOT" && cargo build --release)

echo "[install] Installing backend binary"
(cd "$ROOT" && cargo install --path .)

echo "[install] Done"
echo "[install] Run: ./gpu-monitor web"
