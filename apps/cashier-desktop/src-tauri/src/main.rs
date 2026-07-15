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
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent};
use tauri_plugin_updater::UpdaterExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
mod windows_printing;

#[derive(Debug, Serialize, Deserialize)]
struct PrinterInfo {
    name: String,
    #[serde(rename = "isDefault")]
    is_default: bool,
}

// ── Edge server sidecar management ───────────────────────────────────────────
// The edge-server is a compiled Bun binary that runs as a subprocess on port 3101.
// It provides local SQLite, offline order creation, KOT printing, and LAN API.
// We spawn it on app startup and kill it on app shutdown.

static EDGE_SERVER_CHILD: Mutex<Option<Child>> = Mutex::new(None);
static EDGE_SERVER_DIAGNOSTICS: Mutex<Option<String>> = Mutex::new(None);
static EDGE_SERVER_LAST_ERROR: Mutex<Option<String>> = Mutex::new(None);
static EDGE_SERVER_STATE: Mutex<String> = Mutex::new(String::new());
static EDGE_SERVER_READY: AtomicBool = AtomicBool::new(false);
static EDGE_SERVER_EXE: Mutex<Option<PathBuf>> = Mutex::new(None);
static EDGE_SERVER_PORT: Mutex<String> = Mutex::new(String::new());
static EDGE_PRINT_BRIDGE_URL: Mutex<String> = Mutex::new(String::new());

#[derive(Debug, Serialize, Deserialize)]
struct EdgeServerStatus {
    running: bool,
    ready: bool,
    state: String,
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

    let correlation_id = format!("pb-{}-{}", std::process::id(), std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
    let byte_count = print_request.bytes.len();
    let printer_name = &print_request.printer_name;
    eprintln!("[PrintBridge] {} → printer={} bytes={}", correlation_id, printer_name, byte_count);

    let result = if let Some((ip, port)) = parse_network_printer(&print_request.printer_name) {
        print_network(ip, port, print_request.bytes)
    } else {
        print_raw(print_request.printer_name.clone(), print_request.bytes)
    };

    let response = match result {
        Ok(()) => {
            eprintln!("[PrintBridge] {} ✓ printed {} bytes to {}", correlation_id, byte_count, printer_name);
            bridge_json_response("200 OK", serde_json::json!({"ok": true, "message": "Printed", "correlation_id": correlation_id}))
        }
        Err(error) => {
            eprintln!("[PrintBridge] {} ✗ failed: {}", correlation_id, error);
            bridge_json_response("500 Internal Server Error", serde_json::json!({"ok": false, "error": error, "correlation_id": correlation_id}))
        }
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

fn set_edge_server_state(state: &str) {
    if let Ok(mut guard) = EDGE_SERVER_STATE.lock() {
        *guard = state.to_string();
    }
}

fn set_edge_server_ready(ready: bool) {
    EDGE_SERVER_READY.store(ready, Ordering::Relaxed);
}

fn start_edge_health_probe(port: String) {
    set_edge_server_ready(false);
    set_edge_server_state("starting");
    thread::spawn(move || {
        let started = Instant::now();
        let deadline = Duration::from_secs(35);
        let mut attempts = 0u32;
        while started.elapsed() < deadline {
            attempts += 1;
            if let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port.parse::<u16>().unwrap_or(3101))) {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                let request = "GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
                if stream.write_all(request.as_bytes()).is_ok() {
                    let mut response = String::new();
                    if stream.read_to_string(&mut response).is_ok() && response.starts_with("HTTP/1.1 200") {
                        let body = response.split("\r\n\r\n").nth(1).unwrap_or("");
                        if body.contains("\"status\":\"ok\"") {
                            set_edge_server_ready(true);
                            set_edge_server_state("ready");
                            set_edge_server_diagnostics(format!("health=ready\nhealth_attempts={}\nhealth_elapsed_ms={}", attempts, started.elapsed().as_millis()));
                            return;
                        }
                        if body.contains("\"status\":\"error\"") {
                            set_edge_server_state("database_error");
                            set_edge_server_error(format!("Edge server /health reported error state: {}", body));
                            set_edge_server_diagnostics(format!("health=error\nhealth_attempts={}\nhealth_elapsed_ms={}\nbody={}", attempts, started.elapsed().as_millis(), body));
                            return;
                        }
                    }
                }
            }
            thread::sleep(Duration::from_millis(500));
        }
        set_edge_server_state("health_timeout");
        set_edge_server_error(format!("Edge server process is alive but /health did not respond within {} seconds", deadline.as_secs()));
        set_edge_server_diagnostics(format!("health=timeout\nhealth_attempts={}\nhealth_elapsed_ms={}", attempts, started.elapsed().as_millis()));
    });
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

#[cfg(windows)]
fn diagnose_process_on_port(port: &str) -> String {
    let mut cmd = Command::new("cmd");
    cmd.args(["/C", &format!("netstat -ano | findstr LISTENING | findstr :{}", port)]);
    cmd.creation_flags(0x08000000);
    let output = cmd.output();
    let Ok(output) = output else {
        return format!("port={}; owner_lookup=failed", port);
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut owners = Vec::new();
    for line in stdout.lines() {
        if let Some(pid) = line.split_whitespace().last() {
            if pid.chars().all(|c| c.is_ascii_digit()) {
                let mut task_cmd = Command::new("tasklist");
                task_cmd.args(["/FI", &format!("PID eq {}", pid), "/FO", "CSV", "/NH"]);
                task_cmd.creation_flags(0x08000000);
                let task = task_cmd.output()
                    .ok()
                    .map(|value| String::from_utf8_lossy(&value.stdout).trim().to_string())
                    .filter(|value| !value.is_empty())
                    .unwrap_or_else(|| "process_lookup=failed".to_string());
                owners.push(format!("pid={};task={}", pid, task));
            }
        }
    }
    if owners.is_empty() {
        format!("port={};owner=none", port)
    } else {
        format!("port={};{}", port, owners.join(";"))
    }
}

#[cfg(not(windows))]
fn diagnose_process_on_port(port: &str) -> String {
    format!("port={};owner_lookup=unsupported", port)
}

/// Check if a TCP port is free (nothing listening on it).
fn is_port_free(port: &str) -> bool {
    TcpListener::bind(("127.0.0.1", port.parse::<u16>().unwrap_or(3101))).is_ok()
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

/// Kill any process on the port, then wait until the port is actually free.
/// Windows keeps ports in TIME_WAIT for a while after a process is killed,
/// so we poll for up to `timeout_secs` before giving up.
fn free_port_blocking(port: &str, timeout_secs: u64) {
    kill_process_on_port(port);
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    while Instant::now() < deadline {
        if is_port_free(port) {
            return;
        }
        thread::sleep(Duration::from_millis(250));
    }
    eprintln!("[EdgeServer] Port {} still not free after {}s — spawning anyway", port, timeout_secs);
}

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
    let mut cmd = Command::new(exe);
    cmd.env("EDGE_PORT", port)
        .env("PRINT_BRIDGE_URL", print_bridge_url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    cmd.spawn()
}

/// Detect if a legacy standalone edge-server.exe is already listening on the port.
/// This is diagnostic-only: we never kill the foreign process.
#[cfg(windows)]
fn detect_legacy_edge_server(port: &str) -> Option<String> {
    let mut cmd = Command::new("cmd");
    cmd.args(["/C", &format!("netstat -ano | findstr LISTENING | findstr :{}", port)]);
    cmd.creation_flags(0x08000000);
    let output = cmd.output().ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let our_pid = std::process::id();
    let child_pid = EDGE_SERVER_CHILD.lock().ok()
        .and_then(|guard| guard.as_ref().map(|c| c.id()));
    for line in stdout.lines() {
        if let Some(pid_str) = line.split_whitespace().last() {
            if pid_str.chars().all(|c| c.is_ascii_digit()) {
                let pid: u32 = pid_str.parse().ok()?;
                if pid == our_pid {
                    continue;
                }
                if child_pid == Some(pid) {
                    continue;
                }
                let mut task_cmd = Command::new("tasklist");
                task_cmd.args(["/FI", &format!("PID eq {}", pid), "/FO", "CSV", "/NH"]);
                task_cmd.creation_flags(0x08000000);
                let task = task_cmd.output()
                    .ok()
                    .map(|v| String::from_utf8_lossy(&v.stdout).trim().to_string())
                    .unwrap_or_default();
                let is_edge = task.to_lowercase().contains("edge-server");
                return Some(format!(
                    "legacy_standalone_detected: pid={} task={} is_edge_server={}",
                    pid, task, is_edge
                ));
            }
        }
    }
    None
}

#[cfg(not(windows))]
fn detect_legacy_edge_server(_port: &str) -> Option<String> {
    None
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
        set_edge_server_state("binary_missing");
        return;
    };

    // Pass through environment variables for edge-server configuration
    let port = std::env::var("EDGE_PORT").unwrap_or_else(|_| "3101".to_string());
    if let Ok(mut guard) = EDGE_SERVER_EXE.lock() {
        *guard = Some(edge_server_exe.clone());
    }
    if let Ok(mut guard) = EDGE_SERVER_PORT.lock() {
        *guard = port.clone();
    }
    if let Ok(mut guard) = EDGE_PRINT_BRIDGE_URL.lock() {
        *guard = print_bridge_url.to_string();
    }
    set_edge_server_ready(false);
    set_edge_server_state("starting");

    // Detect legacy standalone edge-server that may already own the port.
    // Diagnostic-only: we never kill it, just warn the user.
    if let Some(legacy_info) = detect_legacy_edge_server(&port) {
        eprintln!("[EdgeServer] WARNING: {}", legacy_info);
        let existing = EDGE_SERVER_DIAGNOSTICS.lock().map(|g| g.clone()).unwrap_or(None);
        let combined = match existing {
            Some(d) => format!("{}\n{}", d, legacy_info),
            None => legacy_info.clone(),
        };
        set_edge_server_diagnostics(combined);
    }

    // Preemptive cleanup: if a previous Cashier instance left an orphaned edge-server
    // on this port (e.g. crash, force-quit), kill it and wait for the port to be free.
    // Windows keeps killed ports in TIME_WAIT for up to 4 minutes, so we poll.
    if !is_port_free(&port) {
        eprintln!("[EdgeServer] Port {} occupied — killing stale process before spawn", port);
        free_port_blocking(&port, 5);
    }

    // First attempt. If spawn fails, or the child dies immediately (stale port bind),
    // free EDGE_PORT once and retry — never loop forever.
    let first = spawn_edge_server_process(&edge_server_exe, &port, print_bridge_url);
    let need_retry = match first {
        Ok(mut child) => {
            thread::sleep(Duration::from_millis(300));
            match child.try_wait() {
                Ok(Some(status)) => {
                    let port_diagnostic = diagnose_process_on_port(&port);
                    let message = format!("Edge server exited immediately with {}. {}", status, port_diagnostic);
                    eprintln!("[EdgeServer] {}", message);
                    set_edge_server_error(message);
                    set_edge_server_diagnostics(port_diagnostic);
                    set_edge_server_state("port_conflict");
                    true
                }
                Ok(None) => {
                    let pid = child.id();
                    attach_edge_server_logs(&mut child);
                    eprintln!("[EdgeServer] Started edge-server (PID: {}) on port {}", pid, port);
                    *EDGE_SERVER_CHILD.lock().unwrap() = Some(child);
                    start_edge_health_probe(port.clone());
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
            let port_diagnostic = diagnose_process_on_port(&port);
            let message = format!("First edge-server spawn failed at {:?}: {}. {}", edge_server_exe, e, port_diagnostic);
            eprintln!("[EdgeServer] {}", message);
            set_edge_server_error(message);
            set_edge_server_diagnostics(port_diagnostic);
            set_edge_server_state("port_conflict");
            true
        }
    };

    if need_retry {
        free_port_blocking(&port, 10);
        match spawn_edge_server_process(&edge_server_exe, &port, print_bridge_url) {
            Ok(mut child) => {
                let pid = child.id();
                attach_edge_server_logs(&mut child);
                eprintln!(
                    "[EdgeServer] Started edge-server after retry (PID: {}) on port {}",
                    pid, port
                );
                *EDGE_SERVER_CHILD.lock().unwrap() = Some(child);
                start_edge_health_probe(port.clone());
            }
            Err(e2) => {
                let err = format!(
                    "Failed to start edge-server at {:?} after port-cleanup retry: {}",
                    edge_server_exe, e2
                );
                eprintln!("[EdgeServer] {}", err);
                set_edge_server_error(err);
                set_edge_server_state("exited");
            }
        }
    }
}

#[tauri::command]
fn restart_edge_server(app: tauri::AppHandle) -> Result<(), String> {
    kill_edge_server();
    let print_bridge_url = EDGE_PRINT_BRIDGE_URL.lock()
        .map(|guard| guard.clone())
        .unwrap_or_else(|_| "http://127.0.0.1:3101".to_string());
    spawn_edge_server(&app, &print_bridge_url);
    Ok(())
}

fn kill_edge_server() {
    set_edge_server_ready(false);
    set_edge_server_state("stopping");
    if let Some(mut child) = EDGE_SERVER_CHILD.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
        eprintln!("[EdgeServer] Stopped edge-server");
    }
    set_edge_server_state("stopped");
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
    let state = EDGE_SERVER_STATE.lock().map(|guard| guard.clone()).unwrap_or_else(|_| "unknown".to_string());
    EdgeServerStatus {
        running,
        ready: EDGE_SERVER_READY.load(Ordering::Relaxed),
        state,
        error,
        diagnostics,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

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

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            list_printers,
            print_raw,
            print_network,
            get_app_version,
            check_for_updates,
            get_edge_server_status,
            restart_edge_server,
            test_print
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
