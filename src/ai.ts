/** Vercel AI SDK tools over the same definitions MCP, Pi, OMP and the CLI read. */

import { toAiTools, type AiTools } from "@agntn/tools/ai";
import { urlsTools } from "./tools.ts";

/** Every urls tool under its MCP name, so a new tool can't miss the map. */
export const urlsAiTools: AiTools<typeof urlsTools> = toAiTools(urlsTools);

export const discoverTool = urlsAiTools.urls_discover;
export const providersTool = urlsAiTools.urls_providers;
