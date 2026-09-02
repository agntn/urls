import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../src/providers/index.ts";
import { createMcpServer } from "../../src/mcp.ts";

async function withServer(run: (client: Client) => Promise<void>) {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

async function firstText(
  response: Readonly<{
    content?: readonly { readonly type: string; readonly text?: string }[];
  }>,
) {
  return response.content?.[0]?.text ?? "";
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("urls MCP server", () => {
  it("lists the two tools", async () => {
    await withServer(async (client) => {
      const listed = await client.listTools();
      const names = listed.tools.map((tool) => tool.name);

      expect(names).toEqual(["urls_providers", "urls_discover"]);
    });
  });

  it("providers lists sources and flags key-requiring backends", async () => {
    await withServer(async (client) => {
      const response = await client.callTool({ name: "urls_providers", arguments: {} });

      const text = await firstText(response);
      expect(text).toContain('"name": "alienvault"');
      expect(text).toContain('"requiresKey": true');
      expect(text).toContain('"name": "wayback"');
    });
  });

  it("discovers with the selected source and reports count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ has_next: false, url_list: [{ url: "https://example.com/a" }] }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );

    await withServer(async (client) => {
      const response = await client.callTool({
        name: "urls_discover",
        arguments: { domain: "example.com", provider: "alienvault" },
      });

      const text = await firstText(response);
      expect(text).toContain('"provider": "alienvault"');
      expect(text).toContain('"count": 1');
      expect(text).toContain('"url": "https://example.com/a"');
    });
  });

  it("rejects an empty domain as a tool error", async () => {
    await withServer(async (client) => {
      const response = await client.callTool({
        name: "urls_discover",
        arguments: { domain: "   " },
      });

      expect(response.isError).toBe(true);
      expect(await firstText(response)).toContain("Invalid");
    });
  });

  it("surfaces unknown providers as tool errors", async () => {
    await withServer(async (client) => {
      const response = await client.callTool({
        name: "urls_discover",
        arguments: { domain: "example.com", provider: "missing" },
      });

      expect(response.isError).toBe(true);
      expect(await firstText(response)).toContain("Unknown provider: missing");
    });
  });
});
