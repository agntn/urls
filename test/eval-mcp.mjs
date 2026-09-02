/**
 * MCP subprocess gate: the built stdio server exercised through a real client transport.
 *
 * Runs with DEBUG=1 on purpose - the handshake fails outright if anything pollutes stdout, and a
 * separate raw spawn asserts every stdout line parses as JSON. One live discover proves the
 * network path; set URLS_EVAL_OFFLINE=1 to skip it.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const CLI = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const LIVE = process.env.URLS_EVAL_OFFLINE !== "1";

/** Credentials are dropped so provider auto-selection stays deterministic. */
const env = { ...process.env, DEBUG: "1" };
delete env.VIRUSTOTAL_API_KEY;
delete env.URLSCAN_API_KEY;

let failures = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "ok" : "FAIL"} - ${name}`);
  if (!ok) {
    failures += 1;
    if (detail) console.log(String(detail).slice(0, 400));
  }
}

function firstText(response) {
  return response.content?.[0]?.text ?? "";
}

const proc = spawn("node", [CLI, "mcp"], { env, stdio: ["pipe", "pipe", "pipe"] });
proc.stdin.write(
  `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "purity", version: "0" },
    },
  })}\n`,
);
const rawStdout = await new Promise((resolve) => {
  let output = "";
  const finish = () => {
    proc.kill();
    resolve(output);
  };
  proc.stdout.on("data", (chunk) => {
    output += String(chunk);
    if (output.includes("\n")) finish();
  });
  setTimeout(finish, 10_000);
});
const rawLines = rawStdout.trim().split("\n").filter(Boolean);
check(
  "stdout carries only JSON-RPC frames under DEBUG=1",
  rawLines.length > 0 &&
    rawLines.every((line) => {
      try {
        JSON.parse(line);
        return true;
      } catch {
        return false;
      }
    }),
  rawStdout,
);

const transport = new StdioClientTransport({ command: "node", args: [CLI, "mcp"], env });
const client = new Client({ name: "urls-eval", version: "1.0.0" });
await client.connect(transport);

const listed = await client.listTools();
check(
  "lists the two urls tools",
  JSON.stringify(listed.tools.map((tool) => tool.name)) ===
    JSON.stringify(["urls_providers", "urls_discover"]),
  JSON.stringify(listed.tools.map((tool) => tool.name)),
);

const providers = await client.callTool({ name: "urls_providers", arguments: {} });
check(
  "providers reports the sources and the unconfigured backend",
  providers.isError !== true &&
    firstText(providers).includes("alienvault") &&
    firstText(providers).includes('"requiresKey": true'),
  firstText(providers),
);

const schemaReject = await client.callTool({
  name: "urls_discover",
  arguments: { domain: "   " },
});
check("schema rejects an empty domain", schemaReject.isError === true, firstText(schemaReject));

const unknown = await client.callTool({
  name: "urls_discover",
  arguments: { domain: "example.com", provider: "missing" },
});
check(
  "unknown provider surfaces as a tool error",
  unknown.isError === true && firstText(unknown).includes("Unknown provider: missing"),
  firstText(unknown),
);

if (LIVE) {
  const discover = await client.callTool({
    name: "urls_discover",
    arguments: { domain: "example.com", provider: "alienvault", limit: 5 },
  });
  check(
    "live discover answers with the provider name and URLs",
    discover.isError !== true &&
      firstText(discover).includes('"provider": "alienvault"') &&
      firstText(discover).includes('"urls"'),
    firstText(discover),
  );
} else {
  console.log("skip - live check disabled via URLS_EVAL_OFFLINE=1");
}

await client.close();

console.log(
  failures === 0 ? "eval-mcp: all checks passed" : `eval-mcp: ${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
