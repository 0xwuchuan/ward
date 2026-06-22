import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUpDown,
  ArrowUp,
  ChartNoAxesColumn,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleDot,
  Copy,
  Expand,
  FileText,
  FolderKanban,
  GitBranch,
  Pencil,
  Plus,
  Search,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { Textarea } from "./components/ui/textarea";
import {
  clearFixReview,
  createFinding,
  deleteFinding,
  deleteProject,
  getRelatedCode,
  listFindings,
  listProjects,
  requestFixReview,
  updateFinding,
} from "./lib/api";
import { cn } from "./lib/utils";
import type {
  CodePreview,
  FileRef,
  Finding,
  FindingPayload,
  FindingSortBy,
  Project,
  Severity,
  Source,
  SortDirection,
  SortRule,
  Status,
} from "./types";

const severities: Severity[] = ["critical", "high", "medium", "low", "info"];
const statuses: Status[] = ["draft", "valid", "invalid", "reported"];
const sources: Source[] = ["human", "agent"];
const drawerWidthBounds = { min: 680, max: 1240 };

type DrawerMode = "view" | "edit" | "create";
type WorkspaceView = "findings" | "projects" | "finding-detail";
type DetailSurface = "drawer" | "page";

type Filters = {
  search: string;
  severity: string;
  status: string;
  source: string;
};

type SortState = SortRule[];

const emptyPayload: FindingPayload = {
  title: "",
  severity: "medium",
  file_refs: [],
  category: "",
  description: "",
  impact: "",
  recommendation: "",
  source: "human",
  status: "draft",
};

const codeKeywords = new Set([
  "as",
  "async",
  "await",
  "class",
  "const",
  "contract",
  "def",
  "else",
  "enum",
  "error",
  "event",
  "export",
  "external",
  "false",
  "for",
  "from",
  "function",
  "if",
  "import",
  "interface",
  "internal",
  "let",
  "mapping",
  "new",
  "private",
  "public",
  "pure",
  "require",
  "return",
  "returns",
  "revert",
  "struct",
  "throw",
  "true",
  "try",
  "type",
  "var",
  "view",
  "while",
]);
const tokenPattern =
  /(\/\/.*|#.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;

function fileRefToText(ref: FileRef) {
  if (ref.start_line && ref.end_line)
    return `${ref.path}:${ref.start_line}-${ref.end_line}`;
  if (ref.start_line) return `${ref.path}:${ref.start_line}`;
  return ref.path;
}

function parseFileRefs(value: string): FileRef[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?)(?::(\d+)(?:-(\d+))?)?$/);
      if (!match) return { path: line };
      return {
        path: match[1],
        ...(match[2] ? { start_line: Number(match[2]) } : {}),
        ...(match[3] ? { end_line: Number(match[3]) } : {}),
      };
    });
}

function shortPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 3) return path;
  return `.../${parts.slice(-3).join("/")}`;
}

function shortCommit(commit: string | null) {
  return commit ? commit.slice(0, 7) : "No commit";
}

function projectPathSummary(project: Project) {
  if (project.paths.length <= 1) return shortPath(project.path);
  return `${shortPath(project.path)} +${project.paths.length - 1} dirs`;
}

function fixReviewSummary(project: Project) {
  if (!project.fix_review_commit_hash) return null;
  return `${shortCommit(project.review_base_commit_hash)} → ${shortCommit(project.fix_review_commit_hash)}`;
}

function severityVariant(severity: Severity) {
  if (severity === "critical") return "red";
  if (severity === "high") return "orange";
  if (severity === "medium") return "yellow";
  if (severity === "low") return "blue";
  return "cyan";
}

function statusVariant(status: Status) {
  if (status === "valid") return "green";
  if (status === "invalid") return "red";
  if (status === "reported") return "purple";
  return "muted";
}

function sourceVariant(source: Source) {
  return source === "agent" ? "blue" : "muted";
}

function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  return (
    <Badge className={className} variant={severityVariant(severity)}>
      {severity}
    </Badge>
  );
}

function StatusBadge({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  return (
    <Badge className={className} variant={statusVariant(status)}>
      {status}
    </Badge>
  );
}

function WardLogo() {
  return (
    <svg
      viewBox="0 0 294 266"
      fill="none"
      overflow="visible"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="ward"
      className="ward-logo h-8 w-8 shrink-0"
      style={{ overflow: "visible" }}
    >
      <rect width="294" height="266" fill="transparent" />
      <g stroke="#100f0f" strokeLinejoin="round" strokeWidth="6">
        <path
          fill="#3aa99f"
          d="M146.187 99L80.6869 49.5L114.187 0.5H180.187L213.687 49.5L146.187 99Z"
        />
        <path
          className="ward-logo-wing ward-logo-wing-right"
          fill="#f4c542"
          d="M195.187 162.5L180.687 104L237.687 63.5L293.187 82L273.687 124.5L195.187 162.5Z"
        />
        <path
          className="ward-logo-wing ward-logo-wing-left"
          fill="#f4c542"
          d="M98.6869 162.5L113.187 104L56.1869 63.5L0.68689 82L20.1869 124.5L98.6869 162.5Z"
        />
        <path
          fill="#2f2419"
          d="M146.687 127L132.687 119L101.687 239.5L146.687 265L190.187 239.5L159.687 119L146.687 127Z"
        />
      </g>
    </svg>
  );
}

function highlightLine(line: string) {
  const parts: JSX.Element[] = [];
  let cursor = 0;
  for (const match of line.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push(
        <span key={`${index}-plain`}>{line.slice(cursor, index)}</span>,
      );
    }

    let className = "text-foreground";
    if (token.startsWith("//") || token.startsWith("#")) {
      className = "text-muted-foreground";
    } else if (
      token.startsWith('"') ||
      token.startsWith("'") ||
      token.startsWith("`")
    ) {
      className = "text-green-700";
    } else if (/^\d/.test(token)) {
      className = "text-cyan-700";
    } else if (codeKeywords.has(token)) {
      className = "font-semibold text-purple-700";
    }

    parts.push(
      <span key={`${index}-${token}`} className={className}>
        {token}
      </span>,
    );
    cursor = index + token.length;
  }

  if (cursor < line.length) {
    parts.push(<span key="tail">{line.slice(cursor)}</span>);
  }
  return parts.length ? parts : " ";
}

function CopyAffordance({
  label,
  copied,
  onCopy,
}: {
  label: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity duration-150 hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/copy:opacity-70 group-focus-within/copy:opacity-100"
      onClick={onCopy}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-700 opacity-100" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      <span className="sr-only">Copy {label}</span>
    </button>
  );
}

function FieldBlock({
  label,
  value,
  copyKey,
  copiedKey,
  onCopy,
  multiline = false,
  valueClassName,
}: {
  label: string;
  value: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
  multiline?: boolean;
  valueClassName?: string;
}) {
  return (
    <section className="group/copy border-t py-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
          {label}
        </h3>
        <CopyAffordance
          label={label}
          copied={copiedKey === copyKey}
          onCopy={() => onCopy(copyKey, value)}
        />
      </div>
      <p
        className={cn(
          "text-sm leading-6 text-foreground",
          multiline && "whitespace-pre-wrap",
          valueClassName,
        )}
      >
        {value || "Not provided"}
      </p>
    </section>
  );
}

function MetadataCopyItem({
  label,
  value,
  copyKey,
  copiedKey,
  onCopy,
  valueClassName,
}: {
  label: string;
  value: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
  valueClassName?: string;
}) {
  return (
    <div className="group/copy min-w-0">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
          {label}
        </h3>
        <CopyAffordance
          label={label}
          copied={copiedKey === copyKey}
          onCopy={() => onCopy(copyKey, value)}
        />
      </div>
      <p className={valueClassName}>{value || "Not provided"}</p>
    </div>
  );
}

function FindingMetadataRow({
  fileRefs,
  category,
  copiedKey,
  onCopy,
}: {
  fileRefs: string;
  category: string;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 border-t py-4 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
      <MetadataCopyItem
        label="File references"
        value={fileRefs}
        copyKey="file_refs"
        copiedKey={copiedKey}
        onCopy={onCopy}
        valueClassName="whitespace-pre-wrap break-all font-mono text-xs leading-6 text-foreground"
      />
      <MetadataCopyItem
        label="Category"
        value={category}
        copyKey="category"
        copiedKey={copiedKey}
        onCopy={onCopy}
        valueClassName="truncate text-sm leading-6 text-foreground"
      />
    </section>
  );
}

function CodePreviewBlocks({
  previews,
  loading,
}: {
  previews: CodePreview[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="border-t py-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
          Related code
        </h3>
        <p className="text-sm text-muted-foreground">
          Loading code previews...
        </p>
      </section>
    );
  }

  if (previews.length === 0) {
    return null;
  }

  return (
    <section className="border-t py-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        Related code
      </h3>
      <div className="space-y-3">
        {previews.map((preview) => {
          const lines = preview.code.split("\n");
          return (
            <div
              key={`${preview.path}:${preview.start_line}`}
              className="overflow-hidden rounded-md border bg-background"
            >
              <div className="flex items-center justify-between gap-3 border-b bg-muted px-3 py-2">
                <div className="min-w-0 truncate font-mono text-xs text-foreground">
                  {preview.path}:{preview.start_line}-{preview.end_line}
                </div>
                <Badge variant="muted">{preview.language}</Badge>
              </div>
              {preview.error ? (
                <div className="px-3 py-3 text-sm text-muted-foreground">
                  {preview.error}
                </div>
              ) : (
                <pre className="overflow-x-auto p-3 text-xs leading-5">
                  <code>
                    {lines.map((line, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3"
                      >
                        <span className="select-none text-right text-muted-foreground">
                          {preview.start_line + index}
                        </span>
                        <span className="whitespace-pre">
                          {highlightLine(line)}
                        </span>
                      </div>
                    ))}
                  </code>
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FindingForm({
  value,
  setValue,
}: {
  value: FindingPayload;
  setValue: (next: FindingPayload) => void;
}) {
  const setField = <K extends keyof FindingPayload>(
    key: K,
    next: FindingPayload[K],
  ) => {
    setValue({ ...value, [key]: next });
  };

  return (
    <div className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Title</span>
        <Input
          value={value.title}
          onChange={(event) => setField("title", event.target.value)}
          autoFocus
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Severity
          </span>
          <Select
            value={value.severity}
            onValueChange={(next: Severity) => setField("severity", next)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {severities.map((severity) => (
                <SelectItem key={severity} value={severity}>
                  {severity}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Status
          </span>
          <Select
            value={value.status}
            onValueChange={(next: Status) => setField("status", next)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Source
          </span>
          <Select
            value={value.source}
            onValueChange={(next: Source) => setField("source", next)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sources.map((source) => (
                <SelectItem key={source} value={source}>
                  {source}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Category
          </span>
          <Input
            value={value.category}
            onChange={(event) => setField("category", event.target.value)}
          />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          File references
        </span>
        <Textarea
          value={value.file_refs.map(fileRefToText).join("\n")}
          onChange={(event) =>
            setField("file_refs", parseFileRefs(event.target.value))
          }
          placeholder="src/Vault.sol:42-51"
          className="min-h-[72px]"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Description
        </span>
        <Textarea
          value={value.description}
          onChange={(event) => setField("description", event.target.value)}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Impact
        </span>
        <Textarea
          value={value.impact}
          onChange={(event) => setField("impact", event.target.value)}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Recommendation
        </span>
        <Textarea
          value={value.recommendation}
          onChange={(event) => setField("recommendation", event.target.value)}
        />
      </label>
    </div>
  );
}

function findingToPayload(finding: Finding): FindingPayload {
  return {
    title: finding.title,
    severity: finding.severity,
    file_refs: finding.file_refs,
    category: finding.category,
    description: finding.description,
    impact: finding.impact,
    recommendation: finding.recommendation,
    source: finding.source,
    status: finding.status,
  };
}

function ProjectsPage({
  projects,
  selectedProjectId,
  deletingProjectId,
  onOpenProject,
  onDeleteProject,
}: {
  projects: Project[];
  selectedProjectId: string | null;
  deletingProjectId: string | null;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (project: Project) => void;
}) {
  return (
    <section className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-5">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Projects</h2>
            <p className="text-sm text-muted-foreground">
              Registered audit workspaces
            </p>
          </div>
          <Badge variant="muted">{projects.length} total</Badge>
        </div>
        {projects.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Register a project from a repository with{" "}
            <code className="font-mono text-foreground">ward place</code>.
          </div>
        ) : (
          <div className="divide-y overflow-hidden rounded-md border bg-background">
            {projects.map((project) => (
              <div
                key={project.id}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_2.5rem] gap-3 px-4 py-3 md:items-center",
                  selectedProjectId === project.id && "bg-accent",
                )}
              >
                <button
                  type="button"
                  onClick={() => onOpenProject(project.id)}
                  className="grid min-w-0 grid-cols-1 gap-2 text-left transition-colors hover:text-foreground md:grid-cols-[minmax(160px,0.9fr)_minmax(220px,1.5fr)_minmax(96px,120px)_minmax(170px,auto)] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {project.name}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground md:hidden">
                      <span className="truncate">{projectPathSummary(project)}</span>
                      {project.paths.length > 1 && (
                        <Badge variant="muted">{project.paths.length} dirs</Badge>
                      )}
                      {project.fix_review_commit_hash && (
                        <Badge variant="purple">Fix review</Badge>
                      )}
                    </div>
                  </div>
                  <span className="hidden truncate font-mono text-xs text-muted-foreground md:block">
                    {projectPathSummary(project)}
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                    <GitBranch className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {project.git_branch ?? "No branch"}
                    </span>
                  </span>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {project.fix_review_commit_hash && (
                      <Badge variant="purple">Fix review</Badge>
                    )}
                    <Badge variant={project.git_dirty ? "yellow" : "muted"}>
                      {project.git_dirty ? (
                        <AlertTriangle className="h-3 w-3" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      {project.git_dirty ? "dirty" : "clean"}
                    </Badge>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {shortCommit(project.git_commit_hash)}
                    </span>
                  </div>
                </button>
                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${project.name}`}
                    title="Delete project"
                    disabled={deletingProjectId === project.id}
                    onClick={() => onDeleteProject(project)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SortHeader({
  label,
  priority,
  direction,
  onClick,
}: {
  label: string;
  priority?: number;
  direction?: SortDirection;
  onClick: () => void;
}) {
  const active = direction !== undefined;
  const SortIcon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      aria-label={
        active
          ? `${label} sorted ${direction}${priority ? `, priority ${priority}` : ""}`
          : `Sort by ${label}`
      }
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-full px-2 py-1 text-xs transition-colors hover:bg-muted/70",
        active && "bg-muted text-foreground",
      )}
      onClick={onClick}
    >
      <span>{label}</span>
      <SortIcon className="h-3 w-3" />
    </button>
  );
}

function FindingDetailBody({
  finding,
  copiedKey,
  onCopy,
  onUpdateStatus,
  codePreviews,
  codeLoading,
}: {
  finding: Finding;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
  onUpdateStatus: (status: Status) => void;
  codePreviews: CodePreview[];
  codeLoading: boolean;
}) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <StatusBadge status={finding.status} />
        <Badge variant={sourceVariant(finding.source)}>{finding.source}</Badge>
        <div className="ml-auto w-36">
          <Select value={finding.status} onValueChange={(value: Status) => onUpdateStatus(value)}>
            <SelectTrigger className="h-8 rounded-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <FindingMetadataRow
        fileRefs={finding.file_refs.map(fileRefToText).join("\n")}
        category={finding.category}
        copiedKey={copiedKey}
        onCopy={onCopy}
      />
      <FieldBlock
        label="Description"
        value={finding.description}
        copyKey="description"
        copiedKey={copiedKey}
        onCopy={onCopy}
        multiline
      />
      <FieldBlock
        label="Impact"
        value={finding.impact}
        copyKey="impact"
        copiedKey={copiedKey}
        onCopy={onCopy}
        multiline
      />
      <FieldBlock
        label="Recommendation"
        value={finding.recommendation}
        copyKey="recommendation"
        copiedKey={copiedKey}
        onCopy={onCopy}
        multiline
      />
      <CodePreviewBlocks previews={codePreviews} loading={codeLoading} />
    </>
  );
}

function sortRuleFor(sortState: SortState, sortBy: FindingSortBy) {
  const index = sortState.findIndex((sort) => sort.sort_by === sortBy);
  return index === -1 ? null : { index, rule: sortState[index]! };
}

function updateSortState(sortState: SortState, sortBy: FindingSortBy): SortState {
  const existing = sortRuleFor(sortState, sortBy);
  if (!existing) return [...sortState, { sort_by: sortBy, sort_dir: "desc" }];
  if (existing.rule.sort_dir === "desc") {
    return sortState.map((sort) =>
      sort.sort_by === sortBy ? { ...sort, sort_dir: "asc" } : sort,
    );
  }
  if (sortState.length > 1) {
    return sortState.filter((sort) => sort.sort_by !== sortBy);
  }
  return [{ sort_by: sortBy, sort_dir: "desc" }];
}

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [findings, setFindings] = useState<Finding[]>([]);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    severity: "",
    status: "",
    source: "",
  });
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("findings");
  const [detailSurface, setDetailSurface] = useState<DetailSurface>("drawer");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("view");
  const [activeFinding, setActiveFinding] = useState<Finding | null>(null);
  const [formValue, setFormValue] = useState<FindingPayload>(emptyPayload);
  const [codePreviews, setCodePreviews] = useState<CodePreview[]>([]);
  const [codeLoading, setCodeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [newFindingHovered, setNewFindingHovered] = useState(false);
  const [sortState, setSortState] = useState<SortState>([
    { sort_by: "created_at", sort_dir: "desc" },
  ]);
  const [drawerWidth, setDrawerWidth] = useState(() =>
    Math.max(
      drawerWidthBounds.min,
      Math.min(drawerWidthBounds.max, Math.round(window.innerWidth * 0.5)),
    ),
  );
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null;
  const activeDetailSurface = drawerMode === "view" ? detailSurface : "drawer";
  const drawerStyle = useMemo(
    () => ({ width: `min(${drawerWidth}px, 100vw)` }),
    [drawerWidth],
  );

  async function refreshProjects() {
    const nextProjects = await listProjects();
    setProjects(nextProjects);
    setSelectedProjectId((current) => {
      if (current && nextProjects.some((project) => project.id === current)) {
        return current;
      }
      return nextProjects[0]?.id ?? null;
    });
  }

  async function refreshFindings(projectId = selectedProjectId) {
    if (!projectId) {
      setFindings([]);
      return;
    }
    const nextFindings = await listFindings(projectId, {
      ...filters,
      sort: sortState,
    });
    setFindings(nextFindings);
  }

  useEffect(() => {
    refreshProjects()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshFindings().catch((err: Error) => setError(err.message));
  }, [
    selectedProjectId,
    filters.search,
    filters.severity,
    filters.status,
    filters.source,
    sortState,
  ]);

  useEffect(() => {
    if (
      drawerMode !== "view" ||
      !activeFinding ||
      (activeDetailSurface === "drawer" && !drawerOpen)
    ) {
      setCodePreviews([]);
      setCodeLoading(false);
      return;
    }

    let cancelled = false;
    setCodeLoading(true);
    getRelatedCode(activeFinding.id)
      .then((previews) => {
        if (!cancelled) setCodePreviews(previews);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setCodeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeDetailSurface, drawerOpen, drawerMode, activeFinding?.id]);

  useEffect(() => {
    if (!drawerOpen) dragStateRef.current = null;
  }, [drawerOpen]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!dragStateRef.current) return;
      const nextWidth = dragStateRef.current.startWidth + (dragStateRef.current.startX - event.clientX);
      setDrawerWidth(
        Math.max(drawerWidthBounds.min, Math.min(drawerWidthBounds.max, nextWidth)),
      );
    }

    function handlePointerUp() {
      dragStateRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  function openCreate() {
    setActiveFinding(null);
    setFormValue(emptyPayload);
    setDrawerMode("create");
    setDetailSurface("drawer");
    setWorkspaceView("findings");
    setDrawerOpen(true);
  }

  function openFinding(finding: Finding) {
    setActiveFinding(finding);
    setFormValue(findingToPayload(finding));
    setDrawerMode("view");
    setDetailSurface("drawer");
    setWorkspaceView("findings");
    setDrawerOpen(true);
  }

  function openProject(projectId: string) {
    setSelectedProjectId(projectId);
    setDetailSurface("drawer");
    setWorkspaceView("findings");
    setDrawerOpen(false);
  }

  function toggleDetailSurface(nextSurface: DetailSurface) {
    setDetailSurface(nextSurface);
    if (drawerMode !== "view" || !activeFinding) return;
    if (nextSurface === "page") {
      setDrawerOpen(false);
      setWorkspaceView("finding-detail");
      return;
    }
    setWorkspaceView("findings");
    setDrawerOpen(true);
  }

  function handleDrawerResizeStart(event: React.PointerEvent<HTMLButtonElement>) {
    dragStateRef.current = { startX: event.clientX, startWidth: drawerWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  async function handleRequestFixReview() {
    if (!selectedProject) return;
    try {
      setError(null);
      const updated = selectedProject.fix_review_commit_hash
        ? await clearFixReview(selectedProject.id)
        : await requestFixReview(selectedProject.id);
      setProjects((current) =>
        current.map((project) => (project.id === updated.id ? updated : project)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update fix review");
    }
  }

  async function handleDeleteProject(project: Project) {
    if (!window.confirm(`Delete project \"${project.name}\" and its findings?`)) {
      return;
    }
    try {
      setDeletingProjectId(project.id);
      setError(null);
      await deleteProject(project.id);
      if (selectedProjectId === project.id) {
        setActiveFinding(null);
        setDrawerOpen(false);
        setWorkspaceView("projects");
      }
      await refreshProjects();
      await refreshFindings(selectedProjectId === project.id ? null : selectedProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete project");
    } finally {
      setDeletingProjectId(null);
    }
  }

  async function saveFinding() {
    if (!selectedProjectId) return;
    try {
      setError(null);
      if (drawerMode === "create") {
        const created = await createFinding(selectedProjectId, formValue);
        setActiveFinding(created);
        setDrawerMode("view");
      } else if (activeFinding) {
        const updated = await updateFinding(activeFinding.id, formValue);
        setActiveFinding(updated);
        setDrawerMode("view");
      }
      await refreshFindings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save finding");
    }
  }

  async function removeFinding() {
    if (!activeFinding) return;
    if (!window.confirm("Delete this finding?")) return;
    try {
      await deleteFinding(activeFinding.id);
      setDrawerOpen(false);
      setActiveFinding(null);
      await refreshFindings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete finding");
    }
  }

  async function updateStatus(status: Status) {
    if (!activeFinding) return;
    try {
      const updated = await updateFinding(activeFinding.id, { status });
      setActiveFinding(updated);
      setFormValue(findingToPayload(updated));
      await refreshFindings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update status");
    }
  }

  async function copySection(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1200);
  }

  const drawerTitle =
    drawerMode === "create"
      ? "New finding"
      : (activeFinding?.title ?? "Finding");
  const pageTitle =
    workspaceView === "projects"
      ? "Ward - Mission Control for Security Researchers"
      : workspaceView === "finding-detail"
        ? activeFinding?.title ?? selectedProject?.name ?? "finding"
        : `${selectedProject?.name ?? "findings"}`;
  const severityFilterLabel = filters.severity || "All severities";
  const statusFilterLabel = filters.status || "All statuses";
  const sourceFilterLabel = filters.source || "All sources";
  const renderSortHeader = (label: string, sortBy: FindingSortBy) => {
    const activeSort = sortRuleFor(sortState, sortBy);
    return (
      <SortHeader
        label={label}
        priority={activeSort ? activeSort.index + 1 : undefined}
        direction={activeSort?.rule.sort_dir}
        onClick={() => setSortState((current) => updateSortState(current, sortBy))}
      />
    );
  };

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside className="flex w-16 shrink-0 flex-col border-r bg-popover max-sm:hidden">
        <div className="flex h-14 items-center justify-center border-b">
          <div className="flex h-10 w-10 items-center justify-center text-primary">
            <WardLogo />
          </div>
        </div>
        <nav className="flex flex-1 flex-col items-center gap-2 p-2">
          <Button
            type="button"
            variant={workspaceView === "projects" ? "secondary" : "ghost"}
            size="icon"
            className="group/project-nav relative rounded-full"
            aria-label="Projects"
            title="Projects"
            onClick={() => setWorkspaceView("projects")}
          >
            <FolderKanban className="h-4 w-4 shrink-0" />
            <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 -translate-y-1/2 rounded-md border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-sm transition-opacity duration-150 group-hover/project-nav:opacity-100 group-focus-visible/project-nav:opacity-100">
              Projects
            </span>
          </Button>
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center justify-between gap-3 border-b bg-background px-4">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{pageTitle}</h1>
            {(workspaceView === "findings" || workspaceView === "finding-detail") && selectedProject && (
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="truncate">
                  {projectPathSummary(selectedProject)}
                </span>
                {selectedProject.paths.length > 1 && (
                  <Badge variant="muted">{selectedProject.paths.length} dirs</Badge>
                )}
                <span className="inline-flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  {selectedProject.git_branch ?? "No branch"}
                </span>
                <span>{shortCommit(selectedProject.git_commit_hash)}</span>
                <Badge variant={selectedProject.git_dirty ? "yellow" : "muted"}>
                  {selectedProject.git_dirty ? (
                    <AlertTriangle className="h-3 w-3" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  {selectedProject.git_dirty ? "dirty" : "clean"}
                </Badge>
                {fixReviewSummary(selectedProject) && (
                  <Badge variant="purple">Fix review: {fixReviewSummary(selectedProject)}</Badge>
                )}
              </div>
            )}
          </div>
          {workspaceView === "findings" && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleRequestFixReview}
                disabled={!selectedProject}
                className="rounded-full"
              >
                <GitBranch className="h-4 w-4" />
                {selectedProject?.fix_review_commit_hash ? "Clear fix review" : "Request fix review"}
              </Button>
              <Button
                variant="outline"
                onClick={openCreate}
                disabled={!selectedProject}
                onMouseEnter={() => setNewFindingHovered(true)}
                onMouseLeave={() => setNewFindingHovered(false)}
                className="rounded-full border-border bg-muted text-foreground shadow-none"
                style={
                  newFindingHovered
                    ? {
                        backgroundColor: "#eae6d7",
                        color: "#100f0f",
                      }
                    : undefined
                }
              >
                <Plus className="h-4 w-4" />
                New finding
              </Button>
            </div>
          )}
        </header>

        {workspaceView === "projects" ? (
          <ProjectsPage
            projects={projects}
            selectedProjectId={selectedProjectId}
            deletingProjectId={deletingProjectId}
            onOpenProject={openProject}
            onDeleteProject={handleDeleteProject}
          />
        ) : workspaceView === "finding-detail" && activeFinding ? (
          <>
            {error && (
              <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                <span className="min-w-0 flex-1">{error}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 rounded-full"
                  onClick={() => setError(null)}
                >
                  Dismiss
                </Button>
              </div>
            )}
            <section className="min-h-0 flex-1 overflow-auto">
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="rounded-full"
                      onClick={() => {
                        setDetailSurface("drawer");
                        setWorkspaceView("findings");
                      }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Back to findings
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => {
                        setDrawerMode("edit");
                        setDrawerOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                  </div>
                </div>
                <div className="border-y bg-popover px-5 py-4">
                  <FindingDetailBody
                    finding={activeFinding}
                    copiedKey={copiedKey}
                    onCopy={copySection}
                    onUpdateStatus={updateStatus}
                    codePreviews={codePreviews}
                    codeLoading={codeLoading}
                  />
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="border-b bg-popover px-4 py-3">
              <div className="grid gap-2 lg:grid-cols-[minmax(220px,320px)_150px_150px_150px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={filters.search}
                    onChange={(event) =>
                      setFilters({ ...filters, search: event.target.value })
                    }
                    placeholder="Search findings"
                    className="h-8 rounded-full pl-8 text-xs"
                  />
                </div>
                <Select
                  value={filters.severity || "all"}
                  onValueChange={(value) =>
                    setFilters({
                      ...filters,
                      severity: value === "all" ? "" : value,
                    })
                  }
                >
                  <SelectTrigger className="h-8 rounded-full text-xs text-muted-foreground">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <ChartNoAxesColumn className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{severityFilterLabel}</span>
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" textValue="All severities">
                      <span className="inline-flex items-center gap-2">
                        <ChartNoAxesColumn className="h-3.5 w-3.5 shrink-0" />
                        All severities
                      </span>
                    </SelectItem>
                    {severities.map((severity) => (
                      <SelectItem key={severity} value={severity}>
                        {severity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filters.status || "all"}
                  onValueChange={(value) =>
                    setFilters({
                      ...filters,
                      status: value === "all" ? "" : value,
                    })
                  }
                >
                  <SelectTrigger className="h-8 rounded-full text-xs text-muted-foreground">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <CircleDot className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{statusFilterLabel}</span>
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" textValue="All statuses">
                      <span className="inline-flex items-center gap-2">
                        <CircleDot className="h-3.5 w-3.5 shrink-0" />
                        All statuses
                      </span>
                    </SelectItem>
                    {statuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filters.source || "all"}
                  onValueChange={(value) =>
                    setFilters({
                      ...filters,
                      source: value === "all" ? "" : value,
                    })
                  }
                >
                  <SelectTrigger className="h-8 rounded-full text-xs text-muted-foreground">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <UsersRound className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{sourceFilterLabel}</span>
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" textValue="All sources">
                      <span className="inline-flex items-center gap-2">
                        <UsersRound className="h-3.5 w-3.5 shrink-0" />
                        All sources
                      </span>
                    </SelectItem>
                    {sources.map((source) => (
                      <SelectItem key={source} value={source}>
                        {source}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            {error && (
              <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                <span className="min-w-0 flex-1">{error}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 rounded-full"
                  onClick={() => setError(null)}
                >
                  Dismiss
                </Button>
              </div>
            )}

            <section className="min-h-0 flex-1 overflow-hidden">
              {loading ? (
                <div className="p-6 text-sm text-muted-foreground">
                  Loading workspace...
                </div>
              ) : !selectedProject ? (
                <div className="mx-auto max-w-xl p-8 text-sm text-muted-foreground">
                  No projects are registered. Run{" "}
                  <code className="font-mono text-foreground">ward place</code>{" "}
                  in an audit target directory.
                </div>
              ) : findings.length === 0 ? (
                <div className="mx-auto max-w-xl p-8 text-sm text-muted-foreground">
                  No findings match this workspace view. Create one from the
                  drawer or add agent output with{" "}
                  <code className="font-mono text-foreground">
                    ward finding create
                  </code>
                  .
                </div>
              ) : (
                <div className="flex h-full min-h-0 flex-col lg:flex-row">
                  <div className="min-h-0 flex-1 overflow-auto">
                    <div className="divide-y">
                      <div className="hidden grid-cols-[minmax(220px,1fr)_104px_104px_92px] gap-2 bg-popover px-4 py-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground md:grid">
                        {renderSortHeader("Finding", "created_at")}
                        {renderSortHeader("Severity", "severity")}
                        {renderSortHeader("Status", "status")}
                        {renderSortHeader("Source", "source")}
                      </div>
                      {findings.map((finding) => (
                        <button
                          key={finding.id}
                          type="button"
                          onClick={() => openFinding(finding)}
                          className={cn(
                            "grid w-full grid-cols-1 gap-2 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted md:grid-cols-[minmax(220px,1fr)_104px_104px_92px] md:items-center",
                            activeFinding?.id === finding.id &&
                              drawerOpen &&
                              drawerMode === "view" &&
                              activeDetailSurface === "drawer" &&
                              "bg-muted",
                          )}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {finding.title}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground md:hidden">
                              <SeverityBadge severity={finding.severity} />
                              <StatusBadge status={finding.status} />
                              <Badge variant={sourceVariant(finding.source)}>
                                {finding.source}
                              </Badge>
                            </div>
                          </div>
                          <SeverityBadge
                            className="hidden justify-self-center md:inline-flex"
                            severity={finding.severity}
                          />
                          <StatusBadge
                            className="hidden justify-self-center md:inline-flex"
                            status={finding.status}
                          />
                          <Badge
                            className="hidden justify-self-center md:inline-flex"
                            variant={sourceVariant(finding.source)}
                          >
                            {finding.source}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                  {drawerOpen &&
                    drawerMode === "view" &&
                    activeDetailSurface === "drawer" &&
                    activeFinding && (
                      <aside
                        className="relative flex min-h-0 shrink-0 flex-col border-t bg-popover text-popover-foreground shadow-sm lg:h-full lg:border-l lg:border-t-0"
                        style={drawerStyle}
                      >
                        <button
                          type="button"
                          aria-label="Resize drawer"
                          className="absolute left-0 top-0 z-10 hidden h-full w-2 -translate-x-1/2 cursor-col-resize bg-transparent lg:block"
                          onPointerDown={handleDrawerResizeStart}
                        >
                          <span className="sr-only">Resize drawer</span>
                        </button>
                        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
                          <button
                            type="button"
                            className="group flex min-h-9 min-w-0 items-center gap-2 text-left text-base font-semibold opacity-90 transition-opacity duration-150 hover:opacity-100"
                            onClick={() =>
                              copySection("drawer-title", activeFinding.title)
                            }
                          >
                            <span className="truncate">{drawerTitle}</span>
                            {copiedKey === "drawer-title" ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-green-700" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-60" />
                            )}
                          </button>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              type="button"
                              variant={detailSurface === "page" ? "secondary" : "ghost"}
                              size="icon"
                              className="rounded-full"
                              aria-label="Open detail page"
                              onClick={() => toggleDetailSurface("page")}
                            >
                              <Expand className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="rounded-full"
                              onClick={() => setDrawerOpen(false)}
                            >
                              <X className="h-4 w-4" />
                              <span className="sr-only">Close</span>
                            </Button>
                          </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                          <FindingDetailBody
                            finding={activeFinding}
                            copiedKey={copiedKey}
                            onCopy={copySection}
                            onUpdateStatus={updateStatus}
                            codePreviews={codePreviews}
                            codeLoading={codeLoading}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
                          <Button
                            variant="outline"
                            className="rounded-full"
                            onClick={() => setDrawerMode("edit")}
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            className="rounded-full text-red-700 hover:text-red-700"
                            onClick={removeFinding}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </aside>
                    )}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {drawerMode !== "view" && (
        <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DialogContent className="drawer-content" style={drawerStyle}>
            <DialogHeader>
              <DialogTitle>{drawerTitle}</DialogTitle>
              <DialogDescription>
                {drawerMode === "create"
                  ? "Create a structured audit finding for the selected project."
                  : "Edit finding"}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <FindingForm value={formValue} setValue={setFormValue} />
            </div>

            <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
              <Button
                variant="ghost"
                className="rounded-full"
                onClick={() => {
                  if (drawerMode === "edit" && activeFinding) {
                    setFormValue(findingToPayload(activeFinding));
                    setDrawerMode("view");
                  } else {
                    setDrawerOpen(false);
                  }
                }}
              >
                Cancel
              </Button>
              <Button className="rounded-full" onClick={saveFinding}>
                <FileText className="h-4 w-4" />
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
