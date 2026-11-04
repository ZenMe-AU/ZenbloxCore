/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import checkCardOrder from "./plugins/checkCardOrder";

// https://vite.dev/config/
export default defineConfig({
  base: "/core/",
  server: { port: 5174, strictPort: true },
  plugins: [react(), checkCardOrder()],
  build: {
    outDir: "dist/core",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
    },
  },
});
