/** Side-effect import: registers every built-in provider. */
import "./providers/index.ts";

export { version } from "./version.ts";
export type {
  DiscoveredUrl,
  DiscoverOptions,
  ProviderCapabilities,
  ProviderConfig,
} from "./core/types.ts";
export { clampMaxResults } from "./core/types.ts";
export { extractUrls, inScope, normalizeHost, resolveDomain, UrlCollector } from "./core/url.ts";
export { Provider, requireOperation } from "./core/provider.ts";
export type { ProviderConstructor, ProviderOperation } from "./core/provider.ts";
export {
  AuthError,
  HTTPError,
  InvalidInputError,
  NotFoundError,
  PaymentError,
  RateLimitError,
  UnknownProviderError,
  UnsupportedOperationError,
  UrlsError,
  normalizeError,
} from "./core/errors.ts";
export { buildQuery, getJSON, getTextLines } from "./core/client.ts";
export type { ClientOptions } from "./core/client.ts";
export { create, getDefaultURL, has, listProviders, providers, register } from "./core/registry.ts";
export type { ProviderListing } from "./core/registry.ts";
export { isAllProviders, resolveProvider, selectProvider } from "./core/resolve.ts";
export type { SelectedProvider } from "./core/resolve.ts";
export { discoverAll, discoverWithFallback, serializeOutcomes } from "./core/all.ts";
export type { ProviderOutcome, SerializedOutcome } from "./core/all.ts";
export {
  formatDiscoverAll,
  formatProviders,
  formatSourceBlock,
  formatUrlLine,
  serializeDiscoverAll,
} from "./core/format.ts";
