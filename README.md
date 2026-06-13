# Ward

Ward is a local-first workspace for security audit projects and findings.

Ward now ships as a Node-first npm package. It uses a TypeScript CLI built with
`incur`, a local Hono HTTP API, and SQLite for persistence.

## Install

```sh
npm install -g ward
ward serve
```

For one-off usage:

```sh
npx ward finding create --project . --title "Unchecked transfer" --severity high
```

## Development

```sh
npm install
npm --prefix frontend install
npm run build
node dist/cli.js serve
```

By default Ward stores data in `~/.ward/ward.db`. Set `WARD_DB_PATH` to use a different SQLite database.

## UI Iteration

Start the backend and Vite dev server together:

```sh
npm run dev -- start
```

Agentation is installed for development-only visual feedback. Include it with the debug start command:

```sh
npm run dev -- start --debug
```

The toolbar is rendered only in Vite development mode and points at `http://localhost:4747`.

## CLI

```sh
npm run dev -- place --name "My Audit"
npm run dev -- finding create --project . --title "Unchecked transfer" --severity high --file-ref src/Vault.sol:42-51 --category access-control --description "..." --impact "..." --recommendation "..."
npm run dev -- finding list --project .
npm run dev -- finding get <id>
npm run dev -- finding update <id> --status valid
npm run dev -- finding delete <id>
npm run dev -- start
npm run dev -- serve
```

The CLI uses `incur` output defaults. TOON is the default output; JSON is available with `--json` or `--format json`.

## Testing

```sh
npm test
npm run build
npm run dev -- start
```
