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
            if stream.read_to_string(&mut response).is_err() {
                return (false, "Failed to read health response".to_string());
            }
            if response.starts_with("HTTP/1.1 200") {
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

/// Check for updates using Tauri's built-in updater.
#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<bool, String> {
    let update = app.updater()
        .map_err(|e| format!("Updater init failed: {}", e))?
        .check().await
        .map_err(|e| format!("Update check failed: {}", e))?;
    if let Some(update) = update {
        update.download_and_install(|_, _| {}, || {}).await
            .map_err(|e| format!("Update install failed: {}", e))?;
        Ok(true)
    } else {
        Ok(false)
    }
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

// ── Edge server spawn (fallback for missing Runtime Host) ────────────────────
// Phase 1.2 removed spawn logic expecting an external "Softshape Runtime Host"
// (Phase 3) to launch edge-server.exe. That host was never built, so the
// bundled edge-server.exe never starts and port 3101 has nothing listening.
// This restores a minimal spawn-on-startup fallback: if the health check fails,
// launch the bundled edge-server.exe as a detached child. The Cashier remains
// a client — it does not supervise or kill the process.
fn spawn_edge_server_if_needed(app: &tauri::AppHandle) {
    if check_edge_server_health().0 {
        return; // already running
    }
    let exe = match app.path().resource_dir() {
        Ok(dir) if dir.join("edge-server.exe").exists() => dir.join("edge-server.exe"),
        _ => {
            eprintln!("[Edge] edge-server.exe not found in resources; cannot spawn");
            return;
        }
    };
    match std::process::Command::new(&exe)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
    {
        Ok(child) => {
            eprintln!("[Edge] Spawned edge-server.exe pid={}", child.id());
            // Detach: forget the handle so dropping it does not kill the child.
            std::mem::forget(child);
        }
        Err(e) => eprintln!("[Edge] Failed to spawn edge-server.exe: {}", e),
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

            // Launch the bundled edge-server.exe if it isn't already running.
            // The Runtime Host (Phase 3) was never built, so the Cashier must
            // spawn the edge-server itself as a fallback.
            spawn_edge_server_if_needed(&app.handle());

            // Build system tray with Show/Quit menu
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::TrayIconBuilder;

            let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

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
                    "quit" => {
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
            check_for_updates,
            get_edge_server_status,
            restart_edge_server,
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
