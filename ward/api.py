from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from . import db
from .schemas import CodePreview, FindingCreate, FindingOut, FindingUpdate, ProjectOut


_MAX_CODE_PREVIEW_LINES = 80
_LANGUAGE_BY_SUFFIX = {
    ".c": "c",
    ".cpp": "cpp",
    ".cs": "csharp",
    ".css": "css",
    ".go": "go",
    ".html": "html",
    ".java": "java",
    ".js": "javascript",
    ".jsx": "jsx",
    ".json": "json",
    ".md": "markdown",
    ".py": "python",
    ".rs": "rust",
    ".sol": "solidity",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".yaml": "yaml",
    ".yml": "yaml",
}


def _frontend_dist() -> Path:
    return Path(__file__).resolve().parents[1] / "frontend" / "dist"


def _code_preview(project: dict, ref: dict) -> dict:
    raw_path = str(ref.get("path") or "")
    start_line = int(ref.get("start_line") or 1)
    end_line = int(ref.get("end_line") or start_line + 24)
    end_line = min(end_line, start_line + _MAX_CODE_PREVIEW_LINES - 1)

    project_path = Path(project["path"]).resolve(strict=False)
    target = (project_path / raw_path).resolve(strict=False)
    language = _LANGUAGE_BY_SUFFIX.get(target.suffix.lower(), "text")
    preview = {
        "path": raw_path,
        "start_line": start_line,
        "end_line": end_line,
        "language": language,
        "code": "",
        "error": None,
    }

    try:
        target.relative_to(project_path)
    except ValueError:
        return {**preview, "error": "File reference is outside the registered project path."}

    if not target.exists() or not target.is_file():
        return {**preview, "error": "File was not found."}

    try:
        lines = target.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        return {**preview, "error": "File is not valid UTF-8 text."}
    except OSError as exc:
        return {**preview, "error": str(exc)}

    if not lines:
        return {**preview, "end_line": start_line, "error": "File is empty."}

    bounded_start = max(1, min(start_line, len(lines)))
    bounded_end = max(bounded_start, min(end_line, len(lines)))
    return {
        **preview,
        "start_line": bounded_start,
        "end_line": bounded_end,
        "code": "\n".join(lines[bounded_start - 1 : bounded_end]),
    }


def create_app() -> FastAPI:
    app = FastAPI(title="Ward", version="0.1.0")

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/projects", response_model=list[ProjectOut])
    def list_projects() -> list[dict]:
        return db.list_projects()

    @app.get("/api/projects/{project_id}", response_model=ProjectOut)
    def get_project(project_id: str) -> dict:
        project = db.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="project not found")
        return project

    @app.get("/api/projects/{project_id}/findings", response_model=list[FindingOut])
    def list_findings(
        project_id: str,
        search: str | None = None,
        severity: str | None = None,
        status: str | None = None,
        source: str | None = None,
        category: str | None = None,
    ) -> list[dict]:
        if not db.get_project(project_id):
            raise HTTPException(status_code=404, detail="project not found")
        try:
            return db.list_findings(
                project_id,
                search=search,
                severity=severity,
                status=status,
                source=source,
                category=category,
            )
        except db.WardDbError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.post("/api/projects/{project_id}/findings", response_model=FindingOut, status_code=201)
    def create_finding(project_id: str, payload: FindingCreate) -> dict:
        try:
            return db.create_finding(
                project_id=project_id,
                title=payload.title,
                severity=payload.severity,
                file_refs=[ref.model_dump(exclude_none=True) for ref in payload.file_refs],
                category=payload.category,
                description=payload.description,
                impact=payload.impact,
                recommendation=payload.recommendation,
                source=payload.source,
                status=payload.status,
            )
        except db.WardDbError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/api/findings/{finding_id}", response_model=FindingOut)
    def get_finding(finding_id: str) -> dict:
        finding = db.get_finding(finding_id)
        if not finding:
            raise HTTPException(status_code=404, detail="finding not found")
        return finding

    @app.get("/api/findings/{finding_id}/related-code", response_model=list[CodePreview])
    def get_related_code(finding_id: str) -> list[dict]:
        finding = db.get_finding(finding_id)
        if not finding:
            raise HTTPException(status_code=404, detail="finding not found")
        project = db.get_project(finding["project_id"])
        if not project:
            raise HTTPException(status_code=404, detail="project not found")
        return [_code_preview(project, ref) for ref in finding["file_refs"]]

    @app.patch("/api/findings/{finding_id}", response_model=FindingOut)
    def update_finding(finding_id: str, payload: FindingUpdate) -> dict:
        values = payload.model_dump(exclude_unset=True)
        if "file_refs" in values and values["file_refs"] is not None:
            values["file_refs"] = [ref.model_dump(exclude_none=True) for ref in payload.file_refs or []]
        try:
            finding = db.update_finding(finding_id, values)
        except db.WardDbError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if not finding:
            raise HTTPException(status_code=404, detail="finding not found")
        return finding

    @app.delete("/api/findings/{finding_id}", status_code=204)
    def delete_finding(finding_id: str) -> None:
        if not db.delete_finding(finding_id):
            raise HTTPException(status_code=404, detail="finding not found")

    dist = _frontend_dist()
    assets = dist / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/", include_in_schema=False, response_model=None)
    def index():
        index_file = dist / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return HTMLResponse(
            """
            <!doctype html>
            <html>
              <head><title>Ward</title></head>
              <body>
                <main style="font-family: system-ui; max-width: 720px; margin: 64px auto;">
                  <h1>Ward UI has not been built</h1>
                  <p>Run <code>npm --prefix frontend install</code> and <code>npm --prefix frontend run build</code>, then restart <code>ward serve</code>.</p>
                </main>
              </body>
            </html>
            """
        )

    @app.get("/{full_path:path}", include_in_schema=False, response_model=None)
    def spa_fallback(full_path: str = ""):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="not found")
        return index()

    return app


app = create_app()
