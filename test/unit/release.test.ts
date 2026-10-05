import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../.github/workflows/publish.yml", import.meta.url),
  "utf8",
);

describe("the Publish workflow", () => {
  /** A bare `inputs.tag` checks out `main` just as happily, bumped version and unreleased code included. */
  it("checks out only a tag on a manual dispatch", () => {
    const refs = [...workflow.matchAll(/^\s*ref: (.+)$/gmu)].map((match) => match[1]);

    expect(refs).toEqual([
      "${{ inputs.tag && format('refs/tags/{0}', inputs.tag) || github.ref }}",
    ]);
  });
});
