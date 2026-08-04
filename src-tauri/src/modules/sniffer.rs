use serde::Serialize;
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpStream, ToSocketAddrs},
    time::Duration,
};

use super::errors::UiError;
use crate::{log_error, log_info};

// ── Varint ──

fn write_varint(value: u64) -> Vec<u8> {
    let mut result = Vec::new();
    let mut v = value;
    loop {
        let mut byte = (v & 0x7F) as u8;
        v >>= 7;
        if v != 0 {
            byte |= 0x80;
        }
        result.push(byte);
        if v == 0 {
            break;
        }
    }
    result
}

fn read_varint(data: &[u8], offset: &mut usize) -> Option<u64> {
    let mut value: u64 = 0;
    let mut shift = 0;
    while *offset < data.len() {
        let byte = data[*offset];
        *offset += 1;
        value |= ((byte & 0x7F) as u64) << shift;
        if byte & 0x80 == 0 {
            return Some(value);
        }
        shift += 7;
    }
    None
}

// ── Wire helpers ──

fn wire_string(tag: u64, value: &str) -> Vec<u8> {
    let encoded = value.as_bytes();
    let mut buf = write_varint((tag << 3) | 2);
    buf.extend(write_varint(encoded.len() as u64));
    buf.extend(encoded);
    buf
}

fn wire_varint(tag: u64, value: u64) -> Vec<u8> {
    let mut buf = write_varint((tag << 3) | 0);
    buf.extend(write_varint(value));
    buf
}

fn wire_message(tag: u64, message: &[u8]) -> Vec<u8> {
    let mut buf = write_varint((tag << 3) | 2);
    buf.extend(write_varint(message.len() as u64));
    buf.extend(message);
    buf
}

// ── Packet builders ──

fn build_client_identification(
    game_version: &str,
    player_name: &str,
    server_password: &str,
    player_uid: &str,
    view_distance: u64,
    network_version: &str,
) -> Vec<u8> {
    let mut msg = Vec::new();
    msg.extend(wire_string(1, game_version));
    msg.extend(wire_string(2, player_name));
    if !server_password.is_empty() {
        msg.extend(wire_string(4, server_password));
    }
    msg.extend(wire_string(6, player_uid));
    msg.extend(wire_varint(7, view_distance));
    msg.extend(wire_string(9, network_version));
    msg.extend(wire_string(10, game_version));
    msg
}

fn build_packet_client(identification: &[u8]) -> Vec<u8> {
    wire_message(2, identification)
}

fn build_wire_packet(payload: &[u8]) -> Vec<u8> {
    let len = payload.len() as u32;
    let mut buf = len.to_be_bytes().to_vec();
    buf.extend(payload);
    buf
}

// ── Network I/O ──

fn send_packet(addr: &SocketAddr, wire: &[u8], timeout: Duration) -> Result<Vec<u8>, UiError> {
    let mut stream = TcpStream::connect_timeout(addr, timeout).map_err(|e| {
        log_error!("sniff_server: connect failed to {}: {e}", addr);
        UiError {
            name: "connect_failed".into(),
            message: format!("Failed to connect to {}: {e}", addr),
        }
    })?;
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok();
    stream.set_write_timeout(Some(timeout)).map_err(|e| {
        log_error!("sniff_server: set_write_timeout failed: {e}");
        UiError {
            name: "timeout_error".into(),
            message: format!("Failed to set write timeout: {e}"),
        }
    })?;

    stream.write_all(wire).map_err(|e| {
        log_error!("sniff_server: send failed: {e}");
        UiError {
            name: "send_failed".into(),
            message: format!("Failed to send packet: {e}"),
        }
    })?;

    let mut data = Vec::new();
    let mut buf = [0u8; 65536];
    loop {
        match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => data.extend_from_slice(&buf[..n]),
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => break,
            Err(e) => {
                log_error!("sniff_server: recv failed: {e}");
                return Err(UiError {
                    name: "recv_failed".into(),
                    message: format!("Failed to read response: {e}"),
                });
            }
        }
    }
    Ok(data)
}

// ── Protobuf parser ──

fn parse_protobuf(payload: &[u8]) -> serde_json::Value {
    let mut result = serde_json::Map::new();
    let mut offset: usize = 0;

    while offset < payload.len() {
        let wire_tag = match read_varint(payload, &mut offset) {
            Some(v) => v,
            None => break,
        };
        let tag = wire_tag >> 3;
        let wire_type = wire_tag & 0x07;

        match wire_type {
            0 => {
                if let Some(val) = read_varint(payload, &mut offset) {
                    result.insert(format!("int_{tag}"), serde_json::Value::Number(val.into()));
                } else {
                    break;
                }
            }
            2 => {
                let length = match read_varint(payload, &mut offset) {
                    Some(v) => v as usize,
                    None => break,
                };
                if offset + length > payload.len() {
                    break;
                }
                let raw = &payload[offset..offset + length];
                offset += length;

                if let Ok(s) = std::str::from_utf8(raw) {
                    result.insert(
                        format!("str_{tag}"),
                        serde_json::Value::String(s.to_string()),
                    );
                } else {
                    let nested = parse_protobuf(raw);
                    if nested.as_object().map(|o| o.is_empty()).unwrap_or(true) {
                        result.insert(
                            format!("hex_{tag}"),
                            serde_json::Value::String(bytes_to_hex(raw)),
                        );
                    } else {
                        result.insert(format!("msg_{tag}"), nested);
                    }
                }
            }
            _ => break,
        }
    }

    serde_json::Value::Object(result)
}

fn parse_response_packets(data: &[u8]) -> Vec<serde_json::Value> {
    let mut packets = Vec::new();
    let mut offset: usize = 0;

    while offset + 4 <= data.len() {
        let pkt_len = u32::from_be_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]) as usize;

        if pkt_len == 0 || offset + 4 + pkt_len > data.len() {
            break;
        }

        let payload = &data[offset + 4..offset + 4 + pkt_len];
        packets.push(parse_protobuf(payload));
        offset += 4 + pkt_len;
    }

    packets
}

fn extract_strings_recursive(value: &serde_json::Value) -> Vec<String> {
    let mut strings = Vec::new();
    match value {
        serde_json::Value::Object(map) => {
            for (k, v) in map {
                if k.starts_with("str_") {
                    if let Some(s) = v.as_str() {
                        strings.push(s.to_string());
                    }
                } else {
                    strings.extend(extract_strings_recursive(v));
                }
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr {
                strings.extend(extract_strings_recursive(v));
            }
        }
        _ => {}
    }
    strings
}

fn extract_version(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'v' && i + 1 < bytes.len() && bytes[i + 1].is_ascii_digit() {
            let start = i + 1;
            let mut end = start;
            while end < bytes.len() && (bytes[end].is_ascii_digit() || bytes[end] == b'.') {
                end += 1;
            }
            if end > start {
                return Some(text[start..end].to_string());
            }
        }
        i += 1;
    }
    None
}

fn extract_server_info(packets: &[serde_json::Value]) -> ServerSniffResult {
    let mut info = ServerSniffResult::default();

    let all_strings: Vec<String> = packets.iter().flat_map(extract_strings_recursive).collect();
    let full_text = all_strings.join("");

    // Version from disconnect message: "Server: v1.22.2 (nv: 1.22.2)"
    if let Some(start) = full_text.find("Server:") {
        let after = &full_text[start..];
        if let Some(ver) = extract_version(after) {
            info.server_game_version = Some(ver);
        }
        if let Some(nv_start) = after.find("(nv:") {
            let nv_after = &after[nv_start + 4..];
            let nv: String = nv_after
                .chars()
                .skip_while(|c| !c.is_ascii_digit())
                .take_while(|c| c.is_ascii_digit() || *c == '.')
                .collect();
            if !nv.is_empty() {
                info.server_network_version = Some(nv);
            }
        }
    }

    let lower = full_text.to_lowercase();
    // Print debug info
    info.password_protected = lower.contains("password") || lower.contains("enter password");
    info.whitelisted = lower.contains("whitelist");
    info.banned = lower.contains("banned");
    info.server_full = lower.contains("queue") || lower.contains("full");
    info.auth_required = lower.contains("bad game session");
    // password_valid set by sniff_server step 3

    for p in packets {
        if let Some(token) = p.get("str_2").and_then(|v| v.as_str()) {
            info.login_token = Some(token.to_string());
        }
    }

    let clean = full_text.trim().to_string();
    info.disconnect_message = if clean.is_empty() { None } else { Some(clean) };

    info
}

// ── Helpers ──

fn bytes_to_hex(data: &[u8]) -> String {
    data.iter().map(|b| format!("{b:02x}")).collect()
}

// ── Result type ──

#[derive(Debug, Clone, Serialize, Default)]
pub struct ServerSniffResult {
    pub server_game_version: Option<String>,
    pub server_network_version: Option<String>,
    pub password_protected: bool,
    pub password_valid: Option<bool>,
    pub whitelisted: bool,
    pub banned: bool,
    pub server_full: bool,
    pub auth_required: bool,
    pub login_token: Option<String>,
    pub disconnect_message: Option<String>,
}

// ── Command ──

/// Delegates to `sniff_server_blocking` via `spawn_blocking` so the probe can't block the UI thread.
#[tauri::command]
pub async fn sniff_server(
    host: String,
    port: Option<u16>,
    password: Option<String>,
    timeout_secs: Option<f64>,
) -> Result<ServerSniffResult, UiError> {
    tokio::task::spawn_blocking(move || sniff_server_blocking(host, port, password, timeout_secs))
        .await
        .map_err(|e| {
            log_error!("sniff_server: task join error: {e}");
            UiError {
                name: "internal_error".into(),
                message: format!("Internal error: {e}"),
            }
        })?
}

/// Probes a Vintage Story server to detect version, password status, etc.
///
/// Two-step process:
/// 1. Send wrong version → get server's real version + basic flags
/// 2. Send correct version + password → get detailed auth/password/whitelist status
fn sniff_server_blocking(
    host: String,
    port: Option<u16>,
    password: Option<String>,
    timeout_secs: Option<f64>,
) -> Result<ServerSniffResult, UiError> {
    let port = port.unwrap_or(42420);
    let timeout = Duration::from_secs_f64(timeout_secs.unwrap_or(8.0));
    let password = password.unwrap_or_default();

    let host_port = format!("{host}:{port}");
    let addr = host_port
        .to_socket_addrs()
        .map_err(|e| {
            log_error!("sniff_server: failed to resolve {}:{} - {e}", host, port);
            UiError {
                name: "invalid_address".into(),
                message: format!("Failed to resolve {host}:{port} - {e}"),
            }
        })?
        .next()
        .ok_or_else(|| {
            log_error!("sniff_server: could not resolve {}:{}", host, port);
            UiError {
                name: "invalid_address".into(),
                message: format!("Could not resolve {host}:{port}"),
            }
        })?;

    // ── Step 1: probe with wrong version ──
    log_info!("sniff_server: probing {}:{}", host, port);
    let ident1 = build_client_identification(
        "1.99.99",
        "ServerSniffer",
        "", // no password on first probe
        "sniffer",
        128,
        "999.99.99",
    );
    let data1 = send_packet(
        &addr,
        &build_wire_packet(&build_packet_client(&ident1)),
        timeout,
    )?;
    let packets1 = parse_response_packets(&data1);
    let mut info = extract_server_info(&packets1);

    // ── Step 2: probe with correct version, NO password (detects password/whitelist) ──
    if let (Some(ver), Some(nver)) = (&info.server_game_version, &info.server_network_version) {
        let ident2 = build_client_identification(
            ver,
            "ServerSniffer",
            "", // no password — server will tell us if one is needed
            "sniffer",
            128,
            nver,
        );
        if let Ok(data2) = send_packet(
            &addr,
            &build_wire_packet(&build_packet_client(&ident2)),
            timeout,
        ) {
            let info2 = extract_server_info(&parse_response_packets(&data2));
            info.password_protected = info.password_protected || info2.password_protected;
            info.whitelisted = info.whitelisted || info2.whitelisted;
            info.banned = info.banned || info2.banned;
            info.server_full = info.server_full || info2.server_full;
        }

        // ── Step 3: if user provided a password, test it ──
        if !password.is_empty() {
            let ident3 =
                build_client_identification(ver, "ServerSniffer", &password, "sniffer", 128, nver);
            if let Ok(data3) = send_packet(
                &addr,
                &build_wire_packet(&build_packet_client(&ident3)),
                timeout,
            ) {
                let info3 = extract_server_info(&parse_response_packets(&data3));
                // If server says "bad game session", password was accepted
                // If server still says "password", the password was wrong
                let lower3 = info3
                    .disconnect_message
                    .as_deref()
                    .unwrap_or("")
                    .to_lowercase();
                info.auth_required = info3.auth_required || lower3.contains("bad game session");
                info.password_valid = if info.auth_required {
                    Some(true)
                } else if lower3.contains("password") || info3.password_protected {
                    Some(false) // server still asking for password → wrong
                } else {
                    None
                };
                if info3.login_token.is_some() {
                    info.login_token = info3.login_token;
                }
                if info3.disconnect_message.is_some() {
                    info.disconnect_message = info3.disconnect_message;
                }
            }
        }
    }

    log_info!(
        "sniff_server result: version={:?} password_protected={} password_valid={:?}",
        info.server_game_version,
        info.password_protected,
        info.password_valid
    );
    Ok(info)
}
