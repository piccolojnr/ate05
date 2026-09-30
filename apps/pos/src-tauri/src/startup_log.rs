use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

static LOG: OnceLock<Mutex<Option<File>>> = OnceLock::new();
static RUNTIME_READY: OnceLock<()> = OnceLock::new();

fn log_path() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("ATE05 POS")
        .join("logs")
        .join("startup.log")
}

fn open_log(path: &std::path::Path) -> Option<File> {
    path.parent().and_then(|directory| {
        fs::create_dir_all(directory).ok()?;
        OpenOptions::new().create(true).append(true).open(path).ok()
    })
}

pub fn initialize() {
    let file = open_log(&log_path())
        .or_else(|| open_log(&std::env::temp_dir().join("ATE05 POS/logs/startup.log")));
    let _ = LOG.set(Mutex::new(file));
    // Record location only: panic messages can contain credentials or customer data.
    std::panic::set_hook(Box::new(|panic| {
        let location = panic
            .location()
            .map(|location| {
                format!(
                    "{}:{}:{}",
                    location.file(),
                    location.line(),
                    location.column()
                )
            })
            .unwrap_or_else(|| "unknown".into());
        event(&format!("Rust panic at {location}"));
    }));
}

pub fn event(message: &str) {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let line = format!("{timestamp} pid={} {message}\n", std::process::id());
    if let Some(log) = LOG.get() {
        if let Ok(mut guard) = log.lock() {
            if let Some(file) = guard.as_mut() {
                let _ = file.write_all(line.as_bytes());
                let _ = file.flush();
                let _ = file.sync_data();
            }
        }
    }
    let _ = write!(std::io::stderr(), "[ATE05 startup] {line}");
}

pub fn runtime_ready() {
    if RUNTIME_READY.set(()).is_ok() {
        event("window/runtime startup completed");
    }
}
