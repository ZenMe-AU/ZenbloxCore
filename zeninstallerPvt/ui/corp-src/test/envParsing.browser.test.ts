import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { createGithubApi } from "../api/github";
import * as backend from "../api/backend";
import type { Account } from "../types";

const account: Account = { login: "example", type: "Organization", id: 1 };
// Include multibyte text to catch Base64 decoders that treat UTF-8 bytes as Latin-1.
const content = [
  "# configuration",
  "export NAME=company",
  "UNICODE=crème 東京",
  "EMPTY=",
  'QUOTED="value # with = symbols"',
  "SINGLE=' literal value '",
  "COMMENT=plain # ignored",
  'ESCAPED="first\\nsecond"',
  'MULTILINE="first',
  'second"',
].join("\r\n");
const expected = {
  NAME: "company", UNICODE: "crème 東京", EMPTY: "", QUOTED: "value # with = symbols", SINGLE: " literal value ",
  COMMENT: "plain", ESCAPED: "first\nsecond", MULTILINE: "first\nsecond",
};

afterEach(() => vi.restoreAllMocks());

for (const provider of ["backend", "github"] as const) {
  describe(`${provider} browser env parsing`, () => {
    const api = provider === "backend" ? backend : createGithubApi("test-token");

    it("parses fetched configuration without Node APIs", async () => {
      // Base64 must be built from encoded bytes so this browser test covers real UTF-8 payloads.
      const encodedContent = btoa(Array.from(new TextEncoder().encode(content), (byte) => String.fromCharCode(byte)).join(""));
      vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ content: provider === "backend" ? content : encodedContent }));
      expect(await api.fetchEnv(account, "repo")).toEqual(expected);
    });

    it("parses the configuration inside a downloaded plan artifact", async () => {
      const archive = new JSZip().file("corp.env", content);
      const response = provider === "backend"
        ? Response.json({ content: await archive.generateAsync({ type: "base64" }) })
        : new Response(await archive.generateAsync({ type: "blob" }));
      vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
      expect(await api.getPlanEnv(account, "repo", 123)).toEqual(expected);
    });

    it("returns null for a missing configuration file", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
      expect(await api.fetchEnv(account, "repo")).toBeNull();
    });
  });
}