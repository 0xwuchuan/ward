# Ward Development Guide

## Principles

- NEVER push changes without testing them locally first.
- Testing means actually running the affected services and proving the change works end-to-end, not just linting or reasoning about it.
- Preserve Ward's local-first behavior; do not add external services or storage unless explicitly requested.
- Keep changes scoped to the requested behavior and follow existing project patterns.
- All secrets must come from env vars or a secret manager; never hardcode secrets.

## Code Conventions

- Python 3.11+, uv for deps, pytest for tests.
- Backend uses FastAPI, Pydantic v2, Typer, SQLite.
- Frontend uses npm only, React 19, TypeScript, Vite, Tailwind, Radix UI.
- Keep FastAPI routes thin; put persistence and reusable business logic in focused modules such as `ward/db.py`.
- Keep CLI behavior in Typer commands and share core logic with the API instead of duplicating persistence code.
- Keep API calls in `frontend/src/lib/api.ts` and shared frontend types in `frontend/src/types.ts`.
- Use existing `frontend/src/components/ui` primitives and lucide-react icons where possible.
- Use Tailwind utilities and the `cn()` helper for conditional class names.
- Use `pathlib.Path` for filesystem paths.
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

## Testing Expectations

- No dedicated lint command is currently configured.
- If adding linting, wire the command into `pyproject.toml` or `frontend/package.json` and document the exact command here.
- Backend/CLI tests: run `uv run pytest`.
- Frontend typecheck/build: run `npm --prefix frontend run build`.
- Full-stack verification: run the backend and frontend together with `uv run ward start` and verify the workflow in the browser.
- If a change cannot be tested locally, document the exact blocker and risk before handing it off.
