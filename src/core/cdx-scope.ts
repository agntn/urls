/**
 * CDX request narrowing for `urlScope`
 *
 * Wayback, Arquivo.pt and Vefsafn all fold a `matchType=prefix` request like their urlkey: scheme,
 * `www.` and case dropped. A prefix taken from a scope pattern asks for a superset of what the
 * pattern keeps, and the collector drops the extras.
 */

import { inScope } from "./url.ts";

/** One CDX request: the `url` parameter and how the archive matches it. */
export interface CdxScopeQuery {
  readonly url: string;
  readonly matchType: "domain" | "prefix";
}

/** More prefixes than this cost more round trips than one domain-wide stream. */
const MAX_SCOPE_REQUESTS = 8;

/** Empty and dot segments, which the archive would not keep as written. */
const UNSAFE_PATH = /\/\/|\/\.{1,2}(?:\/|$)/u;

/** Host, then an optional path the urlkey keeps as written: no query, port or escapes. */
const SCOPE_PREFIX = /^https?:\/\/([a-z0-9.-]+)(\/[a-z0-9._~/-]*)?$/u;

/**
 * The part of a URL-scope pattern every kept URL starts with, cut where the host is whole.
 *
 * @param pattern Lowercased `urlScope` pattern.
 * @returns {string} Literal head, or empty when a glob cuts the host short.
 */
function literalHead(pattern: string): string {
  const star = pattern.indexOf("*");
  if (star === -1) return pattern;
  const head = pattern.slice(0, star);
  return head.slice(head.indexOf("//") + 2).includes("/") ? head : "";
}

/**
 * Turn one URL-scope pattern into a CDX prefix under the target domain.
 *
 * @param pattern `urlScope` pattern.
 * @param target Resolved domain.
 * @returns {string | undefined} `host/path` for `matchType=prefix`, or undefined to ask broadly.
 */
function scopePrefix(pattern: string, target: string): string | undefined {
  const match = SCOPE_PREFIX.exec(literalHead(pattern.trim().toLowerCase()));
  const host = match?.[1];
  const path = match?.[2] ?? "/";
  if (!host || host.split(".").includes("") || UNSAFE_PATH.test(path)) return undefined;
  if (!inScope(`https://${host}/`, target)) return undefined;
  return `${host}${path}`;
}

/**
 * CDX `url` values that together cover every URL the scope can keep.
 *
 * @param target Resolved domain.
 * @param urlScope Caller `urlScope` patterns.
 * @returns {string[] | undefined} Prefixes to ask for, or undefined for one domain-wide request.
 */
function scopePrefixes(
  target: string,
  urlScope: readonly string[] | undefined,
): string[] | undefined {
  if (!urlScope || urlScope.length === 0) return undefined;
  const prefixes = new Set<string>();
  for (const pattern of urlScope) {
    const prefix = scopePrefix(pattern, target);
    if (prefix === undefined) return undefined;
    prefixes.add(prefix);
  }
  const sorted = [...prefixes].toSorted();
  const kept = sorted.filter(
    (prefix, index) => !sorted.slice(0, index).some((other) => prefix.startsWith(other)),
  );
  return kept.length > MAX_SCOPE_REQUESTS ? undefined : kept;
}

/**
 * The CDX requests that cover a discovery: one per scope prefix, or the whole domain.
 *
 * @param target Resolved domain.
 * @param urlScope Caller `urlScope` patterns.
 * @returns {CdxScopeQuery[]} Requests to send in order.
 */
export function cdxScopeQueries(
  target: string,
  urlScope: readonly string[] | undefined,
): CdxScopeQuery[] {
  const prefixes = scopePrefixes(target, urlScope);
  return prefixes
    ? prefixes.map((url) => ({ url, matchType: "prefix" }))
    : [{ url: target, matchType: "domain" }];
}
