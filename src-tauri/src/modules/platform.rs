//! Platform-specific helpers.
//!
//! New platform modules are added here only when the platform-specific code is
//! large or self-contained enough to warrant isolation.

#[cfg(target_os = "macos")]
pub mod macos;
