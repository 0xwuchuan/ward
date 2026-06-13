from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer

from . import db
from .git import get_git_metadata


app = typer.Typer(help="Ward local audit findings workspace.", no_args_is_help=True)
finding_app = typer.Typer(help="Manage findings.", no_args_is_help=True)
app.add_typer(finding_app, name="finding")


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
def serve(
    host: Annotated[str, typer.Option("--host", help="Host interface for the local service.")] = "127.0.0.1",
    port: Annotated[int, typer.Option("--port", "-p", help="Port for the local service.")] = 8765,
    reload: Annotated[bool, typer.Option("--reload", help="Enable uvicorn reload for development.")] = False,
) -> None:
    """Start the local FastAPI service and serve the web UI."""
    import uvicorn

    typer.echo(f"Ward serving at http://{host}:{port}")
    uvicorn.run("ward.api:app", host=host, port=port, reload=reload)
