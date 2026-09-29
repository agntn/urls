import type { DiscoverPage, SerializedOutcome } from "@agntn/urls";

/** What `/api/discover` answers: the executor's result, the MCP text for it and when it was fetched. */
export type DiscoverAnswer =
  | { mode: "single"; text: string; provider: string; page: DiscoverPage; fetchedAt: string }
  | { mode: "comparison"; text: string; outcomes: SerializedOutcome<DiscoverPage>[]; fetchedAt: string };
