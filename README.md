<p align="center">
  <img src="https://raw.githubusercontent.com/0xwuchuan/ward/main/docs/assets/ward.png" alt="Ward - Mission Control for Security Researchers" width="900">
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#features">Features</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="AGENTS.md">Development</a>
</p>

## Overview

Ward is a local-first audit workspace for tracking security review projects and findings without sending workspace data to an external service.

It ships as a Node-first npm package with a TypeScript CLI, a local Hono HTTP API, a React web UI, and SQLite persistence. Ward is built for both humans and agents: the CLI uses [`incur`](https://github.com/wevm/incur#readme) for structured output, script-friendly workflows, and LLM-readable command discovery.

## Features

- Local-first audit workspace backed by SQLite.
- Project registration for repositories under review.
- Structured finding capture with severity, status, category, source, impact, and recommendation fields.
- File references that connect findings to related code locations.
- Agent-oriented CLI workflows for scripts, terminals, and autonomous security review.
- Agent discovery through skill files, MCP registration, and LLM-readable command manifests.
- Token-efficient TOON output by default, with JSON, YAML, Markdown, and JSONL available when needed.
- Local web UI for browsing projects, filtering findings, editing details, and previewing related code.

## Getting Started

Install Ward:

```sh
npm install -g ward
```

Or run from source:

```sh
git clone <repo-url> ward
cd ward
npm install
npm run build
npm link
```

**Using an agent?** Run `ward skills add` to register Ward with your agent, then ask it to explore the codebase and capture findings. View everything in the web UI when it's done:

```sh
ward serve
```

Or do it manually:

Register the repository you are reviewing:

```sh
cd /path/to/project
ward place --name "Protocol Audit"
```

Capture a finding:

```sh
ward finding create \
  --title "Missing access control on withdrawal" \
  --severity high \
  --fileRef src/Vault.sol:42-51 \
  --category access-control \
  --description "The withdrawal path does not verify the caller role."
```

Open the local web UI to browse and filter results:

```sh
ward serve
```

## Data Storage

Ward stores all data locally in SQLite at `~/.ward/ward.db`. Set `WARD_DB_PATH` to use a different file:

```sh
WARD_DB_PATH=/path/to/ward.db ward finding list
```
