import { describe, expect, it } from "vitest";
import { builtins } from "../../src/providers/index.ts";
import {
  create,
  getDefaultURL,
  has,
  listProviders,
  providers,
  register,
} from "../../src/core/registry.ts";
import { Provider } from "../../src/core/provider.ts";
import type { ProviderEntry } from "../../src/core/types.ts";
import { UnknownProviderError } from "../../src/core/errors.ts";

class ProbeProvider extends Provider {
  static readonly key = "probe";

  get capabilities() {
    return { discover: false };
  }

  async discover() {
    return [];
  }
}

const probeEntry: Readonly<ProviderEntry> = {
  key: "probe",
  capabilities: { discover: false },
  load: () => Promise.resolve(ProbeProvider),
};

describe("registry", () => {
  it("registers every built-in source exactly once", () => {
    const names = providers();

    expect(names).toEqual(["alienvault", "commoncrawl", "urlscan", "virustotal", "wayback"]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("manifest entries match the classes they load", async () => {
    // Lazy-manifest guard: metadata lives in the manifest, so a provider whose key drifted
    // from its entry would be invisible to create() with green tests everywhere.
    for (const entry of builtins) {
      const loaded = await entry.load();
      expect(loaded.key).toBe(entry.key);
    }
  });

  it("creates instances asynchronously on first use", async () => {
    expect(has("wayback")).toBe(true);
    expect((await create("wayback")).name).toBe("wayback");
    expect(has("missing")).toBe(false);
    await expect(create("missing")).rejects.toThrow(UnknownProviderError);
  });

  it("reports default endpoints", () => {
    expect(getDefaultURL("wayback")).toBe("https://web.archive.org");
    expect(getDefaultURL("missing")).toBeUndefined();
  });

  it("lists capabilities from static metadata and flags key-requiring sources", () => {
    const listings = listProviders();
    const names = listings.map((listing) => listing.name);

    expect(names).toContain("alienvault");
    const alienvault = listings.find((listing) => listing.name === "alienvault");
    expect(alienvault?.capabilities).toEqual({ discover: true });

    const virustotal = listings.find((listing) => listing.name === "virustotal");
    expect(virustotal?.requiresKey).toBe(true);
  });

  it("registers external classes without loading them", async () => {
    register(ProbeProvider, probeEntry);
    expect(has("probe")).toBe(true);

    const provider = await create("probe");
    expect(provider.constructor.name).toBe("ProbeProvider");
    expect(provider.capabilities).toEqual({ discover: false });
  });

  it("loads a manifest module once for parallel cold creates", async () => {
    let loads = 0;
    class SlowProvider extends Provider {
      static readonly key = "slow";
      get capabilities() {
        return { discover: false };
      }
      async discover() {
        return [];
      }
    }
    register(SlowProvider, {
      key: "slow",
      capabilities: { discover: false },
      load: async () => {
        loads += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return SlowProvider;
      },
    });

    const [first, second, third] = await Promise.all([
      create("slow"),
      create("slow"),
      create("slow"),
    ]);

    expect(loads).toBe(1);
    expect(first).not.toBe(second);
    expect(second).not.toBe(third);
  });

  it("retries a rejected load on the next create", async () => {
    let attempts = 0;
    class FlakyProvider extends Provider {
      static readonly key = "flaky";
      get capabilities() {
        return { discover: false };
      }
      async discover() {
        return [];
      }
    }
    register(FlakyProvider, {
      key: "flaky",
      capabilities: { discover: false },
      load: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("boom");
        return FlakyProvider;
      },
    });

    await expect(create("flaky")).rejects.toThrow("boom");

    const provider = await create("flaky");
    expect(provider).toBeInstanceOf(FlakyProvider);
    expect(attempts).toBe(2);
  });
});
