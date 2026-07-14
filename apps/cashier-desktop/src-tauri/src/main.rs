#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
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
static EDGE_SERVER_DIAGNOSTICS: Mutex<Option<String>> = Mutex::new(None);
static EDGE_SERVER_LAST_ERROR: Mutex<Option<String>> = Mutex::new(None);

#[derive(Debug, Serialize, Deserialize)]
struct EdgeServerStatus {
    running: bool,
    error: Option<String>,
    diagnostics: Option<String>,
    app_version: String,
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

fn set_edge_server_diagnostics(message: String) {
    let _ = EDGE_SERVER_DIAGNOSTICS.lock().map(|mut guard| *guard = Some(message));
}

/// Bounded recursive search for a file named `edge-server.exe` under `root`.
/// Caps depth and file visits so a packaging regression never freezes startup.
fn find_edge_server_recursive(root: &Path, max_depth: usize, max_files: usize) -> (Option<PathBuf>, usize, Duration) {
    let started = Instant::now();
    let mut files_walked = 0usize;
    let mut stack: Vec<(PathBuf, usize)> = vec![(root.to_path_buf(), 0)];

    while let Some((dir, depth)) = stack.pop() {
        if depth > max_depth {
            continue;
        }
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            files_walked += 1;
            if files_walked > max_files {
                return (None, files_walked, started.elapsed());
            }
            let path = entry.path();
            if path.is_dir() {
                if depth < max_depth {
                    stack.push((path, depth + 1));
                }
            } else if path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.eq_ignore_ascii_case("edge-server.exe"))
                .unwrap_or(false)
            {
                return (Some(path), files_walked, started.elapsed());
            }
        }
    }

    (None, files_walked, started.elapsed())
}

/// Kill any process currently listening on `port` (Windows). Best-effort; never panics.
#[cfg(windows)]
fn kill_process_on_port(port: &str) {
    let netstat = Command::new("cmd")
        .args(["/C", &format!("netstat -ano | findstr :{}", port)])
        .output();
    let Ok(output) = netstat else {
        return;
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut pids = std::collections::HashSet::new();
    for line in stdout.lines() {
        // Prefer LISTENING rows so we don't kill random clients.
        if !line.contains("LISTENING") {
            continue;
        }
        if let Some(pid) = line.split_whitespace().last() {
            if pid.chars().all(|c| c.is_ascii_digit()) {
                pids.insert(pid.to_string());
            }
        }
    }
    for pid in pids {
        eprintln!("[EdgeServer] Killing stale process on port {} (PID {})", port, pid);
        let _ = Command::new("taskkill")
            .args(["/F", "/PID", &pid])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

#[cfg(not(windows))]
fn kill_process_on_port(_port: &str) {}

fn attach_edge_server_logs(child: &mut Child) {
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
}

fn spawn_edge_server_process(exe: &Path, port: &str, print_bridge_url: &str) -> Result<Child, std::io::Error> {
    Command::new(exe)
        .env("EDGE_PORT", port)
        .env("PRINT_BRIDGE_URL", print_bridge_url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
}

fn spawn_edge_server(app: &tauri::AppHandle, print_bridge_url: &str) {
    let _ = EDGE_SERVER_LAST_ERROR.lock().map(|mut guard| *guard = None);
    let _ = EDGE_SERVER_DIAGNOSTICS.lock().map(|mut guard| *guard = None);

    // Resolve the edge-server binary path from bundled resources
    let resource_path = app
        .path()
        .resource_dir()
        .expect("Failed to get resource dir");

    let mut candidates = vec![resource_path.join("edge-server.exe")];
    // Legacy fallback: Tauri array-form resources rewrote ".." to "_up_" folders.
    // Keep this so already-built / future-regressed installers still resolve.
    candidates.push(
        resource_path
            .join("_up_")
            .join("_up_")
            .join("_up_")
            .join("softshape-print-agent")
            .join("softshape-print-agent")
            .join("edge-server")
            .join("edge-server.exe"),
    );
    if cfg!(debug_assertions) {
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("..")
                .join("..")
                .join("..")
                .join("softshape-print-agent")
                .join("softshape-print-agent")
                .join("edge-server")
                .join("edge-server.exe"),
        );
        // Sibling checkout used during local monorepo development.
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("..")
                .join("..")
                .join("..")
                .join("..")
                .join("softshape-print-agent")
                .join("softshape-print-agent")
                .join("edge-server")
                .join("edge-server.exe"),
        );
    }

    let checked: Vec<String> = candidates
        .iter()
        .map(|p| format!("{} (exists={})", p.display(), p.exists()))
        .collect();

    let mut edge_server_exe = candidates.iter().find(|path| path.is_file()).cloned();
    let mut scan_files = 0usize;
    let mut scan_elapsed = Duration::from_millis(0);
    let mut found_via_scan = false;

    if edge_server_exe.is_none() {
        let (found, walked, elapsed) = find_edge_server_recursive(&resource_path, 3, 500);
        scan_files = walked;
        scan_elapsed = elapsed;
        if let Some(path) = found {
            eprintln!(
                "[EdgeServer] Found via fallback scan at {} — resources config is misconfigured, fix tauri.conf.json",
                path.display()
            );
            found_via_scan = true;
            edge_server_exe = Some(path);
        }
    }

    let diagnostics = format!(
        "app_version={}\nresource_dir={}\ncandidates=[{}]\nscan_files_walked={}\nscan_elapsed_ms={}\nfound_via_scan={}",
        env!("CARGO_PKG_VERSION"),
        resource_path.display(),
        checked.join("; "),
        scan_files,
        scan_elapsed.as_millis(),
        found_via_scan
    );
    set_edge_server_diagnostics(diagnostics.clone());

    let Some(edge_server_exe) = edge_server_exe else {
        let err = format!(
            "Bundled edge-server.exe was not found. {}. This usually means the desktop app was not built with the edge server binary. Please reinstall SoftShape Cashier.",
            diagnostics.replace('\n', " ")
        );
        eprintln!("[EdgeServer] {}", err);
        set_edge_server_error(err);
        return;
    };

    // Pass through environment variables for edge-server configuration
    let port = std::env::var("EDGE_PORT").unwrap_or_else(|_| "3100".to_string());

    // First attempt. If spawn fails, or the child dies immediately (stale port bind),
    // free EDGE_PORT once and retry — never loop forever.
    let first = spawn_edge_server_process(&edge_server_exe, &port, print_bridge_url);
    let need_retry = match first {
        Ok(mut child) => {
            thread::sleep(Duration::from_millis(300));
            match child.try_wait() {
                Ok(Some(status)) => {
                    eprintln!(
                        "[EdgeServer] Process exited immediately with {} — likely port {} still held; will retry once",
                        status, port
                    );
                    true
                }
                Ok(None) => {
                    let pid = child.id();
                    attach_edge_server_logs(&mut child);
                    eprintln!("[EdgeServer] Started edge-server (PID: {}) on port {}", pid, port);
                    *EDGE_SERVER_CHILD.lock().unwrap() = Some(child);
                    false
                }
                Err(e) => {
                    let err = format!("Unable to inspect edge-server process: {}", e);
                    eprintln!("[EdgeServer] {}", err);
                    set_edge_server_error(err);
                    false
                }
            }
        }
        Err(e) => {
            eprintln!(
                "[EdgeServer] First spawn failed at {:?}: {} — retrying once after freeing port {}",
                edge_server_exe, e, port
            );
            true
        }
    };

    if need_retry {
        kill_process_on_port(&port);
        thread::sleep(Duration::from_millis(400));
        match spawn_edge_server_process(&edge_server_exe, &port, print_bridge_url) {
            Ok(mut child) => {
                let pid = child.id();
                attach_edge_server_logs(&mut child);
                eprintln!(
                    "[EdgeServer] Started edge-server after port cleanup (PID: {}) on port {}",
                    pid, port
                );
                *EDGE_SERVER_CHILD.lock().unwrap() = Some(child);
            }
            Err(e2) => {
                let err = format!(
                    "Failed to start edge-server at {:?} after port-cleanup retry: {}",
                    edge_server_exe, e2
                );
                eprintln!("[EdgeServer] {}", err);
                set_edge_server_error(err);
            }
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
    let mut child_guard = EDGE_SERVER_CHILD.lock().unwrap();
    let mut running = false;

    if let Some(child) = child_guard.as_mut() {
        match child.try_wait() {
            Ok(None) => running = true,
            Ok(Some(status)) => {
                let message = format!("edge-server exited unexpectedly with status {}", status);
                eprintln!("[EdgeServer] {}", message);
                set_edge_server_error(message);
                child_guard.take();
            }
            Err(error) => {
                let message = format!("Unable to inspect edge-server process: {}", error);
                eprintln!("[EdgeServer] {}", message);
                set_edge_server_error(message);
                child_guard.take();
            }
        }
    }

    let error = EDGE_SERVER_LAST_ERROR.lock().unwrap().clone();
    let diagnostics = EDGE_SERVER_DIAGNOSTICS.lock().unwrap().clone();
    EdgeServerStatus {
        running,
        error,
        diagnostics,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    }
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
