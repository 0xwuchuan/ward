import { useEffect, useState, type JSX, type KeyboardEvent } from "react";
import {
  AlertTriangle,
  ChartNoAxesColumn,
  Check,
  CheckCircle2,
  CircleDot,
  Copy,
  FileText,
  FolderKanban,
  GitBranch,
  Pencil,
  Plus,
  Search,
  Trash2,
  UsersRound
} from "lucide-react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Textarea } from "./components/ui/textarea";
import { createFinding, deleteFinding, getRelatedCode, listFindings, listProjects, updateFinding } from "./lib/api";
import { cn } from "./lib/utils";
import type { CodePreview, FileRef, Finding, FindingPayload, Project, Severity, Source, Status } from "./types";

const severities: Severity[] = ["critical", "high", "medium", "low", "info"];
const statuses: Status[] = ["draft", "valid", "invalid", "reported"];
const sources: Source[] = ["human", "agent"];

type DrawerMode = "view" | "edit" | "create";
type WorkspaceView = "findings" | "projects";

type Filters = {
  search: string;
  severity: string;
  status: string;
  source: string;
};

const emptyPayload: FindingPayload = {
  title: "",
  severity: "medium",
  file_refs: [],
  category: "",
  description: "",
  impact: "",
  recommendation: "",
  source: "human",
  status: "draft"
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
  "while"
]);
const tokenPattern = /(\/\/.*|#.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;

function fileRefToText(ref: FileRef) {
  if (ref.start_line && ref.end_line) return `${ref.path}:${ref.start_line}-${ref.end_line}`;
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
        ...(match[3] ? { end_line: Number(match[3]) } : {})
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

function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <Badge className={className} variant={severityVariant(severity)}>
      {severity}
    </Badge>
  );
}

function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <Badge className={className} variant={statusVariant(status)}>
      {status}
    </Badge>
  );
}

function WardMark() {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label="Ward" className="group/wardmark h-8 w-8 overflow-visible">
      <g stroke="currentColor" strokeLinejoin="round" strokeWidth="2.25">
        <path fill="#3aa99f" d="M19 7h10l5 6-7 7h-6l-7-7 5-6Z" />
        <path
          className="origin-center transition-transform duration-200 ease-out group-hover/wardmark:-translate-x-0.5 group-hover/wardmark:-translate-y-0.5"
          fill="#f4c542"
          d="M5 16h15l-5 9-9 1-6-8 5-2Z"
        />
        <path
          className="origin-center transition-transform duration-200 ease-out group-hover/wardmark:translate-x-0.5 group-hover/wardmark:-translate-y-0.5"
          fill="#f4c542"
          d="M43 16H28l5 9 9 1 6-8-5-2Z"
        />
        <path fill="#2f2419" d="M20 23h8l5 19-9 5-9-5 5-19Z" />
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
      parts.push(<span key={`${index}-plain`}>{line.slice(cursor, index)}</span>);
    }

    let className = "text-foreground";
    if (token.startsWith("//") || token.startsWith("#")) {
      className = "text-muted-foreground";
    } else if (token.startsWith("\"") || token.startsWith("'") || token.startsWith("`")) {
      className = "text-green-700";
    } else if (/^\d/.test(token)) {
      className = "text-cyan-700";
    } else if (codeKeywords.has(token)) {
      className = "font-semibold text-purple-700";
    }

    parts.push(
      <span key={`${index}-${token}`} className={className}>
        {token}
      </span>
    );
    cursor = index + token.length;
  }

  if (cursor < line.length) {
    parts.push(<span key="tail">{line.slice(cursor)}</span>);
  }
  return parts.length ? parts : " ";
}

function CopyAffordance({ label, copied }: { label: string; copied: boolean }) {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/copy:opacity-70 group-focus-visible/copy:opacity-70">
      {copied ? <Check className="h-3.5 w-3.5 text-green-700 opacity-100" /> : <Copy className="h-3.5 w-3.5" />}
      <span className="sr-only">Copy {label}</span>
    </span>
  );
}

function FieldBlock({
  label,
  value,
  copyKey,
  copiedKey,
  onCopy,
  multiline = false,
  valueClassName
}: {
  label: string;
  value: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
  multiline?: boolean;
  valueClassName?: string;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onCopy(copyKey, value);
    }
  }

  return (
    <section
      role="button"
      tabIndex={0}
      className="group/copy cursor-copy border-t py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onCopy(copyKey, value)}
      onKeyDown={handleKeyDown}
    >
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</h3>
        <CopyAffordance label={label} copied={copiedKey === copyKey} />
      </div>
      <p className={cn("text-sm leading-6 text-foreground", multiline && "whitespace-pre-wrap", valueClassName)}>{value || "Not provided"}</p>
    </section>
  );
}

function MetadataCopyItem({
  label,
  value,
  copyKey,
  copiedKey,
  onCopy,
  valueClassName
}: {
  label: string;
  value: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
  valueClassName?: string;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onCopy(copyKey, value);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className="group/copy min-w-0 cursor-copy outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onCopy(copyKey, value)}
      onKeyDown={handleKeyDown}
    >
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</h3>
        <CopyAffordance label={label} copied={copiedKey === copyKey} />
      </div>
      <p className={valueClassName}>{value || "Not provided"}</p>
    </div>
  );
}

function FindingMetadataRow({
  fileRefs,
  category,
  copiedKey,
  onCopy
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

function CodePreviewBlocks({ previews, loading }: { previews: CodePreview[]; loading: boolean }) {
  if (loading) {
    return (
      <section className="border-t py-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-normal text-muted-foreground">Related code</h3>
        <p className="text-sm text-muted-foreground">Loading code previews...</p>
      </section>
    );
  }

  if (previews.length === 0) {
    return null;
  }

  return (
    <section className="border-t py-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-normal text-muted-foreground">Related code</h3>
      <div className="space-y-3">
        {previews.map((preview) => {
          const lines = preview.code.split("\n");
          return (
            <div key={`${preview.path}:${preview.start_line}`} className="overflow-hidden rounded-md border bg-background">
              <div className="flex items-center justify-between gap-3 border-b bg-muted px-3 py-2">
                <div className="min-w-0 truncate font-mono text-xs text-foreground">
                  {preview.path}:{preview.start_line}-{preview.end_line}
                </div>
                <Badge variant="muted">{preview.language}</Badge>
              </div>
              {preview.error ? (
                <div className="px-3 py-3 text-sm text-muted-foreground">{preview.error}</div>
              ) : (
                <pre className="overflow-x-auto p-3 text-xs leading-5">
                  <code>
                    {lines.map((line, index) => (
                      <div key={index} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3">
                        <span className="select-none text-right text-muted-foreground">{preview.start_line + index}</span>
                        <span className="whitespace-pre">{highlightLine(line)}</span>
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
  setValue
}: {
  value: FindingPayload;
  setValue: (next: FindingPayload) => void;
}) {
  const setField = <K extends keyof FindingPayload>(key: K, next: FindingPayload[K]) => {
    setValue({ ...value, [key]: next });
  };

  return (
    <div className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Title</span>
        <Input value={value.title} onChange={(event) => setField("title", event.target.value)} autoFocus />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Severity</span>
          <Select value={value.severity} onValueChange={(next: Severity) => setField("severity", next)}>
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
          <span className="text-xs font-medium text-muted-foreground">Status</span>
          <Select value={value.status} onValueChange={(next: Status) => setField("status", next)}>
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
          <span className="text-xs font-medium text-muted-foreground">Source</span>
          <Select value={value.source} onValueChange={(next: Source) => setField("source", next)}>
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
          <span className="text-xs font-medium text-muted-foreground">Category</span>
          <Input value={value.category} onChange={(event) => setField("category", event.target.value)} />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">File references</span>
        <Textarea
          value={value.file_refs.map(fileRefToText).join("\n")}
          onChange={(event) => setField("file_refs", parseFileRefs(event.target.value))}
          placeholder="src/Vault.sol:42-51"
          className="min-h-[72px]"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Description</span>
        <Textarea value={value.description} onChange={(event) => setField("description", event.target.value)} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Impact</span>
        <Textarea value={value.impact} onChange={(event) => setField("impact", event.target.value)} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Recommendation</span>
        <Textarea value={value.recommendation} onChange={(event) => setField("recommendation", event.target.value)} />
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
    status: finding.status
  };
}

function ProjectsPage({
  projects,
  selectedProjectId,
  onOpenProject
}: {
  projects: Project[];
  selectedProjectId: string | null;
  onOpenProject: (projectId: string) => void;
}) {
  return (
    <section className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-5">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Projects</h2>
            <p className="text-sm text-muted-foreground">Registered audit workspaces</p>
          </div>
          <Badge variant="muted">{projects.length} total</Badge>
        </div>
        {projects.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Register a project from a repository with <code className="font-mono text-foreground">ward place</code>.
          </div>
        ) : (
          <div className="divide-y overflow-hidden rounded-md border bg-background">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => onOpenProject(project.id)}
                className={cn(
                  "grid w-full grid-cols-1 gap-2 px-4 py-3 text-left transition-colors hover:bg-muted md:grid-cols-[minmax(180px,1fr)_minmax(220px,1.4fr)_120px_120px] md:items-center",
                  selectedProjectId === project.id && "bg-accent"
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{project.name}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground md:hidden">{shortPath(project.path)}</div>
                </div>
                <span className="hidden truncate font-mono text-xs text-muted-foreground md:block">{project.path}</span>
                <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                  <GitBranch className="h-3 w-3 shrink-0" />
                  <span className="truncate">{project.git_branch ?? "No branch"}</span>
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant={project.git_dirty ? "yellow" : "muted"}>
                    {project.git_dirty ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                    {project.git_dirty ? "dirty" : "clean"}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">{shortCommit(project.git_commit_hash)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [filters, setFilters] = useState<Filters>({ search: "", severity: "", status: "", source: "" });
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("findings");
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

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  async function refreshProjects() {
    const nextProjects = await listProjects();
    setProjects(nextProjects);
    setSelectedProjectId((current) => current ?? nextProjects[0]?.id ?? null);
  }

  async function refreshFindings(projectId = selectedProjectId) {
    if (!projectId) {
      setFindings([]);
      return;
    }
    const nextFindings = await listFindings(projectId, filters);
    setFindings(nextFindings);
  }

  useEffect(() => {
    refreshProjects()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshFindings().catch((err: Error) => setError(err.message));
  }, [selectedProjectId, filters.search, filters.severity, filters.status, filters.source]);

  useEffect(() => {
    if (!drawerOpen || drawerMode !== "view" || !activeFinding) {
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
  }, [drawerOpen, drawerMode, activeFinding?.id]);

  function openCreate() {
    setActiveFinding(null);
    setFormValue(emptyPayload);
    setDrawerMode("create");
    setDrawerOpen(true);
  }

  function openFinding(finding: Finding) {
    setActiveFinding(finding);
    setFormValue(findingToPayload(finding));
    setDrawerMode("view");
    setDrawerOpen(true);
  }

  function openProject(projectId: string) {
    setSelectedProjectId(projectId);
    setWorkspaceView("findings");
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

  const drawerTitle = drawerMode === "create" ? "New finding" : activeFinding?.title ?? "Finding";
  const pageTitle = workspaceView === "projects" ? "Ward - Mission Control for Security Researchers" : selectedProject?.name ?? "Findings";
  const severityFilterLabel = filters.severity || "All severities";
  const statusFilterLabel = filters.status || "All statuses";
  const sourceFilterLabel = filters.source || "All sources";

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside className="flex w-16 shrink-0 flex-col border-r bg-popover max-sm:hidden">
        <div className="flex h-14 items-center justify-center border-b">
          <div className="flex h-10 w-10 items-center justify-center text-primary">
            <WardMark />
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
            {workspaceView === "findings" && selectedProject && (
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="truncate">{shortPath(selectedProject.path)}</span>
                <span className="inline-flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  {selectedProject.git_branch ?? "No branch"}
                </span>
                <span>{shortCommit(selectedProject.git_commit_hash)}</span>
                <Badge variant={selectedProject.git_dirty ? "yellow" : "muted"}>
                  {selectedProject.git_dirty ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                  {selectedProject.git_dirty ? "dirty" : "clean"}
                </Badge>
              </div>
            )}
          </div>
          {workspaceView === "findings" && (
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
                      color: "#100f0f"
                    }
                  : undefined
              }
            >
              <Plus className="h-4 w-4" />
              New finding
            </Button>
          )}
        </header>

        {workspaceView === "projects" ? (
          <ProjectsPage projects={projects} selectedProjectId={selectedProjectId} onOpenProject={openProject} />
        ) : (
          <>
	            <section className="border-b bg-popover px-4 py-3">
	              <div className="grid gap-2 lg:grid-cols-[minmax(220px,320px)_150px_150px_150px]">
	                <div className="relative">
	                  <Search className="pointer-events-none absolute left-3 top-2 h-3.5 w-3.5 text-muted-foreground" />
	                  <Input
	                    value={filters.search}
	                    onChange={(event) => setFilters({ ...filters, search: event.target.value })}
	                    placeholder="Search findings"
	                    className="h-8 rounded-full pl-8 text-xs"
	                  />
	                </div>
	                <Select
	                  value={filters.severity || "all"}
	                  onValueChange={(value) => setFilters({ ...filters, severity: value === "all" ? "" : value })}
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
	                  onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? "" : value })}
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
	                  onValueChange={(value) => setFilters({ ...filters, source: value === "all" ? "" : value })}
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
              <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {error}
                <Button variant="ghost" size="sm" className="ml-2 h-7 rounded-full" onClick={() => setError(null)}>
                  Dismiss
                </Button>
              </div>
            )}

            <section className="min-h-0 flex-1 overflow-auto">
              {loading ? (
                <div className="p-6 text-sm text-muted-foreground">Loading workspace...</div>
              ) : !selectedProject ? (
                <div className="mx-auto max-w-xl p-8 text-sm text-muted-foreground">
                  No projects are registered. Run <code className="font-mono text-foreground">ward place</code> in an audit target directory.
                </div>
              ) : findings.length === 0 ? (
                <div className="mx-auto max-w-xl p-8 text-sm text-muted-foreground">
                  No findings match this workspace view. Create one from the drawer or add agent output with{" "}
                  <code className="font-mono text-foreground">ward finding create</code>.
                </div>
              ) : (
                <div className="divide-y">
                  <div className="hidden grid-cols-[minmax(220px,1fr)_104px_104px_92px_minmax(160px,240px)] gap-2 bg-popover px-4 py-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground md:grid">
                    <span>Finding</span>
                    <span className="text-center">Severity</span>
                    <span className="text-center">Status</span>
                    <span className="text-center">Source</span>
                    <span>File</span>
                  </div>
                  {findings.map((finding) => (
                    <button
                      key={finding.id}
                      type="button"
                      onClick={() => openFinding(finding)}
                      className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted md:grid-cols-[minmax(220px,1fr)_104px_104px_92px_minmax(160px,240px)] md:items-center"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{finding.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground md:hidden">
                          <SeverityBadge severity={finding.severity} />
                          <StatusBadge status={finding.status} />
                          <Badge variant={sourceVariant(finding.source)}>{finding.source}</Badge>
                        </div>
                      </div>
                      <SeverityBadge className="hidden justify-self-center md:inline-flex" severity={finding.severity} />
                      <StatusBadge className="hidden justify-self-center md:inline-flex" status={finding.status} />
                      <Badge className="hidden justify-self-center md:inline-flex" variant={sourceVariant(finding.source)}>
                        {finding.source}
                      </Badge>
                      <span className="hidden truncate font-mono text-xs text-muted-foreground md:block">
                        {finding.file_refs[0] ? fileRefToText(finding.file_refs[0]) : "no file ref"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent className="drawer-content">
          <DialogHeader>
            {drawerMode === "view" && activeFinding ? (
              <DialogTitle asChild>
                <button
                  type="button"
                  className="group flex max-w-full items-center gap-2 pr-8 text-left text-base font-semibold opacity-90 transition-opacity duration-150 hover:opacity-100"
                  onClick={() => copySection("drawer-title", activeFinding.title)}
                >
                  <span className="truncate">{drawerTitle}</span>
                  {copiedKey === "drawer-title" ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-green-700" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-60" />
                  )}
                </button>
              </DialogTitle>
            ) : (
              <DialogTitle>{drawerTitle}</DialogTitle>
            )}
            {drawerMode !== "view" && (
              <DialogDescription>{drawerMode === "create" ? "Create a structured audit finding for the selected project." : "Edit finding"}</DialogDescription>
            )}
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {drawerMode === "view" && activeFinding ? (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={activeFinding.severity} />
                  <StatusBadge status={activeFinding.status} />
                  <Badge variant={sourceVariant(activeFinding.source)}>{activeFinding.source}</Badge>
                  <div className="ml-auto w-36">
                    <Select value={activeFinding.status} onValueChange={(value: Status) => updateStatus(value)}>
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
                  fileRefs={activeFinding.file_refs.map(fileRefToText).join("\n")}
                  category={activeFinding.category}
                  copiedKey={copiedKey}
                  onCopy={copySection}
                />
                <FieldBlock
                  label="Description"
                  value={activeFinding.description}
                  copyKey="description"
                  copiedKey={copiedKey}
                  onCopy={copySection}
                  multiline
                />
                <FieldBlock label="Impact" value={activeFinding.impact} copyKey="impact" copiedKey={copiedKey} onCopy={copySection} multiline />
                <FieldBlock
                  label="Recommendation"
                  value={activeFinding.recommendation}
                  copyKey="recommendation"
                  copiedKey={copiedKey}
                  onCopy={copySection}
                  multiline
                />
                <CodePreviewBlocks previews={codePreviews} loading={codeLoading} />
              </>
            ) : (
              <FindingForm value={formValue} setValue={setFormValue} />
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
            {drawerMode === "view" && activeFinding ? (
              <>
                <Button variant="outline" className="rounded-full" onClick={() => setDrawerMode("edit")}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                <Button variant="ghost" className="rounded-full text-red-700 hover:text-red-700" onClick={removeFinding}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
