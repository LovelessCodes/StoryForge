use super::utils::lock;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

static PLAYER_REFS: LazyLock<Mutex<PlayerRefs>> = LazyLock::new(|| Mutex::new(PlayerRefs::new()));

struct PlayerRefs {
    run: String,
    next_id: usize,
    ids: HashMap<(String, String), usize>,
}

impl PlayerRefs {
    fn new() -> Self {
        Self {
            run: run_prefix(),
            next_id: 0,
            ids: HashMap::new(),
        }
    }
}

/// A stable, value-free alias for a player identifier in application logs.
///
/// The same input gets the same alias for the life of the process, so a log
/// can still show that two lines refer to the same player and that a name
/// resolved to a UID. The raw value stays in memory and is never written.
///
/// A plain hash would not be enough: player names are low-entropy and
/// guessable. The run prefix keeps aliases from different app runs distinct
/// when one log file spans restarts.
pub fn player_ref(kind: &str, value: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        return format!("{kind}-none");
    }

    let key = (kind.to_owned(), value.to_owned());
    let mut refs = lock(&PLAYER_REFS);

    if let Some(id) = refs.ids.get(&key) {
        return format!("{}-{kind}-{id}", refs.run);
    }

    refs.next_id += 1;
    let id = refs.next_id;
    refs.ids.insert(key, id);
    format!("{}-{kind}-{id}", refs.run)
}

/// Short per-run marker so aliases from different launches cannot collide in a
/// log that has survived a restart.
fn run_prefix() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos() as u64)
        .unwrap_or_default();
    format!("p{:06x}", nanos & 0xff_ffff)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aliases_are_stable_and_do_not_contain_the_value() {
        let first = player_ref("name", "Alice");
        let second = player_ref("name", "Alice");
        let other = player_ref("name", "Bob");

        assert_eq!(first, second);
        assert_ne!(first, other);
        assert!(!first.contains("Alice"));
        assert!(!other.contains("Bob"));
        assert!(first.contains("-name-"));
    }

    #[test]
    fn names_and_uids_use_separate_namespaces() {
        let name = player_ref("name", "same-value");
        let uid = player_ref("uid", "same-value");

        assert_ne!(name, uid);
        assert!(name.contains("-name-"));
        assert!(uid.contains("-uid-"));
    }

    #[test]
    fn empty_values_get_a_placeholder() {
        assert_eq!(player_ref("name", ""), "name-none");
        assert_eq!(player_ref("uid", "   "), "uid-none");
    }
}
