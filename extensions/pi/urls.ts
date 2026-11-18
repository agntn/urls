/** Pi extension: Urls - unified passive URL discovery tools */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { registerPiTools } from "@agntn/tools/pi";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type * as UrlsTools from "../../dist/tools.d.mts";

const sourceModuleUrl = new URL("../../src/tools.ts", import.meta.url);
const distributionModuleUrl = new URL("../../dist/tools.mjs", import.meta.url);

/**
 * Load the definitions from the source in a checkout and from the build in the package.
 *
 * @returns {Promise<typeof UrlsTools>} The tools module.
 */
function loadTools(): Promise<typeof UrlsTools> {
  return import(
    existsSync(fileURLToPath(sourceModuleUrl)) ? sourceModuleUrl.href : distributionModuleUrl.href
  ) as Promise<typeof UrlsTools>;
}

/**
 * Register the urls tools; the library loads on the first call.
 *
 * @param pi - The Pi extension API.
 */
export default async function urlsExtension(pi: ExtensionAPI): Promise<void> {
  const { urlsTools } = await loadTools();
  registerPiTools(pi, urlsTools);
}
