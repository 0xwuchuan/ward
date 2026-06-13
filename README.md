# Ward

Mission Control for Security Researchers.

## Features

- Local-first audit workspace backed by SQLite.
- Project registration for repositories under review.
- Structured finding capture with severity, status, category, source, impact, and recommendation fields.
- File references that connect findings to related code locations.
- Agent-oriented CLI workflows for scripts, terminals, and autonomous security review.
- Full agent discovery through `ward skills add`, `ward mcp add`, and `ward --llms`.
- Token-efficient TOON output by default, with JSON, YAML, Markdown, and JSONL available when needed.
- Local web UI for browsing projects, filtering findings, editing details, and previewing related code.

## Overview

Ward helps security researchers track audit projects and findings without sending workspace data to an external service. It is meant to be used by agents as well as humans, so the CLI is built with [`incur`](https://github.com/wevm/incur#readme) for structured output and full agent discovery.

Ward ships as a Node-first npm package with a TypeScript CLI, a local Hono HTTP API, a React web UI, and SQLite persistence.

By default, Ward stores data in `~/.ward/ward.db`. Set `WARD_DB_PATH` to point Ward at a different SQLite database.

For agents, Ward can sync command-specific skill files with `ward skills add`, register itself as an MCP server with `ward mcp add`, or print an LLM-readable command manifest with `ward --llms`. TOON is the default CLI output format, and JSON is available with `--json` or `--format json`.

## Getting Started

Install Ward:

```sh
npm install -g ward
```

Sync Ward's agent skills, then ask your agent to register projects, create findings, and manage the audit workspace:

```sh
ward skills add
```

Open the local web UI when you want to browse projects and review findings directly:

```sh
ward serve
```

Other discovery options are available for agent environments that prefer MCP or command manifests:

```sh
ward mcp add
ward --llms
```
