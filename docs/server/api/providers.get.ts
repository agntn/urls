import { formatProviders, listProviders } from "@agntn/urls";

/** The registry as `urls_providers` returns it; no key is configured on the docs worker. */
export default defineEventHandler((event) => {
  const providers = listProviders();
  markPublic(event, 60 * 60);
  return { text: JSON.stringify(providers, null, 2), table: formatProviders(providers), providers };
});
