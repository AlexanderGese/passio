import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Tauri works best with a fixed dev port and no clearScreen so Rust output is visible.
 * HMR via a separate port keeps the webview connection stable during Rust rebuilds.
 */
export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    hmr: {
      protocol: "ws",
      host: "127.0.0.1",
      port: 1421,
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));
