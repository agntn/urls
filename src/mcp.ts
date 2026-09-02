import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { discoverAll, discoverWithFallback, serializeOutcomes } from "./core/all.ts";
import {
  domainInput,
  filterInput,
  limitInput,
  matchInput,
  noScopeInput,
  providerInput,
} from "./core/schemas.ts";
import { requireOperation } from "./core/provider.ts";
import { listProviders } from "./core/registry.ts";
import { isAllProviders, selectProvider } from "./core/resolve.ts";
import { version } from "./version.ts";
import "./providers/index.ts";

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
        "Enumerate URLs known for a domain from passive sources. Each result carries the source that found it; the default scope keeps only URLs under the input domain.",
      inputSchema: {
        domain: domainInput,
        limit: limitInput,
        match: matchInput,
        filter: filterInput,
        noScope: noScopeInput,
        ...providerInput,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ domain, limit, match, filter, noScope, provider }) => {
      const options = { limit, match, filter, noScope };
      if (isAllProviders(provider)) {
        return result(serializeOutcomes(await discoverAll(domain, options)));
      }
      if (provider?.trim()) {
        const selected = selectProvider(provider);
        const discover = requireOperation(selected.provider, "discover");
        return providerResult(selected.name, await discover(domain, options));
      }
      const fallback = await discoverWithFallback(domain, options);
      return providerResult(fallback.provider, fallback.result);
    },
  );

  return server;
}
