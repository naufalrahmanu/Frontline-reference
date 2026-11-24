import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        // Vite 8 runs on rolldown, which only accepts the function form of manualChunks.
        // Splitting the vendor code keeps the data-heavy pages from re-downloading React on
        // every navigation, and keeps the initial chunk small.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-router") || id.includes("/react-dom/") || id.includes("/react/")) {
            return "react";
          }
          if (id.includes("@tanstack")) return "tables";
          return undefined;
        },
      },
    },
  },
});
