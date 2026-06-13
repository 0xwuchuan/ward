from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import subprocess


@dataclass(frozen=True)
class GitMetadata:
    git_remote_url: str | None = None
    git_branch: str | None = None
    git_commit_hash: str | None = None
    git_dirty: bool = False


def _git(path: Path, *args: str) -> str | None:
    try:
        result = subprocess.run(
            ["git", "-C", str(path), *args],
            check=True,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    value = result.stdout.strip()
    return value or None


def get_git_metadata(path: Path) -> GitMetadata:
    worktree = _git(path, "rev-parse", "--show-toplevel")
    if worktree is None:
        return GitMetadata()

    remote = _git(path, "remote", "get-url", "origin")
    branch = _git(path, "branch", "--show-current")
    commit = _git(path, "rev-parse", "HEAD")
    status = _git(path, "status", "--porcelain")

    return GitMetadata(
        git_remote_url=remote,
        git_branch=branch,
        git_commit_hash=commit,
        git_dirty=bool(status),
    )
