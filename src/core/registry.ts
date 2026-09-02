/** Self-registering provider registry for Urls */

import { Provider } from "./provider.ts";
import type { ProviderConstructor } from "./provider.ts";
import type { ProviderCapabilities, ProviderConfig } from "./types.ts";
import { UnknownProviderError } from "./errors.ts";

interface RegistryEntry {
  defaultURL?: string;
  providerClass: ProviderConstructor;
}

const registry = new Map<string, RegistryEntry>();

/**
 * Register a provider class under its stable `key`.
 *
 * Registering the same name again replaces the previous entry. That is useful in tests, but easy
 * to do by accident in application code.
 *
 * @param providerClass Concrete provider class with a `static readonly key`.
 * @param defaultURL Public endpoint advertised with the provider.
 */
export function register(providerClass: ProviderConstructor, defaultURL?: string): void {
  registry.set(providerClass.key, { defaultURL, providerClass });
}

/**
 * Create a registered provider with optional backend configuration.
 *
 * @example
 *   ```ts
 *   import { create } from "@agntn/urls";
 *
 *   const provider = create("alienvault");
 *   const urls = await provider.discover("example.com", { limit: 5 });
 *   ```
 *
 * @throws {UnknownProviderError} When `name` has not been registered.
 * @param name Registry key.
 * @param config Optional backend configuration.
 * @returns {Provider} A ready-to-use provider instance.
 */
export function create(name: string, config?: Readonly<ProviderConfig>): Provider {
  const entry = registry.get(name);
  if (!entry) {
    throw new UnknownProviderError(name);
  }
  return new entry.providerClass(config ?? {});
}

/**
 * Return registered provider names in registration order.
 *
 * @returns {string[]} Registered provider keys.
 */
export function providers(): string[] {
  return Array.from(registry.keys());
}

/**
 * Check whether a name can be passed to `create`.
 *
 * @param name Registry key.
 * @returns {boolean} True when the name is registered.
 */
export function has(name: string): boolean {
  return registry.has(name);
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
  return registry.get(name)?.defaultURL;
}

/** One row of `listProviders()`. */
export interface ProviderListing {
  /** Registry key */
  readonly name: string;
  /** Public endpoint advertised at registration */
  readonly defaultUrl?: string;
  /** Operations the provider serves; absent when construction needs configuration */
  readonly capabilities?: ProviderCapabilities;
  /**
   * True when the provider cannot be constructed without credentials. A provider whose
   * constructor demands missing credentials is reported as requiring configuration instead of
   * failing the whole listing.
   */
  readonly requiresConfiguration?: boolean;
}

/**
 * Enumerate registered providers with their capabilities.
 *
 * A provider whose constructor demands missing credentials is reported as requiring
 * configuration instead of failing the whole listing.
 *
 * @returns {ProviderListing[]} Registered providers.
 */
export function listProviders(): ProviderListing[] {
  return providers().map((name) => {
    const base = { name, defaultUrl: getDefaultURL(name) };
    try {
      return { ...base, capabilities: create(name).capabilities };
    } catch {
      return { ...base, requiresConfiguration: true };
    }
  });
}
