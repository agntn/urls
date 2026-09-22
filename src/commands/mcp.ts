import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "mcp",
    description: "Run the Urls MCP server over stdio",
  },
  /** Citty loads command metadata for help; defer the SDK until the server actually runs. */
  async run() {
    const [{ StdioServerTransport }, { createMcpServer }] = await Promise.all([
      import("@modelcontextprotocol/sdk/server/stdio.js"),
      import("../mcp.ts"),
    ]);
    const server = createMcpServer();
    await server.connect(new StdioServerTransport());
  },
});
