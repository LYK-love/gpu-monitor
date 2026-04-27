use std::{
    collections::HashMap,
    fs,
    io::{self, ErrorKind},
    path::{Path, PathBuf},
    process::{Command as StdCommand, Stdio},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
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
use crossterm::{
    event::{self, Event, KeyCode, KeyEventKind, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use futures_util::{sink::SinkExt, StreamExt};
use ratatui::{
    prelude::*,
    widgets::{Block, Borders, Cell, Gauge, Paragraph, Row, Table, Wrap},
};
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
    enable_raw_mode().context("failed to enable terminal raw mode")?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen).context("failed to enter alternate screen")?;
    let _cleanup = TerminalCleanup;

    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend).context("failed to initialize terminal")?;
    terminal.clear().context("failed to clear terminal")?;
    let mut app = TuiApp::default();

    loop {
        let snapshot = collect_snapshot().await;
        app.update(&snapshot);
        terminal
            .draw(|frame| draw_tui(frame, &snapshot, &app, interval))
            .context("failed to draw terminal UI")?;

        let deadline = Instant::now() + interval_duration(interval);
        while Instant::now() < deadline {
            let wait = deadline.saturating_duration_since(Instant::now());
            if wait.is_zero() {
                break;
            }
            if event::poll(wait.min(Duration::from_millis(100)))
                .context("failed to poll terminal events")?
            {
                if handle_tui_event(
                    event::read().context("failed to read terminal event")?,
                    &mut app,
                    &snapshot,
                ) {
                    return Ok(());
                }
                terminal
                    .draw(|frame| draw_tui(frame, &snapshot, &app, interval))
                    .context("failed to draw terminal UI")?;
                continue;
            }
        }
    }
}

#[derive(Clone, Copy, Default, PartialEq, Eq)]
enum TuiTab {
    #[default]
    Overview,
    Processes,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ReturnTarget {
    Processes,
    GpuDetail {
        gpu_index: usize,
        selected_process: usize,
    },
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum TuiPage {
    Overview,
    Processes,
    GpuDetail {
        gpu_index: usize,
        selected_process: usize,
    },
    ProcessDetail {
        gpu_id: u32,
        pid: u32,
        return_to: ReturnTarget,
    },
}

#[derive(Default)]
struct TuiApp {
    selected_gpu: usize,
    selected_process: usize,
    tab: TuiTab,
    page: TuiPage,
}

impl Default for TuiPage {
    fn default() -> Self {
        Self::Overview
    }
}

impl TuiApp {
    fn update(&mut self, snapshot: &Snapshot) {
        if !snapshot.gpus.is_empty() {
            self.selected_gpu = self.selected_gpu.min(snapshot.gpus.len() - 1);
        } else {
            self.selected_gpu = 0;
        }

        self.page = match self.page {
            TuiPage::Overview => TuiPage::Overview,
            TuiPage::Processes => {
                let count = flatten_processes(snapshot).len();
                if count == 0 {
                    self.selected_process = 0;
                } else {
                    self.selected_process = self.selected_process.min(count - 1);
                }
                TuiPage::Processes
            }
            TuiPage::GpuDetail {
                gpu_index,
                selected_process,
            } => {
                if let Some(gpu) = snapshot.gpus.get(gpu_index) {
                    let process_count = gpu.processes.len();
                    TuiPage::GpuDetail {
                        gpu_index,
                        selected_process: selected_process.min(process_count.saturating_sub(1)),
                    }
                } else {
                    TuiPage::Overview
                }
            }
            TuiPage::ProcessDetail {
                gpu_id,
                pid,
                return_to,
            } => {
                if find_process(snapshot, gpu_id, pid).is_some() {
                    TuiPage::ProcessDetail {
                        gpu_id,
                        pid,
                        return_to,
                    }
                } else {
                    match return_to {
                        ReturnTarget::Processes => TuiPage::Processes,
                        ReturnTarget::GpuDetail {
                            gpu_index,
                            selected_process,
                        } => TuiPage::GpuDetail {
                            gpu_index,
                            selected_process,
                        },
                    }
                }
            }
        };
    }

    fn select_next_gpu(&mut self, gpu_count: usize) {
        if gpu_count > 0 {
            self.selected_gpu = (self.selected_gpu + 1).min(gpu_count - 1);
        }
    }

    fn select_previous_gpu(&mut self) {
        self.selected_gpu = self.selected_gpu.saturating_sub(1);
    }

    fn toggle_tab(&mut self) {
        if matches!(self.page, TuiPage::Overview | TuiPage::Processes) {
            self.page = match self.page {
                TuiPage::Overview => TuiPage::Processes,
                TuiPage::Processes => TuiPage::Overview,
                _ => self.page,
            };
            self.tab = match self.page {
                TuiPage::Overview => TuiTab::Overview,
                TuiPage::Processes => TuiTab::Processes,
                _ => self.tab,
            };
        }
    }

    fn open_selected_gpu(&mut self) {
        self.page = TuiPage::GpuDetail {
            gpu_index: self.selected_gpu,
            selected_process: 0,
        };
    }

    fn open_selected_process(&mut self, snapshot: &Snapshot) {
        match self.page {
            TuiPage::Processes => {
                if let Some((gpu_id, pid)) = selected_process_ref(snapshot, self.selected_process) {
                    self.page = TuiPage::ProcessDetail {
                        gpu_id,
                        pid,
                        return_to: ReturnTarget::Processes,
                    };
                }
            }
            TuiPage::GpuDetail {
                gpu_index,
                selected_process,
            } => {
                if let Some(gpu) = snapshot.gpus.get(gpu_index) {
                    if let Some(process) = gpu.processes.get(selected_process) {
                        self.page = TuiPage::ProcessDetail {
                            gpu_id: process.gpu_id,
                            pid: process.pid,
                            return_to: ReturnTarget::GpuDetail {
                                gpu_index,
                                selected_process,
                            },
                        };
                    }
                }
            }
            _ => {}
        }
    }

    fn back(&mut self) {
        self.page = match self.page {
            TuiPage::GpuDetail { .. } => TuiPage::Overview,
            TuiPage::ProcessDetail { return_to, .. } => match return_to {
                ReturnTarget::Processes => TuiPage::Processes,
                ReturnTarget::GpuDetail {
                    gpu_index,
                    selected_process,
                } => TuiPage::GpuDetail {
                    gpu_index,
                    selected_process,
                },
            },
            page => page,
        };
        self.tab = match self.page {
            TuiPage::Overview | TuiPage::GpuDetail { .. } => TuiTab::Overview,
            TuiPage::Processes | TuiPage::ProcessDetail { .. } => TuiTab::Processes,
        };
    }
}

struct TerminalCleanup;

impl Drop for TerminalCleanup {
    fn drop(&mut self) {
        let _ = disable_raw_mode();
        let _ = execute!(io::stdout(), LeaveAlternateScreen);
    }
}

fn handle_tui_event(event: Event, app: &mut TuiApp, snapshot: &Snapshot) -> bool {
    match event {
        Event::Key(key) if key.kind == KeyEventKind::Press => {
            if matches!(key.code, KeyCode::Char('q') | KeyCode::Esc)
                || (matches!(key.code, KeyCode::Char('c'))
                    && key.modifiers.contains(KeyModifiers::CONTROL))
            {
                if matches!(
                    app.page,
                    TuiPage::GpuDetail { .. } | TuiPage::ProcessDetail { .. }
                ) && key.code == KeyCode::Esc
                {
                    app.back();
                    return false;
                }
                return true;
            }

            match app.page {
                TuiPage::Overview => match key.code {
                    KeyCode::Down | KeyCode::Char('j') => app.select_next_gpu(snapshot.gpus.len()),
                    KeyCode::Up | KeyCode::Char('k') => app.select_previous_gpu(),
                    KeyCode::Enter => app.open_selected_gpu(),
                    KeyCode::Tab | KeyCode::Right => app.toggle_tab(),
                    KeyCode::Char('1') => {
                        app.page = TuiPage::Overview;
                        app.tab = TuiTab::Overview;
                    }
                    KeyCode::Char('2') => {
                        app.page = TuiPage::Processes;
                        app.tab = TuiTab::Processes;
                    }
                    _ => {}
                },
                TuiPage::Processes => match key.code {
                    KeyCode::Down | KeyCode::Char('j') => {
                        let count = flatten_processes(snapshot).len();
                        if count > 0 {
                            app.selected_process = (app.selected_process + 1).min(count - 1);
                        }
                    }
                    KeyCode::Up | KeyCode::Char('k') => {
                        app.selected_process = app.selected_process.saturating_sub(1);
                    }
                    KeyCode::Enter => app.open_selected_process(snapshot),
                    KeyCode::Tab | KeyCode::Right => app.toggle_tab(),
                    KeyCode::Char('1') => {
                        app.page = TuiPage::Overview;
                        app.tab = TuiTab::Overview;
                    }
                    KeyCode::Char('2') => {
                        app.page = TuiPage::Processes;
                        app.tab = TuiTab::Processes;
                    }
                    _ => {}
                },
                TuiPage::GpuDetail {
                    gpu_index,
                    selected_process,
                } => match key.code {
                    KeyCode::Down | KeyCode::Char('j') => {
                        if let Some(gpu) = snapshot.gpus.get(gpu_index) {
                            if !gpu.processes.is_empty() {
                                let next = (selected_process + 1).min(gpu.processes.len() - 1);
                                app.page = TuiPage::GpuDetail {
                                    gpu_index,
                                    selected_process: next,
                                };
                            }
                        }
                    }
                    KeyCode::Up | KeyCode::Char('k') => {
                        app.page = TuiPage::GpuDetail {
                            gpu_index,
                            selected_process: selected_process.saturating_sub(1),
                        };
                    }
                    KeyCode::Enter => app.open_selected_process(snapshot),
                    _ => {}
                },
                TuiPage::ProcessDetail { .. } => match key.code {
                    KeyCode::Enter => {}
                    _ => {}
                },
            }
            false
        }
        _ => false,
    }
}

fn draw_tui(frame: &mut Frame<'_>, snapshot: &Snapshot, app: &TuiApp, interval: f64) {
    let area = frame.area();
    let layout = Layout::vertical([
        Constraint::Length(4),
        Constraint::Min(10),
        Constraint::Length(1),
    ])
    .split(area);

    draw_tui_header(frame, snapshot, app, interval, layout[0]);
    match app.page {
        TuiPage::Overview => draw_tui_overview(frame, snapshot, app, layout[1]),
        TuiPage::Processes => draw_tui_processes(frame, snapshot, app, layout[1]),
        TuiPage::GpuDetail {
            gpu_index,
            selected_process,
        } => draw_gpu_detail(frame, snapshot, gpu_index, selected_process, layout[1]),
        TuiPage::ProcessDetail { gpu_id, pid, .. } => {
            draw_process_detail(frame, snapshot, gpu_id, pid, layout[1])
        }
    }
    draw_tui_footer(frame, app, layout[2]);
}

fn draw_tui_header(
    frame: &mut Frame<'_>,
    snapshot: &Snapshot,
    app: &TuiApp,
    interval: f64,
    area: Rect,
) {
    let total_gpu_memory_used: u64 = snapshot.gpus.iter().map(|gpu| gpu.memory_used).sum();
    let total_gpu_memory: u64 = snapshot.gpus.iter().map(|gpu| gpu.memory_total).sum();
    let total_power_draw: f64 = snapshot.gpus.iter().map(|gpu| gpu.power_draw).sum();
    let total_power_limit: f64 = snapshot.gpus.iter().map(|gpu| gpu.power_limit).sum();
    let avg_gpu_util = average_u32(snapshot.gpus.iter().map(|gpu| gpu.utilization));
    let process_count: usize = snapshot.gpus.iter().map(|gpu| gpu.processes.len()).sum();

    let title = Line::from(vec![
        Span::styled(
            " GPUMON ",
            Style::default().fg(Color::Black).bg(Color::Cyan).bold(),
        ),
        Span::raw(" "),
        Span::styled(
            format!("{} ", format_timestamp(snapshot.timestamp)),
            Style::default().fg(Color::Gray),
        ),
        Span::raw(format!("refresh {:.1}s  ", interval)),
        Span::styled(
            format!("source {}", snapshot.source),
            Style::default().fg(if snapshot.error.is_some() {
                Color::Red
            } else {
                Color::Green
            }),
        ),
        Span::raw("  "),
        Span::styled(
            page_label(&app.page),
            Style::default().fg(Color::Cyan).bold(),
        ),
    ]);

    let summary = Line::from(vec![
        Span::raw(format!("GPUs {} | ", snapshot.gpus.len())),
        Span::raw(format!("Procs {} | ", process_count)),
        Span::styled(
            format!("GPU {}% | ", avg_gpu_util),
            metric_style(avg_gpu_util),
        ),
        Span::raw(format!(
            "VRAM {}/{} | ",
            format_mib(total_gpu_memory_used),
            format_mib(total_gpu_memory)
        )),
        Span::raw(format!(
            "Pwr {:.0}/{:.0}W | ",
            clean_f64(total_power_draw),
            clean_f64(total_power_limit)
        )),
        Span::raw(format!("CPU {:.1}%", snapshot.system.cpu_utilization)),
    ]);

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::DarkGray));
    let paragraph = Paragraph::new(vec![title, summary])
        .block(block)
        .wrap(Wrap { trim: true });
    frame.render_widget(paragraph, area);
}

fn draw_tui_overview(frame: &mut Frame<'_>, snapshot: &Snapshot, app: &TuiApp, area: Rect) {
    let columns =
        Layout::horizontal([Constraint::Percentage(38), Constraint::Percentage(62)]).split(area);
    draw_gpu_list(frame, snapshot, app, columns[0]);
    draw_selected_gpu(frame, snapshot, app, columns[1]);
}

fn draw_gpu_list(frame: &mut Frame<'_>, snapshot: &Snapshot, app: &TuiApp, area: Rect) {
    if snapshot.gpus.is_empty() {
        frame.render_widget(
            Paragraph::new(
                snapshot
                    .error
                    .as_deref()
                    .unwrap_or("No GPU data available. Check nvidia-smi and driver access."),
            )
            .block(
                Block::default()
                    .title(" GPUs ")
                    .title_style(Style::default().fg(Color::Cyan).bold())
                    .borders(Borders::ALL)
                    .border_style(Style::default().fg(Color::DarkGray)),
            )
            .style(Style::default().fg(Color::Yellow))
            .wrap(Wrap { trim: true }),
            area,
        );
        return;
    }

    let rows = snapshot.gpus.iter().enumerate().map(|(index, gpu)| {
        let memory_pct = percent_u64(gpu.memory_used, gpu.memory_total);
        let style = if index == app.selected_gpu {
            Style::default().fg(Color::Black).bg(Color::Cyan).bold()
        } else {
            Style::default().fg(Color::White)
        };
        Row::new(vec![
            Cell::from(format!("{}", gpu.id)),
            Cell::from(truncate(&gpu.name, 24)),
            Cell::from(format!("{}%", gpu.utilization)),
            Cell::from(format!("{}%", memory_pct)),
            Cell::from(format!("{}C", gpu.temperature)),
        ])
        .style(style)
    });

    let table = Table::new(
        rows,
        [
            Constraint::Length(4),
            Constraint::Min(12),
            Constraint::Length(7),
            Constraint::Length(7),
            Constraint::Length(6),
        ],
    )
    .header(
        Row::new(["ID", "Name", "Util", "VRAM", "Temp"])
            .style(Style::default().fg(Color::DarkGray)),
    )
    .block(
        Block::default()
            .title(" GPUs ")
            .title_style(Style::default().fg(Color::Cyan).bold())
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::DarkGray)),
    );
    frame.render_widget(table, area);
}

fn draw_selected_gpu(frame: &mut Frame<'_>, snapshot: &Snapshot, app: &TuiApp, area: Rect) {
    let Some(gpu) = snapshot.gpus.get(app.selected_gpu) else {
        frame.render_widget(
            Paragraph::new("No selected GPU")
                .block(Block::default().borders(Borders::ALL))
                .style(Style::default().fg(Color::DarkGray)),
            area,
        );
        return;
    };

    let memory_pct = percent_u64(gpu.memory_used, gpu.memory_total);
    let block = Block::default()
        .title(format!(
            " GPU {}  {} ",
            gpu.id,
            truncate(&gpu.name, area.width.saturating_sub(16) as usize)
        ))
        .title_style(Style::default().fg(Color::White).bold())
        .borders(Borders::ALL)
        .border_style(Style::default().fg(metric_color(gpu.utilization)));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let rows = Layout::vertical([
        Constraint::Length(3),
        Constraint::Length(5),
        Constraint::Min(8),
    ])
    .split(inner);

    let metrics = Layout::horizontal([
        Constraint::Percentage(34),
        Constraint::Percentage(33),
        Constraint::Percentage(33),
    ])
    .split(rows[0]);
    frame.render_widget(tui_gauge("util", gpu.utilization, 100), metrics[0]);
    frame.render_widget(tui_gauge("vram", memory_pct, 100), metrics[1]);
    frame.render_widget(tui_gauge("temp", gpu.temperature.min(100), 100), metrics[2]);

    let facts = Paragraph::new(vec![
        Line::from(vec![
            Span::styled("Power ", Style::default().fg(Color::DarkGray)),
            Span::raw(format!(
                "{:.1}/{:.0} W",
                clean_f64(gpu.power_draw),
                clean_f64(gpu.power_limit)
            )),
            Span::raw("   "),
            Span::styled("Fan ", Style::default().fg(Color::DarkGray)),
            Span::raw(format!("{}%", gpu.fan_speed)),
            Span::raw("   "),
            Span::styled("VRAM ", Style::default().fg(Color::DarkGray)),
            Span::raw(format!(
                "{}/{}",
                format_mib(gpu.memory_used),
                format_mib(gpu.memory_total)
            )),
        ]),
        Line::from(vec![
            Span::styled("UUID ", Style::default().fg(Color::DarkGray)),
            Span::raw(truncate(&gpu.uuid, area.width.saturating_sub(12) as usize)),
        ]),
    ])
    .wrap(Wrap { trim: true });
    frame.render_widget(
        facts,
        Rect {
            height: 2,
            ..rows[1]
        },
    );

    draw_selected_gpu_processes(frame, gpu, None, rows[2]);
}

fn draw_selected_gpu_processes(
    frame: &mut Frame<'_>,
    gpu: &GpuData,
    selected_process: Option<usize>,
    area: Rect,
) {
    let mut processes: Vec<&GpuProcess> = gpu.processes.iter().collect();
    processes.sort_by(|left, right| right.memory_usage.cmp(&left.memory_usage));
    let rows = if processes.is_empty() {
        vec![Row::new(["-", "-", "-", "-", "No GPU processes"])]
    } else {
        processes
            .into_iter()
            .take(8)
            .enumerate()
            .map(|(index, process)| {
                let is_selected = selected_process == Some(index);
                Row::new([
                    truncate(&process.user, 12),
                    truncate(&process.uid, 8),
                    process.pid.to_string(),
                    format_mib(process.memory_usage),
                    truncate(&process.cmd_line, area.width.saturating_sub(42) as usize),
                ])
                .style(if is_selected {
                    Style::default().fg(Color::Black).bg(Color::Cyan).bold()
                } else {
                    Style::default()
                })
            })
            .collect()
    };
    let table = Table::new(
        rows,
        [
            Constraint::Length(14),
            Constraint::Length(10),
            Constraint::Length(8),
            Constraint::Length(9),
            Constraint::Min(12),
        ],
    )
    .header(
        Row::new(["User", "UID", "PID", "VRAM", "Command"])
            .style(Style::default().fg(Color::DarkGray)),
    )
    .block(
        Block::default()
            .title(" GPU Processes ")
            .title_style(Style::default().fg(Color::Cyan).bold())
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::DarkGray)),
    );
    frame.render_widget(table, area);
}

fn draw_gpu_detail(
    frame: &mut Frame<'_>,
    snapshot: &Snapshot,
    gpu_index: usize,
    selected_process: usize,
    area: Rect,
) {
    let Some(gpu) = snapshot.gpus.get(gpu_index) else {
        frame.render_widget(
            Paragraph::new("No GPU selected")
                .block(Block::default().borders(Borders::ALL))
                .style(Style::default().fg(Color::DarkGray)),
            area,
        );
        return;
    };

    let layout = Layout::vertical([Constraint::Length(7), Constraint::Min(8)]).split(area);
    let header = Paragraph::new(vec![
        Line::from(vec![
            Span::styled("GPU ", Style::default().fg(Color::DarkGray)),
            Span::raw(format!("{}", gpu.id)),
            Span::raw("  "),
            Span::raw(truncate(&gpu.name, area.width.saturating_sub(12) as usize)),
        ]),
        Line::from(vec![
            Span::styled("UUID ", Style::default().fg(Color::DarkGray)),
            Span::raw(truncate(&gpu.uuid, area.width.saturating_sub(12) as usize)),
        ]),
        Line::from(vec![
            Span::styled("Power ", Style::default().fg(Color::DarkGray)),
            Span::raw(format!(
                "{:.1}/{:.0} W",
                clean_f64(gpu.power_draw),
                clean_f64(gpu.power_limit)
            )),
            Span::raw("  "),
            Span::styled("Temp ", Style::default().fg(Color::DarkGray)),
            Span::raw(format!("{}C", gpu.temperature)),
            Span::raw("  "),
            Span::styled("Fan ", Style::default().fg(Color::DarkGray)),
            Span::raw(format!("{}%", gpu.fan_speed)),
        ]),
    ])
    .block(
        Block::default()
            .title(" GPU Detail ")
            .title_style(Style::default().fg(Color::Cyan).bold())
            .borders(Borders::ALL)
            .border_style(Style::default().fg(metric_color(gpu.utilization))),
    )
    .wrap(Wrap { trim: true });
    frame.render_widget(header, layout[0]);

    draw_selected_gpu_processes(frame, gpu, Some(selected_process), layout[1]);
}

fn draw_tui_processes(frame: &mut Frame<'_>, snapshot: &Snapshot, app: &TuiApp, area: Rect) {
    let processes = sorted_processes(snapshot);

    let rows: Vec<Row<'_>> = if processes.is_empty() {
        vec![Row::new(vec![
            Cell::from("-"),
            Cell::from("-"),
            Cell::from("-"),
            Cell::from("-"),
            Cell::from("-"),
            Cell::from("-"),
            Cell::from(
                snapshot
                    .error
                    .as_deref()
                    .unwrap_or("No active compute processes reported by nvidia-smi"),
            ),
        ])]
    } else {
        processes
            .into_iter()
            .take(64)
            .enumerate()
            .map(|(index, (gpu_index, process))| {
                let is_selected = app.selected_process == index;
                Row::new(vec![
                    Cell::from(format!("{}", snapshot.gpus[gpu_index].id)),
                    Cell::from(truncate(&process.user, 14)),
                    Cell::from(truncate(&process.uid, 8)),
                    Cell::from(process.pid.to_string()),
                    Cell::from(process.kind.clone()),
                    Cell::from(format_mib(process.memory_usage)),
                    Cell::from(truncate(&process.cmd_line, 120)),
                ])
                .style(if is_selected {
                    Style::default().fg(Color::Black).bg(Color::Cyan).bold()
                } else {
                    Style::default()
                })
            })
            .collect()
    };

    let table = Table::new(
        rows,
        [
            Constraint::Length(5),
            Constraint::Length(16),
            Constraint::Length(10),
            Constraint::Length(9),
            Constraint::Length(6),
            Constraint::Length(9),
            Constraint::Min(24),
        ],
    )
    .header(
        Row::new(vec!["GPU", "User", "UID", "PID", "Type", "VRAM", "Command"])
            .style(Style::default().fg(Color::Cyan).bold()),
    )
    .block(
        Block::default()
            .title(" Processes ")
            .title_style(Style::default().fg(Color::Cyan).bold())
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::DarkGray)),
    )
    .row_highlight_style(Style::default().bg(Color::DarkGray));

    frame.render_widget(table, area);
}

fn draw_process_detail(
    frame: &mut Frame<'_>,
    snapshot: &Snapshot,
    gpu_id: u32,
    pid: u32,
    area: Rect,
) {
    let Some((gpu_index, process)) = find_process(snapshot, gpu_id, pid) else {
        frame.render_widget(
            Paragraph::new("Process not found")
                .block(Block::default().borders(Borders::ALL))
                .style(Style::default().fg(Color::Red)),
            area,
        );
        return;
    };

    let gpu = &snapshot.gpus[gpu_index];
    let layout = Layout::vertical([Constraint::Length(8), Constraint::Min(4)]).split(area);
    let details = Paragraph::new(vec![
        Line::from(vec![
            Span::styled("GPU ", Style::default().fg(Color::DarkGray)),
            Span::raw(format!(
                "{}  {}",
                gpu.id,
                truncate(&gpu.name, area.width.saturating_sub(12) as usize)
            )),
        ]),
        Line::from(vec![
            Span::styled("PID ", Style::default().fg(Color::DarkGray)),
            Span::raw(format!("{}", process.pid)),
            Span::raw("  "),
            Span::styled("UID ", Style::default().fg(Color::DarkGray)),
            Span::raw(process.uid.clone()),
            Span::raw("  "),
            Span::styled("User ", Style::default().fg(Color::DarkGray)),
            Span::raw(process.user.clone()),
        ]),
        Line::from(vec![
            Span::styled("Type ", Style::default().fg(Color::DarkGray)),
            Span::raw(process.kind.clone()),
            Span::raw("  "),
            Span::styled("VRAM ", Style::default().fg(Color::DarkGray)),
            Span::raw(format_mib(process.memory_usage)),
        ]),
        Line::from(vec![
            Span::styled("Command ", Style::default().fg(Color::DarkGray)),
            Span::raw(truncate(
                &process.cmd_line,
                area.width.saturating_sub(12) as usize,
            )),
        ]),
    ])
    .block(
        Block::default()
            .title(" Process Detail ")
            .title_style(Style::default().fg(Color::Cyan).bold())
            .borders(Borders::ALL)
            .border_style(Style::default().fg(metric_color(gpu.utilization))),
    )
    .wrap(Wrap { trim: true });
    frame.render_widget(details, layout[0]);

    let hint = Paragraph::new("Esc back | Enter open from lists | j/k move selection")
        .style(Style::default().fg(Color::DarkGray))
        .wrap(Wrap { trim: true });
    frame.render_widget(hint, layout[1]);
}

fn draw_tui_footer(frame: &mut Frame<'_>, app: &TuiApp, area: Rect) {
    let text = match app.page {
        TuiPage::Overview => "1 overview | tab switch | j/k select GPU | Enter open GPU | q quit",
        TuiPage::Processes => {
            "2 processes | tab switch | j/k select process | Enter open process | q quit"
        }
        TuiPage::GpuDetail { .. } => "Esc back | j/k select process | Enter open process | q quit",
        TuiPage::ProcessDetail { .. } => "Esc back | q quit",
    };
    frame.render_widget(
        Paragraph::new(format!(" {text} ")).style(Style::default().fg(Color::DarkGray)),
        area,
    );
}

fn flatten_processes(snapshot: &Snapshot) -> Vec<(usize, &GpuProcess)> {
    snapshot
        .gpus
        .iter()
        .enumerate()
        .flat_map(|(gpu_index, gpu)| {
            gpu.processes
                .iter()
                .map(move |process| (gpu_index, process))
        })
        .collect()
}

fn sorted_processes(snapshot: &Snapshot) -> Vec<(usize, &GpuProcess)> {
    let mut processes = flatten_processes(snapshot);
    processes.sort_by(|left, right| right.1.memory_usage.cmp(&left.1.memory_usage));
    processes
}

fn selected_process_ref(snapshot: &Snapshot, index: usize) -> Option<(u32, u32)> {
    sorted_processes(snapshot)
        .into_iter()
        .nth(index)
        .map(|(gpu_index, process)| (snapshot.gpus[gpu_index].id, process.pid))
}

fn find_process<'a>(
    snapshot: &'a Snapshot,
    gpu_id: u32,
    pid: u32,
) -> Option<(usize, &'a GpuProcess)> {
    snapshot
        .gpus
        .iter()
        .enumerate()
        .find_map(|(gpu_index, gpu)| {
            if gpu.id != gpu_id {
                return None;
            }
            gpu.processes
                .iter()
                .find(|process| process.pid == pid)
                .map(|process| (gpu_index, process))
        })
}

fn page_label(page: &TuiPage) -> &'static str {
    match page {
        TuiPage::Overview => "Overview",
        TuiPage::Processes => "Processes",
        TuiPage::GpuDetail { .. } => "GPU Detail",
        TuiPage::ProcessDetail { .. } => "Process Detail",
    }
}

fn tui_gauge(label: &'static str, value: u32, max: u32) -> Gauge<'static> {
    let ratio = if max == 0 {
        0.0
    } else {
        (value as f64 / max as f64).clamp(0.0, 1.0)
    };
    Gauge::default()
        .gauge_style(Style::default().fg(metric_color(value)))
        .label(format!("{label} {value}%"))
        .ratio(ratio)
}

fn metric_style(value: u32) -> Style {
    Style::default().fg(metric_color(value)).bold()
}

fn metric_color(value: u32) -> Color {
    if value >= 85 {
        Color::Red
    } else if value >= 65 {
        Color::Yellow
    } else {
        Color::Green
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
        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if error.is_empty() {
            return Err(anyhow!("nvidia-smi exited with status {}", output.status));
        }
        return Err(anyhow!(error));
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

fn average_u32(values: impl Iterator<Item = u32>) -> u32 {
    let mut total = 0u64;
    let mut count = 0u64;
    for value in values {
        total += value as u64;
        count += 1;
    }
    if count == 0 {
        0
    } else {
        (total / count) as u32
    }
}

fn percent_u64(used: u64, total: u64) -> u32 {
    if total == 0 {
        return 0;
    }
    ((used as f64 / total as f64 * 100.0).round() as u32).min(100)
}

fn clean_f64(value: f64) -> f64 {
    if value.abs() < 0.05 {
        0.0
    } else {
        value
    }
}

fn format_mib(value: u64) -> String {
    if value >= 1024 {
        format!("{:.1}G", value as f64 / 1024.0)
    } else {
        format!("{value}M")
    }
}

fn format_timestamp(timestamp: u128) -> String {
    let seconds = ((timestamp / 1000) % 86_400) as u64;
    let hour = seconds / 3600;
    let minute = (seconds % 3600) / 60;
    let second = seconds % 60;
    format!("{hour:02}:{minute:02}:{second:02} UTC")
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
