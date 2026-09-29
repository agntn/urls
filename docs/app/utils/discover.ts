import {
  normalizeUrl,
  urlExtension,
  urlQueryKeys,
  type DiscoveredUrl,
  type DiscoverPage,
  type SerializedOutcome,
} from "../../../src/index.ts";
import recorded from "./landing-samples.json" with { type: "json" };
import { PROVIDERS } from "./providers.ts";

/** One `urls_discover` comparison the landing walks: recorded by `scripts/record-landing.ts`, or live. */
export interface DiscoverSample {
  readonly target: string;
  readonly limit: number;
  readonly fetchedAt: string;
  readonly outcomes: readonly SerializedOutcome<DiscoverPage>[];
  readonly live?: boolean;
}

/**
 * Puts back the fields the recorder leaves out, in the key order `UrlCollector` writes them, so
 * the tool text of a recorded sample is the text the MCP server sent.
 *
 * @param {DiscoveredUrl} record - A record as stored in `landing-samples.json`.
 * @returns {DiscoveredUrl} The record as the executor returned it.
 */
export function restoreRecord({ url, source, input, firstSeen, lastSeen }: DiscoveredUrl): DiscoveredUrl {
  const ext = urlExtension(url);
  const queryKeys = urlQueryKeys(url);
  return {
    url,
    source,
    input,
    ...(ext ? { ext } : {}),
    ...(queryKeys.length > 0 ? { queryKeys } : {}),
    ...(firstSeen ? { firstSeen, lastSeen } : {}),
  };
}

/** The recorded samples, in the order the landing walks them. */
export const LANDING_SAMPLES: readonly DiscoverSample[] = (recorded as DiscoverSample[]).map((sample) => ({
  ...sample,
  outcomes: sample.outcomes.map((outcome) =>
    outcome.result ? { ...outcome, result: { ...outcome.result, urls: outcome.result.urls.map(restoreRecord) } } : outcome,
  ),
}));

/** What one source did in a comparison; the state name is also the look of its node. */
export type SourceState = "ok" | "empty" | "failed" | "waiting";

export interface SourceCell {
  readonly key: string;
  readonly state: SourceState;
  readonly count: number;
  readonly hasMore: boolean;
  readonly error?: string;
}

/**
 * Every registered source in registry order, with what it answered in this sample.
 *
 * @param {DiscoverSample | undefined} sample - The comparison, or undefined before any answer.
 * @returns {SourceCell[]} One cell per source.
 */
export function sourceCells(sample: DiscoverSample | undefined): SourceCell[] {
  return PROVIDERS.map((provider) => {
    const outcome = sample?.outcomes.find((entry) => entry.provider === provider.key);
    if (!outcome) return { key: provider.key, state: "waiting", count: 0, hasMore: false };
    if (outcome.error !== undefined) {
      return { key: provider.key, state: "failed", count: 0, hasMore: false, error: outcome.error };
    }
    const count = outcome.result?.count ?? 0;
    return { key: provider.key, state: count ? "ok" : "empty", count, hasMore: outcome.result?.hasMore ?? false };
  });
}

/** One URL after the sources are merged: the first spelling seen, and every source that had it. */
export interface MergedUrl {
  readonly url: string;
  readonly sources: readonly string[];
  readonly firstSeen?: string;
  readonly lastSeen?: string;
}

/**
 * Merges the pages of every source on the library's own dedup key, the way `UrlCollector` does
 * within one source.
 *
 * @param {DiscoverSample | undefined} sample - The comparison.
 * @returns {MergedUrl[]} Unique URLs in the order the sources answered.
 */
export function mergeUrls(sample: DiscoverSample | undefined): MergedUrl[] {
  const merged = new Map<string, { url: string; sources: string[]; firstSeen?: string; lastSeen?: string }>();
  for (const outcome of sample?.outcomes ?? []) {
    for (const record of outcome.result?.urls ?? []) {
      const key = normalizeUrl(record.url);
      const entry = merged.get(key) ?? { url: record.url, sources: [] };
      if (!entry.sources.includes(record.source)) entry.sources.push(record.source);
      entry.firstSeen = earlier(entry.firstSeen, record.firstSeen);
      entry.lastSeen = later(entry.lastSeen, record.lastSeen);
      merged.set(key, entry);
    }
  }
  return [...merged.values()];
}

function earlier(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function later(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * The years a set of URLs was seen in, from the oldest capture to the newest.
 *
 * @param {readonly MergedUrl[]} urls - Merged URLs.
 * @returns {string} `2014 → 2026`, one year, or `undated` when no source gave a date.
 */
export function seenSpan(urls: readonly MergedUrl[]): string {
  const first = urls.reduce<string | undefined>((min, url) => earlier(min, url.firstSeen), undefined);
  const last = urls.reduce<string | undefined>((max, url) => later(max, url.lastSeen), undefined);
  if (!first || !last) return "undated";
  const from = first.slice(0, 4);
  const to = last.slice(0, 4);
  return from === to ? from : `${from} → ${to}`;
}

/** One first path segment and how many merged URLs sit under it. */
export interface PathBranch {
  readonly path: string;
  readonly count: number;
}

/**
 * Groups URLs by host and first path segment, the rough shape of a site as the sources remember it.
 *
 * @param {readonly MergedUrl[]} urls - Merged URLs.
 * @param {number} top - Branches to keep; the rest fold into the last row.
 * @returns {PathBranch[]} The largest branches, biggest first.
 */
export function pathBranches(urls: readonly MergedUrl[], top: number): PathBranch[] {
  const counts = new Map<string, number>();
  for (const { url } of urls) {
    const branch = firstBranch(url);
    counts.set(branch, (counts.get(branch) ?? 0) + 1);
  }
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const kept = sorted.slice(0, top).map(([path, count]) => ({ path, count }));
  const rest = sorted.slice(top).reduce((sum, [, count]) => sum + count, 0);
  return rest ? [...kept, { path: `${sorted.length - top} more`, count: rest }] : kept;
}

function firstBranch(url: string): string {
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split("/").find(Boolean);
    return `${parsed.hostname.replace(/^www\./, "")}/${segment ?? ""}`;
  } catch {
    return url;
  }
}

/**
 * The page of one source as `urls_discover` prints it, or the comparison as a list of outcomes.
 *
 * @param {DiscoverSample} sample - The comparison.
 * @returns {string} The MCP tool text for this call.
 */
export function toolText(sample: DiscoverSample): string {
  return JSON.stringify(sample.outcomes, null, 2);
}

/** The records a sample carries, for filters that run on them in the browser. */
export function sampleRecords(sample: DiscoverSample | undefined): DiscoveredUrl[] {
  return (sample?.outcomes ?? []).flatMap((outcome) => [...(outcome.result?.urls ?? [])]);
}
