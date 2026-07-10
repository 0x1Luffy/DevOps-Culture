import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/stats": "http://localhost:5001",
      "/api/notifications": "http://localhost:5002",
      "/api/login": "http://localhost:5003",
      "/api/verify": "http://localhost:5003",
      "/api/status": "http://localhost:5004",
      "/api": "http://localhost:5000",
    },
  },
});