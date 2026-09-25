import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        accessPass: resolve(__dirname, "accessPass.html"),
        privAccount: resolve(__dirname, "privAccount.html"),
        costManagement: resolve(__dirname, "costManagement.html"),
        userAccess: resolve(__dirname, "userAccess.html"),
        awsHosting: resolve(__dirname, "awsHosting.html"),
      },
    },
  },
});
