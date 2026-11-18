/** OMP extension: Urls - unified passive URL discovery tools. */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { registerOmpTools } from "@agntn/tools/omp";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

import type * as UrlsTools from "../../dist/tools.d.mts";

/** Longest argument on the status line, cut before the adapter's sanitizer sees it. */
const PREVIEW_LENGTH = 80;

const sourceModulePath = fileURLToPath(new URL("../../src/tools.ts", import.meta.url));

/**
 * Source in a checkout, build in the package; compiled OMP resolves only literal specifiers.
 *
 * @returns {Promise<typeof UrlsTools>} The tools module.
 */
function loadTools(): Promise<typeof UrlsTools> {
  return (
    existsSync(sourceModulePath) ? import("../../src/tools.ts") : import("../../dist/tools.mjs")
  ) as Promise<typeof UrlsTools>;
}

type Args = Readonly<Record<string, unknown>>;

const describeCall: Record<string, (args: Args) => string> = {
  urls_providers: () => "list",
  urls_discover: (args) => String(args["domain"]).slice(0, PREVIEW_LENGTH),
};

/**
 * Register the urls tools with the OMP host; the library loads on the first call.
 *
 * @param pi - The OMP extension API.
 */
export default async function urlsExtension(pi: ExtensionAPI): Promise<void> {
  pi.setLabel("Urls");
  const { urlsTools } = await loadTools();
  registerOmpTools(pi, urlsTools, {
    Text: pi.pi.Text,
    renderers: Object.fromEntries(
      Object.entries(describeCall).map(([name, describe]) => [name, { describeCall: describe }]),
    ),
  });
}
