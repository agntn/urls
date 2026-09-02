/** Zod fragments shared by the MCP server and the AI SDK tools. */

import { z } from "zod";
import { MAX_DISCOVER_RESULTS } from "./types.ts";

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
  .describe("Maximum number of URLs to return; sources stop when the bound is reached");

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
