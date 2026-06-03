// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // Apply Linux-specific fixes for rendering the front-end on NVIDIA cards. Systems using an NVIDIA GPU with the proprietary
        // drivers often encounter rendering issues with WebkitGTK.
        // See: https://github.com/tauri-apps/tauri/issues/9304
        use webkit2gtk_nvidia_quirk::{
            apply_workaround_with_options, is_primary_gpu_nvidia, ApplyWorkaroundOptions,
        };
        let nvidia_gpu_in_use = is_primary_gpu_nvidia();
        if nvidia_gpu_in_use {
            // Add command line options to override rendering defaults.
            // Testing has shown that DMA Buffering always needs to be disabled. Allow forcing to be disabled.
            // If more WebkitGTK is ever updated to fix this issue, then this behavior may need to be adjusted.
            let allow_dmabuf_renderer =
                std::env::args().any(|arg| arg == "--allow-dmabuf-renderer");
            // NV Sync typically needs to be disabled due to incompatibilities with Wayland. It can be forcibly disabled
            // here, if not properly detected.
            let disable_nv_sync = std::env::args().any(|arg| arg == "--disable-nv-explicit-sync");

            let options = ApplyWorkaroundOptions::default()
                .force_disable_dmabuf(!allow_dmabuf_renderer)
                .force_disable_nv_explicit_sync(disable_nv_sync);
            apply_workaround_with_options(options);
        }
    }

    story_forge_lib::run()
}
