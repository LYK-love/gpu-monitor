# Workflows

## Install And Update

Install or rebuild the local checkout:

```bash
./install.sh
```

`install.sh` builds both project halves:

- `app/dist`: the React dashboard bundle
- `target/release/gpu-monitor`: the Rust CLI / server / TUI binary

After pulling updates, run the installer again:

```bash
git pull
./install.sh
```

Use the same rebuild path after changing Rust files, frontend files, or frontend dependencies.

## Local Monitoring

Run the dashboard:

```bash
./gpu-monitor web
```

Default ports:

- `8766`: dashboard HTTP page
- `8765`: preferred WebSocket metric stream

If `8765` is already busy, the command chooses a free WebSocket port and connects the dashboard to it automatically.

## Local Development

Run Rust checks from the repository root:

```bash
cargo fmt --check
cargo check
```

Run the metric stream:

```bash
./gpu-monitor server --port 8765
```

Run the frontend in a second terminal:

```bash
cd app
npm run dev
```

Run frontend checks from `app/`:

```bash
npm run lint
npm run build
```

## Terminal Monitoring

```bash
./gpu-monitor tui
```

Controls:

- `j` / Down: select next GPU
- `k` / Up: select previous GPU
- Tab / Left / Right: switch views
- `1`: Overview
- `2`: Processes
- `q`, Esc, or Ctrl+C: quit

## Verification

```bash
cargo fmt --check
cargo check

cd app
npm run lint
npm run build
```
