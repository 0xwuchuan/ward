from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


Severity = Literal["critical", "high", "medium", "low", "info"]
Source = Literal["human", "agent"]
Status = Literal["draft", "valid", "invalid", "reported"]


class FileRef(BaseModel):
    path: str
    start_line: int | None = Field(default=None, ge=1)
    end_line: int | None = Field(default=None, ge=1)


class ProjectOut(BaseModel):
    id: str
    name: str
    path: str
    git_remote_url: str | None = None
    git_branch: str | None = None
    git_commit_hash: str | None = None
    git_dirty: bool = False
    created_at: str
    updated_at: str


class FindingBase(BaseModel):
    title: str
    severity: Severity = "medium"
    file_refs: list[FileRef] = Field(default_factory=list)
    category: str = ""
    description: str = ""
    impact: str = ""
    recommendation: str = ""
    source: Source = "human"
    status: Status = "draft"


class FindingCreate(FindingBase):
    pass


class FindingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    severity: Severity | None = None
    file_refs: list[FileRef] | None = None
    category: str | None = None
    description: str | None = None
    impact: str | None = None
    recommendation: str | None = None
    source: Source | None = None
    status: Status | None = None


class FindingOut(FindingBase):
    id: str
    project_id: str
    created_at: str
    updated_at: str


class CodePreview(BaseModel):
    path: str
    start_line: int
    end_line: int
    language: str
    code: str
    error: str | None = None
