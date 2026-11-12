#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tauri_plugin_updater::UpdaterExt;

#[cfg(windows)]
mod windows_printing;

#[derive(Debug, Serialize, Deserialize)]
struct PrinterInfo {
    name: String,
    #[serde(rename = "isDefault")]
    is_default: bool,
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

/// What the frontend shows in the "Update now" banner.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    available: bool,
    current_version: String,
    version: Option<String>,
    notes: Option<String>,
}

/// Download progress sent to the frontend as the `update-progress` event.
#[derive(Serialize, Clone)]
struct UpdateProgress {
    downloaded: u64,
    total: Option<u64>,
}

/// Check whether a newer version exists. This NEVER downloads or installs anything:
/// the user must click "Update now", which calls `install_update`.
#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    let current_version = app.package_info().version.to_string();
    let update = app.updater()
        .map_err(|e| format!("Updater init failed: {}", e))?
        .check().await
        .map_err(|e| format!("Update check failed: {}", e))?;
    Ok(match update {
        Some(u) => UpdateInfo {
            available: true,
            current_version,
            version: Some(u.version.clone()),
            notes: u.body.clone(),
        },
        None => UpdateInfo { available: false, current_version, version: None, notes: None },
    })
}

/// Download and install the update. Only ever invoked by the "Update now" button.
/// On Windows the installer closes this app and starts the new version when it finishes.
#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let update = app.updater()
        .map_err(|e| format!("Updater init failed: {}", e))?
        .check().await
        .map_err(|e| format!("Update check failed: {}", e))?
        .ok_or_else(|| "No update available".to_string())?;
    let progress_app = app.clone();
    let mut downloaded: u64 = 0;
    update.download_and_install(
        move |chunk, total| {
            downloaded += chunk as u64;
            let _ = progress_app.emit("update-progress", UpdateProgress { downloaded, total });
        },
        || {},
    ).await
        .map_err(|e| format!("Update install failed: {}", e))?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            list_printers,
            print_raw,
            print_network,
            get_app_version,
            check_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running SoftShape Admin");
}
