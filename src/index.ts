export { version } from "./version.ts";
export type {
  DiscoveredUrl,
  DiscoverOptions,
  ProviderCapabilities,
  ProviderConfig,
  ProviderEntry,
} from "./core/types.ts";
export { clampMaxResults, DEFAULT_DISCOVER_LIMIT, MAX_DISCOVER_RESULTS } from "./core/types.ts";
export {
  extractUrls,
  inScope,
  normalizeHost,
  resolveDomain,
  urlMatchesScope,
  UrlCollector,
} from "./core/url.ts";
export {
  archiveStampToIso,
  normalizeUrl,
  parseCdxNdjsonLine,
  parseCdxTextLine,
  parseTimeBound,
  uniqueQueryKeys,
  urlExtension,
  urlQueryKeys,
} from "./core/url-shape.ts";
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
export { runDiscover, runDiscoverPage } from "./tool-operations.ts";
export type {
  DiscoverPage,
  DiscoverPageOptions,
  DiscoverPageResult,
  DiscoverResult,
} from "./tool-operations.ts";
export {
  formatDiscoverAll,
  formatDiscoverPage,
  formatDiscoverPages,
  formatProviders,
  formatSourceBlock,
  formatUrlLine,
  serializeDiscoverAll,
} from "./core/format.ts";
export type { SourceBlockOptions } from "./core/format.ts";
