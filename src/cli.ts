#!/usr/bin/env node

/** Urls CLI - unified passive URL discovery commands */
import { defineCommand, runMain } from "citty";
import { version } from "./version.ts";

/** Side-effect import: registers every built-in provider before the CLI parses arguments. */
import "./providers/index.ts";

const main = defineCommand({
  meta: {
    name: "urls",
    version,
    description: "Unified passive URL discovery CLI",
  },
  subCommands: {
    discover: () => import("./commands/discover.ts").then((m) => m.default),
    providers: () => import("./commands/providers.ts").then((m) => m.default),
    mcp: () => import("./commands/mcp.ts").then((m) => m.default),
  },
});

await runMain(main);
