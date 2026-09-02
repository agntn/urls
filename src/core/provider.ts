import type {
  DiscoverOptions,
  DiscoveredUrl,
  ProviderCapabilities,
  ProviderConfig,
} from "./types.ts";
import { getJSON, getTextLines } from "./client.ts";
import type { ClientOptions } from "./client.ts";
import { UnsupportedOperationError } from "./errors.ts";

/**
 * Common API for passive URL sources.
 *
 * A provider holds backend configuration, not a domain. Pass domains to `discover` and check
 * `capabilities` before using an operation.
 */
export abstract class Provider {
  private readonly timeout: number | undefined;

  constructor(config: ProviderConfig = {}) {
    this.timeout = config.timeout;
  }

  /**
   * Registry key owned by the concrete class.
   *
   * @returns {string} The provider key.
   */
  get name(): string {
    return (this.constructor as ProviderConstructor).key;
  }

  /**
   * Operations this provider can actually serve.
   *
   * @returns {ProviderCapabilities} The provider capabilities.
   */
  abstract get capabilities(): ProviderCapabilities;

  /** Enumerate URLs for a domain from this passive source. */
  abstract discover(domain: string, options?: DiscoverOptions): Promise<DiscoveredUrl[]>;

  /**
   * Execute a provider-attributed GET request using the configured timeout.
   *
   * @param url Request URL.
   * @param options Additional request options.
   * @returns {Promise<T>} The parsed JSON body.
   */
  protected getJSON<T>(url: string, options?: ClientOptions): Promise<T> {
    return getJSON<T>(url, { ...options, timeout: this.timeout, provider: this.name });
  }

  /**
   * Stream a provider-attributed response one line at a time.
   *
   * @param url Request URL.
   * @param options Additional request options.
   * @returns {AsyncGenerator<string>} A generator of response lines.
   */
  protected getTextLines(url: string, options?: ClientOptions): AsyncGenerator<string> {
    return getTextLines(url, { ...options, timeout: this.timeout, provider: this.name });
  }
}

/** Concrete provider class accepted by the registry. */
export interface ProviderConstructor {
  /** Stable registry key owned by the concrete class. */
  readonly key: string;
  new (config: ProviderConfig): Provider;
}

/** Operation names accepted by `requireOperation` - one per capability flag. */
export type ProviderOperation = keyof ProviderCapabilities;

/**
 * Return a bound provider method after checking its capability flag.
 *
 * @param provider Provider instance.
 * @param operation Capability-backed operation name.
 * @returns {Provider[K]} The bound provider method.
 *
 * @throws {UnsupportedOperationError} When the provider does not serve the operation.
 */
export function requireOperation<K extends ProviderOperation>(
  provider: Provider,
  operation: K,
): Provider[K] {
  if (!provider.capabilities[operation]) {
    throw new UnsupportedOperationError(operation, provider.name);
  }
  return provider[operation].bind(provider) as Provider[K];
}
