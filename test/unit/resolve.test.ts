import { afterEach, describe, expect, it } from "vitest";
import { UnknownProviderError } from "../../src/core/errors.ts";
import { isAllProviders, resolveProvider, selectProvider } from "../../src/core/resolve.ts";
import "../../src/providers/index.ts";

afterEach(() => {
  delete process.env.VIRUSTOTAL_API_KEY;
});

describe("resolveProvider", () => {
  it("prefers an explicit registered provider", () => {
    expect(resolveProvider("wayback")).toBe("wayback");
  });

  it("throws UnknownProviderError for an unknown explicit provider", () => {
    expect(() => resolveProvider("missing")).toThrow(UnknownProviderError);
  });

  it("defaults to the keyless alienvault source", () => {
    expect(resolveProvider()).toBe("alienvault");
  });

  it("picks virustotal when its key is configured", () => {
    process.env.VIRUSTOTAL_API_KEY = "test";
    expect(resolveProvider()).toBe("virustotal");
  });

  it("treats empty and whitespace strings as absent", async () => {
    expect((await selectProvider("   ")).name).toBe("alienvault");
    expect((await selectProvider("")).name).toBe("alienvault");
  });
});

describe("isAllProviders", () => {
  it("recognizes the reserved all value case-insensitively", () => {
    expect(isAllProviders("all")).toBe(true);
    expect(isAllProviders(" ALL ")).toBe(true);
    expect(isAllProviders("wayback")).toBe(false);
    expect(isAllProviders(undefined)).toBe(false);
  });
});

describe("selectProvider", () => {
  it("returns a provider instance paired with its key", async () => {
    const selected = await selectProvider("wayback");

    expect(selected.name).toBe("wayback");
    expect(selected.provider.name).toBe("wayback");
  });

  it("throws for unknown providers", async () => {
    await expect(selectProvider("missing")).rejects.toThrow(/Unknown provider: missing/);
  });
});
