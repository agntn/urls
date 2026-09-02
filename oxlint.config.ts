import oxlint from "@agntn/ox/oxlint";
import { defineConfig } from "oxlint";

export default defineConfig({
  ...oxlint,
  rules: {
    ...oxlint.rules,
    // Repo-local extension of the shared allow list. The internal value types and page shapes
    // of this library travel by reference between helpers; forcing `Readonly<...>` at every
    // call site is noise. The shared policy's own allow entries are restated here so this file
    // does not depend on the exact internal shape of the shared config.
    "typescript/prefer-readonly-parameter-types": [
      "error",
      {
        allow: [
          { from: "file", name: "ToolResult" },
          {
            from: "package",
            name: "ExtensionAPI",
            package: "@earendil-works/pi-coding-agent",
          },
          {
            from: "package",
            name: ["ExtensionAPI", "ToolDefinition"],
            package: "@oh-my-pi/pi-coding-agent",
          },
          { from: "file", name: ["DiscoveredUrl", "ProviderConfig", "DiscoverOptions"] },
          { from: "file", name: ["UrlCollector"], path: "./src/core/url.ts" },
          {
            from: "file",
            name: ["Provider", "ProviderConstructor"],
            path: "./src/core/provider.ts",
          },
          { from: "file", name: ["ClientOptions"] },
          {
            from: "file",
            name: ["RenderCallOptions", "RenderTheme"],
            path: "./packages/omp/extensions/urls.ts",
          },
          { from: "file", name: ["UrlsError", "AuthError", "PaymentError", "RateLimitError"] },
          {
            from: "file",
            name: ["ProviderOutcome", "SerializedOutcome"],
            path: "./src/core/all.ts",
          },
          {
            from: "file",
            name: [
              "AlienVaultPage",
              "CommonCrawlIndex",
              "UrlScanPage",
              "UrlScanResult",
              "VtResponse",
              "VtUrlItem",
            ],
          },
          { from: "lib", name: ["AbortSignal", "ReadonlyMap", "Headers", "ReadableStream"] },
          {
            from: "package",
            name: ["ExtensionAPI", "ToolDefinition", "RenderTheme"],
            package: "@oh-my-pi/pi-coding-agent",
          },
          { from: "package", package: "ofetch", name: ["FetchError"] },
          { from: "package", package: "@modelcontextprotocol/sdk", name: ["Client"] },
          {
            from: "package",
            package: "@earendil-works/pi-coding-agent",
            name: ["ToolDefinition"],
          },
        ],
        ignoreInferredTypes: true,
      },
    ],
  },
  ignorePatterns: ["dist", "coverage", "test/*.mjs"],
});
