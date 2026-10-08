import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In development the page comes from Vite (5173) and the data from the
    // Tix server (4000): forward /api there so the browser sees one origin.
    proxy: { "/api": "http://127.0.0.1:4000" },
  },
});
