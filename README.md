# Ward

Ward is a local-first workspace for security audit projects and findings.

## Development

```sh
uv sync --extra dev
npm --prefix frontend install
npm --prefix frontend run build
uv run ward serve
```

By default Ward stores data in `~/.ward/ward.db`. Set `WARD_DB_PATH` to use a different SQLite database.

## UI Iteration

Agentation is installed for development-only visual feedback. Start the MCP annotation server and the Vite dev server in separate terminals:

```sh
npm --prefix frontend run agentation:mcp
npm --prefix frontend run dev
```

The toolbar is rendered only in Vite development mode and points at `http://localhost:4747`.

## CLI

```sh
uv run ward place --name "My Audit"
uv run ward finding create --project . --title "Unchecked transfer" --severity high --file-ref src/Vault.sol:42-51 --category access-control --description "..." --impact "..." --recommendation "..."
uv run ward serve
```
