# CLI

GPU Monitor exposes one Python command, `gpumon`, after installation with `python -m pip install -e .`.

## Commands

```bash
gpumon --help
gpumon tui --help
gpumon server --help
gpumon web --help
```

### `gpumon tui`

Launches the terminal interface. The TUI reads metrics directly from the Python collector and redraws the screen several times per second.

Keyboard controls:

- `q`: quit
- `0` to `9`: select GPU by index
- `m`: sort processes by memory
- `p`: sort processes by PID
- `n`: sort processes by name
- Arrow keys: move between GPUs or scroll process rows

### `gpumon server`

Starts only the backend WebSocket metric stream. It does not open a browser and it does not serve the React development app.

```bash
gpumon server --host 0.0.0.0 --port 8765 --interval 1
```

Options:

- `--host`: bind host, default `0.0.0.0`
- `--port`: bind port, default `8765`
- `--interval`: GPU polling interval in seconds, default `1.0`

The server accepts browser connections on any path, including `/gpu-stream`, and sends JSON dashboard snapshots.

Use `gpumon server` when another process is responsible for the frontend, for example Vite during development:

```bash
# Terminal 1
gpumon server --port 8765

# Terminal 2
cd app
npm run dev
```

### `gpumon web`

Starts the backend WebSocket server, builds `app/` if needed, serves `app/dist/` over local HTTP, and opens the dashboard in the default browser. This is the one-command local web dashboard mode.

```bash
gpumon web --host 0.0.0.0 --port 8765 --interval 1
```

By default, `--port` is the backend WebSocket port and `--web-port` is the dashboard HTTP port:

```text
ws://localhost:8765/gpu-stream   backend metric stream
http://127.0.0.1:8766/           browser dashboard
```

If port `8766` is already used, choose another dashboard port:

```bash
gpumon web --port 8765 --web-port 8770
```

This command expects the Node dependencies in `app/` to be installed before first use.

Do not run `gpumon server --port 8765` and `gpumon web --port 8765` at the same time. Both commands try to bind the same WebSocket port.
