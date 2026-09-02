# CORE SOURCE SCOPE

Library, CLI, MCP, AI, and shared presentation source for `@agntn/urls`.

## Conventions

- Keep provider responses behind the normalized `discover()` interface; page shapes stay in the
  provider file that owns them.
- Domain input is normalized once through `resolveDomain()`; scope/filter/dedupe happens only in
  `UrlCollector`.
- Streams (CDX dumps) go through `getTextLines`; JSON endpoints through `getJSON`. Do not add a
  second HTTP path.
