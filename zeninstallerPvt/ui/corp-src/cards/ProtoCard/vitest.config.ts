import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["corp-src/cards/ProtoCard/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["./vitest.setup.js"],
  },
});
