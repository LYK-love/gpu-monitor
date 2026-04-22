# Design

## Goal

GPU Monitor provides a compact view of NVIDIA GPU health and process usage for local workstations and remote servers. It should be usable from a terminal over SSH and from a browser dashboard on the same machine or network.

## Non-Goals

- It does not modify GPU state.
- It does not kill, pause, or reprioritize GPU processes.
- It does not store historical metrics beyond the short browser-side chart window.
- It does not replace fleet observability systems such as Prometheus and Grafana.

## Core Abstractions

`GPUCollector` is the single source of GPU snapshots. It tries NVML through `nvidia-ml-py` first, then falls back to `nvidia-smi` command output.

`GPUWebSocketServer` periodically calls the collector and broadcasts each snapshot to connected browser clients.

`GPUMonitorTUI` calls the same collector directly and renders a terminal dashboard with GPU cards and a process table.

The React application stores the latest snapshot and short utilization history in Zustand. When the WebSocket stream is unavailable, a mock data engine keeps the interface usable for development and demos.

## Data Shape

Each update is a JSON object with a timestamp and a list of GPUs:

```json
{
  "timestamp": 1760000000000,
  "gpus": [
    {
      "id": 0,
      "name": "NVIDIA GeForce RTX 4090",
      "temperature": 63,
      "powerDraw": 221.5,
      "powerLimit": 450.0,
      "fanSpeed": 58,
      "utilization": 84,
      "memoryUsed": 10240,
      "memoryTotal": 24576,
      "processes": [
        {
          "pid": 4242,
          "type": "C",
          "name": "python",
          "gpuId": 0,
          "memoryUsage": 2048,
          "user": "alice",
          "uid": "1001",
          "cmdLine": "python train.py"
        }
      ]
    }
  ]
}
```

Memory values are reported in MiB. Power values are reported in watts.

## Control Flow

```text
NVML or nvidia-smi
        |
        v
  GPUCollector
   |        |
   |        v
   |   GPUMonitorTUI
   v
GPUWebSocketServer
        |
        v
React dashboard
```

## Interfaces

- Python package: `gpumon`
- CLI: `gpumon tui`, `gpumon server`, `gpumon web`
- WebSocket payload: dashboard snapshot JSON
- Frontend entry point: `app/src/App.tsx`

## Constraints and Tradeoffs

NVML gives direct access to structured metrics, but some machines only expose `nvidia-smi`. The fallback parser keeps the tool useful in constrained environments at the cost of less process detail.

The web dashboard is a static Vite application. This keeps deployment simple, but it means the browser must connect directly to the WebSocket stream.

The terminal UI is optimized for quick local inspection. It does not attempt to provide every dashboard interaction available in the browser.

## Extension Points

- Add additional collector backends for non-NVIDIA hardware.
- Add optional Prometheus export beside the WebSocket stream.
- Add persistent history storage for long-running monitoring sessions.
- Add authenticated reverse-proxy deployment guidance for shared servers.
