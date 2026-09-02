/**
 * Packed-package gate: pack the tarball, install it cleanly without peers, and prove the
 * published entries share one provider registry.
 *
 * This is the layer repository tests cannot see: a registry chunk split between dist entries, a
 * runtime dependency missing from `dependencies`, or a file dropped from `files` all surface
 * here first. Set URLS_EVAL_KEEP=1 to keep the temp install for manual inspection.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

let failures = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "ok" : "FAIL"} - ${name}`);
  if (!ok) {
    failures += 1;
    if (detail) console.log(String(detail).slice(0, 400));
  }
}

const pack = spawnSync("pnpm", ["pack"], { cwd: ROOT, encoding: "utf8", timeout: 120_000 });
const tarballName = pack.stdout.trim().split("\n").at(-1) ?? "";
check(
  "pnpm pack produces a tarball",
  pack.status === 0 && tarballName.endsWith(".tgz"),
  pack.stderr,
);

const dir = mkdtempSync(join(tmpdir(), "urls-packed-"));
const install = spawnSync(
  "npm",
  ["install", "--legacy-peer-deps", "--no-audit", "--no-fund", join(ROOT, tarballName)],
  { cwd: dir, encoding: "utf8", timeout: 300_000 },
);
check("npm install of the tarball succeeds without peers", install.status === 0, install.stderr);

/**
 * The probe registers a provider through the main entry and reads it back through the mcp
 * entry. With a split registry chunk the probe key never shows up in urls_providers.
 */
writeFileSync(
  join(dir, "probe.mjs"),
  `import { Provider, register } from "@agntn/urls";
import { createMcpServer } from "@agntn/urls/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

class Probe extends Provider {
  static key = "probe";
  get capabilities() {
    return { discover: false };
  }
  async discover() {
    return [];
  }
}
register(Probe);

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const server = createMcpServer();
const client = new Client({ name: "packed", version: "0" });
await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
const response = await client.callTool({ name: "urls_providers", arguments: {} });
const text = response.content[0].text;
await client.close();
await server.close();
if (!text.includes('"probe"')) {
  console.error("registry split: probe missing from urls_providers");
  process.exit(1);
}
console.log("registry shared across entries");
`,
);
const probe = spawnSync("node", ["probe.mjs"], { cwd: dir, encoding: "utf8", timeout: 60_000 });
check(
  "a provider registered through the main entry is visible through the mcp entry",
  probe.status === 0 && probe.stdout.includes("registry shared across entries"),
  probe.stdout + probe.stderr,
);

const cli = spawnSync("node", [join(dir, "node_modules/@agntn/urls/dist/cli.mjs"), "providers"], {
  cwd: dir,
  encoding: "utf8",
  timeout: 30_000,
});
check(
  "the packed CLI lists providers",
  cli.status === 0 && cli.stdout.includes("alienvault"),
  cli.stdout + cli.stderr,
);

rmSync(join(ROOT, tarballName), { force: true });
if (process.env.URLS_EVAL_KEEP === "1") {
  console.log(`keeping temp install at ${dir}`);
} else {
  rmSync(dir, { recursive: true, force: true });
}

console.log(
  failures === 0 ? "eval-packed: all checks passed" : `eval-packed: ${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
