use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterRequest {
    pub connection_type: String,
    #[serde(default)]
    pub address: String,
    pub port: Option<u16>,
    pub queue_name: Option<String>,
    pub paper_width: u16,
    pub cutter_enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterQueue {
    /// Exact installed queue name used by OpenPrinterW; never a port name.
    pub name: String,
    pub driver_name: String,
    pub port_name: String,
    pub status: u32,
    pub jobs: u32,
}

#[derive(Debug, PartialEq)]
pub enum Transport {
    Network,
    System,
}

pub fn transport(request: &PrinterRequest) -> Result<Transport, String> {
    if !matches!(request.paper_width, 58 | 80) {
        return Err("invalid_configuration: paper width must be 58 or 80 mm".into());
    }
    match request.connection_type.as_str() {
        "network" => {
            if request.address.trim().is_empty() || request.address.contains('\0') {
                return Err("invalid_configuration: network printer address is required".into());
            }
            if request.port.is_none_or(|port| port == 0) {
                return Err("invalid_configuration: network printer port must be 1 to 65535".into());
            }
            Ok(Transport::Network)
        }
        "system" => {
            let name = request.queue_name.as_deref().unwrap_or("");
            if name.trim().is_empty() || name.contains('\0') || name.encode_utf16().count() > 1024 {
                return Err("invalid_configuration: select a valid installed printer queue".into());
            }
            if !request.address.is_empty() || request.port.is_some() {
                return Err("invalid_configuration: system printers use queueName, not address or port".into());
            }
            Ok(Transport::System)
        }
        "usb" => Err("unsupported_transport: direct USB printing is not enabled; select an installed Windows queue using system".into()),
        _ => Err("unsupported_transport: unknown printer connection type".into()),
    }
}

#[cfg(windows)]
#[path = "printing_windows.rs"]
mod windows;
#[cfg(windows)]
pub use windows::{list_queues, send_system};

#[cfg(not(windows))]
pub fn list_queues() -> Result<Vec<PrinterQueue>, String> {
    Err("unsupported_platform: installed printer queues are supported only on Windows".into())
}

#[cfg(not(windows))]
pub fn send_system(_queue: &str, _bytes: &[u8]) -> Result<(), String> {
    Err("unsupported_platform: system printing is supported only on Windows".into())
}

/// Complete partial spooler writes without retrying a failed submission.
#[cfg(any(windows, test))]
fn write_raw_bytes(
    mut bytes: &[u8],
    mut write: impl FnMut(&[u8]) -> Result<usize, String>,
) -> Result<(), String> {
    while !bytes.is_empty() {
        let chunk = &bytes[..bytes.len().min(u32::MAX as usize)];
        let written = write(chunk)?;
        if written == 0 || written > chunk.len() {
            return Err(
                "write_failed: Windows spooler made no valid progress writing RAW data".into(),
            );
        }
        bytes = &bytes[written..];
    }
    Ok(())
}

/// Fixed messages and numeric codes keep driver-provided strings out of errors.
#[cfg(any(windows, test))]
fn spooler_error(stage: &str, code: u32) -> String {
    match code {
        1801 | 2 if stage == "open" => {
            "queue_not_found: installed printer queue was not found; refresh printer setup".into()
        }
        5 => "spooler_error: access to the installed printer queue was denied".into(),
        1722 | 1062 => "spooler_error: Windows Print Spooler is unavailable".into(),
        _ if stage == "write" => {
            format!("write_failed: Windows spooler rejected RAW data (Windows error {code})")
        }
        _ => format!("spooler_error: printer {stage} failed (Windows error {code})"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(kind: &str) -> PrinterRequest {
        PrinterRequest {
            connection_type: kind.into(),
            address: String::new(),
            port: None,
            queue_name: None,
            paper_width: 80,
            cutter_enabled: true,
        }
    }

    #[test]
    fn dispatches_network_and_system_without_overloading_usb() {
        let mut network = request("network");
        network.address = "192.168.1.100".into();
        network.port = Some(9100);
        assert_eq!(transport(&network), Ok(Transport::Network));
        let mut system = request("system");
        system.queue_name = Some("Kitchen Bluetooth — Receipt".into());
        assert_eq!(transport(&system), Ok(Transport::System));
        for kind in ["usb", "bluetooth", "other"] {
            assert!(transport(&request(kind))
                .unwrap_err()
                .starts_with("unsupported_transport:"));
        }
    }

    #[test]
    fn rejects_invalid_requests_before_opening_transport() {
        let mut system = request("system");
        for name in [None, Some(""), Some("  "), Some("Queue\0suffix")] {
            system.queue_name = name.map(str::to_string);
            assert!(transport(&system)
                .unwrap_err()
                .starts_with("invalid_configuration:"));
        }
        system.queue_name = Some("Generic / Text Only".into());
        system.address = "USB001".into();
        assert!(transport(&system).is_err());
        system.address.clear();
        system.port = Some(9100);
        assert!(transport(&system).is_err());
        let mut network = request("network");
        assert!(transport(&network).is_err());
        network.address = "localhost".into();
        for port in [None, Some(0)] {
            network.port = port;
            assert!(transport(&network).is_err());
        }
        network.port = Some(9100);
        network.paper_width = 72;
        assert!(transport(&network).is_err());
        assert!(serde_json::from_str::<PrinterRequest>(r#"{"connectionType":"network","address":"localhost","port":65536,"paperWidth":80,"cutterEnabled":true}"#).is_err());
    }

    #[test]
    fn raw_writes_handle_partial_progress_and_stop_on_failure() {
        let mut received = Vec::new();
        write_raw_bytes(b"ESC/POS payload", |chunk| {
            let count = chunk.len().min(2);
            received.extend_from_slice(&chunk[..count]);
            Ok(count)
        })
        .unwrap();
        assert_eq!(received, b"ESC/POS payload");
        for count in [0, 5] {
            assert!(write_raw_bytes(b"test", |_| Ok(count))
                .unwrap_err()
                .starts_with("write_failed:"));
        }
        let mut calls = 0;
        let failure = spooler_error("write", 29);
        assert_eq!(
            write_raw_bytes(b"test", |_| {
                calls += 1;
                if calls == 1 {
                    Ok(1)
                } else {
                    Err(failure.clone())
                }
            }),
            Err(failure)
        );
        assert_eq!(calls, 2);
    }

    #[test]
    fn maps_spooler_errors_to_bounded_actionable_messages() {
        assert!(spooler_error("open", 1801).starts_with("queue_not_found:"));
        assert!(spooler_error("open", 5).contains("denied"));
        assert!(spooler_error("start document", 1722).contains("unavailable"));
        assert!(spooler_error("write", 29).starts_with("write_failed:"));
        assert!(spooler_error("end document", u32::MAX).len() < 160);
    }

    #[cfg(not(windows))]
    #[test]
    fn unsupported_platform_is_explicit_for_discovery_and_printing() {
        assert!(list_queues()
            .unwrap_err()
            .starts_with("unsupported_platform:"));
        assert!(send_system("Queue", b"test")
            .unwrap_err()
            .starts_with("unsupported_platform:"));
    }
}
