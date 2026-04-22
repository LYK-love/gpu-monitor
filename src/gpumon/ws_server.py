"""
WebSocket server that streams GPU data to connected clients.
"""

import asyncio
import json
import websockets
from collections.abc import Sequence
from typing import Set, Dict, Any
from .gpu_collector import GPUCollector


class GPUWebSocketServer:
    """WebSocket server broadcasting GPU metrics."""

    def __init__(self, host: str = "0.0.0.0", port: int = 8765, interval: float = 1.0):
        self.host = host
        self.port = port
        self.interval = interval
        self.collector = GPUCollector()
        self.clients: Set[websockets.WebSocketServerProtocol] = set()
        self.running = False
        self._lock = asyncio.Lock()

    async def _broadcast(self, data: Dict[str, Any]):
        """Send data to all connected clients."""
        if not self.clients:
            return
        message = json.dumps(data)
        dead_clients = set()
        for client in self.clients:
            try:
                await client.send(message)
            except:
                dead_clients.add(client)
        for dead in dead_clients:
            self.clients.discard(dead)

    async def _handler(self, websocket: websockets.WebSocketServerProtocol, path: str | None = None):
        """Handle a new WebSocket connection."""
        self.clients.add(websocket)
        client_addr = websocket.remote_address
        print(f"[WS] Client connected from {client_addr} — {len(self.clients)} total")

        # Send current data immediately
        try:
            data = self.collector.collect()
            await websocket.send(json.dumps(data))
        except Exception as e:
            print(f"[WS] Error sending initial data: {e}")

        try:
            await websocket.wait_closed()
        except:
            pass
        finally:
            self.clients.discard(websocket)
            print(f"[WS] Client disconnected — {len(self.clients)} remaining")

    async def _collector_loop(self):
        """Periodically collect and broadcast GPU data."""
        while self.running:
            try:
                data = self.collector.collect()
                await self._broadcast(data)
            except Exception as e:
                print(f"[WS] Collector error: {e}")
            await asyncio.sleep(self.interval)

    async def start(self):
        """Start the WebSocket server."""
        self.running = True
        print(f"[WS] Starting server on ws://{self.host}:{self.port}")
        print(f"[WS] Refresh interval: {self.interval}s")

        server = await websockets.serve(
            self._handler, self.host, self.port, ping_interval=20, ping_timeout=10
        )

        # Start collector loop
        collector_task = asyncio.create_task(self._collector_loop())

        try:
            await asyncio.Future()  # Run forever
        except asyncio.CancelledError:
            pass
        finally:
            self.running = False
            collector_task.cancel()
            self.collector.close()
            server.close()
            await server.wait_closed()
            print("[WS] Server stopped")

    def run(self):
        """Run the server (blocking)."""
        try:
            asyncio.run(self.start())
        except KeyboardInterrupt:
            print("\n[WS] Shutdown requested")
            self.running = False
            self.collector.close()


def main(argv: Sequence[str] | None = None) -> int:
    import argparse
    parser = argparse.ArgumentParser(description="GPU Monitor WebSocket Server")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8765, help="Bind port (default: 8765)")
    parser.add_argument("--interval", type=float, default=1.0, help="Update interval in seconds (default: 1.0)")
    args = parser.parse_args(argv)

    server = GPUWebSocketServer(host=args.host, port=args.port, interval=args.interval)
    server.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
