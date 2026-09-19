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
  referenceInput,
  urlOutScopeInput,
  urlScopeInput,
  extInput,
  hasQueryInput,
  fromInput,
  toInput,
} from "./core/schemas.ts";
import { listProviders } from "./core/registry.ts";
import { runDiscoverPage } from "./tool-operations.ts";
import type { DiscoverPage } from "./tool-operations.ts";
import { version } from "./version.ts";

function result(value: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function pageResult(provider: string, page: DiscoverPage): CallToolResult {
  return result({ provider, ...page });
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
        "Enumerate URLs known for a domain from passive sources. The answer names the source, counts the URLs, and says whether the source had more than the limit; the default host filter keeps URLs under the input domain; urlScope/urlOutScope match full URLs.",
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
        reference: referenceInput,
        ...providerInput,
      },
      annotations: { readOnlyHint: true },
    },
    async (
      {
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
        reference,
        provider,
      },
      extra,
    ) => {
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
        reference,
        signal: extra.signal,
      };
      const outcome = await runDiscoverPage(domain, options, provider);
      if (outcome.mode === "comparison") {
        return result(serializeOutcomes(outcome.outcomes));
      }
      return pageResult(outcome.provider, outcome.page);
    },
  );

  return server;
}
