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
    /// Idempotent: returns the running URL when already started (pre-start in
    /// setup + eager frontend invocation must not double-spawn).
    pub fn start(&mut self, app: &AppHandle) -> Result<String, String> {
        if let Some(url) = &self.url {
            if self.is_running() {
                return Ok(url.clone());
            }
        }

        // 发布形态不依赖 `DSH_PLATFORM_REPO`：CLI 优先从缓存运行时
        // （dsh_runtime_dir）、npm 全局解析，dev 仅作为最后回退；
        // overlay 优先从安装包资源（resource_dir/config）、dev 仓库解析。
        let cli = resolve_cli(app)?;
        let overlay = resolve_overlay(app);
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

        // 发布版是 GUI 子系统(无主控制台)。node 是控制台子系统程序,若不显式
        // 用 CREATE_NO_WINDOW,子在 Windows 上会额外分配一个黑色控制台窗口。
        // dev(debug)因主进程带控制台而不弹,release 才出现——这里统一屏蔽。
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }

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

/// dev 仓库根：`DSH_PLATFORM_REPO` env override，否则 `CARGO_MANIFEST_DIR/../../..`。
///
/// 仅作为 dev 回退（CARGO_MANIFEST_DIR 是编译期常量，安装到其它机器后
/// 指向不存在的 CI/构建路径）。发布形态由 resolve_cli / resolve_overlay
/// 优先从 resource_dir / app_data_dir/runtime 解析，不再依赖这里。
fn repo_root() -> Option<PathBuf> {
    if let Ok(explicit) = std::env::var("DSH_PLATFORM_REPO") {
        if !explicit.trim().is_empty() {
            return Some(PathBuf::from(explicit));
        }
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    // src-tauri/../.. 只到 apps/desktop；仓库根需要再上两级上级… 一级：
    // manifest = <root>/apps/desktop/src-tauri → ../../.. = <root>
    let dev_root = manifest.join("../../..");
    if dev_root.exists() {
        Some(dev_root)
    } else {
        None
    }
}

/// Resolve the DSH CLI bin.js. 发布形态不再依赖 `DSH_PLATFORM_REPO`：
///  1. `DSH_PLATFORM_RUNTIME` env（测试/自定义）
///  2. `<cache_dir>/dsh-platform/runtime/...`（发布形态在线运行时 install_runtime）
///  3. npm 全局安装 `npm root -g`（用户手动 npm -g / npx 安装的 DSH）
///  4. dev: `<root>/harness/apps/cli/lib/bin.js`（submodule 构建输出）
///  5. dev: `<root>/node_modules/@deepseek-ai/dsh/lib/bin.js`（npm 回退）
///
/// 注意：打包资源 `runtime/harness/apps/cli` 只含 CLI 源码（无 node_modules），
/// 不可直接运行，故不作为候选；安装包保持轻薄，运行时由 install_runtime
/// 在线安装到缓存目录（见 `dsh_runtime_dir`），避免落入卸载器会清空的
/// app_data_dir（其内 node_modules 正是卸载卡顿的根源）。
fn resolve_cli(app: &AppHandle) -> Result<String, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(env_runtime) = std::env::var("DSH_PLATFORM_RUNTIME") {
        if !env_runtime.trim().is_empty() {
            candidates.push(PathBuf::from(env_runtime).join("node_modules").join("@deepseek-ai").join("dsh").join("lib").join("bin.js"));
        }
    }
    if let Ok(runtime_dir) = dsh_runtime_dir(app) {
        candidates.push(runtime_dir.join("node_modules").join("@deepseek-ai").join("dsh").join("lib").join("bin.js"));
    }
    if let Ok(output) = Command::new("npm").args(["root", "-g"]).output() {
        if output.status.success() {
            let global_root = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !global_root.is_empty() {
                candidates.push(PathBuf::from(global_root).join("@deepseek-ai").join("dsh").join("lib").join("bin.js"));
            }
        }
    }
    if let Some(root) = repo_root() {
        candidates.push(root.join("harness").join("apps").join("cli").join("lib").join("bin.js"));
        candidates.push(root.join("node_modules").join("@deepseek-ai").join("dsh").join("lib").join("bin.js"));
    }

    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.to_string_lossy().into_owned());
        }
    }
    Err(format!(
        "DSH CLI not found (searched {}); dev: run `pnpm install`; release: 运行 install_runtime 在线安装或 npm -g install @deepseek-ai/dsh",
        candidates.iter().map(|c| c.display().to_string()).collect::<Vec<_>>().join(", ")
    ))
}

/// Overlay: prefer the generated (absolute-path) overlay, fall back to the
/// committed template for diagnostics. 发布形态优先从安装包资源
/// `<resource_dir>/config` 解析；dev 再回退到编译期仓库根。
///
/// 只有当 overlay 引用的插件文件在本地可解析时才返回，避免把
/// `file:///E:/...` 这种打包进安装包的绝对路径（仅开发机有效）传给
/// DSH loader 造成插件缺失、启动失败。
fn resolve_overlay(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        if let Some(found) = find_overlay(&resource_dir.join("config")) {
            if overlay_plugins_resolvable(&found) {
                return Some(found);
            }
        }
    }
    if let Some(root) = repo_root() {
        if let Some(found) = find_overlay(&root.join("config")) {
            if overlay_plugins_resolvable(&found) {
                return Some(found);
            }
        }
    }
    None
}

fn find_overlay(config_dir: &Path) -> Option<PathBuf> {
    let generated = config_dir.join("desktop-overlay.generated.yml");
    if generated.exists() {
        return Some(generated);
    }
    let template = config_dir.join("desktop-overlay.yml");
    if template.exists() {
        eprintln!("[sidecar] WARNING: using overlay template (relative refs) — run `pnpm prepare:harness` for absolute refs");
        return Some(template);
    }
    None
}

/// Heuristic: an overlay whose plugin refs are all `file:///` absolute paths
/// that do not exist on this machine cannot be loaded — treat as unusable.
/// Overlays without `file://` refs (relative-ref template) are assumed usable.
fn overlay_plugins_resolvable(config_file: &Path) -> bool {
    let Ok(content) = std::fs::read_to_string(config_file) else {
        return false;
    };
    let mut file_refs = 0usize;
    for segment in content.split("file:///").skip(1) {
        let raw: String = segment
            .chars()
            .take_while(|c| !matches!(c, '"' | '\'' | '\n' | '\r' | ' '))
            .collect();
        if raw.is_empty() {
            continue;
        }
        file_refs += 1;
        if PathBuf::from(&raw).exists() {
            return true;
        }
    }
    file_refs == 0
}

/// Sidecar 专属 DSH_HOME：默认 `<app_data_dir>/dsh-home`。
///
/// 注意：**不继承父进程的 `DSH_HOME`** —— 若壳从另一个 DSH 会话（或 dsh CLI）
/// 中被启动，继承会与本机真实 profile 目录冲突（双进程写同一 profile）。
/// 测试/自定义路径请用独立变量 `DSH_PLATFORM_HOME`。
fn resolve_dsh_home(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(explicit) = std::env::var("DSH_PLATFORM_HOME") {
        if !explicit.trim().is_empty() {
            return Ok(PathBuf::from(explicit));
        }
    }
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("dsh-home"))
        .map_err(|err| format!("cannot resolve app data dir: {err}"))
}

/// 在线安装的 DSH 运行时根目录。
///
/// 放在系统缓存目录（Windows 为 `%LOCALAPPDATA%`，即 `cache_dir()`）而非
/// `app_data_dir()`（Windows 为 `%APPDATA%\\io.dsh.platform`）——后者会被
/// NSIS 卸载器递归清空，里面的巨型 node_modules 正是卸载卡顿的根源。
/// 缓存目录不在卸载器的清理范围内，卸载时不再反复遍历这些文件。
pub fn dsh_runtime_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .cache_dir()
        .map(|dir| dir.join("dsh-platform").join("runtime"))
        .map_err(|err| format!("cannot resolve cache dir: {err}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static OVERLAY_SEQ: AtomicUsize = AtomicUsize::new(0);

    /// Write a fake overlay file to a unique temp path and return its path.
    fn temp_overlay(content: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dsh-sidecar-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let n = OVERLAY_SEQ.fetch_add(1, Ordering::SeqCst);
        let file = dir.join(format!("desktop-overlay-{n}.yml"));
        fs::write(&file, content).unwrap();
        file
    }

    #[test]
    fn overlay_with_existing_file_ref_is_resolvable() {
        // Reference a path that really exists (this crate's Cargo.toml).
        let existing = std::env::current_dir().unwrap().join("Cargo.toml");
        let url = format!("file:///{}", existing.to_string_lossy().replace('\\', "/"));
        let overlay = temp_overlay(&format!("{{ \"name\": \"{url}\" }}"));
        assert!(overlay_plugins_resolvable(&overlay));
    }

    #[test]
    fn overlay_with_missing_file_ref_is_not_resolvable() {
        let overlay = temp_overlay(r#"{ "name": "file:///Z:/definitely/not/here/index.js" }"#);
        assert!(!overlay_plugins_resolvable(&overlay));
    }

    #[test]
    fn overlay_without_file_refs_is_resolvable() {
        // Relative-ref template (no file:// absolute paths) is assumed usable.
        let overlay = temp_overlay("- name: ./plugins/desktop-bridge/lib/index.js");
        assert!(overlay_plugins_resolvable(&overlay));
    }
}
