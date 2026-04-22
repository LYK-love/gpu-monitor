"""Command line entry point for GPU Monitor."""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from typing import Sequence


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="gpumon",
        description="Monitor NVIDIA GPU metrics in a terminal or web dashboard.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("tui", help="launch the terminal interface")

    server = subparsers.add_parser("server", help="start the WebSocket metric stream")
    server.add_argument("--host", default="0.0.0.0", help="bind host")
    server.add_argument("--port", type=int, default=8765, help="bind port")
    server.add_argument("--interval", type=float, default=1.0, help="poll interval in seconds")

    web = subparsers.add_parser("web", help="build and open the web dashboard")
    web.add_argument("--host", default="0.0.0.0", help="WebSocket bind host")
    web.add_argument("--port", type=int, default=8765, help="WebSocket bind port")
    web.add_argument("--interval", type=float, default=1.0, help="poll interval in seconds")
    web.add_argument("--web-host", default="127.0.0.1", help="dashboard HTTP bind host")
    web.add_argument("--web-port", type=int, default=8766, help="dashboard HTTP port")
    return parser


def _stop_process(proc: subprocess.Popen[bytes] | subprocess.Popen[str]) -> None:
    if proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


def _run_web(host: str, port: int, interval: float, web_host: str, web_port: int) -> int:
    root = _project_root()
    app_dir = root / "app"
    dist_dir = app_dir / "dist"
    ws_url = f"ws://localhost:{port}"
    browser_host = "127.0.0.1" if web_host == "0.0.0.0" else web_host
    dashboard_url = f"http://{browser_host}:{web_port}/"

    if not dist_dir.exists():
        print("[WEB] Building web app...")
        subprocess.run(["npm", "run", "build"], cwd=app_dir, check=True)

    dashboard = dist_dir / "index.html"
    if not dashboard.exists():
        print(f"[WEB] Dashboard not found at {dashboard}")
        print("[WEB] Build it manually with: cd app && npm run build")
        return 1

    print(f"[WEB] Starting WebSocket server on {host}:{port}...")
    server_proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "gpumon",
            "server",
            "--host",
            host,
            "--port",
            str(port),
            "--interval",
            str(interval),
        ]
    )

    print(f"[WEB] Serving dashboard on http://{web_host}:{web_port}/...")
    http_proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "http.server",
            str(web_port),
            "--bind",
            web_host,
            "--directory",
            str(dist_dir),
        ]
    )

    time.sleep(1)
    if server_proc.poll() is not None:
        _stop_process(http_proc)
        return server_proc.returncode or 1
    if http_proc.poll() is not None:
        _stop_process(server_proc)
        return http_proc.returncode or 1

    print(f"[WEB] Opening dashboard: {dashboard_url}")
    webbrowser.open(dashboard_url)
    print(f"[WEB] WebSocket server running at {ws_url}")
    print("[WEB] Press Ctrl+C to stop")

    try:
        while True:
            if server_proc.poll() is not None:
                _stop_process(http_proc)
                return server_proc.returncode or 1
            if http_proc.poll() is not None:
                _stop_process(server_proc)
                return http_proc.returncode or 1
            time.sleep(0.5)
    except KeyboardInterrupt:
        _stop_process(http_proc)
        _stop_process(server_proc)
        print("\n[WEB] Server stopped")
        return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command == "tui":
        from .tui import main as tui_main

        tui_main([])
        return 0

    if args.command == "server":
        from .ws_server import main as server_main

        return server_main(
            ["--host", args.host, "--port", str(args.port), "--interval", str(args.interval)]
        )

    if args.command == "web":
        return _run_web(args.host, args.port, args.interval, args.web_host, args.web_port)

    parser.error(f"unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
