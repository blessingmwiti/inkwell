import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["comic-grubworm-novel.ngrok-free.app"],
  },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["onnxruntime-web"] },
});
