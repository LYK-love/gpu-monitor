# CLI

Build or update the local checkout:

```bash
./install.sh
```

The project contains a Rust backend/CLI and a React dashboard. `./install.sh` builds `app/dist` first, then builds the Rust release binary. Run it again after `git pull` or after changing either side of the project.

`install.sh` also copies the built dashboard to `${XDG_DATA_HOME:-$HOME/.local/share}/gpu-monitor/app/dist`, so the installed `gpu-monitor` binary can serve the web UI from `PATH` without depending on the repository layout.

All commands support `-h` / `--help`.

Run commands through the root launcher:

```bash
./gpu-monitor --help
./gpu-monitor web
./gpu-monitor tui
./gpu-monitor server
```

After installation, you can also use the installed command directly:

```bash
gpu-monitor web
gpu-monitor tui
```

## `web`

Starts the metric stream, serves the dashboard, and prints the browser URL.

```bash
./gpu-monitor web
```

Defaults:

```text
Dashboard:  http://127.0.0.1:8766/
Metric WS:  ws://127.0.0.1:8765/gpu-stream
```

Options:

- `--host`: metric stream bind host, default `0.0.0.0`
- `--port`: preferred metric stream port, default `8765`
- `--interval`: GPU polling interval in seconds, default `1.0`
- `--web-host`: dashboard bind host, default `127.0.0.1`
- `--web-port`: dashboard HTTP port, default `8766`
- `--font`: dashboard font family, default `Fira Code`
- `--font-css`: optional web font CSS URL, default Google Fonts CSS for Fira Code
- `--no-open`: print the URL without trying to open a browser

If the preferred metric stream port is already busy, `web` automatically chooses another free port and injects it into the dashboard.

You can also set the font through an environment variable:

```bash
GPUMON_FONT="JetBrains Mono" ./gpu-monitor web
GPUMON_FONT_CSS="" ./gpu-monitor web
```

If the font is not installed locally, the browser can load it from `--font-css`. Point this option at Google Fonts, a CDN, or an internal static CSS file.

## `tui`

Shows an interactive terminal dashboard:

```bash
./gpu-monitor tui
```

Views:

- `Overview`: compact GPU list, selected GPU details, utilization history, and that GPU's top processes
- `Processes`: full process table across all GPUs

Controls:

- `j` / Down: select next GPU
- `k` / Up: select previous GPU
- Tab / Left / Right: switch views
- `1`: Overview
- `2`: Processes
- `q`, Esc, or Ctrl+C: quit

Use `--interval` to change the refresh rate:

```bash
./gpu-monitor tui --interval 0.5
```

## `server`

Starts only the WebSocket metric stream:

```bash
./gpu-monitor server --host 0.0.0.0 --port 8765 --interval 1
```

The stream is available at `/gpu-stream`.

## Data Fields

GPU table:

- `util`: GPU utilization percentage reported by `nvidia-smi`
- `vram`: used / total GPU memory
- `temp`: current GPU temperature
- `power`: current power draw / enforced power limit
- `processes`: number of GPU compute processes currently attached to that GPU

Process table:

- `GPU`: GPU index that owns the process
- `PID`: operating-system process id
- `User`: username resolved from UID when available
- `UID`: numeric user id
- `Type`: `C` means compute process
- `VRAM`: GPU memory used by the process
- `Command`: full process command line when available

Bottom status:

- `avg temp`: average temperature across GPUs
- `sum power`: sum of current power draw across GPUs
- `sum vram`: sum of used VRAM across GPUs
- `sum capacity`: sum of total VRAM capacity across GPUs
- `system cpu`: current host CPU utilization
- `system mem`: current host memory utilization

Resource chart:

- `cpu`: current host CPU utilization
- `mem`: current host memory utilization
- `gpu N`: utilization percentage for GPU `N`, not VRAM usage
