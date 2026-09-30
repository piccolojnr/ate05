use super::{spooler_error, write_raw_bytes, PrinterQueue};
use std::{mem::size_of, ptr};
use windows_sys::Win32::{
    Foundation::GetLastError,
    Graphics::Printing::{
        AbortPrinter, ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, OpenPrinterW,
        StartDocPrinterW, StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_ENUM_CONNECTIONS,
        PRINTER_ENUM_LOCAL, PRINTER_HANDLE, PRINTER_INFO_2W,
    },
};

// Drop order aborts any unfinished document before closing the printer handle.
struct PrinterHandle(PRINTER_HANDLE);
impl Drop for PrinterHandle {
    fn drop(&mut self) {
        unsafe {
            ClosePrinter(self.0);
        }
    }
}
struct Document<'a> {
    printer: &'a PrinterHandle,
    finished: bool,
}
impl Drop for Document<'_> {
    fn drop(&mut self) {
        if !self.finished {
            unsafe {
                AbortPrinter(self.printer.0);
            }
        }
    }
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}
fn last_error(stage: &str) -> String {
    spooler_error(stage, unsafe { GetLastError() })
}

pub fn send_system(queue: &str, bytes: &[u8]) -> Result<(), String> {
    let queue = wide(queue);
    let mut handle = PRINTER_HANDLE {
        Value: ptr::null_mut(),
    };
    unsafe {
        if OpenPrinterW(queue.as_ptr(), &mut handle, ptr::null()) == 0 {
            return Err(last_error("open"));
        }
        let printer = PrinterHandle(handle);
        let mut title = wide("ATE05 thermal print");
        let mut datatype = wide("RAW");
        let info = DOC_INFO_1W {
            pDocName: title.as_mut_ptr(),
            pOutputFile: ptr::null_mut(),
            pDatatype: datatype.as_mut_ptr(),
        };
        if StartDocPrinterW(printer.0, 1, &info) == 0 {
            return Err(last_error("start document"));
        }
        let mut document = Document {
            printer: &printer,
            finished: false,
        };
        if StartPagePrinter(printer.0) == 0 {
            return Err(last_error("start page"));
        }
        write_raw_bytes(bytes, |chunk| {
            let mut written = 0;
            if WritePrinter(
                printer.0,
                chunk.as_ptr().cast(),
                chunk.len() as u32,
                &mut written,
            ) == 0
            {
                return Err(last_error("write"));
            }
            Ok(written as usize)
        })?;
        if EndPagePrinter(printer.0) == 0 {
            return Err(last_error("end page"));
        }
        if EndDocPrinter(printer.0) == 0 {
            return Err(last_error("end document"));
        }
        document.finished = true;
        Ok(())
    }
}

// The spooler owns the layout, but the backing allocation must be suitably
// aligned for PRINTER_INFO_2W. Strings point into this buffer and are copied
// before it is dropped. Bound every string read to the buffer's extent.
fn buffer_string(buffer: &[usize], value: *const u16) -> String {
    let start = buffer.as_ptr() as usize;
    let end = start + std::mem::size_of_val(buffer);
    let address = value as usize;
    if address < start || address >= end || address % 2 != 0 {
        return String::new();
    }
    let length = ((end - address) / 2).min(4096);
    let units = unsafe { std::slice::from_raw_parts(value, length) };
    let length = units.iter().position(|unit| *unit == 0).unwrap_or(length);
    String::from_utf16_lossy(&units[..length])
}

pub fn list_queues() -> Result<Vec<PrinterQueue>, String> {
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut needed = 0;
    let mut returned = 0;
    unsafe {
        let ok = EnumPrintersW(
            flags,
            ptr::null(),
            2,
            ptr::null_mut(),
            0,
            &mut needed,
            &mut returned,
        );
        if ok == 0 && GetLastError() != 122 {
            return Err(last_error("enumeration"));
        }
        if needed == 0 {
            return Ok(Vec::new());
        }
        // Retry if queues changed between sizing and enumeration. Limit memory
        // and retries rather than exposing unbounded spooler data or errors.
        for _ in 0..3 {
            if needed > 16 * 1024 * 1024 {
                return Err("spooler_error: installed printer queue list is too large".into());
            }
            let bytes = needed;
            let mut buffer = vec![0usize; (bytes as usize).div_ceil(size_of::<usize>())];
            if EnumPrintersW(
                flags,
                ptr::null(),
                2,
                buffer.as_mut_ptr().cast(),
                bytes,
                &mut needed,
                &mut returned,
            ) == 0
            {
                if GetLastError() == 122 {
                    continue;
                }
                return Err(last_error("enumeration"));
            }
            if returned as usize > bytes as usize / size_of::<PRINTER_INFO_2W>() {
                return Err("spooler_error: invalid installed printer queue list".into());
            }
            let entries = std::slice::from_raw_parts(
                buffer.as_ptr().cast::<PRINTER_INFO_2W>(),
                returned as usize,
            );
            let mut queues: Vec<_> = entries
                .iter()
                .filter_map(|info| {
                    let name = buffer_string(&buffer, info.pPrinterName);
                    if name.is_empty() {
                        return None;
                    }
                    Some(PrinterQueue {
                        name,
                        driver_name: buffer_string(&buffer, info.pDriverName),
                        port_name: buffer_string(&buffer, info.pPortName),
                        status: info.Status,
                        jobs: info.cJobs,
                    })
                })
                .collect();
            queues.sort_by(|a, b| a.name.cmp(&b.name));
            queues.dedup_by(|a, b| a.name == b.name);
            return Ok(queues);
        }
    }
    Err("spooler_error: printer queues changed during discovery; try again".into())
}
