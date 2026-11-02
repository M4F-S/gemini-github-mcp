# Changelog

All notable changes to the Gemini for Mac GitHub MCP Server integration will be documented in this file.

## [1.1.0] - 2026-11-02

### Added
- **GitHub Actions CI/CD Telemetry Suite**:
  - `get_workflow_runs`: Query running, queued, and completed workflow runs across branches with status and conclusion.
  - `get_workflow_run_logs`: Fetch failure details, failed job steps, and compiler/test error logs.
  - `trigger_workflow`: Dispatch manual workflow runs (`workflow_dispatch`) with custom input arguments.
- **Local-First & In-Memory Response Caching**:
  - ETag caching (`304 Not Modified`) for instant 0ms repeat repository and tree queries.
  - Local repository detection to automatically route code searches via instant disk grep when the repository is cloned locally.
- **Atomic Multi-File Compound Workflow**:
  - `create_feature_branch_and_pr`: Single-turn tool call that branches, commits multiple modified files, and opens a Pull Request automatically.
- **Custom Native MCP Server Engine (`src/server.mjs`)**:
  - Pure Node.js ES modules implementation using native `fetch` with both Stdio and Streamable HTTP support.

---

## [1.0.0] - 2026-11-01

### Added
- Initial stable release of Gemini for Mac GitHub MCP Server integration.
- Streamable HTTP bridge on port 8124 over Cloudflare edge routing.
- Verified live private repository discovery for `M4F-S` in Gemini Desktop chat UI.
- macOS LaunchAgent daemon configuration and test automation suite.
