/// Windows raw printing via Win32 API (Winspool)
///
/// Uses RawDocToPrinter to send ESC/POS bytes directly to the printer
/// without showing a print dialog.

use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::HANDLE;
use windows::Win32::Graphics::Printing::{
    ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, OpenPrinterW,
    StartDocPrinterW, StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_INFO_2W,
    PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL,
};

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn last_windows_error() -> String {
    windows::core::Error::from_win32().to_string()
}

/// Enumerate all installed printers on this machine.
/// Uses level 2 (PRINTER_INFO_2W) to access the Attributes field for default printer detection.
pub fn enumerate_printers() -> Result<Vec<super::PrinterInfo>, String> {
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut needed: u32 = 0;
    let mut returned: u32 = 0;

    let _ = unsafe {
        EnumPrintersW(
            flags,
            None,
            2,
            None,
            &mut needed,
            &mut returned,
        )
    };

    if needed == 0 {
        return Ok(vec![]);
    }

    let mut buffer = vec![0u8; needed as usize];

    let result = unsafe {
        EnumPrintersW(
            flags,
            None,
            2,
            Some(&mut buffer),
            &mut needed,
            &mut returned,
        )
    };

    if result.is_err() {
        return Err(format!("EnumPrintersW failed: {}", last_windows_error()));
    }

       // PRINTER_ATTRIBUTE_DEFAULT = 0x00000001
    const PRINTER_ATTRIBUTE_DEFAULT: u32 = 0x00000001;

    let mut printers = Vec::new();
    let struct_size = std::mem::size_of::<PRINTER_INFO_2W>();
    let count = returned as usize;

    for i in 0..count {
        let offset = i * struct_size;
        if offset + struct_size > buffer.len() {
            break;
        }

        let info: &PRINTER_INFO_2W = unsafe {
            &*(buffer.as_ptr().add(offset) as *const PRINTER_INFO_2W)
        };

        let name_pcwstr = info.pPrinterName;
        if !name_pcwstr.is_null() {
            let name = unsafe { name_pcwstr.to_string() }.unwrap_or_else(|_| "Unnamed printer".to_string());
            let is_default = (info.Attributes & PRINTER_ATTRIBUTE_DEFAULT) != 0;
            printers.push(super::PrinterInfo {
                name,
                is_default,
            });
        }
    }

    Ok(printers)
}

/// Send raw bytes to a printer by name. No print dialog.
pub fn raw_print(printer_name: &str, bytes: &[u8]) -> Result<(), String> {
    let name_wide = to_wide(printer_name);
    let mut handle = HANDLE(0);

    let result = unsafe {
        OpenPrinterW(
            PCWSTR::from_raw(name_wide.as_ptr()),
            &mut handle as *mut _,
            None,
        )
    };

    if result.is_err() {
        return Err(format!("Cannot open printer {}: {}", printer_name, last_windows_error()));
    }

    let mut doc_name = to_wide("SoftShape Print Job");
    let mut raw_type = to_wide("RAW");
    let doc_info = DOC_INFO_1W {
        pDocName: PWSTR::from_raw(doc_name.as_mut_ptr()),
        pOutputFile: PWSTR::null(),
        pDatatype: PWSTR::from_raw(raw_type.as_mut_ptr()),
    };

    let job_id = unsafe { StartDocPrinterW(handle, 1, &doc_info) };
    if job_id == 0 {
        unsafe { let _ = ClosePrinter(handle); };
        return Err(format!("StartDocPrinter failed: {}", last_windows_error()));
    }

    let page_result = unsafe { StartPagePrinter(handle) };
    if !page_result.as_bool() {
        unsafe {
            EndDocPrinter(handle);
            let _ = ClosePrinter(handle);
        }
        return Err(format!("StartPagePrinter failed: {}", last_windows_error()));
    }

    let mut written: u32 = 0;
    let write_result = unsafe {
        WritePrinter(
            handle,
            bytes.as_ptr() as *const _,
            bytes.len() as u32,
            &mut written,
        )
    };

    unsafe {
        EndPagePrinter(handle);
        EndDocPrinter(handle);
        let _ = ClosePrinter(handle);
    }

    if !write_result.as_bool() {
        return Err(format!(
            "WritePrinter failed (wrote {} of {} bytes): {}",
            written,
            bytes.len(),
            last_windows_error()
        ));
    }

    Ok(())
}
