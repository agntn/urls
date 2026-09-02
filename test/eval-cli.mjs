/**
 * CLI subprocess gate: every subcommand exercised end to end against the built binary.
 *
 * Runs the error paths and local commands offline; one live AlienVault query proves the network
 * path. Set URLS_EVAL_OFFLINE=1 to skip the live block. Common Crawl's index host is
 * unreachable from the development network; wayback is exercised live too when online.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const LIVE = process.env.URLS_EVAL_OFFLINE !== "1";

/** Credentials are dropped so provider auto-selection stays deterministic. */
const env = { ...process.env };
delete env.VIRUSTOTAL_API_KEY;
delete env.URLSCAN_API_KEY;

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
  "providers lists the five sources and flags the key-requiring backend",
  providers.stdout.includes("alienvault") &&
    providers.stdout.includes("wayback") &&
    providers.stdout.includes("virustotal") &&
    providers.stdout.includes("requires API key"),
  providers.stdout,
);

const emptyDomain = run(["discover", ""]);
check(
  "discover rejects an empty domain",
  emptyDomain.status === 1 && emptyDomain.stderr.includes("Error"),
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

const badLimit = run(["discover", "example.com", "-n", "0"]);
check(
  "discover rejects a non-positive limit",
  badLimit.status === 1 && badLimit.stderr.includes("Invalid limit: 0"),
  badLimit.stderr,
);

for (const sub of ["discover", "providers"]) {
  const help = run([sub, "--help"]);
  check(`${sub} --help exits 0`, help.status === 0, help.stderr);
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
