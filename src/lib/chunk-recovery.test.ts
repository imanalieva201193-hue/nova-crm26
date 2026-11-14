import { afterEach, describe, expect, it, vi } from "vitest";
import { isChunkLoadError, recoverChunkLoad } from "./chunk-recovery";

afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });
describe("stale chunk recovery", () => {
  it("recognizes the reported auth module failure", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: /assets/auth-CV-WYREw.js"))).toBe(true);
    expect(isChunkLoadError(new Error("Failed to fetch"))).toBe(false);
  });
  it("prevents repeated reloads within one minute", () => {
    vi.spyOn(Date, "now").mockReturnValue(100_000);
    sessionStorage.setItem("nova-chunk-recovery", "99999");
    expect(recoverChunkLoad(new Error("Failed to fetch dynamically imported module: /assets/auth.js"))).toBe(false);
    expect(sessionStorage.getItem("nova-chunk-recovery")).toBe("99999");
  });
  it("does not reload unrelated errors or when the guard cannot be saved", () => {
    expect(recoverChunkLoad(new Error("Permission denied"))).toBe(false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("disabled"); });
    expect(recoverChunkLoad(new Error("Importing a module script failed"))).toBe(false);
  });
});