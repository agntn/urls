/** Zod fragments shared by the MCP server and the AI SDK tools. */

import { z } from "zod";
import { DEFAULT_DISCOVER_LIMIT, MAX_DISCOVER_RESULTS } from "./types.ts";

/** Optional provider selector; empty-like strings are rejected before selection. */
export const providerInput = {
  provider: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Urls source key, or 'all' to fan out to every registered source and compare"),
};

/** Target domain for passive discovery. */
export const domainInput = z
  .string()
  .trim()
  .min(1)
  .describe("Target domain to discover URLs for, for example 'example.com'");

/** Discovery result bound; sources stop paging once it is reached. */
export const limitInput = z
  .number()
  .int()
  .positive()
  .max(MAX_DISCOVER_RESULTS)
  .optional()
  .describe(
    `Maximum number of URLs to return; sources stop when the bound is reached and the answer says whether more exist. Defaults to ${DEFAULT_DISCOVER_LIMIT}; accepted range: 1-${MAX_DISCOVER_RESULTS}.`,
  );

/** Provenance switch: the query URL names the request, not the URL, and repeats per record. */
export const referenceInput = z
  .boolean()
  .optional()
  .describe(
    "Include the source query URL that returned each record as reference. Defaults to false.",
  );

/** Keep-only substring patterns, case-insensitive. */
export const matchInput = z
  .array(z.string().trim().min(1))
  .optional()
  .describe("Keep only URLs containing at least one of these substrings (case-insensitive)");

/** Exclude substring patterns, case-insensitive. */
export const filterInput = z
  .array(z.string().trim().min(1))
  .optional()
  .describe("Drop URLs containing any of these substrings (case-insensitive)");

/** Scope switch: the default host-based scope keeps only URLs under the input domain. */
export const noScopeInput = z
  .boolean()
  .optional()
  .describe("Disable the default host-based scope and keep every URL a source returns");

/** Keep-only URL-scope patterns; matched against the full URL, not a hostname. */
export const urlScopeInput = z
  .array(z.string().trim().min(1))
  .optional()
  .describe(
    "Keep only URLs matching at least one URL-scope pattern (prefix or glob with *). Patterns apply to the full URL, not a domain or DNS name.",
  );

/** Drop URL-out-scope patterns; matched against the full URL. */
export const urlOutScopeInput = z
  .array(z.string().trim().min(1))
  .optional()
  .describe(
    "Drop URLs matching any URL-out-scope pattern (prefix or glob with *). Patterns apply to the full URL.",
  );

/** Path extensions to keep, without a leading dot. */
export const extInput = z
  .array(z.string().trim().min(1))
  .optional()
  .describe("Keep only URLs whose path ends with one of these extensions (for example js, json)");

/** Keep URLs that still have query keys after tracking keys are dropped. */
export const hasQueryInput = z
  .boolean()
  .optional()
  .describe("When true, keep only URLs that still have query keys after tracking keys are dropped");

/** Inclusive start of the seen-at window. */
export const fromInput = z
  .string()
  .trim()
  .min(1)
  .optional()
  .describe("Inclusive start of the seen-at window (archive digits such as 2019, or an ISO date)");

/** Inclusive end of the seen-at window. */
export const toInput = z
  .string()
  .trim()
  .min(1)
  .optional()
  .describe("Inclusive end of the seen-at window (archive digits such as 2019, or an ISO date)");
