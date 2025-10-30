## [1.29.2](https://github.com/snomiao/claude-yes/compare/v1.29.1...v1.29.2) (2025-10-30)


### Bug Fixes

* **cli.ts:** update import statement for cliYes to use local module path for better compatibility ([7a199e3](https://github.com/snomiao/claude-yes/commit/7a199e357b31c81a1dbe7bf40f99d727e632c3c7))

## [1.29.1](https://github.com/snomiao/claude-yes/compare/v1.29.0...v1.29.1) (2025-10-30)


### Bug Fixes

* **pkg:** keep only module ([932cb3d](https://github.com/snomiao/claude-yes/commit/932cb3d015505beeeb83102269a047b51c3a881f))

# [1.29.0](https://github.com/snomiao/claude-yes/compare/v1.28.1...v1.29.0) (2025-10-30)


### Features

* detect and display sub-agent status using CLAUDE_PPID ([#20](https://github.com/snomiao/claude-yes/issues/20)) ([d0c968b](https://github.com/snomiao/claude-yes/commit/d0c968b02ed345b769444c103f8dce0a3fb53621))

## [1.28.1](https://github.com/snomiao/claude-yes/compare/v1.28.0...v1.28.1) (2025-10-29)


### Bug Fixes

* add from-node-stream as external dependency in build scripts ([3b0d414](https://github.com/snomiao/claude-yes/commit/3b0d414fdf81b22fc48ef40a8f40c53af6b69507))

# [1.28.0](https://github.com/snomiao/claude-yes/compare/v1.27.0...v1.28.0) (2025-10-29)


### Features

* add SKILL.md for Claude Skills integration ([#19](https://github.com/snomiao/claude-yes/issues/19)) ([0f3fa66](https://github.com/snomiao/claude-yes/commit/0f3fa663a39ce80c8711408529a5114e771e4541))

# [1.27.0](https://github.com/snomiao/claude-yes/compare/v1.26.0...v1.27.0) (2025-10-27)


### Features

* implement per-directory session restoration for codex ([4238062](https://github.com/snomiao/claude-yes/commit/423806229c28ebd185c3a8ccbea2603d42016deb))

# [1.26.0](https://github.com/snomiao/claude-yes/compare/v1.25.0...v1.26.0) (2025-10-26)


### Features

* **tests:** add bun test setup file and configuration for bun testing environment ([da53577](https://github.com/snomiao/claude-yes/commit/da5357798b4a194c8bbd0e15fd203a42272888ee))

# [1.25.0](https://github.com/snomiao/claude-yes/compare/v1.24.2...v1.25.0) (2025-10-26)


### Bug Fixes

* add missing semantic-release plugins ([#16](https://github.com/snomiao/claude-yes/issues/16)) ([575a56b](https://github.com/snomiao/claude-yes/commit/575a56b73034d183bf782ff6a3915d0081cd17d7))
* correct README formatting and package names ([#15](https://github.com/snomiao/claude-yes/issues/15)) ([9fab898](https://github.com/snomiao/claude-yes/commit/9fab8985b502383875e372eaa828fd73aa7bc59c))
* fix all failing tests and improve test infrastructure ([a9842c9](https://github.com/snomiao/claude-yes/commit/a9842c9342d0060473ca7bcc70d45297260f6eb0))
* fix: refine CLI args handling and error parsing\n\n- cli-yes.config.ts: treat 'unknown option' as a fatal error by recognizing /^error: unknown option/ in the fatal errors list.\n- ts/cli.ts: adjust argument spawning and dash prompt extraction:\n  - only pass CLI args to the spawned process if argv._[0] is present; otherwise default to no args.\n  - compute dashPrompt only when a dash marker is present; otherwise leave undefined. ([789f5b0](https://github.com/snomiao/claude-yes/commit/789f5b0e3b60711a78d4578981d9df49e30f556e))


### Features

* add multi-CLI support and improve configuration system ([c968ae0](https://github.com/snomiao/claude-yes/commit/c968ae0f4c5243d08bf25ad9b028156d5a3be126))
* **cli-yes.config.ts:** set defaultArgs to prevent opus model overload ([6e72ab3](https://github.com/snomiao/claude-yes/commit/6e72ab373f7ad85199d7c9c7d5a5d3038c926bcc))

# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.0.1](https://github.com/snomiao/claude-yes/compare/v1.17.1...v0.0.1) (2025-10-06)


### Features

* add cursor agent bin ([1ce23a9](https://github.com/snomiao/claude-yes/commit/1ce23a996cbdad50f57f39e814518c55843d33f9))
* Add cursor position support for codex ([c787c80](https://github.com/snomiao/claude-yes/commit/c787c80f0306c59a1168424657579426fe5b11bf))
* Add exit-on-idle option ([52ca331](https://github.com/snomiao/claude-yes/commit/52ca331b0acf03a04e99113e0f46a485e3257399))
* **cli:** parse idle durations with enhanced-ms ([1e4ef21](https://github.com/snomiao/claude-yes/commit/1e4ef21c2cbe4498fbf0357e21400bc208336900))
