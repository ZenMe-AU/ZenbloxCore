/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import dotenv from "dotenv";

export interface EnvStore {
    data: Record<string, string> | null;
    path: string | null;
    loaded: boolean;
    loadFromFile(filePath: string): void;
    ensureLoaded(): void;
    get(key: string, defaultValue?: string): string | undefined;
    set(key: string, value: unknown): void;
    add(key: string, value: unknown): void;
    edit(key: string, value: unknown): void;
    delete(key: string): void;
    saveToFile(): void;
}

export const env: EnvStore = {
    // please don't modify data, path and loaded directly
    data: null,
    path: null,
    loaded: false,

    loadFromFile(filePath: string) {
        this.path = filePath;
        if (existsSync(filePath)) {
            const content = readFileSync(filePath, "utf8");
            this.data = dotenv.parse(content);
            this.loaded = true;
        } else {
            // or should we throw error here?
            this.data = {}; // If file does not exist, initialize with empty object
            this.loaded = true;
        }
    },

    ensureLoaded() {
        if (!this.loaded) {
            throw new Error("Env file has not been loaded. Call load() first.");
        }
    },

    get(key: string, defaultValue: string | undefined = undefined) {
        this.ensureLoaded();
        return this.data?.[key] ?? defaultValue;
    },

    set(key: string, value: unknown) {
        this.ensureLoaded();
        this.data![key] = String(value);
    },

    add(key: string, value: unknown) {
        this.ensureLoaded();

        if (key in this.data!) {
            throw new Error(`ENV key "${key}" already exists`);
        }
        this.data![key] = String(value);
    },

    edit(key: string, value: unknown) {
        this.ensureLoaded();

        if (!(key in this.data!)) {
            throw new Error(`ENV key "${key}" does not exist`);
        }
        this.data![key] = String(value);
    },

    delete(key: string) {
        this.ensureLoaded();
        delete this.data![key];
    },

    saveToFile() {
        this.ensureLoaded();

        if (!this.path) {
            throw new Error("Env file path is not set");
        }

        const content =
            "# if there is no subscription ID, which means no existing subscription, the script will create a new subscription under the billing account provided during c01(bootstrap) stage.\n" +
            Object.entries(this.data!)
                .map(([key, value]) => `${key}=${value}`)
                .join("\n");

        writeFileSync(this.path, content);
    },
};

export default env;
