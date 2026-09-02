/** Auto-select provider by checking env vars */

import { create, providers, has } from "./registry.ts";
import { UnknownProviderError } from "./errors.ts";
import type { Provider } from "./provider.ts";

/** Credential env var per keyed built-in provider; keyless providers are simply absent. */
const ENV_MAP: Record<string, string> = {
  virustotal: "VIRUSTOTAL_API_KEY",
};

/**
 * Check for the reserved "all" provider value, which fans a request out to every registered
 * provider instead of selecting one. Surfaces test this before calling `selectProvider`.
 *
 * @param preferred Candidate provider value.
 * @returns {boolean} True when the value selects every provider.
 */
export function isAllProviders(preferred?: string): boolean {
  return preferred?.trim().toLowerCase() === "all";
}

/**
 * Choose a registered provider for the current environment.
 *
 * An explicit preference wins. Without one, a provider with configured credentials wins, then
 * AlienVault OTX, whose public API answers without a key; every keyless source remains usable
 * through an explicit `provider` argument.
 *
 * @param preferred Optional explicit provider name.
 * @returns {string} The chosen provider key.
 *
 * @throws {UnknownProviderError} When an explicit preference is not registered.
 */
export function resolveProvider(preferred?: string): string {
  if (preferred) {
    if (!has(preferred)) {
      throw new UnknownProviderError(preferred);
    }
    return preferred;
  }

  for (const [name, envKey] of Object.entries(ENV_MAP)) {
    if (has(name) && process.env[envKey]) return name;
  }

  return has("alienvault") ? "alienvault" : (providers()[0] ?? "alienvault");
}

/** A provider instance paired with its registry key. */
export interface SelectedProvider {
  /** Registry key of the selected provider */
  name: string;
  /** Ready-to-use provider instance */
  provider: Provider;
}

/**
 * Resolve the provider one request should use.
 *
 * This is the single selection path shared by the CLI, MCP server, AI tools, and both agent
 * extensions. Empty or whitespace-only arguments count as absent, so a client that sends `""`
 * gets the same behavior as one that omits the field.
 *
 * @param preferred Optional explicit provider name.
 * @returns {SelectedProvider} The chosen provider key and a ready-to-use instance.
 */
export function selectProvider(preferred?: string): SelectedProvider {
  const preferredName = preferred?.trim() || undefined;
  const name = resolveProvider(preferredName);
  return { name, provider: create(name) };
}
