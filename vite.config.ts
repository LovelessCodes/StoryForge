import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
	// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
	//
	// 1. prevent Vite from obscuring rust errors
	// 2. tauri expects a fixed port, fail if that port is not available
	clearScreen: false,
	plugins: [
		tailwindcss(),
		tsconfigPaths(),
		tanstackRouter({
			autoCodeSplitting: true,
			target: "react",
		}),
		react(),
		devtools(),
	],
	server: {
		hmr: host
			? {
					host,
					port: 1421,
					protocol: "ws",
				}
			: undefined,
		host: host || false,
		port: 1420,
		strictPort: true,
		watch: {
			// 3. tell Vite to ignore watching `src-tauri`
			ignored: ["**/src-tauri/**"],
		},
	},
}));
