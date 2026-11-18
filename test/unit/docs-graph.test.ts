import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));

/** The docs worker installs `docs/` alone, so a package imported here breaks its build. */
describe("what the docs site bundles from src", () => {
  it("imports no package, only relative files and Node builtins", () => {
    const files = ["src/index.ts", ...globSync("src/{core,providers}/**/*.ts", { cwd: root })];
    const bare = files.flatMap((file) =>
      [
        ...readFileSync(join(root, file), "utf8").matchAll(
          /\bfrom\s+"([^"]+)"|import\("([^"]+)"\)/gu,
        ),
      ]
        .map((match) => match[1] ?? match[2] ?? "")
        .filter((specifier) => !specifier.startsWith(".") && !specifier.startsWith("node:"))
        .map((specifier) => `${file}: ${specifier}`),
    );

    expect(files.length).toBeGreaterThan(10);
    expect(bare).toEqual([]);
  });
});
