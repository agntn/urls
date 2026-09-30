# Changelog

## v0.2.0

### 🚀 Enhancements

- Urls - unified passive URL discovery library for agents ([f8805a3](https://github.com/agntn/urls/commit/f8805a3))
- Scope results by URL prefix or glob ([5297bb3](https://github.com/agntn/urls/commit/5297bb3))
- Add arquivo provider for Portuguese web archive CDX ([eb27e4d](https://github.com/agntn/urls/commit/eb27e4d))
- Add vefsafn provider for Icelandic web archive CDX ([6bcbb11](https://github.com/agntn/urls/commit/6bcbb11))
- Normalize URL dedup, query views, and CDX seen-at times ([154ffbf](https://github.com/agntn/urls/commit/154ffbf))
- Cap and slim the agent discover answers ([#12](https://github.com/agntn/urls/pull/12))
- **mcp:** Pick up src changes without a build ([#27](https://github.com/agntn/urls/pull/27))
- **docs:** A site with a live URL explorer ([#33](https://github.com/agntn/urls/pull/33))

### 🔥 Performance

- Keep the MCP SDK off the help path ([#13](https://github.com/agntn/urls/pull/13))
- Fetch JSON without ofetch ([#14](https://github.com/agntn/urls/pull/14))

### 🩹 Fixes

- Normalize domain input and time out streaming reads ([82dc369](https://github.com/agntn/urls/commit/82dc369))
- Reject path-traversing hosts and pin VirusTotal pagination ([f89b81e](https://github.com/agntn/urls/commit/f89b81e))
- Enforce published limit and reject TLD or schemeless userinfo ([e8b9f56](https://github.com/agntn/urls/commit/e8b9f56))
- Stop bypassing oxlint with a local allow-list and disables ([aa4068f](https://github.com/agntn/urls/commit/aa4068f))
- Keep arquivo CDX page cap independent of unique result limit ([7cd9b70](https://github.com/agntn/urls/commit/7cd9b70))
- Constrain Common Crawl index endpoints ([#1](https://github.com/agntn/urls/pull/1))
- Respect ISO offsets in seen-at filters ([#2](https://github.com/agntn/urls/pull/2))
- Forward the abort signal to every request ([#6](https://github.com/agntn/urls/pull/6))
- Include subdomains in the Wayback query ([#9](https://github.com/agntn/urls/pull/9))
- **omp:** Draw the status line with the host theme ([#26](https://github.com/agntn/urls/pull/26))
- **cli:** Survive a reader that quits early ([#31](https://github.com/agntn/urls/pull/31))

### 💅 Refactors

- Lazy provider manifest without side effects ([bb24556](https://github.com/agntn/urls/commit/bb24556))
- Centralize discovery executors in tool-operations ([61d1b20](https://github.com/agntn/urls/commit/61d1b20))

### 📖 Documentation

- Give the README some breathing room ([#11](https://github.com/agntn/urls/pull/11))

### 🏡 Chore

- Align packaging and docs with agntn family ([2557ba4](https://github.com/agntn/urls/commit/2557ba4))
- Add `renovate.json` ([fdbad59](https://github.com/agntn/urls/commit/fdbad59))
- ⚠️ Stop supporting Node.js 24 ([#32](https://github.com/agntn/urls/pull/32))

#### ⚠️ Breaking Changes

- ⚠️ Stop supporting Node.js 24 ([#32](https://github.com/agntn/urls/pull/32))

### ❤️ Contributors

- Ori ([@oritwoen](https://github.com/oritwoen))
- Aeitwoen ([@aeitwoen](https://github.com/aeitwoen))
- Aei ([@aeitwoen](https://github.com/aeitwoen))
- Oritwoen ([@oritwoen](https://github.com/oritwoen))
