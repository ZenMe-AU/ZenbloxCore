/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import js from "@eslint/js";
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import cspell from "@cspell/eslint-plugin";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import { fileURLToPath } from "node:url";

const tsconfigRootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    plugins: { "jsx-a11y": jsxA11y, "@cspell": cspell },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: { tsconfigRootDir },
    },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      "react-refresh/only-export-components": ["error", { extraHOCs: ["withAITracking"] }],
      "@cspell/spellchecker": ["warn", {
        cspell: {
          import: ["@cspell/dict-en-au/cspell-ext.json"],
          language: "en-AU",
          dictionaries: ["en-au"],
          words: ["Zenme", "lifecycles"],
        },
        cspellOptionsRoot: import.meta.url,
      }],
    },
  },
  {
    files: ["corp-src/cards/**/*.{ts,tsx}", "corp-src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='sx'] Literal[value=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})/]",
          message: "Use a theme color token instead of a hex literal in sx.",
        },
        {
          selector: "JSXAttribute[name.name='sx'] Property[key.name='fontFamily']",
          message: "Use a theme typography variant instead of fontFamily in sx.",
        },
        {
          selector: "JSXAttribute[name.name='sx'] Property[key.name='fontSize']",
          message: "Use a theme typography variant instead of fontSize in sx.",
        },
      ],
    },
  },
]);
