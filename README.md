# GPU Monitor

> You can use AI to translate or explain this document and the rest of the project's documentation in your preferred language.
>
> 你可以使用 AI 将本文档和本项目的其他文档翻译成你偏好的语言，或为你解读其中的内容。

GPU Monitor is a small NVIDIA GPU dashboard. It ships as a Rust binary with a React web UI and reads live metrics from `nvidia-smi`.

## Demo

`gpu-monitor tui` opens an interactive text-based user interfaces (TUI):

![tui_overview](./assets/tui_overview.png)

`gpu-monitor web` opens an interactive web page:

![web_overview](./assets/web_overview.png)

## Requirements

- Rust 1.80 or newer
- Node.js 20 or newer
- NVIDIA drivers with `nvidia-smi`

## Install And Update

```bash
./install.sh
```

That command installs the local project build. It does two things:

1. Builds the React dashboard in `app/dist` and copies it to the local data directory at `${XDG_DATA_HOME:-$HOME/.local/share}/gpu-monitor/app/dist`.
2. Builds the Rust release binary in `target/release/gpu-monitor`.
3. Install the Rust binary. 

Run `./install.sh` whenever Rust code, frontend code, or frontend dependencies change. 

## Use

### TUI

Start TUI:
```bash
gpu-monitor tui
```

### Web
Start the dashboard:

```bash
gpu-monitor web
```

Then open the printed URL, usually:

```text
http://127.0.0.1:8766/
```

The command starts both the WebSocket metric stream and the web dashboard. If the default WebSocket port `8765` is already busy, it automatically picks a free port and connects the page to it.

Useful options:

```bash
gpu-monitor web --web-port 8770 # Only change the web service port, leaving the WebSocket port unchanged
gpu-monitor web --font "Fira Code"
```

## Development

```bash
cargo fmt --check
cargo check

cd app
npm run lint
npm run build
```

For frontend-only development, start the metric stream and Vite separately:

```bash
gpu-monitor server --port 8765

cd app
npm run dev
```

## Documentation

- [CLI](docs/cli.md)
- [Design](docs/design.md)
- [Workflows](docs/workflows.md)

## License

MIT

This project was written collaboratively by humans and AI.
