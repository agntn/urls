import type { DiscoverPage, SerializedOutcome } from "@agntn/urls";

/** What `/api/discover` answers: the pages, the tool text for them and when they were fetched. */
export type DiscoverAnswer =
  | { mode: "single"; text: string; provider: string; page: DiscoverPage; fetchedAt: string }
  | { mode: "comparison"; text: string; outcomes: SerializedOutcome<DiscoverPage>[]; fetchedAt: string };
