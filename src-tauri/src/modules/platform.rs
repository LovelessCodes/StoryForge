//! Host platform facts that `tauri_plugin_os` cannot answer on its own.
//!
//! On macOS the plugin reports the architecture the app was built for, which
//! is not necessarily the architecture of the machine: an Intel build runs
//! under Rosetta on Apple Silicon. Game downloads, .NET runtimes and launch
//! checks need the hardware and translation facts instead.

use serde::Serialize;
use std::{fs::File, io::Read, path::Path};

/// Architecture of a Mach-O binary (or the slices a universal one carries).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MachArch {
    Arm64,
    X86_64,
    Universal,
}

impl MachArch {
    /// The architecture name used by the .NET runtime download URLs.
    pub fn dotnet_arch(self) -> &'static str {
        match self {
            MachArch::Arm64 | MachArch::Universal => "arm64",
            MachArch::X86_64 => "x64",
        }
    }
}

const MH_MAGIC_64: u32 = 0xFEED_FACF;
const MH_CIGAM_64: u32 = 0xCFFA_EDFE;
const FAT_MAGIC: u32 = 0xCAFE_BABE;
const FAT_CIGAM: u32 = 0xBEBA_FECA;
const FAT_MAGIC_64: u32 = 0xCAFE_BABF;
const FAT_CIGAM_64: u32 = 0xBFBA_FECA;
const CPU_TYPE_X86_64: u32 = 0x0100_0007;
const CPU_TYPE_ARM64: u32 = 0x0100_000C;

/// Reads the CPU architecture of a Mach-O file.
///
/// Returns `None` for missing files, non-Mach-O files, and Mach-O files whose
/// slices are neither arm64 nor x86_64 (a 32-bit binary, for example).
pub fn macho_arch(path: &Path) -> Option<MachArch> {
    let mut file = File::open(path).ok()?;
    let mut header = [0u8; 8];
    file.read_exact(&mut header).ok()?;
    let magic = u32::from_be_bytes(header[..4].try_into().ok()?);

    match magic {
        // Little-endian 64-bit Mach-O, as written by macOS toolchains.
        MH_CIGAM_64 => {
            let cpu = u32::from_le_bytes(header[4..8].try_into().ok()?);
            arch_from_cpu(cpu)
        }
        // Big-endian 64-bit Mach-O.
        MH_MAGIC_64 => {
            let cpu = u32::from_be_bytes(header[4..8].try_into().ok()?);
            arch_from_cpu(cpu)
        }
        FAT_MAGIC | FAT_CIGAM | FAT_MAGIC_64 | FAT_CIGAM_64 => {
            let big_endian = matches!(magic, FAT_MAGIC | FAT_MAGIC_64);
            let wide = matches!(magic, FAT_MAGIC_64 | FAT_CIGAM_64);
            let read_u32 = |bytes: &[u8]| {
                if big_endian {
                    u32::from_be_bytes(bytes.try_into().unwrap())
                } else {
                    u32::from_le_bytes(bytes.try_into().unwrap())
                }
            };

            let count = read_u32(&header[4..8]);
            if count == 0 || count > 64 {
                return None;
            }

            // The cputype is the first field of every fat_arch entry; the rest
            // of the record (cpusubtype/offset/size/align) is not needed.
            let entry_size = if wide { 32 } else { 20 };
            let mut entry = [0u8; 32];
            let mut arm64 = false;
            let mut x86_64 = false;
            for _ in 0..count {
                file.read_exact(&mut entry[..entry_size]).ok()?;
                match read_u32(&entry[..4]) {
                    CPU_TYPE_ARM64 => arm64 = true,
                    CPU_TYPE_X86_64 => x86_64 = true,
                    _ => {}
                }
            }

            match (arm64, x86_64) {
                (true, true) => Some(MachArch::Universal),
                (true, false) => Some(MachArch::Arm64),
                (false, true) => Some(MachArch::X86_64),
                (false, false) => None,
            }
        }
        _ => None,
    }
}

fn arch_from_cpu(cpu: u32) -> Option<MachArch> {
    match cpu {
        CPU_TYPE_ARM64 => Some(MachArch::Arm64),
        CPU_TYPE_X86_64 => Some(MachArch::X86_64),
        _ => None,
    }
}

/// True when the machine itself is Apple Silicon.
///
/// `hw.optional.arm64` is set by the hardware, so this stays true when the app
/// is an Intel build running under Rosetta.
pub fn apple_silicon() -> bool {
    #[cfg(target_os = "macos")]
    {
        sysctl_flag("hw.optional.arm64")
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

/// True when this process is an Intel binary running under Rosetta.
pub fn translated() -> bool {
    #[cfg(target_os = "macos")]
    {
        sysctl_flag("sysctl.proc_translated")
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

/// True when Rosetta is installed, so x86_64 binaries can start.
pub fn rosetta_available() -> bool {
    #[cfg(target_os = "macos")]
    {
        apple_silicon()
            && (translated()
                || Path::new("/Library/Apple/usr/libexec/oah/libRosettaRuntime").exists())
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

#[cfg(target_os = "macos")]
fn sysctl_flag(name: &str) -> bool {
    let Ok(name) = std::ffi::CString::new(name) else {
        return false;
    };
    let mut value: i32 = 0;
    let mut size: libc::size_t = std::mem::size_of::<i32>();

    // SAFETY: `name` is a valid NUL-terminated C string, `value` points to
    // `size` writable bytes, and sysctlbyname writes at most `size` bytes.
    let result = unsafe {
        libc::sysctlbyname(
            name.as_ptr(),
            (&mut value as *mut i32).cast(),
            &mut size,
            std::ptr::null_mut(),
            0,
        )
    };

    result == 0 && value != 0
}

/// Host facts the version picker uses to warn about Intel-only builds.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostPlatform {
    pub os: String,
    pub arch: String,
    pub apple_silicon: bool,
    pub translated: bool,
    pub rosetta_available: bool,
}

#[tauri::command]
pub fn get_host_platform() -> HostPlatform {
    HostPlatform {
        os: tauri_plugin_os::platform().to_string(),
        arch: tauri_plugin_os::arch().to_string(),
        apple_silicon: apple_silicon(),
        translated: translated(),
        rosetta_available: rosetta_available(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_macho(dir: &Path, name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let path = dir.join(name);
        let mut file = File::create(&path).unwrap();
        file.write_all(bytes).unwrap();
        path
    }

    #[test]
    fn reads_thin_macho_architectures() {
        let tmp = tempfile::tempdir().unwrap();

        let mut arm64 = Vec::new();
        arm64.extend_from_slice(&MH_CIGAM_64.to_be_bytes());
        arm64.extend_from_slice(&CPU_TYPE_ARM64.to_le_bytes());
        let arm64 = write_macho(tmp.path(), "arm64", &arm64);
        assert_eq!(macho_arch(&arm64), Some(MachArch::Arm64));

        let mut x64 = Vec::new();
        x64.extend_from_slice(&MH_CIGAM_64.to_be_bytes());
        x64.extend_from_slice(&CPU_TYPE_X86_64.to_le_bytes());
        let x64 = write_macho(tmp.path(), "x64", &x64);
        assert_eq!(macho_arch(&x64), Some(MachArch::X86_64));
    }

    #[test]
    fn reads_universal_macho_slices() {
        let tmp = tempfile::tempdir().unwrap();
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&FAT_MAGIC.to_be_bytes());
        bytes.extend_from_slice(&2u32.to_be_bytes());
        for cpu in [CPU_TYPE_X86_64, CPU_TYPE_ARM64] {
            let mut entry = [0u8; 20];
            entry[..4].copy_from_slice(&cpu.to_be_bytes());
            bytes.extend_from_slice(&entry);
        }
        let path = write_macho(tmp.path(), "universal", &bytes);
        assert_eq!(macho_arch(&path), Some(MachArch::Universal));
    }

    #[test]
    fn rejects_non_macho_files() {
        let tmp = tempfile::tempdir().unwrap();
        let path = write_macho(tmp.path(), "script", b"#!/bin/sh\nexit 0\n");
        assert_eq!(macho_arch(&path), None);
        assert_eq!(macho_arch(&tmp.path().join("missing")), None);
    }

    #[test]
    fn dotnet_arch_prefers_native_arm64() {
        assert_eq!(MachArch::Arm64.dotnet_arch(), "arm64");
        assert_eq!(MachArch::Universal.dotnet_arch(), "arm64");
        assert_eq!(MachArch::X86_64.dotnet_arch(), "x64");
    }
}
