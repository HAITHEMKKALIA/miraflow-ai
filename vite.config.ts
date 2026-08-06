import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'plugin-inspect-react-code'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("@react-three") || id.includes("\\three\\") || id.includes("/three/")) {
            return "vendor-three";
          }

          if (id.includes("recharts")) {
            return "vendor-charts";
          }

          if (id.includes("html2canvas")) {
            return "vendor-html2canvas";
          }

          if (id.includes("framer-motion")) {
            return "vendor-motion";
          }

          if (id.includes("lucide-react")) {
            return "vendor-icons";
          }

          if (id.includes("@supabase")) {
            return "vendor-supabase";
          }
        },
      },
    },
  },
});
