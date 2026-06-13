from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import asdict
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import re
import sqlite3
from typing import Any
from uuid import uuid4

from .git import GitMetadata


SEVERITIES = ("critical", "high", "medium", "low", "info")
SOURCES = ("human", "agent")
STATUSES = ("draft", "valid", "invalid", "reported")

_FILE_REF_PATTERN = re.compile(r"^(?P<path>.+?)(?::(?P<start>\d+)(?:-(?P<end>\d+))?)?$")


class WardDbError(ValueError):
    pass


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def db_path() -> Path:
    configured = os.environ.get("WARD_DB_PATH")
    if configured:
        return Path(configured).expanduser()
    return Path.home() / ".ward" / "ward.db"


def absolute_path(path: str | Path) -> str:
    return str(Path(path).expanduser().resolve(strict=False))


def connect(path: str | Path | None = None) -> sqlite3.Connection:
    target = Path(path).expanduser() if path is not None else db_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(target)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    init_db(conn)
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            git_remote_url TEXT,
            git_branch TEXT,
            git_commit_hash TEXT,
            git_dirty INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS findings (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
            file_refs TEXT NOT NULL DEFAULT '[]',
            category TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            impact TEXT NOT NULL DEFAULT '',
            recommendation TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL CHECK (source IN ('human', 'agent')),
            status TEXT NOT NULL CHECK (status IN ('draft', 'valid', 'invalid', 'reported')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);
        CREATE INDEX IF NOT EXISTS idx_findings_project_id ON findings(project_id);
        CREATE INDEX IF NOT EXISTS idx_findings_status ON findings(status);
        CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
        """
    )
    conn.commit()


def _own_conn(conn: sqlite3.Connection | None) -> tuple[sqlite3.Connection, bool]:
    if conn is not None:
        return conn, False
    return connect(), True


def _validate_choice(field: str, value: str, choices: Sequence[str]) -> str:
    normalized = value.strip().lower()
    if normalized not in choices:
        raise WardDbError(f"{field} must be one of: {', '.join(choices)}")
    return normalized


def _normalize_file_ref(ref: dict[str, Any]) -> dict[str, Any]:
    path = str(ref.get("path") or "").strip()
    if not path:
        raise WardDbError("file reference path is required")

    normalized: dict[str, Any] = {"path": path}
    start_line = ref.get("start_line")
    end_line = ref.get("end_line")
    if start_line in ("", None):
        start_line = None
    if end_line in ("", None):
        end_line = None
    if start_line is not None:
        start = int(start_line)
        if start <= 0:
            raise WardDbError("file reference start_line must be positive")
        normalized["start_line"] = start
    if end_line is not None:
        end = int(end_line)
        if end <= 0:
            raise WardDbError("file reference end_line must be positive")
        normalized["end_line"] = end
    if "start_line" in normalized and "end_line" in normalized and normalized["end_line"] < normalized["start_line"]:
        raise WardDbError("file reference end_line must be greater than or equal to start_line")
    return normalized


def normalize_file_refs(file_refs: Iterable[dict[str, Any]] | None) -> list[dict[str, Any]]:
    return [_normalize_file_ref(ref) for ref in file_refs or []]


def parse_file_refs(values: Iterable[str] | None) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    for raw in values or []:
        value = raw.strip()
        if not value:
            continue
        match = _FILE_REF_PATTERN.match(value)
        if not match:
            raise WardDbError(f"invalid file reference: {raw}")
        ref: dict[str, Any] = {"path": match.group("path")}
        if match.group("start"):
            ref["start_line"] = int(match.group("start"))
        if match.group("end"):
            ref["end_line"] = int(match.group("end"))
        refs.append(_normalize_file_ref(ref))
    return refs


def _decode_file_refs(value: str) -> list[dict[str, Any]]:
    try:
        loaded = json.loads(value or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(loaded, list):
        return []
    return [ref for ref in loaded if isinstance(ref, dict)]


def _project_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "path": row["path"],
        "git_remote_url": row["git_remote_url"],
        "git_branch": row["git_branch"],
        "git_commit_hash": row["git_commit_hash"],
        "git_dirty": bool(row["git_dirty"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _finding_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "title": row["title"],
        "severity": row["severity"],
        "file_refs": _decode_file_refs(row["file_refs"]),
        "category": row["category"],
        "description": row["description"],
        "impact": row["impact"],
        "recommendation": row["recommendation"],
        "source": row["source"],
        "status": row["status"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def list_projects(conn: sqlite3.Connection | None = None) -> list[dict[str, Any]]:
    db, close = _own_conn(conn)
    try:
        rows = db.execute("SELECT * FROM projects ORDER BY updated_at DESC, name ASC").fetchall()
        return [_project_from_row(row) for row in rows]
    finally:
        if close:
            db.close()


def get_project(project_id: str, conn: sqlite3.Connection | None = None) -> dict[str, Any] | None:
    db, close = _own_conn(conn)
    try:
        row = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        return _project_from_row(row) if row else None
    finally:
        if close:
            db.close()


def get_project_by_path(path: str | Path, conn: sqlite3.Connection | None = None) -> dict[str, Any] | None:
    db, close = _own_conn(conn)
    try:
        row = db.execute("SELECT * FROM projects WHERE path = ?", (absolute_path(path),)).fetchone()
        return _project_from_row(row) if row else None
    finally:
        if close:
            db.close()


def resolve_project(identifier: str | None = None, cwd: str | Path | None = None, conn: sqlite3.Connection | None = None) -> dict[str, Any] | None:
    db, close = _own_conn(conn)
    try:
        if identifier:
            row = db.execute("SELECT * FROM projects WHERE id = ?", (identifier,)).fetchone()
            if row:
                return _project_from_row(row)
            row = db.execute("SELECT * FROM projects WHERE path = ?", (absolute_path(identifier),)).fetchone()
            return _project_from_row(row) if row else None

        lookup = absolute_path(cwd or Path.cwd())
        row = db.execute("SELECT * FROM projects WHERE path = ?", (lookup,)).fetchone()
        return _project_from_row(row) if row else None
    finally:
        if close:
            db.close()


def register_project(
    path: str | Path,
    *,
    name: str | None = None,
    git_metadata: GitMetadata | dict[str, Any] | None = None,
    conn: sqlite3.Connection | None = None,
) -> dict[str, Any]:
    db, close = _own_conn(conn)
    try:
        project_path = absolute_path(path)
        metadata = asdict(git_metadata) if isinstance(git_metadata, GitMetadata) else dict(git_metadata or {})
        timestamp = now_iso()
        existing = db.execute("SELECT * FROM projects WHERE path = ?", (project_path,)).fetchone()

        if existing:
            next_name = name.strip() if name and name.strip() else existing["name"]
            db.execute(
                """
                UPDATE projects
                SET name = ?,
                    git_remote_url = ?,
                    git_branch = ?,
                    git_commit_hash = ?,
                    git_dirty = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    next_name,
                    metadata.get("git_remote_url"),
                    metadata.get("git_branch"),
                    metadata.get("git_commit_hash"),
                    int(bool(metadata.get("git_dirty"))),
                    timestamp,
                    existing["id"],
                ),
            )
            db.commit()
            return get_project(existing["id"], db)  # type: ignore[return-value]

        project_id = str(uuid4())
        display_name = name.strip() if name and name.strip() else Path(project_path).name
        db.execute(
            """
            INSERT INTO projects (
                id, name, path, git_remote_url, git_branch, git_commit_hash,
                git_dirty, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project_id,
                display_name,
                project_path,
                metadata.get("git_remote_url"),
                metadata.get("git_branch"),
                metadata.get("git_commit_hash"),
                int(bool(metadata.get("git_dirty"))),
                timestamp,
                timestamp,
            ),
        )
        db.commit()
        return get_project(project_id, db)  # type: ignore[return-value]
    finally:
        if close:
            db.close()


def create_finding(
    *,
    project_id: str,
    title: str,
    severity: str,
    file_refs: Iterable[dict[str, Any]] | None = None,
    category: str = "",
    description: str = "",
    impact: str = "",
    recommendation: str = "",
    source: str = "human",
    status: str = "draft",
    conn: sqlite3.Connection | None = None,
) -> dict[str, Any]:
    db, close = _own_conn(conn)
    try:
        if not get_project(project_id, db):
            raise WardDbError("project not found")
        cleaned_title = title.strip()
        if not cleaned_title:
            raise WardDbError("title is required")

        finding_id = str(uuid4())
        timestamp = now_iso()
        refs = normalize_file_refs(file_refs)
        db.execute(
            """
            INSERT INTO findings (
                id, project_id, title, severity, file_refs, category, description,
                impact, recommendation, source, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                finding_id,
                project_id,
                cleaned_title,
                _validate_choice("severity", severity, SEVERITIES),
                json.dumps(refs, separators=(",", ":")),
                category.strip(),
                description.strip(),
                impact.strip(),
                recommendation.strip(),
                _validate_choice("source", source, SOURCES),
                _validate_choice("status", status, STATUSES),
                timestamp,
                timestamp,
            ),
        )
        db.commit()
        return get_finding(finding_id, db)  # type: ignore[return-value]
    finally:
        if close:
            db.close()


def get_finding(finding_id: str, conn: sqlite3.Connection | None = None) -> dict[str, Any] | None:
    db, close = _own_conn(conn)
    try:
        row = db.execute("SELECT * FROM findings WHERE id = ?", (finding_id,)).fetchone()
        return _finding_from_row(row) if row else None
    finally:
        if close:
            db.close()


def list_findings(
    project_id: str,
    *,
    search: str | None = None,
    severity: str | None = None,
    status: str | None = None,
    source: str | None = None,
    category: str | None = None,
    conn: sqlite3.Connection | None = None,
) -> list[dict[str, Any]]:
    db, close = _own_conn(conn)
    try:
        where = ["project_id = ?"]
        params: list[Any] = [project_id]

        if search:
            where.append("(lower(title) LIKE ? OR lower(category) LIKE ? OR lower(description) LIKE ? OR lower(file_refs) LIKE ?)")
            needle = f"%{search.lower()}%"
            params.extend([needle, needle, needle, needle])
        if severity:
            where.append("severity = ?")
            params.append(_validate_choice("severity", severity, SEVERITIES))
        if status:
            where.append("status = ?")
            params.append(_validate_choice("status", status, STATUSES))
        if source:
            where.append("source = ?")
            params.append(_validate_choice("source", source, SOURCES))
        if category:
            where.append("category = ?")
            params.append(category)

        rows = db.execute(
            f"SELECT * FROM findings WHERE {' AND '.join(where)} ORDER BY created_at DESC, title ASC",
            params,
        ).fetchall()
        return [_finding_from_row(row) for row in rows]
    finally:
        if close:
            db.close()


def update_finding(finding_id: str, values: dict[str, Any], conn: sqlite3.Connection | None = None) -> dict[str, Any] | None:
    db, close = _own_conn(conn)
    try:
        existing = get_finding(finding_id, db)
        if not existing:
            return None

        allowed = {
            "title",
            "severity",
            "file_refs",
            "category",
            "description",
            "impact",
            "recommendation",
            "source",
            "status",
        }
        assignments: list[str] = []
        params: list[Any] = []
        for key, value in values.items():
            if key not in allowed or value is None:
                continue
            if key == "title":
                value = str(value).strip()
                if not value:
                    raise WardDbError("title is required")
            elif key == "severity":
                value = _validate_choice("severity", str(value), SEVERITIES)
            elif key == "source":
                value = _validate_choice("source", str(value), SOURCES)
            elif key == "status":
                value = _validate_choice("status", str(value), STATUSES)
            elif key == "file_refs":
                value = json.dumps(normalize_file_refs(value), separators=(",", ":"))
            else:
                value = str(value).strip()
            assignments.append(f"{key} = ?")
            params.append(value)

        if not assignments:
            return existing

        assignments.append("updated_at = ?")
        params.append(now_iso())
        params.append(finding_id)
        db.execute(f"UPDATE findings SET {', '.join(assignments)} WHERE id = ?", params)
        db.commit()
        return get_finding(finding_id, db)
    finally:
        if close:
            db.close()


def delete_finding(finding_id: str, conn: sqlite3.Connection | None = None) -> bool:
    db, close = _own_conn(conn)
    try:
        result = db.execute("DELETE FROM findings WHERE id = ?", (finding_id,))
        db.commit()
        return result.rowcount > 0
    finally:
        if close:
            db.close()
