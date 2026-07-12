#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};
use tauri_plugin_updater::UpdaterExt;

#[cfg(windows)]
mod windows_printing;

#[derive(Debug, Serialize, Deserialize)]
struct PrinterInfo {
    name: String,
    #[serde(rename = "isDefault")]
    is_default: bool,
}

// ── Edge server sidecar management ───────────────────────────────────────────
// The edge-server is a compiled Bun binary that runs as a subprocess on port 3100.
// It provides local SQLite, offline order creation, KOT printing, and LAN API.
// We spawn it on app startup and kill it on app shutdown.

static EDGE_SERVER_CHILD: Mutex<Option<Child>> = Mutex::new(None);

fn spawn_edge_server(app: &tauri::AppHandle) {
    // Resolve the edge-server binary path from bundled resources
    let resource_path = app
        .path()
        .resource_dir()
        .expect("Failed to get resource dir");

    let edge_server_exe = resource_path.join("edge-server.exe");

    // In dev mode, the binary might not exist yet — log and skip
    if !edge_server_exe.exists() {
        eprintln!("[EdgeServer] Binary not found at {:?} — edge server will not start (dev mode?)", edge_server_exe);
        return;
    }

    // Pass through environment variables for edge-server configuration
    let port = std::env::var("EDGE_PORT").unwrap_or_else(|_| "3100".to_string());

    match Command::new(&edge_server_exe)
        .env("EDGE_PORT", &port)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => {
            let pid = child.id();
            eprintln!("[EdgeServer] Started edge-server (PID: {}) on port {}", pid, port);
            *EDGE_SERVER_CHILD.lock().unwrap() = Some(child);
        }
        Err(e) => {
            eprintln!("[EdgeServer] Failed to start edge-server: {}", e);
        }
    }
}

fn kill_edge_server() {
    if let Some(mut child) = EDGE_SERVER_CHILD.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
        eprintln!("[EdgeServer] Stopped edge-server");
    }
}

/// Check if the edge server is running.
#[tauri::command]
fn is_edge_server_running() -> bool {
    EDGE_SERVER_CHILD.lock().unwrap().is_some()
}

/// List all installed Windows printers.
#[tauri::command]
fn list_printers() -> Vec<PrinterInfo> {
    #[cfg(windows)]
    {
        windows_printing::enumerate_printers().unwrap_or_default()
    }
    #[cfg(not(windows))]
    {
        vec![]
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

    stream
        .write_all(&bytes)
        .map_err(|e| format!("Write failed: {}", e))?;

    Ok(())
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

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            list_printers,
            print_raw,
            print_network,
            get_app_version,
            check_for_updates,
            is_edge_server_running
        ])
        .build(tauri::generate_context!())
        .expect("error while building SoftShape Cashier");

    // Spawn the edge-server subprocess after the app is built
    spawn_edge_server(&app.handle());

    // Run the app event loop, ensuring edge-server is killed on exit
    app.run(|_app_handle, event| {
        if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
            kill_edge_server();
        }
    });
}
