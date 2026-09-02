import oxlint from "@agntn/ox/oxlint";
import { defineConfig } from "oxlint";

export default defineConfig({
  ...oxlint,
  rules: {
    ...oxlint.rules,
    "typescript/prefer-readonly-parameter-types": [
      "error",
      {
        allow: [
          { from: "file", name: "ToolResult" },
          {
            from: "package",
            name: ["ExtensionAPI", "ToolDefinition"],
            package: "@earendil-works/pi-coding-agent",
          },
          {
            from: "package",
            name: ["ExtensionAPI", "ToolDefinition"],
            package: "@oh-my-pi/pi-coding-agent",
          },
          {
            from: "lib",
            name: [
              "AbortSignal",
              "Headers",
              "ReadableStream",
              "ReadonlyMap",
              "RegExp",
              "Request",
              "RequestInit",
              "Uint8Array",
              "URL",
            ],
          },
          { from: "package", name: "FetchError", package: "ofetch" },
          { from: "package", name: "Client", package: "@modelcontextprotocol/sdk" },
          // Classes with methods: the rule cannot see that call sites do not mutate them.
          { from: "file", name: ["Provider", "UrlCollector", "UrlsError"] },
        ],
        ignoreInferredTypes: true,
      },
    ],
  },
  overrides: [
    {
      /** Subprocess eval gates are plain ESM without types; keep every other rule. */
      files: ["test/eval-*.mjs"],
      rules: {
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-return": "off",
      },
    },
  ],
  ignorePatterns: ["dist", "coverage"],
});
