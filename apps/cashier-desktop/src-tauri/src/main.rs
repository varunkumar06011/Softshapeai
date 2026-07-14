#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex};
use std::thread;
use std::time::Duration;
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
static EDGE_SERVER_LAST_ERROR: Mutex<Option<String>> = Mutex::new(None);

#[derive(Debug, Serialize, Deserialize)]
struct EdgeServerStatus {
    running: bool,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PrintBridgeRequest {
    #[serde(rename = "printerName")]
    printer_name: String,
    bytes: Vec<u8>,
}

fn bridge_json_response(status: &str, body: serde_json::Value) -> Vec<u8> {
    let payload = body.to_string();
    format!(
        "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status,
        payload.len(),
        payload,
    ).into_bytes()
}

fn parse_network_printer(printer_name: &str) -> Option<(String, u16)> {
    let (ip, port) = printer_name.rsplit_once(':')?;
    if ip.parse::<std::net::Ipv4Addr>().is_err() {
        return None;
    }
    Some((ip.to_string(), port.parse().ok()?))
}

fn handle_print_bridge_connection(mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(15)));
    let mut request = Vec::with_capacity(8192);
    let mut buffer = [0u8; 8192];
    let header_end;
    let content_length;

    loop {
        let bytes_read = match stream.read(&mut buffer) {
            Ok(0) => return,
            Ok(n) => n,
            Err(_) => return,
        };
        request.extend_from_slice(&buffer[..bytes_read]);
        if request.len() > 10 * 1024 * 1024 {
            let _ = stream.write_all(&bridge_json_response("413 Payload Too Large", serde_json::json!({"ok": false, "error": "Print payload too large"})));
            return;
        }
        if let Some(position) = request.windows(4).position(|window| window == b"\r\n\r\n") {
            header_end = position + 4;
            let headers = String::from_utf8_lossy(&request[..position]);
            content_length = headers.lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    if name.eq_ignore_ascii_case("Content-Length") { value.trim().parse::<usize>().ok() } else { None }
                })
                .unwrap_or(0);
            break;
        }
    }

    while request.len() < header_end + content_length {
        let bytes_read = match stream.read(&mut buffer) {
            Ok(0) => return,
            Ok(n) => n,
            Err(_) => return,
        };
        request.extend_from_slice(&buffer[..bytes_read]);
    }

    let headers = String::from_utf8_lossy(&request[..header_end]);
    let request_line = headers.lines().next().unwrap_or_default();
    if !request_line.starts_with("POST /print ") {
        let _ = stream.write_all(&bridge_json_response("404 Not Found", serde_json::json!({"ok": false, "error": "Not found"})));
        return;
    }

    let body = &request[header_end..header_end + content_length];
    let print_request: PrintBridgeRequest = match serde_json::from_slice(body) {
        Ok(value) => value,
        Err(_) => {
            let _ = stream.write_all(&bridge_json_response("400 Bad Request", serde_json::json!({"ok": false, "error": "Invalid print request"})));
            return;
        }
    };

    let result = if let Some((ip, port)) = parse_network_printer(&print_request.printer_name) {
        print_network(ip, port, print_request.bytes)
    } else {
        print_raw(print_request.printer_name.clone(), print_request.bytes)
    };

    let response = match result {
        Ok(()) => bridge_json_response("200 OK", serde_json::json!({"ok": true, "message": "Printed"})),
        Err(error) => bridge_json_response("500 Internal Server Error", serde_json::json!({"ok": false, "error": error})),
    };
    let _ = stream.write_all(&response);
}

fn start_print_bridge() -> (Arc<AtomicBool>, String) {
    let port = std::env::var("PRINT_BRIDGE_PORT").unwrap_or_else(|_| "3101".to_string());
    let url = format!("http://127.0.0.1:{}", port);
    let stop = Arc::new(AtomicBool::new(false));
    let stop_for_thread = Arc::clone(&stop);

    let listener = match TcpListener::bind(("127.0.0.1", port.parse::<u16>().unwrap_or(3101))) {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("[PrintBridge] Failed to bind {}: {}", url, error);
            return (stop, url);
        }
    };

    let _ = listener.set_nonblocking(true);
    let url_clone = url.clone();
    thread::spawn(move || {
        eprintln!("[PrintBridge] Listening on {}", url_clone);
        while !stop_for_thread.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((stream, _)) => {
                    thread::spawn(|| handle_print_bridge_connection(stream));
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(50));
                }
                Err(error) => {
                    eprintln!("[PrintBridge] Listener error: {}", error);
                    break;
                }
            }
        }
    });

    (stop, url)
}

fn set_edge_server_error(message: String) {
    let _ = EDGE_SERVER_LAST_ERROR.lock().map(|mut guard| *guard = Some(message));
}

fn spawn_edge_server(app: &tauri::AppHandle, print_bridge_url: &str) {
    let _ = EDGE_SERVER_LAST_ERROR.lock().map(|mut guard| *guard = None);

    // Resolve the edge-server binary path from bundled resources
    let resource_path = app
        .path()
        .resource_dir()
        .expect("Failed to get resource dir");

    let mut candidates = vec![resource_path.join("edge-server.exe")];
    if cfg!(debug_assertions) {
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("..")
                .join("..")
                .join("softshape-print-agent")
                .join("softshape-print-agent")
                .join("edge-server")
                .join("edge-server.exe"),
        );
    }

    let Some(edge_server_exe) = candidates.into_iter().find(|path| path.is_file()) else {
        let err = "Bundled edge-server.exe was not found. This usually means the desktop app was not built with the edge server binary. Please reinstall SoftShape Cashier.".to_string();
        eprintln!("[EdgeServer] {}", err);
        set_edge_server_error(err.clone());
        return;
    };

    // Pass through environment variables for edge-server configuration
    let port = std::env::var("EDGE_PORT").unwrap_or_else(|_| "3100".to_string());

    match Command::new(&edge_server_exe)
        .env("EDGE_PORT", &port)
        .env("PRINT_BRIDGE_URL", print_bridge_url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(mut child) => {
            let pid = child.id();
            if let Some(stdout) = child.stdout.take() {
                std::thread::spawn(move || {
                    use std::io::{BufRead, BufReader};
                    for line in BufReader::new(stdout).lines().flatten() {
                        eprintln!("[EdgeServer] {}", line);
                    }
                });
            }
            if let Some(stderr) = child.stderr.take() {
                std::thread::spawn(move || {
                    use std::io::{BufRead, BufReader};
                    for line in BufReader::new(stderr).lines().flatten() {
                        eprintln!("[EdgeServer] {}", line);
                    }
                });
            }
            eprintln!("[EdgeServer] Started edge-server (PID: {}) on port {}", pid, port);
            *EDGE_SERVER_CHILD.lock().unwrap() = Some(child);
        }
        Err(e) => {
            let err = format!("Failed to start edge-server at {:?}: {}", edge_server_exe, e);
            eprintln!("[EdgeServer] {}", err);
            set_edge_server_error(err.clone());
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

/// Check if the edge server is running and report any spawn errors.
#[tauri::command]
fn get_edge_server_status() -> EdgeServerStatus {
    let running = EDGE_SERVER_CHILD.lock().unwrap().is_some();
    let error = EDGE_SERVER_LAST_ERROR.lock().unwrap().clone();
    EdgeServerStatus { running, error }
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
            get_edge_server_status
        ])
        .build(tauri::generate_context!())
        .expect("error while building SoftShape Cashier");

    let (print_bridge_stop, print_bridge_url) = start_print_bridge();
    spawn_edge_server(&app.handle(), &print_bridge_url);

    app.run(move |_app_handle, event| {
        if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
            print_bridge_stop.store(true, Ordering::Relaxed);
            kill_edge_server();
        }
    });
}
