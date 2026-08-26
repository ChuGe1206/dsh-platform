//! DSH sidecar management — spawns `node <dsh-cli> web`, parses the ready
//! line, owns the child process lifetime, and keeps an error tail.
//!
//! Ready line contract (see @deepseek-ai/dsh-web-app):
//!   `dsh web: http://127.0.0.1:<PORT>` — printed when the web server binds.

use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// READY LINE PREFIX shipped by dsh-web-app.
const READY_LINE_PREFIX: &str = "dsh web: http://127.0.0.1:";
const READY_TIMEOUT: Duration = Duration::from_secs(90);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DshPhase {
    Idle,
    Starting,
    Ready,
    Error,
}

#[derive(Debug, Clone, Serialize)]
pub struct DshStatus {
    pub state: DshPhase,
    pub url: Option<String>,
    pub port: Option<u16>,
    pub error: Option<String>,
    pub uptime_ms: Option<u64>,
    pub dsh_home: Option<String>,
    pub cli: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct ReadyEventPayload<'a> {
    url: &'a str,
}

/// Internal reader loop message.
enum ReaderEvent {
    Ready(String),
    Eof,
}

#[derive(Default)]
pub struct DSHSidecar {
    child: Option<Child>,
    port: Option<u16>,
    url: Option<String>,
    started_at: Option<Instant>,
    error: Option<String>,
    cli: Option<String>,
    dsh_home: Option<String>,
    stderr_tail: Arc<Mutex<Vec<String>>>,
}

impl DSHSidecar {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn status(&self) -> DshStatus {
        let uptime_ms = self
            .started_at
            .map(|started| started.elapsed().as_millis().min(u64::MAX as u128) as u64);
        DshStatus {
            state: if self.child.is_some() && self.port.is_some() {
                DshPhase::Ready
            } else if self.error.is_some() {
                DshPhase::Error
            } else {
                DshPhase::Idle
            },
            url: self.url.clone(),
            port: self.port,
            error: self.error.clone(),
            uptime_ms,
            dsh_home: self.dsh_home.clone(),
            cli: self.cli.clone(),
        }
    }

    pub fn is_running(&self) -> bool {
        self.child.is_some()
    }

    /// Start the sidecar and wait for the ready line.
    /// **Blocking**: callers must wrap in `tauri::async_runtime::spawn_blocking`.
    pub fn start(&mut self, app: &AppHandle) -> Result<String, String> {
        if let Some(url) = &self.url {
            if self.is_running() {
                return Ok(url.clone());
            }
        }

        let repo_root = repo_root().ok_or("cannot resolve dsh-platform repo root (set DSH_PLATFORM_REPO)")?;

        let cli = resolve_cli(&repo_root)?;
        let overlay = resolve_overlay(&repo_root);
        let dsh_home = resolve_dsh_home(app)?;
        std::fs::create_dir_all(&dsh_home).map_err(|err| format!("failed to create DSH_HOME: {err}"))?;

        let node = std::env::var("DSH_NODE").unwrap_or_else(|_| "node".to_string());

        // Launcher flags (--patch) must come BEFORE the app's pass-through
        // flags (--host/--port/--no-open): commander parses the launcher's
        // known options first, then forwards the rest verbatim.
        let mut args: Vec<String> = vec![cli.clone(), "web".into()];
        if let Some(overlay) = &overlay {
            args.push("--patch".into());
            args.push(overlay.to_string_lossy().into_owned());
        }
        args.extend([
            "--host".into(),
            "127.0.0.1".into(),
            "--port".into(),
            "0".into(),
            "--no-open".into(),
        ]);

        let mut command = Command::new(&node);
        command
            .args(&args)
            .env("DSH_HOME", &dsh_home)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        eprintln!("[sidecar] spawning {node} {args:?} (DSH_HOME={})", dsh_home.display());

        let mut child = command.spawn().map_err(|err| format!("failed to spawn DSH: {err}"))?;
        let stdout = child.stdout.take().ok_or("failed to capture DSH stdout")?;
        let stderr = child.stderr.take().ok_or("failed to capture DSH stderr")?;

        // Drain stderr on a thread, keeping the last 64 lines.
        let tail = Arc::new(Mutex::new(Vec::<String>::new()));
        {
            let tail_clone = Arc::clone(&tail);
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().map_while(Result::ok) {
                    {
                        let mut tail = tail_clone.lock().unwrap_or_else(|e| e.into_inner());
                        if tail.len() >= 64 {
                            tail.remove(0);
                        }
                        tail.push(line.clone());
                    }
                    eprintln!("[dsh] {line}");
                }
            });
        }

        // Wait for the ready line on a reader thread.
        let (tx, rx) = channel::<ReaderEvent>();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                let trimmed = line.trim().to_string();
                if let Some(rest) = trimmed.strip_prefix(READY_LINE_PREFIX) {
                    if rest.chars().all(|character| character.is_ascii_digit()) {
                        let _ = tx.send(ReaderEvent::Ready(trimmed));
                        return;
                    }
                }
            }
            let _ = tx.send(ReaderEvent::Eof);
        });

        let deadline = Instant::now() + READY_TIMEOUT;
        let ready = loop {
            if let Some(exit) = child.try_wait().map_err(|err| format!("DSH wait failed: {err}"))? {
                let stderr = tail.lock().unwrap_or_else(|e| e.into_inner()).join("\n");
                return Err(format!(
                    "DSH exited before ready (code={}){}",
                    exit,
                    if stderr.is_empty() { String::new() } else { format!("\n{stderr}") }
                ));
            }
            match rx.recv_timeout(Duration::from_secs(1)) {
                Ok(ReaderEvent::Ready(line)) => break line,
                Ok(ReaderEvent::Eof) => {
                    let _ = child.kill();
                    return Err("DSH stdout closed before ready line".into());
                }
                Err(RecvTimeoutError::Timeout) => {
                    if Instant::now() > deadline {
                        let _ = child.kill();
                        return Err(format!("DSH did not output '{READY_LINE_PREFIX}<port>' within {READY_TIMEOUT:?}"));
                    }
                }
                Err(RecvTimeoutError::Disconnected) => {
                    let _ = child.kill();
                    return Err("DSH reader thread died".into());
                }
            }
        };

        let port_text = ready
            .trim()
            .strip_prefix(READY_LINE_PREFIX)
            .ok_or("malformed ready line")?;
        let port: u16 = port_text.parse().map_err(|err| format!("invalid port in ready line: {err}"))?;
        if port == 0 {
            return Err("DSH bound port 0 — refusing".into());
        }

        let url = format!("http://127.0.0.1:{port}");
        self.child = Some(child);
        self.port = Some(port);
        self.url = Some(url.clone());
        self.started_at = Some(Instant::now());
        self.error = None;
        self.cli = Some(cli);
        self.dsh_home = Some(dsh_home.to_string_lossy().into_owned());
        self.stderr_tail = tail;

        let _ = app.emit("harness-ready", ReadyEventPayload { url: &url });

        Ok(url)
    }

    pub fn stop(&mut self) -> Result<(), String> {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.port = None;
        self.url = None;
        self.started_at = None;
        self.error = None;
        Ok(())
    }

    pub fn restart(&mut self, app: &AppHandle) -> Result<String, String> {
        self.stop()?;
        self.start(app)
    }

    pub fn last_stderr(&self) -> Vec<String> {
        self.stderr_tail.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

/// Repo root: `DSH_PLATFORM_REPO` env override, else `CARGO_MANIFEST_DIR/../..`.
fn repo_root() -> Option<PathBuf> {
    if let Ok(explicit) = std::env::var("DSH_PLATFORM_REPO") {
        if !explicit.trim().is_empty() {
            return Some(PathBuf::from(explicit));
        }
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dev_root = manifest.join("../..");
    if dev_root.exists() {
        Some(dev_root)
    } else {
        None
    }
}

/// Resolve the DSH CLI bin.js:
///  1. dev: `<root>/harness/apps/cli/lib/bin.js` (submodule build output)
///  2. dev: `<root>/node_modules/@deepseek-ai/dsh/lib/bin.js` (npm fallback)
///  3. release: resource `runtime/harness/apps/cli/lib/bin.js`
fn resolve_cli(root: &Path) -> Result<String, String> {
    let candidates = [
        root.join("harness").join("apps").join("cli").join("lib").join("bin.js"),
        root.join("node_modules").join("@deepseek-ai").join("dsh").join("lib").join("bin.js"),
    ];
    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.to_string_lossy().into_owned());
        }
    }
    Err(format!(
        "DSH CLI not found (searched {}, {}); run `pnpm install` or build harness/apps/cli",
        candidates[0].display(),
        candidates[1].display()
    ))
}

/// Overlay: prefer the generated (absolute-path) overlay, fall back to the
/// committed template for diagnostics.
fn resolve_overlay(root: &Path) -> Option<PathBuf> {
    let generated = root.join("config").join("desktop-overlay.generated.yml");
    if generated.exists() {
        return Some(generated);
    }
    let template = root.join("config").join("desktop-overlay.yml");
    if template.exists() {
        eprintln!("[sidecar] WARNING: using overlay template (relative refs) — run `pnpm prepare:harness` for absolute refs");
        return Some(template);
    }
    None
}

fn resolve_dsh_home(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(explicit) = std::env::var("DSH_HOME") {
        if !explicit.trim().is_empty() {
            return Ok(PathBuf::from(explicit));
        }
    }
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("dsh-home"))
        .map_err(|err| format!("cannot resolve app data dir: {err}"))
}
