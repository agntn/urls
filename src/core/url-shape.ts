/** URL normalization, query/extension views, and archive timestamps */

/** Query keys treated as tracking noise and dropped during normalize/dedup. */
const TRACKING_QUERY_KEYS = new Set([
  "_ga",
  "_gl",
  "dclid",
  "fbclid",
  "gbraid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "twclid",
  "utm_campaign",
  "utm_content",
  "utm_id",
  "utm_medium",
  "utm_source",
  "utm_term",
  "wbraid",
  "yclid",
]);

/** Pure archive digit bounds stay lexical so partial periods can use sentinel padding. */
const ARCHIVE_BOUND_PATTERN = /^\d{4,14}$/u;

/** ISO dates keep a strict calendar prefix before runtime parsing. */
const ISO_BOUND_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:T.*)?$/iu;

/** Explicit ISO zone suffix, distinguishing times with a zone from unzoned times. */
const ISO_ZONE_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/iu;

/**
 * Canonical form used as the collector dedup key.
 *
 * Lowercases scheme and host, strips the fragment, drops tracking query keys, sorts the
 * remaining query, and removes a trailing slash on non-root paths. Invalid URLs fall back to
 * the input with only a fragment stripped.
 *
 * @param url Raw URL.
 * @returns {string} The normalized URL.
 */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.protocol = parsed.protocol.toLowerCase();
    const pairs = [...parsed.searchParams.entries()].filter(
      ([key]) => !TRACKING_QUERY_KEYS.has(key.toLowerCase()),
    );
    pairs.sort(([left], [right]) => left.localeCompare(right));
    parsed.search = "";
    for (const [key, value] of pairs) parsed.searchParams.append(key, value);
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.href;
  } catch {
    const hash = trimmed.indexOf("#");
    return hash === -1 ? trimmed : trimmed.slice(0, hash);
  }
}

/**
 * File extension of the URL path, without a leading dot.
 *
 * @param url Raw URL.
 * @returns {string | undefined} Lowercased extension, when the last path segment has one.
 */
export function urlExtension(url: string): string | undefined {
  try {
    const path = new URL(url).pathname;
    const slash = path.lastIndexOf("/");
    const segment = slash === -1 ? path : path.slice(slash + 1);
    const dot = segment.lastIndexOf(".");
    if (dot <= 0 || dot === segment.length - 1) return undefined;
    return segment.slice(dot + 1).toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Query keys of a URL, tracking keys omitted, first-seen order, unique.
 *
 * @param url Raw URL.
 * @returns {string[]} Remaining query keys.
 */
export function urlQueryKeys(url: string): string[] {
  try {
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const key of new URL(url).searchParams.keys()) {
      const lower = key.toLowerCase();
      if (TRACKING_QUERY_KEYS.has(lower) || seen.has(lower)) continue;
      seen.add(lower);
      keys.push(lower);
    }
    return keys;
  } catch {
    return [];
  }
}

/**
 * Unique query keys across a result set, first-seen order.
 *
 * @param urls Discovered URL records or raw URL strings.
 * @returns {string[]} Union of query keys.
 */
export function uniqueQueryKeys(
  urls: readonly { readonly url: string }[] | readonly string[],
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const entry of urls) {
    const url = typeof entry === "string" ? entry : entry.url;
    for (const key of urlQueryKeys(url)) {
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Convert an archive timestamp (`YYYYMMDDhhmmss`, possibly shorter) to UTC ISO-8601.
 *
 * @param stamp Archive digit timestamp.
 * @returns {string | undefined} ISO instant, when the stamp has at least a year.
 */
export function archiveStampToIso(stamp: string): string | undefined {
  const digits = stamp.replaceAll(/\D/g, "");
  if (digits.length < 4) return undefined;
  const padded = digits.padEnd(14, "0").slice(0, 14);
  return `${padded.slice(0, 4)}-${padded.slice(4, 6)}-${padded.slice(6, 8)}T${padded.slice(8, 10)}:${padded.slice(10, 12)}:${padded.slice(12, 14)}Z`;
}

/**
 * Fold an archive stamp or ISO date into a 14-digit comparable stamp.
 *
 * `from` pads missing digits with 0; `to` pads with 9 so `2019` covers the whole year.
 *
 * @param value Archive digits or ISO date.
 * @param edge Start or end of the window.
 * @returns {string | undefined} 14-digit stamp.
 */
export function parseTimeBound(value: string, edge: "from" | "to"): string | undefined {
  const trimmed = value.trim();
  if (ARCHIVE_BOUND_PATTERN.test(trimmed)) {
    return trimmed.padEnd(14, edge === "from" ? "0" : "9");
  }
  return parseIsoTimeBound(trimmed);
}

/**
 * Parse one ISO bound and normalize its offset to UTC.
 *
 * @param value Candidate ISO date or instant.
 * @returns {string | undefined} UTC archive stamp, or undefined when invalid.
 */
function parseIsoTimeBound(value: string): string | undefined {
  const datePart = value.match(ISO_BOUND_PATTERN)?.[1];
  if (!datePart) return undefined;
  const midnight = Date.parse(`${datePart}T00:00:00Z`);
  if (Number.isNaN(midnight) || new Date(midnight).toISOString().slice(0, 10) !== datePart) {
    return undefined;
  }
  const normalized =
    value.length > datePart.length && !ISO_ZONE_PATTERN.test(value) ? `${value}Z` : value;
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) return undefined;
  const iso = new Date(ms).toISOString();
  if (!/^\d{4}-/u.test(iso)) return undefined;
  return iso.replaceAll(/\D/g, "").slice(0, 14);
}

/**
 * True when an occurrence belongs in the optional `[from, to]` window.
 *
 * Missing timestamps pass: sources that do not report time are not dropped by a time filter.
 *
 * @param stamp 14-digit archive stamp, when known.
 * @param from Inclusive start stamp.
 * @param to Inclusive end stamp.
 * @returns {boolean} True when the occurrence is in range.
 */
export function stampInWindow(
  stamp: string | undefined,
  from: string | undefined,
  to: string | undefined,
): boolean {
  if (!stamp) return true;
  if (from && stamp < from) return false;
  if (to && stamp > to) return false;
  return true;
}

/**
 * Normalize a source-reported time to a 14-digit stamp plus ISO display form.
 *
 * @param value Archive digits or ISO date.
 * @returns {{ stamp: string, iso: string } | undefined} Stamp plus ISO, or undefined when unparseable.
 */
export function parseSeenAt(
  value: string | undefined,
): { readonly stamp: string; readonly iso: string } | undefined {
  if (!value?.trim()) return undefined;
  const stamp = parseTimeBound(value.trim(), "from");
  if (!stamp) return undefined;
  const iso = archiveStampToIso(stamp);
  if (!iso) return undefined;
  return { stamp, iso };
}

/**
 * Parse one Wayback/Common Crawl CDX text line (`url` plus optional trailing timestamp).
 *
 * @param line One CDX text row.
 * @returns {{ url: string, timestamp?: string } | undefined} URL and optional stamp.
 */
export function parseCdxTextLine(
  line: string,
): { readonly url: string; readonly timestamp?: string } | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/^(.*)\s+(\d{8,14})$/u);
  if (!match) return { url: trimmed };
  const url = match[1]?.trim();
  const timestamp = match[2];
  if (!url) return undefined;
  return timestamp ? { url, timestamp } : { url };
}

/**
 * Parse one CDX NDJSON record with `url` and optional `timestamp`.
 *
 * @param line One NDJSON object.
 * @returns {{ url: string, timestamp?: string } | undefined} URL and optional stamp.
 */
export function parseCdxNdjsonLine(
  line: string,
): { readonly url: string; readonly timestamp?: string } | undefined {
  try {
    const row: unknown = JSON.parse(line);
    if (typeof row !== "object" || row === null) return undefined;
    const record = row as { readonly url?: unknown; readonly timestamp?: unknown };
    if (typeof record.url !== "string") return undefined;
    return typeof record.timestamp === "string"
      ? { url: record.url, timestamp: record.timestamp }
      : { url: record.url };
  } catch {
    return undefined;
  }
}
