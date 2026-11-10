#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

#[cfg(windows)]
mod windows_printing;

#[derive(Debug, Serialize, Deserialize)]
struct PrinterInfo {
    name: String,
    #[serde(rename = "isDefault")]
    is_default: bool,
}

// ── Edge server client (Phase 1.2: Cashier is now a client, not a supervisor) ──
// The edge-server (Runtime) is now a long-lived process started by the
// Softshape Runtime Host (Phase 3) or Windows autostart. The Cashier app
// connects to it as a client via HTTP on port 3101. It does not spawn,
// supervise, or kill the Runtime.

// ── Tray connection status ───────────────────────────────────────────────────
// Updated by the frontend via the `update_connection_status` Tauri command.
// The tray tooltip reads this to show "Connected" / "Disconnected" so a cashier
// can tell at a glance if something's wrong without opening the window.
static TRAY_CONNECTION_STATUS: Mutex<String> = Mutex::new(String::new());

fn update_tray_tooltip(app: &tauri::AppHandle) {
    let status = TRAY_CONNECTION_STATUS.lock().map(|g| g.clone()).unwrap_or_default();
    let tooltip = if status.is_empty() {
        "SoftShape Cashier".to_string()
    } else {
        format!("SoftShape Cashier — {}", status)
    };
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct EdgeServerStatus {
    running: bool,
    ready: bool,
    state: String,
    error: Option<String>,
    diagnostics: Option<String>,
    app_version: String,
}

// ── Print helpers (used by Tauri commands for test prints from the UI) ───────

fn parse_network_printer(printer_name: &str) -> Option<(String, u16)> {
    let (ip, port) = printer_name.rsplit_once(':')?;
    if ip.parse::<std::net::Ipv4Addr>().is_err() {
        return None;
    }
    Some((ip.to_string(), port.parse().ok()?))
}

// ── Edge server health check (client mode) ───────────────────────────────────
// The Cashier app polls the Runtime's /health endpoint to determine if it's
// running and ready. It does not spawn or kill the Runtime.

fn get_edge_port() -> String {
    std::env::var("EDGE_PORT").unwrap_or_else(|_| "3101".to_string())
}

fn check_edge_server_health() -> (bool, String) {
    let port = get_edge_port();
    let addr = format!("127.0.0.1:{}", port);
    match TcpStream::connect_timeout(
        &addr.parse().unwrap_or_else(|_| "127.0.0.1:3101".parse().unwrap()),
        Duration::from_secs(2),
    ) {
        Ok(mut stream) => {
            let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
            let request = "GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
            if stream.write_all(request.as_bytes()).is_err() {
                return (false, "Failed to send health request".to_string());
            }
            let mut response = String::new();
            let _ = stream.read_to_string(&mut response);
            if response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200") {
                let body = response.split("\r\n\r\n").nth(1).unwrap_or("");
                if body.contains("\"status\"") {
                    return (true, body.to_string());
                }
                return (true, "Health endpoint responded".to_string());
            }
            (false, format!("Health endpoint returned non-200: {}", response.lines().next().unwrap_or("empty")))
        }
        Err(e) => {
            (false, format!("Cannot connect to edge-server on port {}: {}", port, e))
        }
    }
}

/// Check if the edge server is running and report its status.
/// Phase 1.2: The Cashier is now a client — it polls the Runtime's /health
/// endpoint instead of inspecting a child process handle.
#[tauri::command]
fn get_edge_server_status() -> EdgeServerStatus {
    let (healthy, detail) = check_edge_server_health();
    EdgeServerStatus {
        running: healthy,
        ready: healthy,
        state: if healthy { "ready".to_string() } else { "offline".to_string() },
        error: if healthy { None } else { Some(detail.clone()) },
        diagnostics: if healthy { Some(detail) } else { None },
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

/// Request the Runtime to restart itself.
/// Phase 1.2: This calls POST :3101/runtime/restart on the Runtime.
#[tauri::command]
fn restart_edge_server() -> Result<(), String> {
    let port = get_edge_port();
    let addr = format!("127.0.0.1:{}", port);
    let mut stream = TcpStream::connect_timeout(
        &addr.parse().map_err(|e| format!("Invalid address: {}", e))?,
        Duration::from_secs(2),
    )
    .map_err(|e| format!("Cannot connect to edge-server on port {}: {}. Is the Softshape Runtime running?", port, e))?;

    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let request = "POST /runtime/restart HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";
    stream.write_all(request.as_bytes())
        .map_err(|e| format!("Failed to send restart request: {}", e))?;

    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);

    if response.starts_with("HTTP/1.1 200") {
        Ok(())
    } else {
        let status_line = response.lines().next().unwrap_or("no response");
        Err(format!("Runtime restart failed: {}. The Runtime may need to be restarted via the Softshape Runtime Host.", status_line))
    }
}

// ── REMOVED: Supervision functions (Phase 1.2) ───────────────────────────────
// The following functions were removed because the Cashier no longer supervises
// the edge-server. Supervision logic has been ported to the Runtime's
// supervisor.ts module in the edge-server project.
//   - start_edge_health_probe (replaced by check_edge_server_health above)
//   - find_edge_server_recursive, diagnose_process_on_port, is_port_free,
//     kill_process_on_port, free_port_blocking, attach_edge_server_logs,
//     spawn_edge_server_process, assign_child_to_job, close_job_handle,
//     detect_legacy_edge_server, start_edge_server_watchdog, spawn_edge_server,
//     kill_edge_server (all no longer needed)
// ─────────────────────────────────────────────────────────────────────────────

/// List all installed Windows printers.
/// Returns an error if enumeration fails (e.g. spooler service down),
/// so the UI can distinguish "no printers installed" from "detection failed".
#[tauri::command]
fn list_printers() -> Result<Vec<PrinterInfo>, String> {
    #[cfg(windows)]
    {
        windows_printing::enumerate_printers()
            .map_err(|e| format!("Printer enumeration failed: {}", e))
    }
    #[cfg(not(windows))]
    {
        Ok(vec![])
    }
}

/// Send raw bytes directly to a named printer (silent, no dialog).
/// Used for offline ESC/POS printing when the backend socket is unavailable.
#[tauri::command]
fn print_raw(printer_name: String, bytes: Vec<u8>) -> Result<(), String> {
    #[cfg(windows)]
    {
        windows_printing::raw_print(&printer_name, &bytes)
            .map_err(|e| format!("Print failed: {}", e))
    }
    #[cfg(not(windows))]
    {
        let _ = (printer_name, bytes);
        Err("Printing is only supported on Windows".to_string())
    }
}

/// Send raw bytes to a network printer via TCP (IP:port).
#[tauri::command]
fn print_network(ip: String, port: u16, bytes: Vec<u8>) -> Result<(), String> {
    use std::io::Write;
    use std::net::TcpStream;
    use std::time::Duration;

    let addr = format!("{}:{}", ip, port);
    let mut stream = TcpStream::connect_timeout(
        &addr.parse().map_err(|e| format!("Invalid address: {}", e))?,
        Duration::from_secs(5),
    )
    .map_err(|e| format!("Cannot connect to {}: {}", addr, e))?;

    let _ = stream.set_write_timeout(Some(Duration::from_secs(10)));
    stream
        .write_all(&bytes)
        .map_err(|e| format!("Write failed to {}: {}", addr, e))?;

    Ok(())
}

/// Send a small ESC/POS test print to verify a printer is reachable.
#[tauri::command]
fn test_print(printer_name: String) -> Result<(), String> {
    let test_bytes = b"\x1B\x40SoftShape Test Print\n\n\n\x1D\x56\x42\x00";
    if let Some((ip, port)) = parse_network_printer(&printer_name) {
        print_network(ip, port, test_bytes.to_vec())
    } else {
        print_raw(printer_name, test_bytes.to_vec())
    }
}

/// Get the app version.
#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[derive(Debug, Serialize)]
struct UpdateInfo {
    version: String,
    notes: Option<String>,
}

/// Check whether a newer release exists. Only checks; never downloads or installs.
#[tauri::command]
async fn check_for_update(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    let update = app.updater()
        .map_err(|e| format!("Updater init failed: {}", e))?
        .check().await
        .map_err(|e| format!("Update check failed: {}", e))?;
    Ok(update.map(|u| UpdateInfo { version: u.version.clone(), notes: u.body.clone() }))
}

// ── Safe update: the billing PC's database must never be left half-written ─────
// The Runtime (edge-server) owns the local database. Before the installer runs, the
// update: waits for pending work to finish, downloads while the Runtime is still up,
// stops the Runtime cleanly, copies the database, and only then installs.
// If anything fails before the installer starts, the Runtime is started again.

/// Marker the Runtime Host reads: while it is fresh, the Host does not start the Runtime.
/// Matches UPDATE_MARKER_MAX_AGE_SECS in runtime-host/src/main.rs.
const UPDATE_MARKER_NAME: &str = "update-in-progress.flag";
const BACKUPS_TO_KEEP: usize = 10;

#[derive(Deserialize)]
struct UpdateReadiness {
    ready: bool,
    reasons: Vec<String>,
}

fn local_app_data_dir() -> std::path::PathBuf {
    std::env::var("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
}

fn update_marker_file() -> std::path::PathBuf {
    local_app_data_dir().join("Softshape").join(UPDATE_MARKER_NAME)
}

fn write_update_marker() -> Result<(), String> {
    let path = update_marker_file();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {}", dir.display(), e))?;
    }
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    std::fs::write(&path, format!("{}\n", ts)).map_err(|e| format!("Could not write update marker: {}", e))
}

fn clear_update_marker() {
    let _ = std::fs::remove_file(update_marker_file());
}

fn runtime_address() -> Result<std::net::SocketAddr, String> {
    format!("127.0.0.1:{}", get_edge_port())
        .parse()
        .map_err(|e| format!("Invalid Runtime address: {}", e))
}

fn runtime_is_up() -> bool {
    match runtime_address() {
        Ok(addr) => TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok(),
        Err(_) => false,
    }
}

/// Send one request to the Runtime on localhost. Returns the body for HTTP 200, otherwise an error.
fn runtime_request(method: &str, path: &str) -> Result<String, String> {
    let addr = runtime_address()?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(2))
        .map_err(|e| format!("Billing service is not reachable: {}", e))?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
    let request = format!(
        "{} {} HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        method, path
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|e| format!("Request to the billing service failed: {}", e))?;
    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    let ok = response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200");
    let body = response.split("\r\n\r\n").nth(1).unwrap_or("").to_string();
    if ok {
        Ok(body)
    } else {
        Err(format!("Billing service answered {} with: {}", path, body.trim()))
    }
}

/// Wait until the Runtime stops listening. Returns false if it is still up after the timeout.
fn wait_for_runtime_stopped(timeout: Duration) -> bool {
    let deadline = std::time::Instant::now() + timeout;
    while std::time::Instant::now() < deadline {
        if !runtime_is_up() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    !runtime_is_up()
}

/// Fails unless the Runtime reports nothing waiting to sync and no unfinished print jobs.
fn check_update_readiness() -> Result<(), String> {
    let body = runtime_request("GET", "/api/edge/update-readiness")?;
    let readiness: UpdateReadiness = serde_json::from_str(&body)
        .map_err(|e| format!("Unexpected readiness answer from the billing service: {}", e))?;
    if readiness.ready {
        Ok(())
    } else {
        Err(format!(
            "Update not started. Finish these first, then try again: {}.",
            readiness.reasons.join("; ")
        ))
    }
}

fn database_file() -> std::path::PathBuf {
    match std::env::var("EDGE_DB_PATH") {
        Ok(path) if !path.is_empty() => std::path::PathBuf::from(path),
        _ => std::path::PathBuf::from(std::env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string()))
            .join(".softshape")
            .join("edge.db"),
    }
}

/// Copy the database (and its WAL file if present) into backups/. Keeps the newest BACKUPS_TO_KEEP.
/// Must run only after the Runtime has stopped, so the copy is consistent.
fn backup_database() -> Result<Option<std::path::PathBuf>, String> {
    let db = database_file();
    if !db.exists() {
        return Ok(None); // nothing to protect yet
    }
    let dir = db.parent().unwrap_or_else(|| std::path::Path::new(".")).join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create backups folder: {}", e))?;

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let target = dir.join(format!("edge-pre-update-{}.db", ts));
    std::fs::copy(&db, &target).map_err(|e| format!("Could not copy the database: {}", e))?;

    let source_len = std::fs::metadata(&db).map(|m| m.len()).unwrap_or(0);
    let copied_len = std::fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
    if source_len != copied_len {
        return Err(format!("Backup size mismatch ({} vs {} bytes)", source_len, copied_len));
    }

    let wal = std::path::PathBuf::from(format!("{}-wal", db.display()));
    if wal.exists() {
        std::fs::copy(&wal, dir.join(format!("edge-pre-update-{}.db-wal", ts)))
            .map_err(|e| format!("Could not copy the database WAL file: {}", e))?;
    }

    // Keep only the newest backups
    let mut backups: Vec<std::path::PathBuf> = std::fs::read_dir(&dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| {
                    p.file_name()
                        .and_then(|n| n.to_str())
                        .map(|n| n.starts_with("edge-pre-update-") && n.ends_with(".db"))
                        .unwrap_or(false)
                })
                .collect()
        })
        .unwrap_or_default();
    // The backup just made always stays; the other slots go to the newest older backups
    backups.retain(|p| p != &target);
    backups.sort_by_key(|p| std::cmp::Reverse(std::fs::metadata(p).and_then(|m| m.modified()).ok()));
    for old in backups.iter().skip(BACKUPS_TO_KEEP - 1) {
        let _ = std::fs::remove_file(old);
        let _ = std::fs::remove_file(format!("{}-wal", old.display()));
    }

    Ok(Some(target))
}

/// Undo an update that did not reach the installer: clear the marker and start the Runtime again.
fn abort_update(app: &tauri::AppHandle, reason: String) -> String {
    clear_update_marker();
    spawn_runtime_host_if_needed(app);
    let restarted = (0..30).any(|_| {
        if runtime_is_up() {
            true
        } else {
            std::thread::sleep(Duration::from_secs(1));
            false
        }
    });
    if restarted {
        format!("{} Nothing was installed. The billing service is running again.", reason)
    } else {
        format!("{} Nothing was installed, but the billing service did not restart. Restart the billing PC.", reason)
    }
}

/// Download and install the update, then restart. Called only after the cashier clicks "Update now".
/// Refuses while orders or print jobs are unfinished. Stops the Runtime cleanly before
/// the installer runs, backs up the database, and starts the Runtime again if anything fails first.
#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let update = app.updater()
        .map_err(|e| format!("Updater init failed: {}", e))?
        .check().await
        .map_err(|e| format!("Update check failed: {}", e))?
        .ok_or_else(|| "No update available".to_string())?;

    // 1. Confirm before downloading anything
    tauri::async_runtime::spawn_blocking(check_update_readiness)
        .await
        .map_err(|e| format!("Readiness check failed: {}", e))??;

    // 2. Download while the Runtime is still running. This changes nothing on disk yet.
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| format!("Update download failed: {}", e))?;

    // 3. Stop, back up and install. Blocking work runs off the async runtime.
    let app_for_abort = app.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        // New orders or prints may have arrived during the download
        check_update_readiness()?;

        write_update_marker()?;

        // The Runtime answers /runtime/shutdown by exiting, so the reply may never arrive
        let _ = runtime_request("POST", "/runtime/shutdown");
        if !wait_for_runtime_stopped(Duration::from_secs(40)) {
            return Err(abort_update(&app_for_abort, "The billing service did not stop in time.".to_string()));
        }

        if let Err(e) = backup_database() {
            return Err(abort_update(&app_for_abort, format!("Database backup failed: {}.", e)));
        }

        // Windows launches the installer, and this app exits from here on
        update
            .install(bytes)
            .map_err(|e| abort_update(&app_for_abort, format!("Install failed: {}.", e)))
    })
    .await
    .map_err(|e| format!("Update task failed: {}", e))?
}

/// Enable autostart on Windows boot (Run registry key).
#[tauri::command]
fn enable_autostart(app: tauri::AppHandle) -> Result<(), String> {
    app.autolaunch()
        .enable()
        .map_err(|e| format!("Failed to enable autostart: {}", e))
}

/// Disable autostart.
#[tauri::command]
fn disable_autostart(app: tauri::AppHandle) -> Result<(), String> {
    app.autolaunch()
        .disable()
        .map_err(|e| format!("Failed to disable autostart: {}", e))
}

/// Check if autostart is currently enabled.
#[tauri::command]
fn is_autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(app.autolaunch().is_enabled().unwrap_or(false))
}

/// Update the tray tooltip connection status from the frontend.
/// Called by the frontend's socket connection status handler.
#[tauri::command]
fn update_connection_status(app: tauri::AppHandle, status: String) -> Result<(), String> {
    if let Ok(mut guard) = TRAY_CONNECTION_STATUS.lock() {
        *guard = status;
    }
    update_tray_tooltip(&app);
    Ok(())
}

// ── Runtime Host fallback spawn ──────────────────────────────────────────────
// The Cashier never spawns edge-server.exe directly. Instead, if the Runtime
// is not reachable on port 3101, it spawns the Runtime Host (softshape-host.exe),
// which in turn supervises edge-server.exe and print-service.exe with crash-loop
// guards, health probes, and automatic restart.
//
// This fallback handles deployment edge cases:
//   - Runtime Host failed to install
//   - Windows Startup disabled
//   - Print Agent not installed correctly
//   - Antivirus quarantined Runtime Host
//
// The Cashier remains a client — it does not supervise or kill the Runtime.
// CREATE_NO_WINDOW (0x08000000) ensures no visible console window.

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn spawn_runtime_host_if_needed(app: &tauri::AppHandle) {
    if check_edge_server_health().0 {
        return; // Runtime already running
    }

    // Look for softshape-host.exe in resources, then in common install locations
    let exe = match app.path().resource_dir() {
        Ok(dir) if dir.join("softshape-host.exe").exists() => dir.join("softshape-host.exe"),
        _ => {
            // Check alongside the Cashier executable
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.to_path_buf()));
            match exe_dir {
                Some(dir) if dir.join("softshape-host.exe").exists() => dir.join("softshape-host.exe"),
                _ => {
                    eprintln!("[Runtime] softshape-host.exe not found — cannot start Runtime. \
                              The Cashier will run in offline mode. Reinstall Softshape to fix this.");
                    return;
                }
            }
        }
    };

    eprintln!("[Runtime] Spawning Runtime Host: {}", exe.display());

    let mut cmd = std::process::Command::new(&exe);
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    match cmd.spawn() {
        Ok(child) => {
            eprintln!("[Runtime] Spawned softshape-host.exe pid={}", child.id());
            // Detach: forget the handle so dropping it does not kill the child.
            std::mem::forget(child);
        }
        Err(e) => {
            eprintln!("[Runtime] Failed to spawn softshape-host.exe: {}. \
                       The Cashier will run in offline mode.", e);
        }
    }
}

/// Shutdown the Runtime via POST /runtime/shutdown.
/// Called by the tray "Shutdown Runtime" action.
#[tauri::command]
fn shutdown_runtime() -> Result<(), String> {
    let port = get_edge_port();
    let addr = format!("127.0.0.1:{}", port);
    let mut stream = TcpStream::connect_timeout(
        &addr.parse().map_err(|e| format!("Invalid address: {}", e))?,
        Duration::from_secs(2),
    )
    .map_err(|e| format!("Cannot connect to Runtime on port {}: {}. Is the Softshape Runtime running?", port, e))?;

    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let request = "POST /runtime/shutdown HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";
    stream.write_all(request.as_bytes())
        .map_err(|e| format!("Failed to send shutdown request: {}", e))?;

    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);

    if response.starts_with("HTTP/1.1 200") {
        Ok(())
    } else {
        let status_line = response.lines().next().unwrap_or("no response");
        Err(format!("Runtime shutdown failed: {}", status_line))
    }
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Focus existing window when a second instance is launched
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["ai.softshape.cashier"]),
        ))
        .setup(|app| {
            // Enable autostart by default on first run
            let autostart = app.autolaunch();
            if !autostart.is_enabled().unwrap_or(false) {
                let _ = autostart.enable();
                eprintln!("[Autostart] Enabled on first run");
            }

            // A leftover update marker (from an update that was interrupted) must not
            // keep the Runtime Host from starting the Runtime.
            clear_update_marker();

            // Launch the Runtime Host if the Runtime isn't already running.
            // The Cashier never spawns edge-server.exe directly — it spawns the
            // Runtime Host, which supervises edge-server + print service.
            spawn_runtime_host_if_needed(&app.handle());

            // Build system tray with Show / Restart Runtime / Shutdown Runtime
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::TrayIconBuilder;

            let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let restart_item = MenuItem::with_id(app, "restart_runtime", "Restart Runtime", true, None::<&str>)?;
            let shutdown_item = MenuItem::with_id(app, "shutdown_runtime", "Shutdown Runtime", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &restart_item, &shutdown_item])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("SoftShape Cashier")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "restart_runtime" => {
                        // Restart the Runtime via POST /runtime/restart.
                        // If edge is dead, re-spawn the Runtime Host.
                        let port = get_edge_port();
                        let addr = format!("127.0.0.1:{}", port);
                        let restart_ok = TcpStream::connect_timeout(
                            &addr.parse().unwrap_or_else(|_| "127.0.0.1:3101".parse().unwrap()),
                            Duration::from_secs(2),
                        ).and_then(|mut stream| {
                            let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                            let req = "POST /runtime/restart HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";
                            stream.write_all(req.as_bytes())?;
                            let mut resp = String::new();
                            let _ = stream.read_to_string(&mut resp);
                            if resp.starts_with("HTTP/1.1 200") { Ok(()) } else { Err(std::io::Error::new(std::io::ErrorKind::Other, "non-200")) }
                        });
                        if restart_ok.is_err() {
                            eprintln!("[Tray] Runtime restart failed — re-spawning Runtime Host");
                            spawn_runtime_host_if_needed(app);
                        }
                    }
                    "shutdown_runtime" => {
                        // Shutdown the Runtime via POST /runtime/shutdown, then exit Cashier.
                        let _ = shutdown_runtime();
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Close-to-tray: intercept close request, hide window instead
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_printers,
            print_raw,
            print_network,
            get_app_version,
            check_for_update,
            install_update,
            get_edge_server_status,
            restart_edge_server,
            shutdown_runtime,
            test_print,
            enable_autostart,
            disable_autostart,
            is_autostart_enabled,
            update_connection_status
        ])
        .build(tauri::generate_context!())
        .expect("error while building SoftShape Cashier");

    // Phase 2: The print bridge TCP server has been removed. The Runtime now
    // uses the isolated Rust print service on :3103 for all physical printing.
    // The Cashier retains print_raw/print_network/list_printers Tauri commands
    // for the settings page test-print button only.

    // Phase 1.2: The Cashier no longer spawns or supervises the edge-server.
    // The Runtime (edge-server.exe) is started by the Softshape Runtime Host
    // (Phase 3) or Windows autostart. The Cashier connects to it as a client.
    // If the Runtime is not running, the UI shows a "Runtime offline" banner.

    eprintln!("[Cashier] Started in client mode — edge-server supervision moved to Runtime Host");

    app.run(move |_app_handle, event| {
        if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
            // Nothing to clean up — no print bridge, no edge-server child.
            // The Runtime survives Cashier closure.
        }
    });
}

#[cfg(test)]
mod update_safety_tests {
    use super::*;

    // One test covers the whole backup path, because it sets a process-wide env var
    #[test]
    fn backup_copies_the_database_and_keeps_the_newest_ten() {
        let dir = std::env::temp_dir().join(format!("softshape-backup-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("edge.db");
        std::fs::write(&db, b"live-orders").unwrap();
        std::env::set_var("EDGE_DB_PATH", &db);

        // Older backups already on disk, plus the one this call creates
        let backups_dir = dir.join("backups");
        std::fs::create_dir_all(&backups_dir).unwrap();
        for i in 0..12 {
            std::fs::write(backups_dir.join(format!("edge-pre-update-100000000{:02}.db", i)), b"old").unwrap();
        }

        let created = backup_database().unwrap().expect("a backup should be created");
        assert_eq!(std::fs::read(&created).unwrap(), b"live-orders");

        let kept = std::fs::read_dir(&backups_dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with("edge-pre-update-"))
            .count();
        assert_eq!(kept, BACKUPS_TO_KEEP);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
