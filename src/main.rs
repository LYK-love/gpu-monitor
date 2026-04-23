use std::{
    collections::HashMap,
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    process::{Command as StdCommand, Stdio},
    sync::{Mutex, OnceLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use anyhow::{anyhow, Context, Result};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::{header, HeaderValue},
    middleware::map_response,
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use clap::{Parser, Subcommand};
use futures_util::{sink::SinkExt, StreamExt};
use serde::Serialize;
use tokio::{net::TcpListener, process::Command as TokioCommand, signal, sync::broadcast, time};
use tower_http::services::ServeDir;

const DATA_HELP: &str = "\
Data fields:
  GPU overview:
    util       GPU utilization percentage reported by nvidia-smi
    vram       used / total GPU memory
    temp       current GPU temperature
    power      current power draw / enforced power limit
    processes  number of GPU compute processes on that GPU

  Process table:
    GPU        GPU index that owns the process
    PID        operating-system process id
    User       username resolved from UID when available
    UID        numeric user id
    Type       C means compute process
    VRAM       GPU memory used by the process
    Command    full process command line when available

  Bottom status:
    avg temp      average temperature across GPUs
    sum power     sum of current power draw across GPUs
    sum vram      sum of used VRAM across GPUs
    sum capacity  sum of total VRAM capacity across GPUs
    system cpu    current host CPU utilization
    system mem    current host memory utilization

  Resource chart:
    cpu        current host CPU utilization
    mem        current host memory utilization
    gpu N      utilization percentage for GPU N, not VRAM usage";

#[derive(Parser)]
#[command(name = "gpumon")]
#[command(about = "Monitor NVIDIA GPU metrics in a terminal or web dashboard.")]
#[command(after_help = DATA_HELP)]
struct Cli {
    #[command(subcommand)]
    command: CommandKind,
}

#[derive(Subcommand)]
enum CommandKind {
    Tui {
        #[arg(long, default_value_t = 1.0)]
        interval: f64,
    },
    Server {
        #[arg(long, default_value = "0.0.0.0")]
        host: String,
        #[arg(long, default_value_t = 8765)]
        port: u16,
        #[arg(long, default_value_t = 1.0)]
        interval: f64,
    },
    Web {
        #[arg(long, default_value = "0.0.0.0")]
        host: String,
        #[arg(long, default_value_t = 8765)]
        port: u16,
        #[arg(long, default_value_t = 1.0)]
        interval: f64,
        #[arg(long, default_value = "127.0.0.1")]
        web_host: String,
        #[arg(long, default_value_t = 8766)]
        web_port: u16,
        #[arg(long, env = "GPUMON_FONT", default_value = "Fira Code")]
        font: String,
        #[arg(
            long,
            env = "GPUMON_FONT_CSS",
            default_value = "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&display=swap"
        )]
        font_css: String,
        #[arg(long)]
        no_open: bool,
    },
}

#[derive(Clone)]
struct AppState {
    tx: broadcast::Sender<String>,
}

#[derive(Clone)]
struct WebState {
    ws_url: String,
    font: String,
    font_css: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GpuProcess {
    pid: u32,
    #[serde(rename = "type")]
    kind: String,
    name: String,
    gpu_id: u32,
    memory_usage: u64,
    user: String,
    uid: String,
    cmd_line: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GpuData {
    id: u32,
    name: String,
    temperature: u32,
    power_draw: f64,
    power_limit: f64,
    fan_speed: u32,
    utilization: u32,
    memory_used: u64,
    memory_total: u64,
    processes: Vec<GpuProcess>,
    #[serde(skip_serializing)]
    uuid: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemData {
    cpu_utilization: f64,
    memory_used: u64,
    memory_total: u64,
}

#[derive(Debug, Serialize)]
struct Snapshot {
    timestamp: u128,
    gpus: Vec<GpuData>,
    system: SystemData,
    source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        CommandKind::Tui { interval } => run_tui(interval).await,
        CommandKind::Server {
            host,
            port,
            interval,
        } => run_ws_server(host, port, interval).await,
        CommandKind::Web {
            host,
            port,
            interval,
            web_host,
            web_port,
            font,
            font_css,
            no_open,
        } => {
            run_web(
                host, port, interval, web_host, web_port, font, font_css, no_open,
            )
            .await
        }
    }
}

async fn run_ws_server(host: String, port: u16, interval: f64) -> Result<()> {
    let addr = BindAddr { host, port };
    let (tx, _) = broadcast::channel(32);
    let app = ws_router(tx.clone());

    tokio::spawn(collector_loop(tx, interval));

    println!("[WS] Starting server on ws://{addr}/gpu-stream");
    println!("[WS] Refresh interval: {interval}s");
    serve_bind(addr, app).await
}

async fn run_web(
    host: String,
    port: u16,
    interval: f64,
    web_host: String,
    web_port: u16,
    font: String,
    font_css: String,
    no_open: bool,
) -> Result<()> {
    let root = project_root()?;
    let app_dir = root.join("app");
    let dist_dir = app_dir.join("dist");

    if let Some(reason) = web_build_reason(&app_dir, &dist_dir)? {
        println!("[WEB] Building web app ({reason})...");
        let status = TokioCommand::new("npm")
            .arg("run")
            .arg("build")
            .current_dir(&app_dir)
            .status()
            .await
            .context("failed to run npm build")?;
        if !status.success() {
            return Err(anyhow!("npm run build failed"));
        }
    }

    let requested_ws_addr = BindAddr { host, port };
    let web_addr = BindAddr {
        host: web_host.clone(),
        port: web_port,
    };
    let browser_host = if web_host == "0.0.0.0" {
        "127.0.0.1"
    } else {
        web_host.as_str()
    };
    let dashboard_url = format!("http://{browser_host}:{web_port}/");

    let (ws_listener, actual_ws_port) = bind_websocket_listener(&requested_ws_addr).await?;
    let ws_host_for_browser = if requested_ws_addr.host == "0.0.0.0" {
        browser_host
    } else {
        requested_ws_addr.host.as_str()
    };
    let ws_url = format!("ws://{ws_host_for_browser}:{actual_ws_port}/gpu-stream");

    let (tx, _) = broadcast::channel(32);
    let ws_app = ws_router(tx.clone());
    let web_app = web_router(dist_dir, ws_url.clone(), font.clone(), font_css.clone());
    tokio::spawn(collector_loop(tx, interval));

    tokio::spawn(async move {
        if let Err(err) = serve_listener(ws_listener, ws_app).await {
            eprintln!("[WS] Server error: {err:#}");
        }
    });

    println!("[WEB] Serving dashboard on http://{web_addr}/");
    println!("[WEB] WebSocket server running at {ws_url}");
    println!("[WEB] Font: {font}");
    if !font_css.trim().is_empty() {
        println!("[WEB] Font CSS: {font_css}");
    }
    println!("[WEB] Press Ctrl+C to stop");

    if !no_open {
        try_open_browser(&dashboard_url).await;
    }

    serve_bind(web_addr, web_app).await
}

async fn run_tui(interval: f64) -> Result<()> {
    loop {
        let snapshot = collect_snapshot().await;
        print!("\x1b[2J\x1b[H");
        match snapshot.error.as_deref() {
            Some(error) => println!("GPU Monitor ({}) - {error}", snapshot.source),
            None => println!("GPU Monitor ({})", snapshot.source),
        }
        println!(
            "{:<4} {:<32} {:>6} {:>9} {:>12} {:>9}",
            "ID", "Name", "Temp", "Power", "Memory", "Util"
        );
        for gpu in snapshot.gpus {
            println!(
                "{:<4} {:<32} {:>5}C {:>6.1}/{:<4.0}W {:>5}/{:<5}MB {:>8}%",
                gpu.id,
                truncate(&gpu.name, 32),
                gpu.temperature,
                gpu.power_draw,
                gpu.power_limit,
                gpu.memory_used,
                gpu.memory_total,
                gpu.utilization
            );
        }
        time::sleep(interval_duration(interval)).await;
    }
}

fn ws_router(tx: broadcast::Sender<String>) -> Router {
    Router::new()
        .route("/gpu-stream", get(ws_handler))
        .route("/", get(ws_handler))
        .with_state(AppState { tx })
}

fn web_router(dist_dir: PathBuf, ws_url: String, font: String, font_css: String) -> Router {
    Router::new()
        .route("/gpumon-config.js", get(config_handler))
        .fallback_service(ServeDir::new(dist_dir))
        .layer(map_response(disable_cache))
        .with_state(WebState {
            ws_url,
            font,
            font_css,
        })
}

async fn disable_cache(mut response: Response) -> Response {
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-store, no-cache, must-revalidate"),
    );
    response
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state.tx.subscribe()))
}

async fn config_handler(State(state): State<WebState>) -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "application/javascript")],
        format!(
            "window.__GPUMON_CONFIG__ = {{ wsUrl: {}, fontFamily: {}, fontCssUrl: {} }};",
            serde_json::to_string(&state.ws_url).unwrap_or_else(|_| "\"\"".to_string()),
            serde_json::to_string(&state.font).unwrap_or_else(|_| "\"Fira Code\"".to_string()),
            serde_json::to_string(&state.font_css).unwrap_or_else(|_| "\"\"".to_string())
        ),
    )
}

async fn handle_socket(socket: WebSocket, mut rx: broadcast::Receiver<String>) {
    let (mut sender, _) = socket.split();
    while let Ok(message) = rx.recv().await {
        if sender.send(Message::Text(message)).await.is_err() {
            break;
        }
    }
}

async fn collector_loop(tx: broadcast::Sender<String>, interval: f64) {
    let mut ticker = time::interval(interval_duration(interval));
    loop {
        ticker.tick().await;
        let snapshot = collect_snapshot().await;
        match serde_json::to_string(&snapshot) {
            Ok(message) => {
                let _ = tx.send(message);
            }
            Err(err) => eprintln!("[GPU] Failed to serialize snapshot: {err}"),
        }
    }
}

async fn collect_snapshot() -> Snapshot {
    match collect_nvidia_smi().await {
        Ok(gpus) => Snapshot {
            timestamp: now_millis(),
            gpus,
            system: collect_system_data(),
            source: "nvidia-smi".to_string(),
            error: None,
        },
        Err(err) => Snapshot {
            timestamp: now_millis(),
            gpus: Vec::new(),
            system: collect_system_data(),
            source: "unavailable".to_string(),
            error: Some(err.to_string()),
        },
    }
}

async fn collect_nvidia_smi() -> Result<Vec<GpuData>> {
    let output = TokioCommand::new("nvidia-smi")
        .args([
            "--query-gpu=index,uuid,name,temperature.gpu,power.draw,power.limit,utilization.gpu,memory.used,memory.total,fan.speed",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .await
        .context("nvidia-smi not found or failed to start")?;

    if !output.status.success() {
        return Err(anyhow!(String::from_utf8_lossy(&output.stderr)
            .trim()
            .to_string()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut gpus = Vec::new();
    for line in stdout.lines().filter(|line| !line.trim().is_empty()) {
        let cols = csv_cols(line);
        if cols.len() < 10 {
            continue;
        }
        gpus.push(GpuData {
            id: parse_u32(&cols[0]),
            uuid: cols[1].clone(),
            name: cols[2].clone(),
            temperature: parse_u32(&cols[3]),
            power_draw: parse_f64(&cols[4]),
            power_limit: parse_f64(&cols[5]),
            utilization: parse_u32(&cols[6]),
            memory_used: parse_u64(&cols[7]),
            memory_total: parse_u64(&cols[8]),
            fan_speed: parse_u32(&cols[9]),
            processes: Vec::new(),
        });
    }

    attach_processes(&mut gpus).await;
    Ok(gpus)
}

async fn attach_processes(gpus: &mut [GpuData]) {
    let mut by_uuid: HashMap<String, usize> = HashMap::new();
    for (idx, gpu) in gpus.iter().enumerate() {
        by_uuid.insert(gpu.uuid.clone(), idx);
    }

    let output = TokioCommand::new("nvidia-smi")
        .args([
            "--query-compute-apps=pid,gpu_uuid,process_name,used_memory",
            "--format=csv,noheader,nounits",
        ])
        .stderr(Stdio::null())
        .output()
        .await;

    let Ok(output) = output else {
        return;
    };
    if !output.status.success() {
        return;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines().filter(|line| !line.trim().is_empty()) {
        let cols = csv_cols(line);
        if cols.len() < 4 {
            continue;
        }
        let Some(&gpu_pos) = by_uuid.get(&cols[1]) else {
            continue;
        };
        let pid = parse_u32(&cols[0]);
        let proc_info = process_info(pid);
        let gpu_id = gpus[gpu_pos].id;
        gpus[gpu_pos].processes.push(GpuProcess {
            pid,
            kind: "C".to_string(),
            name: cols[2].clone(),
            gpu_id,
            memory_usage: parse_u64(&cols[3]),
            user: proc_info.user,
            uid: proc_info.uid,
            cmd_line: if proc_info.cmd_line.is_empty() {
                cols[2].clone()
            } else {
                proc_info.cmd_line
            },
        });
    }
}

struct ProcInfo {
    user: String,
    uid: String,
    cmd_line: String,
}

fn process_info(pid: u32) -> ProcInfo {
    let mut cmd_line = fs::read_to_string(format!("/proc/{pid}/cmdline"))
        .map(|s| s.replace('\0', " ").trim().to_string())
        .unwrap_or_default();

    if cmd_line.is_empty() {
        cmd_line = ps_field(pid, "args=").unwrap_or_default();
    }

    if cmd_line.is_empty() {
        cmd_line = fs::read_to_string(format!("/proc/{pid}/comm"))
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
    }

    let uid = fs::read_to_string(format!("/proc/{pid}/status"))
        .ok()
        .and_then(|status| {
            status
                .lines()
                .find(|line| line.starts_with("Uid:"))
                .and_then(|line| line.split_whitespace().nth(1))
                .map(str::to_string)
        })
        .unwrap_or_else(|| "unknown".to_string());

    let user = username_for_uid(&uid)
        .or_else(|| getent_username_for_uid(&uid))
        .or_else(|| ps_field(pid, "user="))
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| uid.clone());

    ProcInfo {
        user,
        uid,
        cmd_line,
    }
}

fn username_for_uid(uid: &str) -> Option<String> {
    let passwd = fs::read_to_string("/etc/passwd").ok()?;
    passwd.lines().find_map(|line| {
        let mut parts = line.split(':');
        let name = parts.next()?;
        let _password = parts.next()?;
        let entry_uid = parts.next()?;
        (entry_uid == uid).then(|| name.to_string())
    })
}

fn collect_system_data() -> SystemData {
    let (memory_used, memory_total) = read_memory_usage();
    SystemData {
        cpu_utilization: read_cpu_utilization(),
        memory_used,
        memory_total,
    }
}

fn read_memory_usage() -> (u64, u64) {
    let Ok(meminfo) = fs::read_to_string("/proc/meminfo") else {
        return (0, 0);
    };
    let mut total_kib = 0;
    let mut available_kib = 0;

    for line in meminfo.lines() {
        if line.starts_with("MemTotal:") {
            total_kib = line
                .split_whitespace()
                .nth(1)
                .and_then(|value| value.parse::<u64>().ok())
                .unwrap_or(0);
        } else if line.starts_with("MemAvailable:") {
            available_kib = line
                .split_whitespace()
                .nth(1)
                .and_then(|value| value.parse::<u64>().ok())
                .unwrap_or(0);
        }
    }

    let total_mib = total_kib / 1024;
    let used_mib = total_kib.saturating_sub(available_kib) / 1024;
    (used_mib, total_mib)
}

fn read_cpu_utilization() -> f64 {
    static PREVIOUS_CPU: OnceLock<Mutex<Option<CpuTimes>>> = OnceLock::new();
    let Some(current) = read_cpu_times() else {
        return 0.0;
    };
    let previous = PREVIOUS_CPU.get_or_init(|| Mutex::new(None));
    let Ok(mut previous) = previous.lock() else {
        return 0.0;
    };

    let utilization = previous
        .as_ref()
        .map(|prev| cpu_delta_utilization(prev, &current))
        .unwrap_or(0.0);
    *previous = Some(current);
    utilization
}

#[derive(Clone)]
struct CpuTimes {
    idle: u64,
    total: u64,
}

fn read_cpu_times() -> Option<CpuTimes> {
    let Ok(stat) = fs::read_to_string("/proc/stat") else {
        return None;
    };
    let Some(line) = stat.lines().next() else {
        return None;
    };
    let values: Vec<u64> = line
        .split_whitespace()
        .skip(1)
        .filter_map(|value| value.parse::<u64>().ok())
        .collect();
    if values.len() < 4 {
        return None;
    }

    let idle = values.get(3).copied().unwrap_or(0) + values.get(4).copied().unwrap_or(0);
    let total: u64 = values.iter().sum();
    Some(CpuTimes { idle, total })
}

fn cpu_delta_utilization(previous: &CpuTimes, current: &CpuTimes) -> f64 {
    let total_delta = current.total.saturating_sub(previous.total);
    if total_delta == 0 {
        return 0.0;
    }
    let idle_delta = current.idle.saturating_sub(previous.idle);
    ((total_delta.saturating_sub(idle_delta)) as f64 / total_delta as f64 * 100.0 * 10.0).round()
        / 10.0
}

fn getent_username_for_uid(uid: &str) -> Option<String> {
    let output = StdCommand::new("getent")
        .args(["passwd", uid])
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .next()
        .and_then(|line| line.split(':').next())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
}

fn ps_field(pid: u32, field: &str) -> Option<String> {
    let output = StdCommand::new("ps")
        .args(["-p", &pid.to_string(), "-o", field])
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn csv_cols(line: &str) -> Vec<String> {
    line.split(',')
        .map(|part| part.trim().to_string())
        .collect()
}

fn parse_u32(value: &str) -> u32 {
    parse_f64(value) as u32
}

fn parse_u64(value: &str) -> u64 {
    parse_f64(value) as u64
}

fn parse_f64(value: &str) -> f64 {
    let normalized = value.trim();
    if normalized.is_empty()
        || normalized.eq_ignore_ascii_case("N/A")
        || normalized.eq_ignore_ascii_case("[Not Supported]")
    {
        return 0.0;
    }
    normalized.parse::<f64>().unwrap_or(0.0)
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[derive(Clone)]
struct BindAddr {
    host: String,
    port: u16,
}

impl std::fmt::Display for BindAddr {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}:{}", self.host, self.port)
    }
}

fn interval_duration(interval: f64) -> Duration {
    Duration::from_millis((interval.max(0.1) * 1000.0) as u64)
}

fn truncate(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    value
        .chars()
        .take(max_chars.saturating_sub(1))
        .collect::<String>()
        + "."
}

fn project_root() -> Result<PathBuf> {
    let exe = std::env::current_exe().context("failed to locate current executable")?;
    let cwd = std::env::current_dir().context("failed to locate current directory")?;
    for base in exe.ancestors().chain(cwd.ancestors()) {
        let candidate = base.join("app").join("dist").join("index.html");
        if candidate.exists() {
            return Ok(base.to_path_buf());
        }
    }
    Ok(cwd)
}

fn web_build_reason(app_dir: &Path, dist_dir: &Path) -> Result<Option<String>> {
    let dist_index = dist_dir.join("index.html");
    if !dist_index.exists() {
        return Ok(Some("missing app/dist/index.html".to_string()));
    }

    let dist_mtime = fs::metadata(&dist_index)
        .with_context(|| format!("failed to read metadata for {}", dist_index.display()))?
        .modified()
        .with_context(|| format!("failed to read modified time for {}", dist_index.display()))?;

    let watch_paths = [
        "src",
        "public",
        "index.html",
        "package.json",
        "package-lock.json",
        "vite.config.ts",
        "tailwind.config.js",
        "postcss.config.js",
        "tsconfig.json",
        "tsconfig.app.json",
        "tsconfig.node.json",
        "components.json",
    ];

    let mut newest_source: Option<(SystemTime, PathBuf)> = None;

    for relative in watch_paths {
        let path = app_dir.join(relative);
        if !path.exists() {
            continue;
        }
        if let Some((mtime, changed_path)) = latest_modified_path(&path)? {
            let is_newer = newest_source
                .as_ref()
                .map(|(current, _)| mtime > *current)
                .unwrap_or(true);
            if is_newer {
                newest_source = Some((mtime, changed_path));
            }
        }
    }

    Ok(newest_source.and_then(|(mtime, changed_path)| {
        (mtime > dist_mtime).then(|| {
            let relative = changed_path
                .strip_prefix(app_dir)
                .map(|path| path.display().to_string())
                .unwrap_or_else(|_| changed_path.display().to_string());
            format!("{relative} changed after the last web build")
        })
    }))
}

fn latest_modified_path(path: &Path) -> Result<Option<(SystemTime, PathBuf)>> {
    if !path.exists() {
        return Ok(None);
    }

    let metadata = fs::metadata(path)
        .with_context(|| format!("failed to read metadata for {}", path.display()))?;
    let mut newest = metadata
        .modified()
        .ok()
        .map(|mtime| (mtime, path.to_path_buf()));

    if metadata.is_dir() {
        for entry in fs::read_dir(path)
            .with_context(|| format!("failed to read directory {}", path.display()))?
        {
            let entry =
                entry.with_context(|| format!("failed to read entry in {}", path.display()))?;
            if let Some(candidate) = latest_modified_path(&entry.path())? {
                let is_newer = newest
                    .as_ref()
                    .map(|(current, _)| candidate.0 > *current)
                    .unwrap_or(true);
                if is_newer {
                    newest = Some(candidate);
                }
            }
        }
    }

    Ok(newest)
}

async fn bind_websocket_listener(addr: &BindAddr) -> Result<(TcpListener, u16)> {
    match TcpListener::bind(addr.to_string()).await {
        Ok(listener) => {
            let port = listener
                .local_addr()
                .context("failed to read WebSocket bind address")?
                .port();
            Ok((listener, port))
        }
        Err(err) if err.kind() == ErrorKind::AddrInUse => {
            let fallback = BindAddr {
                host: addr.host.clone(),
                port: 0,
            };
            let listener = TcpListener::bind(fallback.to_string())
                .await
                .with_context(|| format!("failed to bind fallback WebSocket address {fallback}"))?;
            let port = listener
                .local_addr()
                .context("failed to read fallback WebSocket bind address")?
                .port();
            println!(
                "[WEB] WebSocket port {} is already in use; using {} instead",
                addr.port, port
            );
            Ok((listener, port))
        }
        Err(err) => Err(err).with_context(|| format!("failed to bind {addr}")),
    }
}

async fn serve_bind(addr: BindAddr, app: Router) -> Result<()> {
    let listener = TcpListener::bind(addr.to_string())
        .await
        .with_context(|| format!("failed to bind {addr}"))?;
    serve_listener(listener, app).await
}

async fn serve_listener(listener: TcpListener, app: Router) -> Result<()> {
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("server failed")
}

async fn shutdown_signal() {
    let _ = signal::ctrl_c().await;
}

async fn try_open_browser(url: &str) {
    println!("[WEB] Opening dashboard: {url}");
    for program in ["xdg-open", "gio", "gnome-open"] {
        let status = TokioCommand::new(program)
            .arg(url)
            .stderr(Stdio::null())
            .status()
            .await;
        if matches!(status, Ok(status) if status.success()) {
            return;
        }
    }
}
