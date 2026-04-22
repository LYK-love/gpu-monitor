# Workflows

## One-Command Local Monitoring

For servers where the active conda environment changes often, bootstrap the project-local environment once:

```bash
scripts/bootstrap
```

Then run:

```bash
scripts/gpumon web --port 8765
```

This command starts the backend WebSocket server, serves the built frontend over local HTTP, and opens the dashboard in a browser.

Default ports:

- `8765`: WebSocket backend
- `8766`: dashboard HTTP page

If the backend is running on a machine without NVML or `nvidia-smi`, the browser shows mock data while keeping the connection status separate from network offline state.

## Local Development

Install the project-local runtime:

```bash
scripts/bootstrap
```

Install frontend dependencies:

```bash
cd app
npm ci
```

Run the metric stream:

```bash
scripts/gpumon server --port 8765
```

This is the backend only. In a second terminal, run the frontend:

```bash
cd app
npm run dev
```

Do not also run `gpumon web --port 8765` while this backend is running, because `gpumon web` starts its own backend on the same port.

## Terminal Monitoring

Use the TUI for SSH sessions or machines where a browser is not convenient:

```bash
scripts/gpumon tui
```

## Static Dashboard Build

Build the dashboard:

```bash
cd app
npm run build
```

Open it with the helper command:

```bash
scripts/gpumon web
```

## Verification

Run backend tests:

```bash
PYTHONPATH=src python -m unittest discover -s tests -v
```

Run frontend checks:

```bash
cd app
npm run lint
npm run build
```

GitHub Actions runs the same Python unit tests, frontend lint, and frontend build on `push` and `pull_request`.
