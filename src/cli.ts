#!/usr/bin/env node

/** Urls CLI: `discover` for pipes, a command per tool, and the MCP server. */

import { existsSync } from "node:fs";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "@agntn/tools/cli";
import { cliOptions } from "./cli-commands.ts";
import type { createMcpServer } from "./mcp.ts";

/** Built at runtime, so the bundler leaves `src` out. The npm package ships only `dist`. */
const sourceMcp = new URL("../src/mcp.ts", import.meta.url);
const sourceMcpPath = fileURLToPath(sourceMcp);

/**
 * Narrows what a runtime URL import returned, which TypeScript types as `any`.
 *
 * @param value - The imported module.
 * @returns {boolean} Whether it exports `createMcpServer`.
 */
function isMcpModule(value: unknown): value is { createMcpServer: typeof createMcpServer } {
  return typeof value === "object" && value !== null && "createMcpServer" in value;
}

/**
 * In a checkout a bare `urls mcp` serves `src/` live. `URLS_DIST=1` keeps the bundle.
 *
 * @param argv - Arguments after the binary.
 * @returns {boolean} Whether to serve `src/`.
 */
function servesSource(argv: readonly string[]): boolean {
  return (
    argv.length === 1 &&
    argv[0] === "mcp" &&
    process.env["URLS_DIST"] !== "1" &&
    Boolean(process.features.typescript) &&
    !sourceMcpPath.includes(`${sep}node_modules${sep}`) &&
    existsSync(sourceMcpPath)
  );
}

/** Serves `src/mcp.ts` over stdio, to 2025 and 2026 clients alike. */
async function serveSource(): Promise<void> {
  const module: unknown = await import(sourceMcp.href);
  if (!isMcpModule(module)) throw new TypeError(`${sourceMcpPath} has no createMcpServer`);
  const { serveStdio } = await import("@modelcontextprotocol/server/stdio");
  serveStdio(() => module.createMcpServer());
}

const argv = process.argv.slice(2);
if (servesSource(argv)) {
  await serveSource();
} else {
  await runCli(cliOptions, argv);
}
