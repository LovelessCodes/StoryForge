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

fn read_len<'a>(buf: &'a [u8], i: &mut usize) -> Option<&'a [u8]> {
    let len = read_varint(buf, i)? as usize;
    if *i + len > buf.len() {
        return None;
    }
    let s = &buf[*i..*i + len];
    *i += len;
    Some(s)
}

fn read_f64_le(buf: &[u8], i: &mut usize) -> Option<f64> {
    if *i + 8 > buf.len() {
        return None;
    }
    let bytes: [u8; 8] = buf[*i..*i + 8].try_into().ok()?;
    *i += 8;
    Some(f64::from_le_bytes(bytes))
}

fn is_uuid(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    if parts.len() != 5 {
        return false;
    }
    let lens = [8, 4, 4, 4, 12];
    parts
        .iter()
        .zip(lens.iter())
        .all(|(p, &n)| p.len() == n && p.chars().all(|c| c.is_ascii_hexdigit()))
}

fn looks_player_uid(s: &str) -> bool {
    if is_uuid(s) {
        return false;
    }
    let len_ok = (20..=64).contains(&s.len());
    let ok_chars = s
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    len_ok && ok_chars
}

fn is_kind(s: &str) -> bool {
    let len_ok = (3..=24).contains(&s.len());
    len_ok
        && s.chars()
            .all(|c| c.is_ascii_lowercase() || c == '_' || c.is_ascii_digit())
}

fn is_human_label(s: &str) -> bool {
    if is_uuid(s) || looks_player_uid(s) {
        return false;
    }
    let len_ok = (3..=64).contains(&s.len());
    let has_space_or_upper = s.chars().any(|c| c == ' ' || c.is_ascii_uppercase());
    len_ok && has_space_or_upper
}

// recursively parse any submessage, collecting strings and doubles
fn parse_msg(
    msg: &[u8],
    label_icon: &mut Option<String>,
    label: &mut Option<String>,
    id: &mut Option<String>,
    player_uid: &mut Option<String>,
    doubles: &mut Vec<f64>,
) {
    let mut j = 0usize;
    while j < msg.len() {
        let Some(key) = read_varint(msg, &mut j) else {
            break;
        };
        let wire = (key & 0x07) as u8;

        match wire {
            0 => {
                let _ = read_varint(msg, &mut j);
            }
            1 => {
                if let Some(v) = read_f64_le(msg, &mut j) {
                    doubles.push(v);
                } else {
                    break;
                }
            }
            2 => {
                if let Some(inner) = read_len(msg, &mut j) {
                    // Try UTF-8 first
                    if let Ok(s0) = std::str::from_utf8(inner) {
                        let s = s0.trim_matches(char::from(0));
                        if id.is_none() && is_uuid(s) {
                            *id = Some(s.to_string());
                        } else if player_uid.is_none() && looks_player_uid(s) {
                            *player_uid = Some(s.to_string());
                        } else if label_icon.is_none() && is_kind(s) {
                            *label_icon = Some(s.to_string());
                        } else if is_human_label(s) {
                            if label.as_ref().map_or(true, |prev| s.len() > prev.len()) {
                                *label = Some(s.to_string());
                            }
                        } else {
                            // It is a valid string but not clearly classifiable; ignore.
                            // Important: it could also be a nested submessage serialized as bytes.
                            // We will attempt to parse it as a submessage, too.
                            parse_msg(inner, label_icon, label, id, player_uid, doubles);
                        }
                    } else {
                        // binary; attempt nested message parse
                        parse_msg(inner, label_icon, label, id, player_uid, doubles);
                    }
                }
            }
            5 => {
                // 32-bit
                j = j.saturating_add(4);
            }
            _ => break,
        }
    }
}

fn parse_record(rec: &[u8]) -> MapMarker {
    let mut label_icon = None;
    let mut label = None;
    let mut id = None;
    let mut player_uid = None;
    let mut doubles: Vec<f64> = Vec::new();

    // parse the record recursively
    parse_msg(
        rec,
        &mut label_icon,
        &mut label,
        &mut id,
        &mut player_uid,
        &mut doubles,
    );

    // Assign first two doubles as x, y (order as encountered)
    let mut x = None;
    let mut y = None;
    if let Some(a) = doubles.get(0).copied() {
        x = Some(a);
    }
    if let Some(b) = doubles.get(1).copied() {
        y = Some(b);
    }

    MapMarker {
        label_icon,
        label,
        id,
        player_uid,
        x,
        y,
    }
}

pub fn decode_map_markers(buf: &[u8]) -> Vec<MapMarker> {
    let mut i = 0usize;
    let mut res = Vec::new();
    while i < buf.len() {
        if buf[i] == 0x0A {
            i += 1;
            if let Some(sub) = read_len(buf, &mut i) {
                res.push(parse_record(sub));
                continue;
            } else {
                break;
            }
        }
        i += 1; // resync
    }
    res
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
