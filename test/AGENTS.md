# TEST SCOPE

Tests exercise public behavior and real integration seams with Vitest.

## Conventions

- Prefer real response shapes from the 2026-09-02 API audit as fixtures; mark contract-only
  fixtures (virustotal v3, commoncrawl) in a comment.
- Keep the suite hermetic: `test/setup.ts` clears provider keys, stubs must return
  `Content-Type` headers matching the response kind.
- Eval gates (`test/eval-*.mjs`) run against the built `dist`; `URLS_EVAL_OFFLINE=1` keeps CI
  deterministic.
