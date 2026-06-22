# Ward Development Guide

## Principles

- NEVER push changes without testing them locally first.
- Testing means actually running the affected services and proving the change works end-to-end, not just linting or reasoning about it.
- Preserve Ward's local-first behavior; do not add external services or storage unless explicitly requested.
- Keep changes scoped to the requested behavior and follow existing project patterns.
- All secrets must come from env vars or a secret manager; never hardcode secrets.
- README.md is for users, not developers.

## Code Conventions

- Node 22+, npm for deps, Vitest for tests.
- Backend uses Hono, zod, `better-sqlite3`, and SQLite.
- CLI uses `incur`; command handlers should return structured objects and let `incur` format output.
- Frontend uses npm only, React 19, TypeScript, Vite, Tailwind, Radix UI.
- Keep HTTP routes thin; put persistence and reusable business logic in focused modules such as `src/db.ts`.
- Keep CLI behavior in `src/cli.ts` and share core logic with the API instead of duplicating persistence code.
- Keep API calls in `frontend/src/lib/api.ts` and shared frontend types in `frontend/src/types.ts`.
- Use existing `frontend/src/components/ui` primitives and lucide-react icons where possible.
- Use Tailwind utilities and the `cn()` helper for conditional class names.
- Use Node `path`/`fs` APIs through small helpers where path behavior is shared.
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

## Local Development

Run the backend and Vite app together:

```sh
npm run dev -- start
```

The app opens at `http://127.0.0.1:5173`, with the backend on `http://127.0.0.1:8765`.

## Testing Expectations

- No dedicated lint command is currently configured.
- If adding linting, wire the command into `package.json` or `frontend/package.json` and document the exact command here.
- Backend/CLI/API tests: run `npm test`.
- Frontend typecheck/build and TypeScript compile: run `npm run build`.
- Full-stack verification: run the backend and frontend together with `npm run dev -- start` and verify the workflow in the browser.
- Use `agent-browser` for browser automation, UI smoke tests, screenshots, and local app verification. Before using it, load its current workflow with `agent-browser skills get core`.
- If a change cannot be tested locally, document the exact blocker and risk before handing it off.
