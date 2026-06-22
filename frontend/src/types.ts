export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Source = "human" | "agent";
export type Status = "draft" | "valid" | "invalid" | "reported";
export type FindingSortBy = "created_at" | "severity" | "status" | "source";
export type SortDirection = "asc" | "desc";
export type SortRule = {
  sort_by: FindingSortBy;
  sort_dir: SortDirection;
};

export type FileRef = {
  path: string;
  start_line?: number;
  end_line?: number;
};

export type Project = {
  id: string;
  name: string;
  path: string;
  paths: string[];
  git_remote_url: string | null;
  git_branch: string | null;
  git_commit_hash: string | null;
  git_dirty: boolean;
  review_base_commit_hash: string | null;
  fix_review_commit_hash: string | null;
  fix_review_requested_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Finding = {
  id: string;
  project_id: string;
  title: string;
  severity: Severity;
  file_refs: FileRef[];
  category: string;
  description: string;
  impact: string;
  recommendation: string;
  source: Source;
  status: Status;
  created_at: string;
  updated_at: string;
};

export type FindingPayload = Omit<Finding, "id" | "project_id" | "created_at" | "updated_at">;

export type CodePreview = {
  path: string;
  start_line: number;
  end_line: number;
  language: string;
  code: string;
  error: string | null;
};
