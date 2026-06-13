from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from typer.testing import CliRunner

from ward import db
from ward.api import app as api_app
from ward.cli import app as cli_app
from ward.git import GitMetadata


def test_register_project_is_idempotent_and_updates_metadata(tmp_path, monkeypatch):
    monkeypatch.setenv("WARD_DB_PATH", str(tmp_path / "ward.db"))
    project_path = tmp_path / "target"
    project_path.mkdir()

    first = db.register_project(project_path, git_metadata=GitMetadata(git_branch="main"))
    second = db.register_project(
        project_path,
        name="Custom",
        git_metadata=GitMetadata(git_remote_url="git@example.com:repo.git", git_branch="audit", git_commit_hash="abc123", git_dirty=True),
    )

    assert first["id"] == second["id"]
    assert second["name"] == "Custom"
    assert second["path"] == str(project_path.resolve())
    assert second["git_remote_url"] == "git@example.com:repo.git"
    assert second["git_branch"] == "audit"
    assert second["git_commit_hash"] == "abc123"
    assert second["git_dirty"] is True
    assert len(db.list_projects()) == 1


def test_cli_place_and_finding_create_write_without_service(tmp_path, monkeypatch):
    monkeypatch.setenv("WARD_DB_PATH", str(tmp_path / "ward.db"))
    project_path = tmp_path / "repo"
    project_path.mkdir()
    runner = CliRunner()
    monkeypatch.chdir(project_path)

    place_result = runner.invoke(cli_app, ["place", "--name", "CLI Project"], catch_exceptions=False)
    assert place_result.exit_code == 0

    finding_result = runner.invoke(
        cli_app,
        [
            "finding",
            "create",
            "--project",
            str(project_path),
            "--title",
            "Unchecked transfer",
            "--severity",
            "high",
            "--file-ref",
            "src/Vault.sol:42-51",
            "--category",
            "access-control",
            "--description",
            "External call result is ignored.",
            "--impact",
            "Assets may be misaccounted.",
            "--recommendation",
            "Check the return value.",
            "--source",
            "agent",
        ],
        catch_exceptions=False,
    )
    assert finding_result.exit_code == 0

    project = db.get_project_by_path(project_path)
    assert project is not None
    findings = db.list_findings(project["id"])
    assert len(findings) == 1
    assert findings[0]["title"] == "Unchecked transfer"
    assert findings[0]["source"] == "agent"
    assert findings[0]["status"] == "draft"
    assert findings[0]["file_refs"] == [{"path": "src/Vault.sol", "start_line": 42, "end_line": 51}]


def test_cli_start_launches_backend_and_app(monkeypatch):
    captured = []

    def fake_start_commands(commands):
        captured.extend(commands)
        return 0

    monkeypatch.setattr("ward.cli._start_commands", fake_start_commands)
    runner = CliRunner()

    result = runner.invoke(cli_app, ["start"], catch_exceptions=False)

    assert result.exit_code == 0
    assert [command.label for command in captured] == ["backend", "app"]
    assert captured[0].command[-4:] == ["--host", "127.0.0.1", "--port", "8765"]
    assert captured[1].command == ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"]


def test_cli_start_debug_also_launches_agentation_mcp(monkeypatch):
    captured = []

    def fake_start_commands(commands):
        captured.extend(commands)
        return 0

    monkeypatch.setattr("ward.cli._start_commands", fake_start_commands)
    runner = CliRunner()

    result = runner.invoke(cli_app, ["start", "--debug"], catch_exceptions=False)

    assert result.exit_code == 0
    assert [command.label for command in captured] == ["backend", "app", "agentation mcp"]
    assert captured[2].command == ["npm", "run", "agentation:mcp"]


def test_api_uses_shared_database_layer(tmp_path, monkeypatch):
    monkeypatch.setenv("WARD_DB_PATH", str(tmp_path / "ward.db"))
    project = db.register_project(tmp_path / "repo", name="API Project")

    client = TestClient(api_app)
    response = client.post(
        f"/api/projects/{project['id']}/findings",
        json={
            "title": "Missing validation",
            "severity": "medium",
            "file_refs": [{"path": "src/Token.sol", "start_line": 9}],
            "category": "validation",
            "description": "Input is not constrained.",
            "impact": "Unexpected state transitions.",
            "recommendation": "Validate input bounds.",
            "source": "human",
            "status": "draft",
        },
    )
    assert response.status_code == 201
    finding = response.json()

    patch = client.patch(f"/api/findings/{finding['id']}", json={"status": "valid"})
    assert patch.status_code == 200
    assert patch.json()["status"] == "valid"

    listed = client.get(f"/api/projects/{project['id']}/findings", params={"status": "valid"})
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [finding["id"]]

    deleted = client.delete(f"/api/findings/{finding['id']}")
    assert deleted.status_code == 204
    assert db.list_findings(project["id"]) == []


def test_api_related_code_previews_are_scoped_to_project(tmp_path, monkeypatch):
    monkeypatch.setenv("WARD_DB_PATH", str(tmp_path / "ward.db"))
    repo = tmp_path / "repo"
    source = repo / "src" / "Vault.sol"
    source.parent.mkdir(parents=True)
    source.write_text("line 1\nline 2\nline 3\n", encoding="utf-8")
    outside = tmp_path / "outside.sol"
    outside.write_text("secret\n", encoding="utf-8")

    project = db.register_project(repo, name="Code Project")
    finding = db.create_finding(
        project_id=project["id"],
        title="Related code",
        severity="medium",
        file_refs=[
            {"path": "src/Vault.sol", "start_line": 2, "end_line": 3},
            {"path": "../outside.sol", "start_line": 1},
        ],
        category="validation",
        description="",
        impact="",
        recommendation="",
        source="agent",
        status="draft",
    )

    client = TestClient(api_app)
    response = client.get(f"/api/findings/{finding['id']}/related-code")

    assert response.status_code == 200
    previews = response.json()
    assert previews[0]["path"] == "src/Vault.sol"
    assert previews[0]["language"] == "solidity"
    assert previews[0]["start_line"] == 2
    assert previews[0]["end_line"] == 3
    assert previews[0]["code"] == "line 2\nline 3"
    assert previews[0]["error"] is None
    assert previews[1]["code"] == ""
    assert "outside" in previews[1]["error"]
