import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../src/providers/index.ts";
import { createMcpServer } from "../../src/mcp.ts";
import { stubHanging, stubJSON } from "../helpers.ts";

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

function firstText(response: unknown): string {
  const { content } = response as { content?: readonly { readonly text?: string }[] };
  return content?.[0]?.text ?? "";
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("urls MCP server", () => {
  it("lists the two tools as read-only, each under its title", async () => {
    await withServer(async (client) => {
      const listed = await client.listTools();

      expect(listed.tools.map((tool) => tool.name)).toEqual(["urls_providers", "urls_discover"]);
      for (const tool of listed.tools) {
        expect(tool.annotations).toMatchObject({ title: tool.title, readOnlyHint: true });
      }
    });
  });

  it("providers lists sources and flags key-requiring backends", async () => {
    await withServer(async (client) => {
      const response = await client.callTool({ name: "urls_providers", arguments: {} });

      const text = firstText(response);
      expect(text).toMatch(/^Registered providers \(7\):/);
      expect(text).toContain("  alienvault     https://otx.alienvault.com  (discover)");
      expect(text).toContain("(requires API key)");
      expect(text).toContain("  wayback ");
    });
  });

  it("discovers with the selected source and reports count", async () => {
    stubJSON({ has_next: false, url_list: [{ url: "https://example.com/a" }] });

    await withServer(async (client) => {
      const response = await client.callTool({
        name: "urls_discover",
        arguments: { domain: "example.com", provider: "alienvault" },
      });

      expect(response.isError).not.toBe(true);
      expect(firstText(response)).toBe(
        '[alienvault] 1 URLs for "example.com"\n  https://example.com/a',
      );
    });
  });

  it("discover cuts the page at the limit and flags the overflow", async () => {
    stubJSON({
      has_next: false,
      url_list: [{ url: "https://example.com/a" }, { url: "https://example.com/b" }],
    });

    await withServer(async (client) => {
      const response = await client.callTool({
        name: "urls_discover",
        arguments: { domain: "example.com", provider: "alienvault", limit: 1 },
      });

      expect(firstText(response)).toBe(
        '[alienvault] 1 URLs for "example.com" (limit 1 reached; raise limit or narrow with match, ext, urlScope)\n  https://example.com/a',
      );
    });
  });

  it("discover includes the query URL only when reference is requested", async () => {
    stubJSON({ has_next: false, url_list: [{ url: "https://example.com/a" }] });

    await withServer(async (client) => {
      const response = await client.callTool({
        name: "urls_discover",
        arguments: { domain: "example.com", provider: "alienvault", reference: true },
      });

      expect(firstText(response).split("\n")).toEqual([
        '[alienvault] 1 URLs for "example.com"',
        "  via https://otx.alienvault.com/api/v1/indicators/domain/example.com/url_list?page=1",
        "  https://example.com/a",
      ]);
    });
  });

  it("cancels the request when the client cancels the call", async () => {
    const fetch = stubHanging();

    await withServer(async (client) => {
      const controller = new AbortController();
      const pending = client.callTool(
        { name: "urls_discover", arguments: { domain: "example.com", provider: "alienvault" } },
        { signal: controller.signal },
      );
      await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
      controller.abort();

      await expect(pending).rejects.toThrow();
      const init = fetch.mock.calls[0]?.[1] as RequestInit | undefined;
      await vi.waitFor(() => expect(init?.signal?.aborted).toBe(true));
    });
  });

  it("rejects an empty domain as a tool error", async () => {
    await withServer(async (client) => {
      const response = await client.callTool({
        name: "urls_discover",
        arguments: { domain: "   " },
      });

      expect(response.isError).toBe(true);
      expect(firstText(response)).toBe('Invalid arguments at /domain: must match pattern "\\S"');
    });
  });

  it("names an argument the schema doesn't know, with the ones it takes", async () => {
    await withServer(async (client) => {
      const response = await client.callTool({
        name: "urls_discover",
        arguments: { domain: "example.com", lmit: 2 },
      });

      expect(response.isError).toBe(true);
      expect(firstText(response)).toContain('unknown property "lmit"; takes domain, limit');
    });
  });

  it("surfaces unknown providers as tool errors", async () => {
    await withServer(async (client) => {
      const response = await client.callTool({
        name: "urls_discover",
        arguments: { domain: "example.com", provider: "missing" },
      });

      expect(response.isError).toBe(true);
      expect(firstText(response)).toContain("Unknown provider: missing");
    });
  });

  it("strips an escape sequence a source put into a URL, whole", async () => {
    const escape = String.fromCodePoint(27);
    stubJSON({ has_next: false, url_list: [{ url: `https://example.com/${escape}[31mred` }] });

    await withServer(async (client) => {
      const response = await client.callTool({
        name: "urls_discover",
        arguments: { domain: "example.com", provider: "alienvault" },
      });

      expect(firstText(response)).toBe(
        '[alienvault] 1 URLs for "example.com"\n  https://example.com/red',
      );
    });
  });

  /** The URL parser drops a newline, so the domain resolves and comes back in the header. */
  it("keeps a crafted domain from writing its own line of the answer", async () => {
    stubJSON({ has_next: false, url_list: [{ url: "https://example.com/a" }] });

    await withServer(async (client) => {
      const response = await client.callTool({
        name: "urls_discover",
        arguments: { domain: 'example.com/\n[wayback] 9 URLs for "x"', provider: "alienvault" },
      });

      expect(response.isError).not.toBe(true);
      expect(firstText(response).split("\n")).toEqual([
        '[alienvault] 1 URLs for "example.com/ [wayback] 9 URLs for "x""',
        "  https://example.com/a",
      ]);
    });
  });
});
