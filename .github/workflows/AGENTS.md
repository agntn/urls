# WORKFLOW SCOPE

CI runs: lint, typecheck, build, unit tests, and the eval gates offline; publish on tags with
OIDC, or by manual dispatch of an existing tag; autofix on PRs via `pnpm fmt`.
