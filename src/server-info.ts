/** Who the server says it is. `urls --help` and MCP read the same card. */
import { version } from "./version.ts";

export const serverInfo = {
  name: "urls",
  version,
  description: "Passive URL discovery across web archives and threat intel indexes",
} as const;
