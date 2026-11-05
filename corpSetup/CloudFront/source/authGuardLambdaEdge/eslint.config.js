/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import js from "@eslint/js";
import licenseheader from "eslint-plugin-license-header";
import globals from "globals";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";

export default [
  js.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    files: ["**/*.{mjs,js}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      licenseheader,
    },
    rules: {
      "licenseheader/header": [
        "warn",
        [
          "/**",
          " * @license SPDX-FileCopyrightText: © " + new Date().getFullYear() + " Zenme Pty Ltd <info@zenme.com.au>",
          " * @license SPDX-License-Identifier: MIT",
          " */",
        ],
      ],
      "linebreak-style": "off", // Do not check line endings
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
  },
];
