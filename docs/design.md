# Design

## Goal

GPU Monitor provides a compact view of NVIDIA GPU health and process usage for local workstations and remote servers. It should be usable from a terminal over SSH and from a browser dashboard on the same machine or network.

## Non-Goals

- It does not modify GPU state.
- It does not kill, pause, or reprioritize GPU processes.
- It does not store historical metrics beyond the short browser-side chart window.
- It does not replace fleet observability systems such as Prometheus and Grafana.

## Core Pieces

The Rust binary reads GPU snapshots from `nvidia-smi`, serves a WebSocket metric stream, can serve the built React dashboard, and includes a compact terminal view.

The React application stores the latest snapshot and short utilization history in Zustand. When the WebSocket stream is unavailable, a mock data engine keeps the interface usable for development and demos.

The terminal UI uses the same snapshot model, but presents it as a compact navigation flow: an overview page, a per-GPU detail page, a global process page, and a per-process detail page.

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
          "name": "train",
          "gpuId": 0,
          "memoryUsage": 2048,
          "user": "alice",
          "uid": "1001",
          "cmdLine": "train --model resnet"
        }
      ]
    }
  ],
  "source": "nvidia-smi"
}
```

Memory values are reported in MiB. Power values are reported in watts.

## Control Flow

```text
nvidia-smi
    |
    v
Rust binary
  |      |\
  |      | \--> terminal UI
  |      |
  |      v
  |   WebSocket stream
  v
React dashboard
```

## Interfaces

- CLI: `./gpu-monitor web`, `./gpu-monitor server`, `./gpu-monitor tui`
- WebSocket payload: dashboard snapshot JSON
- Frontend entry point: `app/src/App.tsx`

## Extension Points

- Add additional collector backends for non-NVIDIA hardware.
- Add optional Prometheus export beside the WebSocket stream.
- Add persistent history storage for long-running monitoring sessions.
- Add authenticated reverse-proxy deployment guidance for shared servers.
