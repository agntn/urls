/** Lazy provider registry, seeded from the built-in manifest on first use */

import { builtins } from "../providers/index.ts";
import { Provider } from "./provider.ts";
import type { ProviderConstructor } from "./provider.ts";
import type { ProviderCapabilities, ProviderConfig, ProviderEntry } from "./types.ts";
import { UnknownProviderError } from "./errors.ts";

interface RegistryEntry extends ProviderEntry {
  providerClass?: ProviderConstructor;
  providerClassPromise?: Promise<ProviderConstructor>;
}

let registry: Map<string, RegistryEntry> | undefined;

/**
 * Return the registry map, filling it with the built-in metadata on the first call.
 *
 * Only the metadata lands here. Provider modules stay unloaded until `create()` asks for one, so
 * listing or resolving providers never pulls in the source clients.
 *
 * @returns {Map<string, RegistryEntry>} Seeded registry map.
 */
function entries(): Map<string, RegistryEntry> {
  registry ??= new Map(builtins.map((entry): [string, RegistryEntry] => [entry.key, { ...entry }]));
  return registry;
}

/**
 * Register a provider class under its stable `key`.
 *
 * Built-in providers are already registered; this is the entry point for classes living outside
 * the package. The class loader resolves immediately, so `create()` behaves exactly like the
 * manifest path. Registering the same name again replaces the previous entry. That is useful in
 * tests, but easy to do by accident in application code.
 *
 * @param providerClass Concrete provider class with a `static readonly key`.
 * @param meta Static metadata and a loader for the class.
 */
export function register(providerClass: ProviderConstructor, meta: Readonly<ProviderEntry>): void {
  // Unlike manifest entries, the class is already here, so no on-demand import is needed;
  // single-flight still caches the resolved class on first create and retries after a
  // rejected loader, which the registry regression pins.
  entries().set(providerClass.key, {
    ...meta,
    // A caller-supplied loader (counting/flaky in tests) wins; otherwise the class is here
    // already, so resolve it immediately. The registry regression pins single-flight and retry.
    load: meta.load ?? (() => Promise.resolve(providerClass)),
  });
}

/**
 * Create a registered provider with optional backend configuration.
 *
 * The first call for a built-in provider imports its module; later calls reuse the loaded class.
 * The import promise is cached before it resolves, so parallel cold calls share one load, and a
 * rejected load is retried on the next call.
 *
 * @param name Registry key.
 * @param config Optional backend configuration.
 * @returns {Promise<Provider>} A ready-to-use provider instance.
 *
 * @throws {UnknownProviderError} When `name` has not been registered.
 */
export async function create(name: string, config?: Readonly<ProviderConfig>): Promise<Provider> {
  const entry = entries().get(name);
  if (!entry) {
    throw new UnknownProviderError(name);
  }
  if (!entry.providerClass) {
    entry.providerClassPromise ??= entry.load();
    try {
      entry.providerClass = await entry.providerClassPromise;
    } catch (error) {
      entry.providerClassPromise = undefined;
      throw error;
    }
  }
  return new entry.providerClass(config ?? {});
}

/**
 * Return registered provider names in registration order.
 *
 * @returns {string[]} Registered provider keys.
 */
export function providers(): string[] {
  return Array.from(entries().keys());
}

/**
 * Check whether a name can be passed to `create`.
 *
 * @param name Registry key.
 * @returns {boolean} True when the name is registered.
 */
export function has(name: string): boolean {
  return entries().has(name);
}

/**
 * Return the public endpoint advertised when a provider was registered.
 *
 * Per-instance `baseUrl` overrides are deliberately not reflected here.
 *
 * @param name Registry key.
 * @returns {string | undefined} The advertised endpoint, when one was registered.
 */
export function getDefaultURL(name: string): string | undefined {
  return entries().get(name)?.defaultURL;
}

/** One row of `listProviders()`. */
export interface ProviderListing {
  /** Registry key */
  readonly name: string;
  /** Public endpoint advertised at registration */
  readonly defaultUrl?: string;
  /** Operations the provider serves, read from static manifest metadata */
  readonly capabilities?: ProviderCapabilities;
  /** True when the provider cannot be constructed without credentials */
  readonly requiresKey?: boolean;
}

/**
 * Enumerate registered providers with their capabilities.
 *
 * Reads only the static manifest metadata, so listing never loads provider modules.
 *
 * @returns {ProviderListing[]} Registered providers.
 */
export function listProviders(): ProviderListing[] {
  return providers().map((name) => {
    const entry = entries().get(name);
    return {
      name,
      defaultUrl: entry?.defaultURL,
      capabilities: entry?.capabilities,
      requiresKey: entry?.requiresKey ?? false,
    };
  });
}
