# Workflows

## Local Monitoring

Build once:

```bash
./install.sh
```

Run the dashboard:

```bash
./gpu-monitor web
```

Default ports:

- `8766`: dashboard HTTP page
- `8765`: preferred WebSocket metric stream

If `8765` is already busy, the command chooses a free WebSocket port and connects the dashboard to it automatically.

## Local Development

Run the metric stream:

```bash
./gpu-monitor server --port 8765
```

Run the frontend in a second terminal:

```bash
cd app
npm run dev
```

## Terminal Monitoring

```bash
./gpu-monitor tui
```

## Verification

```bash
cargo fmt --check
cargo check

cd app
npm run lint
npm run build
```
