/**
 * CLI subprocess gate: every subcommand exercised end to end against the built binary.
 *
 * Runs the error paths and local commands offline; one live AlienVault query proves the network
 * path. Set URLS_EVAL_OFFLINE=1 to skip the live block. Common Crawl's index host is
 * unreachable from the development network; wayback is exercised live too when online.
 */
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLI = join(ROOT, "dist/cli.mjs");
const LIVE = process.env.URLS_EVAL_OFFLINE !== "1";

/** Credentials are dropped so provider auto-selection stays deterministic. */
const env = { ...process.env };
delete env.VIRUSTOTAL_API_KEY;
delete env.URLSCAN_API_KEY;
delete env.URLS_DIST;

let failures = 0;

function run(args, extraEnv = {}) {
  return spawnSync("node", [CLI, ...args], {
    encoding: "utf8",
    env: { ...env, ...extraEnv },
    timeout: 45_000,
  });
}

function check(name, ok, detail = "") {
  console.log(`${ok ? "ok" : "FAIL"} - ${name}`);
  if (!ok) {
    failures += 1;
    if (detail) console.log(String(detail).slice(0, 400));
  }
}

const providers = run(["providers"]);
check("providers exits 0", providers.status === 0, providers.stderr);
check(
  "providers lists the seven sources and flags the key-requiring backend",
  providers.stdout.includes("alienvault") &&
    providers.stdout.includes("arquivo") &&
    providers.stdout.includes("vefsafn") &&
    providers.stdout.includes("wayback") &&
    providers.stdout.includes("virustotal") &&
    providers.stdout.includes("requires API key"),
  providers.stdout,
);

const versionRun = run(["--version"]);
check(
  "--version prints the version of package.json",
  versionRun.stdout.trim() === JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version,
  versionRun.stdout,
);

const emptyDomain = run(["discover", ""]);
check(
  "discover rejects an empty domain",
  emptyDomain.status === 1 && emptyDomain.stderr.includes("Invalid arguments at <DOMAIN>"),
  emptyDomain.stderr,
);

const unknown = run(["discover", "example.com", "-p", "missing"]);
check(
  "discover rejects an unknown provider",
  unknown.status === 1 && unknown.stderr.includes("Unknown provider: missing"),
  unknown.stderr,
);

const keyless = run(["discover", "example.com", "-p", "virustotal"]);
check(
  "virustotal without a key fails with a clean auth message",
  keyless.status === 1 && keyless.stderr.includes("VIRUSTOTAL_API_KEY"),
  keyless.stderr,
);

const typo = run(["discover", "example.com", "--provder", "wayback"]);
check(
  "discover names a flag it doesn't know instead of skipping it",
  typo.status === 1 && typo.stderr.includes('unknown option "--provder"; takes --provider (-p)'),
  typo.stderr,
);

const badLimit = run(["discover", "example.com", "-n", "0"]);
check(
  "discover rejects a non-positive limit",
  badLimit.status === 1 && badLimit.stderr.includes("Invalid arguments at --limit: must be >= 1"),
  badLimit.stderr,
);

const hugeLimit = run(["discover", "example.com", "-n", "100001"]);
check(
  "discover rejects a limit above MAX_DISCOVER_RESULTS",
  hugeLimit.status === 1 &&
    hugeLimit.stderr.includes("Invalid arguments at --limit: must be <= 100000"),
  hugeLimit.stderr,
);

/** A reader that quits early, as `| head -1` does, ends the command without a stack trace. */
const closedStdout = spawn("node", [CLI, "providers"], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
  timeout: 10_000,
});
// Closing the read end before the child writes makes its first write fail with EPIPE.
closedStdout.stdout.destroy();
let closedStderr = "";
closedStdout.stderr.setEncoding("utf8").on("data", (chunk) => (closedStderr += chunk));
await once(closedStdout, "close");
check(
  "providers ends quietly when stdout closes",
  closedStdout.exitCode === 0 && closedStderr === "",
  `exit=${closedStdout.exitCode} ${closedStderr}`,
);

/** Help must work without evaluating the server SDK, the root command listing included. */
const blockMcp = `data:text/javascript,${encodeURIComponent(`
  import { registerHooks } from "node:module";
  registerHooks({
    load(url, context, nextLoad) {
      if (url.includes("@modelcontextprotocol/")) throw new Error("Unexpected MCP SDK load");
      return nextLoad(url, context);
    }
  });
`)}`;

for (const { mode, modeEnv } of [
  { mode: "source", modeEnv: {} },
  { mode: "bundle", modeEnv: { URLS_DIST: "1" } },
]) {
  for (const args of [
    [],
    ["--help"],
    ["-h"],
    ["--version"],
    ["discover", "--help"],
    ["providers", "--help"],
    ["mcp", "--help"],
    ["mcp", "-h"],
    ["providers"],
  ]) {
    const help = run(args, modeEnv);
    const expectedStatus = args.length === 0 ? 1 : 0;
    const isolated = spawnSync("node", ["--import", blockMcp, CLI, ...args], {
      encoding: "utf8",
      env: { ...env, ...modeEnv },
      timeout: 10_000,
    });
    check(
      `${args.join(" ") || "no arguments"} works without the MCP SDK (${mode})`,
      help.status === expectedStatus &&
        isolated.status === expectedStatus &&
        !isolated.stderr.includes("Unexpected MCP SDK load") &&
        isolated.stderr === help.stderr &&
        isolated.stdout === help.stdout,
      isolated.stderr,
    );
  }
}

/** Prints every module URL the child loaded to stderr when the process exits. */
const recordLoads = `data:text/javascript,${encodeURIComponent(`
  import { registerHooks } from "node:module";
  const loaded = [];
  registerHooks({
    load(url, context, nextLoad) {
      loaded.push(url);
      return nextLoad(url, context);
    }
  });
  process.on("exit", () => process.stderr.write("\\nLOADED " + JSON.stringify(loaded) + "\\n"));
`)}`;

const initialize = `${JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "urls-eval", version: "1.0.0" },
  },
})}\n`;

/**
 * Runs `urls mcp` from a bin, answers one initialize request and records the loaded modules.
 * stdin closes after the request, so the server exits on its own.
 * @param {string} cli - Path of the bin to run.
 * @param {Readonly<Record<string, string>>} extraEnv - Environment on top of the shared one.
 * @param {readonly string[]} flags - Node flags ahead of the bin.
 * @returns {{ initialized: boolean, loaded: string[], status: number | null, stderr: string }} The run.
 */
function serve(cli, extraEnv = {}, flags = []) {
  const result = spawnSync("node", [...flags, "--import", recordLoads, cli, "mcp"], {
    encoding: "utf8",
    env: { ...env, ...extraEnv },
    input: initialize,
    timeout: 20_000,
  });
  const marker = result.stderr.lastIndexOf("\nLOADED ");
  const loaded = marker === -1 ? [] : JSON.parse(result.stderr.slice(marker + 8).trim());
  let initialized = false;
  try {
    initialized = JSON.parse(result.stdout.trim().split("\n")[0]).result.serverInfo.name === "urls";
  } catch {}
  return { initialized, loaded, status: result.status, stderr: result.stderr };
}

/**
 * Where a run took the server from.
 * @param {{ readonly loaded: readonly string[] }} run - A run of `serve`.
 * @param {string} base - Package root the bin sits in.
 * @returns {"source" | "bundle" | "unknown"} Whether the bin went on to load anything under `src/`.
 */
function servedFrom(run, base) {
  if (!run.loaded.includes(pathToFileURL(join(base, "dist/cli.mjs")).href)) return "unknown";
  const source = pathToFileURL(join(base, "src/")).href;
  return run.loaded.some((url) => url.startsWith(source)) ? "source" : "bundle";
}

const checkoutRun = serve(CLI);
check(
  "mcp in a checkout serves the live source",
  checkoutRun.status === 0 && checkoutRun.initialized && servedFrom(checkoutRun, ROOT) === "source",
  checkoutRun.stderr,
);

const distRun = serve(CLI, { URLS_DIST: "1" });
check(
  "mcp keeps the bundle under URLS_DIST=1",
  distRun.status === 0 && distRun.initialized && servedFrom(distRun, ROOT) === "bundle",
  distRun.stderr,
);

const unstripped = serve(CLI, {}, ["--no-experimental-strip-types"]);
check(
  "mcp keeps the bundle when Node does not strip types",
  unstripped.status === 0 && unstripped.initialized && servedFrom(unstripped, ROOT) === "bundle",
  unstripped.stderr,
);

const extraWord = run(["mcp", "--stdio"]);
check(
  "mcp with more on the line is refused, not served",
  extraWord.status === 1 && extraWord.stderr.includes('unknown option "--stdio"'),
  extraWord.stderr,
);

/** Node refuses to strip types under node_modules, so an installed copy that ships src keeps the bundle. */
const cache = join(ROOT, "node_modules/.cache");
mkdirSync(cache, { recursive: true });
const nested = mkdtempSync(join(cache, "urls-cli-"));
try {
  for (const entry of ["dist", "src", "package.json"]) {
    cpSync(join(ROOT, entry), join(nested, entry), { recursive: true });
  }
  const nestedRun = serve(join(nested, "dist/cli.mjs"));
  check(
    "mcp keeps the bundle when the package sits under node_modules",
    nestedRun.status === 0 && nestedRun.initialized && servedFrom(nestedRun, nested) === "bundle",
    nestedRun.stderr,
  );
} finally {
  rmSync(nested, { recursive: true, force: true });
}

/** The npm package ships no src, so its bin has to fall back to the bundle. */
const packaged = mkdtempSync(join(tmpdir(), "urls-cli-"));
try {
  cpSync(join(ROOT, "dist"), join(packaged, "dist"), { recursive: true });
  cpSync(join(ROOT, "package.json"), join(packaged, "package.json"));
  symlinkSync(join(ROOT, "node_modules"), join(packaged, "node_modules"), "dir");
  const packagedRun = serve(join(packaged, "dist/cli.mjs"));
  check(
    "mcp keeps the bundle in a package that ships no src",
    packagedRun.status === 0 &&
      packagedRun.initialized &&
      servedFrom(packagedRun, packaged) === "bundle",
    packagedRun.stderr,
  );
} finally {
  rmSync(packaged, { recursive: true, force: true });
}

if (LIVE) {
  const liveAlienvault = run([
    "discover",
    "example.com",
    "-p",
    "alienvault",
    "-n",
    "5",
    "-f",
    "gitlab",
  ]);
  check(
    "live alienvault discovery returns URLs and applies the filter",
    liveAlienvault.status === 0 &&
      liveAlienvault.stdout.includes("http") &&
      !liveAlienvault.stdout.includes("gitlab"),
    liveAlienvault.stdout || liveAlienvault.stderr,
  );

  const liveJsonl = run(["discover", "example.com", "-p", "wayback", "-n", "3", "-j"]);
  check(
    "live wayback discovery emits one JSON object per URL",
    liveJsonl.status === 0 &&
      liveJsonl.stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .every((line) => {
          try {
            const parsed = JSON.parse(line);
            return parsed.url && parsed.source === "wayback" && parsed.input === "example.com";
          } catch {
            return false;
          }
        }),
    liveJsonl.stdout || liveJsonl.stderr,
  );
} else {
  console.log("skip - live checks disabled via URLS_EVAL_OFFLINE=1");
}

console.log(
  failures === 0 ? "eval-cli: all checks passed" : `eval-cli: ${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
