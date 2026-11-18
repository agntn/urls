/** OMP extension: Urls - unified passive URL discovery tools. */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { registerOmpTools, type OmpRenderers } from "@agntn/tools/omp";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

import type * as UrlsTools from "../../dist/tools.d.mts";

/** Longest argument on the status line, cut before the adapter's sanitizer sees it. */
const PREVIEW_LENGTH = 80;

/** Lines of an answer a collapsed row shows before it counts the rest. */
const COLLAPSED_LINES = 10;

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

/** The part of a result the row draws. */
type Answer = Readonly<{ content: readonly unknown[] }>;

/**
 * The answer as the row shows it. The executor sanitized the text, so only the depth is cut here.
 *
 * @param result - What the tool returned.
 * @param expanded - Whether the host shows the whole row.
 * @returns {string} Every line, or the first few and how many wait behind them.
 */
function answerLines(result: Answer, expanded: boolean): string {
  const lines = result.content.flatMap((part) => {
    const { text } = part as { text?: unknown };
    return typeof text === "string" ? text.split("\n") : [];
  });
  if (expanded || lines.length <= COLLAPSED_LINES) return lines.join("\n");
  const hidden = lines.length - COLLAPSED_LINES;
  return [...lines.slice(0, COLLAPSED_LINES), `... ${hidden} more lines, expand to see them`].join(
    "\n",
  );
}

/**
 * Register the urls tools with the OMP host; the library loads on the first call.
 *
 * @param pi - The OMP extension API.
 */
export default async function urlsExtension(pi: ExtensionAPI): Promise<void> {
  pi.setLabel("Urls");
  const { urlsTools } = await loadTools();
  const { Text } = pi.pi;
  const renderers = Object.fromEntries(
    Object.entries(describeCall).map(([name, describe]): [string, OmpRenderers] => [
      name,
      {
        describeCall: describe,
        renderResult(result, { expanded, isPartial }, theme) {
          if (isPartial) return new Text(theme.fg("muted", "Asking the sources…"), 0, 0);
          return new Text(answerLines(result, expanded), 0, 0);
        },
      },
    ]),
  );
  registerOmpTools(pi, urlsTools, { Text, renderers });
}
