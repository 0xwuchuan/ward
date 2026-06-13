from __future__ import annotations

import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence
from typing import Annotated

import typer

from . import db
from .git import get_git_metadata


app = typer.Typer(help="Ward local audit findings workspace.", no_args_is_help=True)
finding_app = typer.Typer(help="Manage findings.", no_args_is_help=True)
app.add_typer(finding_app, name="finding")


@dataclass(frozen=True)
class ManagedCommand:
    label: str
    command: Sequence[str]
    cwd: Path | None = None


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _frontend_dir() -> Path:
    return _project_root() / "frontend"


def _display_command(command: Sequence[str]) -> str:
    return " ".join(command)


def _terminate_processes(processes: list[tuple[str, subprocess.Popen]]) -> None:
    for _, process in processes:
        if process.poll() is None:
            process.terminate()

    for _, process in processes:
        if process.poll() is not None:
            continue
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


def _start_commands(commands: list[ManagedCommand]) -> int:
    processes: list[tuple[str, subprocess.Popen]] = []

    try:
        for managed in commands:
            typer.echo(f"[ward] starting {managed.label}: {_display_command(managed.command)}")
            process = subprocess.Popen(managed.command, cwd=managed.cwd)
            processes.append((managed.label, process))

        while True:
            for label, process in processes:
                return_code = process.poll()
                if return_code is not None:
                    typer.echo(f"[ward] {label} exited with code {return_code}; stopping remaining servers.")
                    _terminate_processes(processes)
                    return return_code
            time.sleep(0.25)
    except KeyboardInterrupt:
        typer.echo("[ward] stopping servers.")
        _terminate_processes(processes)
        return 130
    except FileNotFoundError as exc:
        _terminate_processes(processes)
        raise typer.ClickException(f"Unable to start server command: {exc}") from exc


@app.command()
def place(
    name: Annotated[str | None, typer.Option("--name", "-n", help="Custom project display name.")] = None,
) -> None:
    """Register the current directory as an audit project."""
    cwd = Path.cwd()
    project = db.register_project(cwd, name=name, git_metadata=get_git_metadata(cwd))
    typer.echo(f"Registered project {project['name']} ({project['id']})")
    typer.echo(project["path"])


@finding_app.command("create")
def create_finding(
    project: Annotated[
        str | None,
        typer.Option("--project", "-p", help="Registered project id or path. Defaults to the current directory."),
    ] = None,
    title: Annotated[str, typer.Option("--title", "-t", help="Finding title.")] = ...,
    severity: Annotated[str, typer.Option("--severity", "-s", help="critical, high, medium, low, or info.")] = "medium",
    file_ref: Annotated[
        list[str] | None,
        typer.Option("--file-ref", "--file", "-f", help="Related file reference, for example src/Vault.sol:42-51."),
    ] = None,
    category: Annotated[str, typer.Option("--category", "-c", help="Finding category.")] = "",
    description: Annotated[str, typer.Option("--description", "-d", help="Technical description.")] = "",
    impact: Annotated[str, typer.Option("--impact", help="Security impact.")] = "",
    recommendation: Annotated[str, typer.Option("--recommendation", "-r", help="Suggested remediation.")] = "",
    source: Annotated[str, typer.Option("--source", help="human or agent.")] = "human",
    status: Annotated[str, typer.Option("--status", help="draft, valid, invalid, or reported.")] = "draft",
) -> None:
    """Create a finding directly in SQLite."""
    resolved = db.resolve_project(project, cwd=Path.cwd())
    if not resolved:
        hint = project or str(Path.cwd())
        raise typer.BadParameter(f"project is not registered: {hint}")

    try:
        finding = db.create_finding(
            project_id=resolved["id"],
            title=title,
            severity=severity,
            file_refs=db.parse_file_refs(file_ref),
            category=category,
            description=description,
            impact=impact,
            recommendation=recommendation,
            source=source,
            status=status,
        )
    except db.WardDbError as exc:
        raise typer.BadParameter(str(exc)) from exc

    typer.echo(f"Created finding {finding['id']}")


@app.command()
def start(
    debug: Annotated[
        bool,
        typer.Option("--debug", help="Also start the Agentation MCP server for UI annotation feedback."),
    ] = False,
) -> None:
    """Start the Ward backend and Vite app together."""
    frontend = _frontend_dir()
    if not frontend.exists():
        raise typer.ClickException(f"Frontend directory was not found: {frontend}")

    commands = [
        ManagedCommand(
            label="backend",
            command=[sys.executable, "-m", "uvicorn", "ward.api:app", "--host", "127.0.0.1", "--port", "8765"],
        ),
        ManagedCommand(
            label="app",
            command=["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"],
            cwd=frontend,
        ),
    ]
    if debug:
        commands.append(
            ManagedCommand(
                label="agentation mcp",
                command=["npm", "run", "agentation:mcp"],
                cwd=frontend,
            )
        )

    typer.echo("[ward] app: http://127.0.0.1:5173")
    typer.echo("[ward] backend: http://127.0.0.1:8765")
    if debug:
        typer.echo("[ward] agentation mcp: http://localhost:4747")

    raise typer.Exit(_start_commands(commands))


@app.command()
def serve(
    host: Annotated[str, typer.Option("--host", help="Host interface for the local service.")] = "127.0.0.1",
    port: Annotated[int, typer.Option("--port", "-p", help="Port for the local service.")] = 8765,
    reload: Annotated[bool, typer.Option("--reload", help="Enable uvicorn reload for development.")] = False,
) -> None:
    """Start the local FastAPI service and serve the web UI."""
    import uvicorn

    typer.echo(f"Ward serving at http://{host}:{port}")
    uvicorn.run("ward.api:app", host=host, port=port, reload=reload)
