# CORE SOURCE SCOPE

Library, CLI, MCP, AI, and shared presentation source for `@agntn/urls`.

## Conventions

- Keep provider responses behind the normalized `discover()` interface; page shapes stay in the
  provider file that owns them.
- Domain input is normalized once through `resolveDomain()` (query target). Result scope, filter
  and dedupe happen only in `UrlCollector`; URL-scope patterns (`urlScope` / `urlOutScope`) match
  the full URL, not a hostname. Selection (explicit / all / fallback) happens only in `runDiscover`;
  MCP, AI, Pi, and OMP call `runDiscoverPage` over it, so the default bound, `hasMore`, and the
  `reference` switch live in one place. The CLI stays on `runDiscover` and unbounded.
- Streams (CDX dumps) go through `getTextLines`; JSON endpoints through `getJSON`. Do not add a
  second HTTP path.
- Provided `limit` values go through `clampMaxResults(..., MAX_DISCOVER_RESULTS)`; do not copy
  the numeric cap into schemas or the CLI.
