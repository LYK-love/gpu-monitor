# GPU Monitor
> You can use AI to translate or explain this document and the rest of the project's documentation in your preferred language.
>
> 你可以使用 AI 将本文档和本项目的其他文档翻译成你偏好的语言，或为你解读其中的内容。

GPU Monitor is an NVIDIA GPU monitoring tool with a Python terminal UI, a Python WebSocket stream, and a React web dashboard.

It reads live GPU metrics through NVML when available, falls back to `nvidia-smi`, and streams the same data shape to both local and browser interfaces. It is intended for workstation and server monitoring, not for changing GPU clocks, power limits, or process state.

## Requirements

- Python 3.10 or newer
- Node.js 20 or newer for the web dashboard
- NVIDIA drivers with either NVML or the `nvidia-smi` command available

## Install

Recommended for servers where you often switch conda environments:

```bash
scripts/bootstrap
```

This creates a project-local `.venv`, installs the Python package there, and installs frontend dependencies if `npm` is available. You can then run the CLI through `scripts/gpumon` from any conda environment without activating `.venv`.

Manual installation is also supported:

```bash
python -m pip install -e .
cd app
npm ci
```

## Use

There are three common ways to run the project. Do not run `gpumon server` and `gpumon web` on the same port at the same time; `gpumon web` already starts its own WebSocket server.

### One-command Web Dashboard

Use this for normal local monitoring:

```bash
scripts/gpumon web --port 8765
```

This starts the backend WebSocket stream on port `8765`, serves the built frontend over local HTTP on port `8766`, and opens the dashboard in your browser. It opens an `http://127.0.0.1:8766/` URL, not a `file://` URL.

Use `--web-port` if the dashboard HTTP port is already taken:

```bash
scripts/gpumon web --port 8765 --web-port 8770
```

### Development Mode

Use this when editing the React frontend. Run the backend in one terminal:

```bash
scripts/gpumon server --host 0.0.0.0 --port 8765 --interval 1
```

Then run the frontend dev server in another terminal:

```bash
cd app
npm run dev
```

The dashboard connects to `ws://localhost:8765/gpu-stream` and falls back to mock data when the stream is unavailable. Its process table can filter by GPU, PID, user, or command, and each row expands to show the full command line together with PID, UID, username, GPU ID, process type, and VRAM use.

If the backend is reachable but the machine has no NVIDIA GPU backend available, for example no NVML and no `nvidia-smi`, the dashboard stays connected and switches to mock data. This is different from an offline network state.

### Terminal Interface

Use this over SSH or when you do not need a browser:

```bash
scripts/gpumon tui
```

If you installed the package manually into your active environment, `gpumon ...` works too. The `scripts/gpumon ...` form is preferred when you do not want conda environment changes to affect the tool.

## Test

Run Python unit tests:

```bash
PYTHONPATH=src python -m unittest discover -s tests -v
```

Run frontend checks:

```bash
cd app
npm run lint
npm run build
```

## Documentation

- [CLI](docs/cli.md)
- [Design](docs/design.md)
- [Workflows](docs/workflows.md)

This project was written collaboratively by humans and AI.
