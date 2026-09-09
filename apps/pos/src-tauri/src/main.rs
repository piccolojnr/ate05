#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Deserialize;
use std::fs;
use std::io::Write;
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};
mod database;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrinterRequest {
    connection_type: String,
    address: String,
    port: Option<u16>,
    paper_width: u16,
    cutter_enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KitchenTicketRequest {
    order_number: u32,
    table_name: Option<String>,
    sequence: u32,
    ticket_type: String,
    created_at: String,
    items: Vec<KitchenTicketItemRequest>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KitchenTicketItemRequest {
    item_name: String,
    quantity: u32,
    action: String,
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReceiptRequest {
    business_name: String,
    receipt_number: u32,
    order_number: u32,
    issued_at: String,
    table_name: Option<String>,
    items: Vec<ReceiptItemRequest>,
    subtotal_minor: i64,
    total_minor: i64,
    payments: Vec<ReceiptPaymentRequest>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReceiptItemRequest {
    name: String,
    quantity: u32,
    line_total_minor: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReceiptPaymentRequest {
    method: String,
    amount_minor: i64,
}

fn line_fit(value: &str, width: usize) -> String {
    let mut chars = value.chars();
    let fitted: String = chars.by_ref().take(width).collect();
    if value.chars().count() > width {
        fitted
            .chars()
            .take(width.saturating_sub(1))
            .collect::<String>()
            + "…"
    } else {
        fitted
    }
}

fn ticket_text(ticket: &KitchenTicketRequest, paper_width: u16) -> String {
    let width = if paper_width == 58 { 32 } else { 48 };
    let separator = |character: char| character.to_string().repeat(width);
    let title = match ticket.ticket_type.as_str() {
        "initial" => "INITIAL",
        "addition" => "*** ADDITION ***",
        "cancellation" => "*** CANCELLATION ***",
        _ => "KITCHEN TICKET",
    };
    let border = if ticket.ticket_type == "cancellation" {
        '!'
    } else {
        '='
    };
    let mut lines = vec![
        separator(border),
        "KITCHEN ORDER".to_string(),
        separator('='),
        format!("ORDER #{:04}", ticket.order_number),
        ticket
            .table_name
            .clone()
            .unwrap_or_else(|| "TAKEAWAY".into()),
        ticket.created_at.clone(),
        separator('-'),
        title.into(),
        separator('-'),
    ];
    for item in &ticket.items {
        let prefix = if item.action == "cancel" { "* " } else { "+ " };
        lines.push(format!(
            "{}{} x {}",
            prefix,
            item.quantity,
            item.item_name.to_uppercase()
        ));
        if let Some(notes) = &item.notes {
            lines.push(format!("  {}", notes));
        }
        lines.push(String::new());
    }
    lines.push(separator(border));
    lines.push(format!("TICKET {}", ticket.sequence));
    lines.push(String::new());
    lines
        .into_iter()
        .map(|line| line_fit(&line, width))
        .collect::<Vec<_>>()
        .join("\n")
}

fn receipt_text(receipt: &ReceiptRequest, paper_width: u16) -> String {
    let width = if paper_width == 58 { 32 } else { 48 };
    let separator = "-".repeat(width);
    let money = |minor: i64| format!("GHS {:.2}", minor as f64 / 100.0);
    let row = |label: &str, value: String| {
        let left = line_fit(label, width.saturating_sub(value.len() + 1));
        format!(
            "{}{}{}",
            left,
            " ".repeat(width.saturating_sub(left.len() + value.len())),
            value
        )
    };
    let mut lines = vec![
        receipt.business_name.clone(),
        "CUSTOMER RECEIPT".into(),
        separator.clone(),
        row("Receipt #", format!("{:06}", receipt.receipt_number)),
        row("Order #", format!("{:04}", receipt.order_number)),
        row("Date", receipt.issued_at.clone()),
        row(
            "Table",
            receipt
                .table_name
                .clone()
                .unwrap_or_else(|| "TAKEAWAY".into()),
        ),
        separator.clone(),
    ];
    for item in &receipt.items {
        lines.push(line_fit(
            &format!("{} x {}", item.quantity, item.name),
            width,
        ));
        lines.push(row("", money(item.line_total_minor)));
    }
    lines.extend([
        separator,
        row("Subtotal", money(receipt.subtotal_minor)),
        row("Total", money(receipt.total_minor)),
        String::new(),
        "PAYMENTS".into(),
    ]);
    for payment in &receipt.payments {
        let label = if payment.method == "mobile_money" {
            "Mobile Money"
        } else {
            &payment.method
        };
        lines.push(row(label, money(payment.amount_minor)));
    }
    lines.extend([
        "Total Paid".to_string(),
        "PAID".into(),
        "Thank you".into(),
        String::new(),
    ]);
    lines.join("\n")
}

fn escpos(text: &str, cutter_enabled: bool) -> Vec<u8> {
    let mut output = vec![0x1b, 0x40, 0x1b, 0x61, 0x00];
    for line in text.lines() {
        let emphasis = line.contains("KITCHEN ORDER")
            || line.contains("INITIAL")
            || line.contains("ADDITION")
            || line.contains("CANCELLATION")
            || line.starts_with("ORDER ");
        if emphasis {
            output.extend_from_slice(&[0x1b, 0x45, 0x01]);
        }
        output.extend_from_slice(line.as_bytes());
        output.push(b'\n');
        if emphasis {
            output.extend_from_slice(&[0x1b, 0x45, 0x00]);
        }
    }
    output.extend_from_slice(&[0x1b, 0x64, 0x03]);
    if cutter_enabled {
        output.extend_from_slice(&[0x1d, 0x56, 0x00]);
    }
    output
}

#[tauri::command]
async fn print_receipt(request: PrinterRequest, receipt: ReceiptRequest) -> Result<(), String> {
    let bytes = escpos(
        &receipt_text(&receipt, request.paper_width),
        request.cutter_enabled,
    );
    tauri::async_runtime::spawn_blocking(move || send_tcp(&request, &bytes))
        .await
        .map_err(|error| format!("print worker failed: {error}"))??;
    Ok(())
}

fn send_tcp(request: &PrinterRequest, bytes: &[u8]) -> Result<(), String> {
    if request.connection_type != "network" {
        return Err("unsupported_transport: USB printing is not enabled in V1".into());
    }
    let port = request
        .port
        .ok_or_else(|| "invalid_configuration: network printer port is required".to_string())?;
    let address = format!("{}:{}", request.address, port);
    let socket = address
        .to_socket_addrs()
        .map_err(|_| "invalid_configuration: printer address is invalid".to_string())?
        .next()
        .ok_or_else(|| "invalid_configuration: printer address is invalid".to_string())?;
    let mut stream =
        TcpStream::connect_timeout(&socket, Duration::from_secs(5)).map_err(|error| {
            if error.kind() == std::io::ErrorKind::TimedOut {
                "timeout: printer connection timed out".to_string()
            } else {
                format!("connection_refused: {}", error)
            }
        })?;
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(|error| format!("write_failed: {}", error))?;
    stream
        .write_all(bytes)
        .map_err(|error| format!("write_failed: {}", error))
}

#[tauri::command]
async fn print_kitchen_ticket(
    request: PrinterRequest,
    ticket: KitchenTicketRequest,
) -> Result<(), String> {
    let bytes = escpos(
        &ticket_text(&ticket, request.paper_width),
        request.cutter_enabled,
    );
    tauri::async_runtime::spawn_blocking(move || send_tcp(&request, &bytes))
        .await
        .map_err(|error| format!("write_failed: {}", error))??;
    Ok(())
}

#[tauri::command]
async fn test_printer(request: PrinterRequest, created_at: String) -> Result<(), String> {
    let ticket = KitchenTicketRequest {
        order_number: 0,
        table_name: Some("ATE05".into()),
        sequence: 1,
        ticket_type: "initial".into(),
        created_at,
        items: vec![KitchenTicketItemRequest {
            item_name: "KITCHEN PRINTER TEST".into(),
            quantity: 1,
            action: "add".into(),
            notes: Some("Printer connection successful.".into()),
        }],
    };
    let bytes = escpos(
        &ticket_text(&ticket, request.paper_width),
        request.cutter_enabled,
    );
    tauri::async_runtime::spawn_blocking(move || send_tcp(&request, &bytes))
        .await
        .map_err(|error| format!("write_failed: {}", error))??;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:ate05.db",
                    vec![
                        Migration {
                            version: 1,
                            description: "ate05_initial_schema",
                            sql: include_str!(
                                "../../../../packages/database/drizzle/0000_clumsy_human_torch.sql"
                            ),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 2,
                            description: "ate05_printers_and_print_attempts",
                            sql: include_str!(
                                "../../../../packages/database/drizzle/0001_chilly_harpoon.sql"
                            ),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 3,
                            description: "payment_receipt_v1",
                            sql: include_str!(
                                "../../../../packages/database/drizzle/0002_lovely_ghost_rider.sql"
                            ),
                            kind: MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .setup(|app| {
            // Migrations have completed in the SQL plugin's preload setup.
            // Keep every statement of renderer-managed transactions on one connection.
            tauri::async_runtime::block_on(async {
                let pool =
                    database::connect(&app.path().app_config_dir()?.join("ate05.db")).await?;
                let instances = app.state::<tauri_plugin_sql::DbInstances>();
                let previous = instances.0.write().await.insert(
                    "sqlite:ate05.db".into(),
                    tauri_plugin_sql::DbPool::Sqlite(pool),
                );
                if let Some(tauri_plugin_sql::DbPool::Sqlite(pool)) = previous {
                    pool.close().await;
                }
                Ok::<_, Box<dyn std::error::Error>>(())
            })?;
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(data_dir.join("backups"))?;
            fs::create_dir_all(data_dir.join("logs"))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            print_kitchen_ticket,
            print_receipt,
            test_printer
        ])
        .run(tauri::generate_context!())
        .expect("error while running ATE05 POS");
}
