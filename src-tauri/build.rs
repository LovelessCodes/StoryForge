fn main() {
    // Stop exporting Rust symbols from the app binary while keeping the v0
    // mangling prefix (`__R` in Mach-O) set in `.cargo/config.toml`.
    //
    // Scoped to bins on purpose: Cargo `rustflags` apply to every unit,
    // including proc-macro dylibs, and rustc links those with
    // `-exported_symbols_list`. ld64 rejects combining that with
    // `-unexported_symbol`.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg-bins=-Wl,-unexported_symbol,__R*");
    }

    tauri_build::build()
}
