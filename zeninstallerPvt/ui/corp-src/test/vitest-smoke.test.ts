import { describe, it, expect } from "vitest";

describe("vitest smoke", () => {
  it("runs without importing project code", () => {
    expect(1 + 1).toBe(2);
  });
});