import { createCli } from "@agntn/tools/cli";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cliOptions } from "../../src/cli-commands.ts";
import { stubJSON } from "../helpers.ts";

/* Runs one command line through the CLI the bin builds and collects both streams. */
async function run(...args: readonly string[]) {
  const written = { stdout: "", stderr: "" };
  for (const stream of ["stdout", "stderr"] as const) {
    vi.spyOn(process[stream], "write").mockImplementation((chunk: unknown) => {
      written[stream] += String(chunk);
      return true;
    });
  }
  process.exitCode = undefined;
  try {
    await createCli(cliOptions).run(args);
    return { code: process.exitCode, ...written };
  } finally {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  }
}

/* An AlienVault page with these URLs. */
function page(...urls: readonly string[]) {
  return { has_next: false, url_list: urls.map((url) => ({ url })) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("urls discover", () => {
  it("prints bare URLs, one per line, and nothing else", async () => {
    stubJSON(page("https://example.com/a", "https://example.com/b"));

    await expect(run("discover", "example.com", "-p", "alienvault")).resolves.toEqual({
      code: undefined,
      stdout: "https://example.com/a\nhttps://example.com/b\n",
      stderr: "",
    });
  });

  it("stays unbounded where the tool would cut the page", async () => {
    stubJSON(page(...Array.from({ length: 150 }, (_, index) => `https://example.com/${index}`)));

    const { stdout } = await run("discover", "example.com", "-p", "alienvault");

    expect(stdout.trimEnd().split("\n")).toHaveLength(150);
  });

  it("splits comma lists and reads the short flags", async () => {
    stubJSON(
      page("https://example.com/app.js", "https://example.com/a.css", "https://x.test/b.js"),
    );

    const kept = await run("discover", "example.com", "-p", "alienvault", "--ext", "js, json");
    const wide = await run("discover", "example.com", "-n", "5", "--no-scope", "-m", "x.test,nope");

    expect(kept.stdout).toBe("https://example.com/app.js\n");
    expect(wide.stdout).toBe("https://x.test/b.js\n");
  });

  it("writes one JSON object per URL under -j, absent fields left out", async () => {
    stubJSON(page("https://example.com/app.js?v=1"));

    const { stdout } = await run("discover", "example.com", "-p", "alienvault", "-j");

    expect(stdout).toBe(
      '{"url":"https://example.com/app.js?v=1","input":"example.com","source":"alienvault","ext":"js","queryKeys":["v"]}\n',
    );
  });

  it("keeps stdout empty for a pipe when nothing was found", async () => {
    stubJSON(page());

    await expect(run("discover", "example.com", "-p", "alienvault")).resolves.toEqual({
      code: undefined,
      stdout: "",
      stderr: "No URLs found for example.com\n",
    });
  });

  it("prints a block per source under -p all, a failed one with its reason", async () => {
    stubJSON(page("https://example.com/a"));

    const { code, stdout } = await run("discover", "example.com", "-p", "all", "-n", "1");

    expect(code).toBeUndefined();
    expect(stdout).toContain('[alienvault] 1 URLs for "example.com"\n  https://example.com/a\n');
    expect(stdout).toContain("[virustotal] error: Authentication failed for virustotal");
  });

  it("fails on one line for an unknown source, with the ones that exist", async () => {
    const { code, stderr, stdout } = await run("discover", "example.com", "-p", "nope");

    expect({ code, stdout }).toEqual({ code: 1, stdout: "" });
    expect(stderr).toBe(
      "Unknown provider: nope; known providers: alienvault, arquivo, commoncrawl, urlscan, vefsafn, virustotal, wayback\n",
    );
  });

  it("takes --json away, since --jsonl is the data form", async () => {
    const { code, stderr } = await run("discover", "example.com", "--json");

    expect(code).toBe(1);
    expect(stderr).toContain('unknown option "--json"');
  });
});

describe("urls providers", () => {
  it("prints the table, or the listings under --json", async () => {
    const table = await run("providers");
    const json = await run("providers", "--json");

    expect(table.stdout).toMatch(/^Registered providers \(7\):\n {2}alienvault /u);
    expect(JSON.parse(json.stdout)).toHaveProperty("providers.6.name", "wayback");
  });
});
