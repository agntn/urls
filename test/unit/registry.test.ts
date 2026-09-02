import { describe, expect, it } from "vitest";
import {
  create,
  getDefaultURL,
  has,
  listProviders,
  providers,
  register,
} from "../../src/core/registry.ts";
import { Provider } from "../../src/core/provider.ts";
import { UnknownProviderError } from "../../src/core/errors.ts";
import "../../src/providers/index.ts";

class ProbeProvider extends Provider {
  static readonly key = "probe";

  constructor() {
    super({});
  }

  get capabilities() {
    return { discover: false };
  }

  async discover() {
    return [];
  }
}

describe("registry", () => {
  it("registers every built-in source exactly once", () => {
    // Each provider file self-registers; the index import is the single side effect.
    const names = providers();

    expect(names).toEqual(["alienvault", "commoncrawl", "urlscan", "virustotal", "wayback"]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("creates instances and reports registration", () => {
    expect(has("wayback")).toBe(true);
    expect(create("wayback").name).toBe("wayback");
    expect(has("missing")).toBe(false);
    expect(() => create("missing")).toThrow(UnknownProviderError);
  });

  it("reports default endpoints", () => {
    expect(getDefaultURL("wayback")).toBe("https://web.archive.org");
    expect(getDefaultURL("missing")).toBeUndefined();
  });

  it("lists capabilities and flags key-requiring sources", () => {
    const listings = listProviders();
    const names = listings.map((listing) => listing.name);

    expect(names).toContain("alienvault");
    const alienvault = listings.find((listing) => listing.name === "alienvault");
    expect(alienvault?.capabilities).toEqual({ discover: true });

    // virustotal cannot be constructed without a key, so it is flagged, not fatal.
    const virustotal = listings.find((listing) => listing.name === "virustotal");
    expect(virustotal?.requiresConfiguration).toBe(true);
  });

  it("replaces an existing registration under the same key", () => {
    register(ProbeProvider);
    expect(create("probe").constructor.name).toBe("ProbeProvider");
    expect(create("probe").capabilities).toEqual({ discover: false });
  });
});
