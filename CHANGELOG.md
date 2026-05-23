# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Keep generated raw REST tool names at 32 characters or fewer by using `vk_<method>_<resource>_<hash12>` names with an 8-character resource hint. This leaves room for MCP client prefixes such as `mcp__dec-vikunja-mcp__` under 64-character tool-name limits.

## [0.5.0] - 2026-05-22

### Changed

- **BREAKING**: Shorten generated raw REST tool names from full path-derived names to compact `vikunja_api_<method>_<resource>_<hash12>` identifiers. The 19 ergonomic tool names are unchanged.

## [0.4.0] - 2026-05-20

### Changed

- **BREAKING**: Drop Node.js 18 support; minimum supported version is now Node.js 20. Node 18's `buffer.File` is still flagged as experimental and emits a warning that breaks our e2e stderr assertions.
- Upgrade `actions/checkout` and `actions/setup-node` to `v6` in CI workflows. The v6 actions ship a Node.js 24 runtime, addressing the deprecation of Node 20 on GitHub Actions runners (forced to Node 24 by 2026-06-02; Node 20 removed 2026-09-16).
- CI matrix updated to test against Node `20` and `22` on Ubuntu, macOS, and Windows.

### Fixed

- Publish workflow no longer fails with `Cannot find module 'promise-retry'`. The runner's bundled npm (10.9.7) does not support trusted publishing, and `npm install -g npm@<version>` is unreliable because the running npm replaces itself mid-execution. The workflow now invokes a new-enough npm via `npx --package=npm@11.14.1 -- npm publish`, which leaves the global install untouched while still propagating OIDC environment variables.

## [0.3.1] - 2026-05-20

### Added

- GitHub Actions CI workflow (`.github/workflows/ci.yml`) running the test suite across Ubuntu, macOS, and Windows.
- npm trusted publishing workflow (`.github/workflows/publish.yml`). Releases are now triggered by pushing a `v*` git tag and authenticate to npm via OIDC instead of a long-lived `NPM_TOKEN`. Each published artifact includes a [provenance](https://docs.npmjs.com/generating-provenance-statements) attestation.

### Fixed

- `npm test` no longer fails on Windows. The previous `node --test test/*.test.mjs` invocation relied on shell glob expansion, which Windows' default shell does not perform. The script now passes the test file path explicitly.

## [0.3.0] and earlier

See the [git history](https://github.com/shichao402/vikunja-mcp/commits/main) for changes prior to this changelog.

[Unreleased]: https://github.com/shichao402/vikunja-mcp/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/shichao402/vikunja-mcp/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/shichao402/vikunja-mcp/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/shichao402/vikunja-mcp/compare/v0.3.0...v0.3.1
