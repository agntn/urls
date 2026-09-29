/**
 * Records the landing samples through the same executor the MCP server calls.
 *
 * Run from `docs/` with `node scripts/record-landing.ts`; it rewrites `app/utils/landing-samples.json`.
 */
import { writeFile } from "node:fs/promises";
import { runDiscoverPage, serializeOutcomes, type DiscoveredUrl } from "../../src/index.ts";

/** Domains the landing walks, in order. */
const TARGETS = ["nuxt.com", "mozilla.org", "example.com"];

/** URLs per source; enough for the instrument, small enough for the page. */
const LIMIT = 60;

/** Keeps what the landing reads; `ext` and `queryKeys` come back from the URL itself. */
function slim({ url, source, input, firstSeen, lastSeen }: DiscoveredUrl): DiscoveredUrl {
  return { url, source, input, ...(firstSeen ? { firstSeen } : {}), ...(lastSeen ? { lastSeen } : {}) };
}

const samples = [];
for (const target of TARGETS) {
  const outcome = await runDiscoverPage(target, { limit: LIMIT }, "all");
  if (outcome.mode !== "comparison") throw new Error(`expected a comparison for ${target}`);
  const outcomes = serializeOutcomes(outcome.outcomes).map((entry) =>
    entry.result ? { ...entry, result: { ...entry.result, urls: entry.result.urls.map(slim) } } : entry,
  );
  samples.push({ target, limit: LIMIT, fetchedAt: new Date().toISOString(), outcomes });
  console.log(target, outcome.outcomes.map((entry) => `${entry.provider}:${entry.error ? "error" : entry.result.count}`).join(" "));
}

await writeFile(new URL("../app/utils/landing-samples.json", import.meta.url), `${JSON.stringify(samples)}\n`);
