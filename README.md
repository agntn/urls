# @agntn/urls

[![npm version](https://npmx.dev/api/registry/badge/version/@agntn/urls)](https://npmx.dev/package/@agntn/urls)
[![npm downloads](https://npmx.dev/api/registry/badge/downloads/@agntn/urls)](https://npmx.dev/package/@agntn/urls)
[![license](https://npmx.dev/api/registry/badge/license/@agntn/urls)](https://npmx.dev/package/@agntn/urls)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/agntn/urls)

🗂️ Seven passive sources. Find URLs for a domain with one API.

## Why?

Wayback remembers one URL, OTX knows another. Now you're writing seven clients for what sounded like one question. `@agntn/urls` gives them the same API and filters. The web has enough abandoned URLs without adding your glue code to the pile.

## ✨ Features

- 🔎 **Seven sources, one call.** Pick an archive or index and hand it a domain.
- 💤 **Passive discovery.** Requests go to the sources, not the discovered pages.
- 🧹 **Less duplicate noise.** Each source deduplicates normalized URLs, keeping the first original spelling.
- 🎯 **Keep the useful bits.** Filter by URL prefix, glob, substring, extension, or query keys.
- 📅 **Look back in time.** Filter source timestamps by date. Undated hits stay in the results.
- 🧮 **Compare sources.** Run them all in parallel and keep each source's results or error.
- 🛑 **Stop when you have enough.** Set a result limit or pass an abort signal from your code.
- 🤖 **Bring your agent.** Pi, OMP, MCP, and AI SDK tools use the same discovery code.

## 📦 Install

Requires Node.js 24 or later.

```bash
pnpm add @agntn/urls

# Or install the CLI globally
pnpm add -g @agntn/urls
```

The npm release is pending. These commands will work once the package is published.

## 🚀 First call

After installing the CLI:

```bash
urls discover example.com -p wayback -n 2
```

```text
http://example.com:80/
http://www.example.com:80/
```

No API key needed. Even `example.com` has a past ;) That's an actual Wayback response from a local build, not a promise about your next run.

### Commands

| Command                                         | What you get                               |
| ----------------------------------------------- | ------------------------------------------ |
| `urls discover example.com -p wayback -n 20`    | Up to 20 URLs from Wayback                 |
| `urls discover example.com -p all -n 20`        | A comparison, capped at 20 URLs per source |
| `urls discover example.com -p wayback -n 20 -j` | Successful hits as JSONL                   |
| `urls providers`                                | Registered sources and key requirements    |
| `urls mcp`                                      | An MCP server over stdio                   |

Need fewer results? Try `--match`, `--filter`, `--ext`, or `--has-query`. `urls discover --help` lists the options. `--url-scope` and `--url-out-scope` match full URLs, not just hosts. Without those, the default filter keeps the input host and its subdomains.

## 🧠 Library

```ts
import { create } from "@agntn/urls";

const archive = await create("wayback");
const hits = await archive.discover("example.com", { limit: 2 });

for (const hit of hits) {
  console.log(hit.source, hit.url);
}
```

You get records, not a blob to parse again. Each hit says which source found it. Want all seven? Use `discoverAll()`. Want automatic selection with fallback on access errors? Use `discoverWithFallback()`.

[Result and option types](./src/core/types.ts) · [Exports](./src/index.ts) · [Fallback and comparison](./src/core/all.ts)

For cancellation, pass `signal` in the discovery options. `create()` also accepts `apiKey`, `baseUrl`, and a `timeout` in milliseconds. Direct provider imports work too: `@agntn/urls/providers/wayback` exports `Wayback`.

## 🗺️ Providers

| Key           | Source                             | API key                        |
| ------------- | ---------------------------------- | ------------------------------ |
| `alienvault`  | AlienVault OTX                     | No                             |
| `arquivo`     | Arquivo.pt                         | No                             |
| `commoncrawl` | Common Crawl                       | No                             |
| `urlscan`     | URLScan                            | Optional: `URLSCAN_API_KEY`    |
| `vefsafn`     | Vefsafn, the Icelandic web archive | No                             |
| `virustotal`  | VirusTotal                         | Required: `VIRUSTOTAL_API_KEY` |
| `wayback`     | Internet Archive Wayback Machine   | No                             |

Without `-p`, configured VirusTotal credentials take priority. Otherwise discovery starts with AlienVault OTX. A keyless source can still rate-limit you. Free doesn't mean infinitely patient.

[Endpoints and registration](./src/providers/index.ts) · [Provider implementations](./src/providers)

Discovery results stay separate when comparing sources. Limits apply per source, not across the whole comparison. Deduplication is per source too.

## 🤖 Agents

Once the npm release is available, pick your host:

```bash
pi install npm:@agntn/urls
omp plugin install @agntn/urls
```

For an MCP client:

```json
{
  "mcpServers": {
    "urls": {
      "command": "npx",
      "args": ["-y", "@agntn/urls", "mcp"]
    }
  }
}
```

Two tools: `urls_discover` and `urls_providers`. Your agent can ask which sources exist before picking one. Set API keys in the host environment when needed.

`urls_discover` hands the model at most 100 URLs per source unless `limit` says otherwise, and tells it when the source had more. Narrowing with `match`, `ext`, or `urlScope` usually beats raising the limit. The query URL behind each record stays out of the answer unless `reference` is set.

Using AI SDK 7 or later? Import `discoverTool` and `providersTool` from `@agntn/urls/ai`. The server factory is `createMcpServer` from `@agntn/urls/mcp`.

## 🚫 What this does not do

No crawling, page downloads, or checks that a discovered URL still works. An archive hit is a lead, not a health check.

## 🧩 Adding a provider

Found another passive index? Add a [Provider](./src/core/provider.ts) subclass and a [manifest entry](./src/providers/index.ts). [Wayback](./src/providers/wayback.ts) shows the streaming approach. Reuse `UrlCollector` for filtering and forward `options.signal` to every request. External providers can join through `register()`.

## 🛠️ Development

```bash
pnpm build       # Build the library, CLI, and provider modules
pnpm test        # Run unit tests
pnpm lint        # Check code and formatting
pnpm typecheck   # Check library and extension types

# Exercise CLI, MCP, and the packed package without live discovery
URLS_EVAL_OFFLINE=1 pnpm test:cli
URLS_EVAL_OFFLINE=1 pnpm test:mcp
URLS_EVAL_OFFLINE=1 pnpm test:packed
```

Omit `URLS_EVAL_OFFLINE=1` to include live discovery checks. Those depend on the upstream services being available.

## 💛 Thanks

[ProjectDiscovery's urlfinder](https://github.com/projectdiscovery/urlfinder) inspired this package. Same useful question, now in TypeScript.

Built with support from [Claude for Open Source](https://claude.com/contact-sales/claude-for-oss) and [Codex for Open Source](https://developers.openai.com/community/codex-for-oss). More time for the code, less time staring at usage limits.

## 📄 License

[MIT](./LICENSE)
