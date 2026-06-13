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

Start the backend and Vite dev server together:

```sh
uv run ward start
```

Agentation is installed for development-only visual feedback. Include it with the debug start command:

```sh
uv run ward start --debug
```

The toolbar is rendered only in Vite development mode and points at `http://localhost:4747`.

## CLI

```sh
uv run ward place --name "My Audit"
uv run ward finding create --project . --title "Unchecked transfer" --severity high --file-ref src/Vault.sol:42-51 --category access-control --description "..." --impact "..." --recommendation "..."
uv run ward start
uv run ward start --debug
uv run ward serve
```
