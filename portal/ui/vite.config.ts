/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import federation from "@originjs/vite-plugin-federation";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import devToolsJson from "vite-plugin-devtools-json";

export default defineConfig(() => {
  const mfPlugin = federation({
    name: "uiHost",
    remotes: {
      accessPassRemote: process.env.VITE_ACCESS_PASS_REMOTE_URL ?? "http://localhost:5183/assets/remoteEntry.js",
    },
    shared: ["react", "react-dom", "react-router", "react-router-dom"],
  });

  return {
    plugins: [mfPlugin, reactRouter(), devToolsJson()],
    build: {
      target: "esnext",
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
