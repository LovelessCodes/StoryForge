use std::convert::TryInto;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MapMarker {
    pub label_icon: Option<String>, // short lowercase kind/icon (e.g., "rocks", "home")
    pub label: Option<String>,      // human label (e.g., "Red Clay", "Home")
    pub id: Option<String>,         // UUID
    pub player_uid: Option<String>, // base62/base64url-ish token (e.g., "b1Ez7ilugAKMcFuZpmGpIQed")
    pub x: Option<f64>,
    pub y: Option<f64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProspectingResult {
    pub name: String,
    pub x: f64,
    pub y: f64,
}

fn read_varint(buf: &[u8], i: &mut usize) -> Option<u64> {
    let mut x: u64 = 0;
    let mut shift = 0u32;
    for _ in 0..10 {
        if *i >= buf.len() {
            return None;
        }
        let b = buf[*i];
        *i += 1;
        x |= ((b & 0x7F) as u64) << shift;
        if (b & 0x80) == 0 {
            return Some(x);
        }
        shift += 7;
    }
    None
}

fn read_f64_le(buf: &[u8], i: &mut usize) -> Option<f64> {
    if *i + 8 > buf.len() {
        return None;
    }
    let bytes: [u8; 8] = buf[*i..*i + 8].try_into().ok()?;
    *i += 8;
    Some(f64::from_le_bytes(bytes))
}

fn read_len_delim<'a>(buf: &'a [u8], i: &mut usize) -> Option<&'a [u8]> {
    let len = read_varint(buf, i)? as usize;
    if *i + len > buf.len() {
        return None;
    }
    let s = &buf[*i..*i + len];
    *i += len;
    Some(s)
}

pub fn decode_prospecting_results(buf: &[u8]) -> Vec<ProspectingResult> {
    let mut i = 0usize;
    let mut items: Vec<ProspectingResult> = Vec::new();

    while i < buf.len() {
        // Try to find a submessage that holds one item.
        // We look for a length-delimited field containing:
        //  - name as a nested length-delimited UTF-8 string
        //  - two f64 values nearby (16 bytes)
        let start = i;

        // Expect length-delimited outer chunk (field tag likely 1: 0x0A)
        if i < buf.len() && buf[i] == 0x0A {
            i += 1;
            if let Some(chunk) = read_len_delim(buf, &mut i) {
                // Parse inside the chunk
                let mut j = 0usize;
                let mut name: Option<String> = None;
                let mut x: Option<f64> = None;
                let mut y: Option<f64> = None;

                while j < chunk.len() {
                    // read key (varint)
                    let key = match read_varint(chunk, &mut j) {
                        Some(k) => k as u32,
                        None => break,
                    };
                    let field_number = key >> 3;
                    let wire_type = (key & 0x07) as u8;

                    match (field_number, wire_type) {
                        // name field nested as: field X (len-delim) -> field Y (len-delim string)
                        (_, 2) => {
                            if let Some(inner) = {
                                // length-delimited value at this level
                                read_len_delim(chunk, &mut j)
                            } {
                                // peek inside for a potential string
                                let mut k = 0usize;
                                if let Some(inner_key) = read_varint(inner, &mut k) {
                                    let wt = (inner_key & 0x07) as u8;
                                    if wt == 2 {
                                        if let Some(sbytes) = read_len_delim(inner, &mut k) {
                                            if let Ok(s) = std::str::from_utf8(sbytes) {
                                                // Heuristic: names we expect are alphabetic mineral names
                                                if s.chars().all(|c| c.is_ascii_lowercase()) {
                                                    name = Some(s.to_string());
                                                }
                                            }
                                        }
                                    }
                                }
                                // also scan inner for two f64s (16 bytes) if present as raw data
                                let mut kk = 0usize;
                                while kk + 16 <= inner.len() {
                                    // try to find 16 consecutive bytes that decode to two f64
                                    // this is heuristic: attempt if we don't have x/y yet
                                    if x.is_none() && y.is_none() {
                                        let a = f64::from_le_bytes(
                                            inner[kk..kk + 8].try_into().unwrap(),
                                        );
                                        let b = f64::from_le_bytes(
                                            inner[kk + 8..kk + 16].try_into().unwrap(),
                                        );
                                        // sanity check: typical magnitudes (|x| < 1e6)
                                        if a.is_finite() && b.is_finite() {
                                            x = Some(a);
                                            y = Some(b);
                                        }
                                    }
                                    kk += 1;
                                }
                            } else {
                                // malformed; stop inner parse
                                break;
                            }
                        }
                        // Skip other wire types conservatively
                        (_, 0) => {
                            // varint skip
                            if read_varint(chunk, &mut j).is_none() {
                                break;
                            }
                        }
                        (_, 1) => {
                            // 64-bit (likely f64)
                            if x.is_none() {
                                if let Some(a) = read_f64_le(chunk, &mut j) {
                                    x = Some(a);
                                } else {
                                    break;
                                }
                            } else if y.is_none() {
                                if let Some(b) = read_f64_le(chunk, &mut j) {
                                    y = Some(b);
                                } else {
                                    break;
                                }
                            } else {
                                // extra 64-bit, skip
                                j = j.saturating_add(8);
                            }
                        }
                        (_, 5) => {
                            // 32-bit, skip
                            j = j.saturating_add(4);
                        }
                        _ => {
                            // Unknown wire type; bail from this chunk
                            j = chunk.len();
                        }
                    }
                }

                if let (Some(name), Some(x), Some(y)) = (name, x, y) {
                    items.push(ProspectingResult { name, x, y });
                }
                continue;
            } else {
                // bad length, break
                break;
            }
        }

        // If no recognizable outer chunk, advance one byte to resync
        i = start + 1;
    }

    items
}

pub fn log_marker_fields(buf: &[u8]) {
    fn read_varint(b: &[u8], i: &mut usize) -> Option<u64> {
        let mut x = 0u64;
        let mut s = 0u32;
        for _ in 0..10 {
            if *i >= b.len() {
                return None;
            }
            let byte = b[*i];
            *i += 1;
            x |= ((byte & 0x7F) as u64) << s;
            if byte & 0x80 == 0 {
                return Some(x);
            }
            s += 7;
        }
        None
    }
    fn read_len<'a>(b: &'a [u8], i: &mut usize) -> Option<&'a [u8]> {
        let len = read_varint(b, i)? as usize;
        if *i + len > b.len() {
            return None;
        }
        let s = &b[*i..*i + len];
        *i += len;
        Some(s)
    }
    fn read_f64(b: &[u8], i: &mut usize) -> Option<f64> {
        if *i + 8 > b.len() {
            return None;
        }
        let mut a = [0u8; 8];
        a.copy_from_slice(&b[*i..*i + 8]);
        *i += 8;
        Some(f64::from_le_bytes(a))
    }
    fn walk(msg: &[u8], depth: usize) {
        let mut i = 0usize;
        while i < msg.len() {
            let Some(key) = read_varint(msg, &mut i) else {
                break;
            };
            let field_no = (key >> 3) as u32;
            let wire = (key & 0x07) as u8;
            match wire {
                0 => {
                    let _ = read_varint(msg, &mut i);
                }
                1 => {
                    if let Some(v) = read_f64(msg, &mut i) {
                        println!(
                            "{:indent$}double field {} -> {}",
                            "",
                            field_no,
                            v,
                            indent = depth * 2
                        );
                    } else {
                        break;
                    }
                }
                2 => {
                    if let Some(ld) = read_len(msg, &mut i) {
                        if let Ok(s) = std::str::from_utf8(ld) {
                            let preview = s.replace('\n', " ");
                            println!(
                                "{:indent$}string field {} -> {:?}",
                                "",
                                field_no,
                                preview,
                                indent = depth * 2
                            );
                        } else {
                            println!(
                                "{:indent$}submessage field {} ({} bytes)",
                                "",
                                field_no,
                                ld.len(),
                                indent = depth * 2
                            );
                            walk(ld, depth + 1);
                        }
                    }
                }
                5 => {
                    i += 4;
                }
                _ => break,
            }
        }
    }
    // Top-level: repeated field 1 with markers
    let mut i = 0usize;
    let mut rec_idx = 0usize;
    while i < buf.len() {
        if buf[i] == 0x0A {
            i += 1;
            if let Some(rec) = read_len(buf, &mut i) {
                println!("=== record {} ===", rec_idx);
                walk(rec, 1);
                rec_idx += 1;
                continue;
            } else {
                break;
            }
        }
        i += 1;
    }
}
