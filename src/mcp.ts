import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { serializeOutcomes } from "./core/all.ts";
import {
  domainInput,
  filterInput,
  limitInput,
  matchInput,
  noScopeInput,
  providerInput,
  urlOutScopeInput,
  urlScopeInput,
  extInput,
  hasQueryInput,
  fromInput,
  toInput,
} from "./core/schemas.ts";
import { listProviders } from "./core/registry.ts";
import { runDiscover } from "./tool-operations.ts";
import { version } from "./version.ts";

function result(value: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function providerResult(provider: string, value: unknown): CallToolResult {
  return result({ provider, count: Array.isArray(value) ? value.length : undefined, urls: value });
}

/**
 * Create an MCP server exposing the normalized URL discovery operations.
 *
 * @returns {McpServer} A configured MCP server.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "urls", version });

  server.registerTool(
    "urls_providers",
    {
      description: "List registered passive URL sources and their capabilities",
      annotations: { readOnlyHint: true },
    },
    () => result(listProviders()),
  );

  server.registerTool(
    "urls_discover",
    {
      description:
        "Enumerate URLs known for a domain from passive sources. Each result carries the source that found it; the default host filter keeps URLs under the input domain; urlScope/urlOutScope match full URLs.",
      inputSchema: {
        domain: domainInput,
        limit: limitInput,
        match: matchInput,
        filter: filterInput,
        noScope: noScopeInput,
        urlScope: urlScopeInput,
        urlOutScope: urlOutScopeInput,
        ext: extInput,
        hasQuery: hasQueryInput,
        from: fromInput,
        to: toInput,
        ...providerInput,
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      domain,
      limit,
      match,
      filter,
      noScope,
      urlScope,
      urlOutScope,
      ext,
      hasQuery,
      from,
      to,
      provider,
    }) => {
      const options = {
        limit,
        match,
        filter,
        noScope,
        urlScope,
        urlOutScope,
        ext,
        hasQuery,
        from,
        to,
      };
      const outcome = await runDiscover(domain, options, provider);
      if (outcome.mode === "comparison") {
        return result(serializeOutcomes(outcome.outcomes));
      }
      return providerResult(outcome.provider, outcome.urls);
    },
  );

  return server;
}
