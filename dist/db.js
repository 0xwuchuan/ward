import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { absolutePath, expandHome } from './paths.js';
const severities = ['critical', 'high', 'medium', 'low', 'info'];
const sources = ['human', 'agent'];
const statuses = ['draft', 'valid', 'invalid', 'reported'];
const findingSortBys = ['created_at', 'severity', 'status', 'source'];
const sortDirections = ['asc', 'desc'];
const fileRefPattern = /^(?<path>.+?)(?::(?<start>\d+)(?:-(?<end>\d+))?)?$/;
export class WardDbError extends Error {
    constructor(message) {
        super(message);
        this.name = 'WardDbError';
    }
}
export function nowIso() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');
}
export function dbPath() {
    const configured = process.env.WARD_DB_PATH;
    if (configured)
        return expandHome(configured);
    return path.join(os.homedir(), '.ward', 'ward.db');
}
export { absolutePath };
export function connect(target) {
    const resolved = target ? expandHome(target) : dbPath();
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const db = new Database(resolved);
    db.pragma('foreign_keys = ON');
    initDb(db);
    return db;
}
function ensureColumn(db, table, column, definition) {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    if (rows.some((row) => row.name === column))
        return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
export function initDb(db) {
    db.exec(`
    BEGIN;
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      git_remote_url TEXT,
      git_branch TEXT,
      git_commit_hash TEXT,
      git_dirty INTEGER NOT NULL DEFAULT 0,
      review_base_commit_hash TEXT,
      fix_review_commit_hash TEXT,
      fix_review_requested_at TEXT,
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

    CREATE TABLE IF NOT EXISTS project_paths (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);
    CREATE INDEX IF NOT EXISTS idx_findings_project_id ON findings(project_id);
    CREATE INDEX IF NOT EXISTS idx_findings_status ON findings(status);
    CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
    CREATE INDEX IF NOT EXISTS idx_project_paths_project_id ON project_paths(project_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_paths_path ON project_paths(path);
    COMMIT;
  `);
    ensureColumn(db, 'projects', 'review_base_commit_hash', 'TEXT');
    ensureColumn(db, 'projects', 'fix_review_commit_hash', 'TEXT');
    ensureColumn(db, 'projects', 'fix_review_requested_at', 'TEXT');
    db.exec(`
    BEGIN;
    INSERT OR IGNORE INTO project_paths (id, project_id, path, created_at)
    SELECT lower(hex(randomblob(16))), id, path, created_at FROM projects
    WHERE path IS NOT NULL AND trim(path) != '';
    COMMIT;
  `);
}
function withDb(db, fn) {
    if (db)
        return fn(db);
    const owned = connect();
    try {
        return fn(owned);
    }
    finally {
        owned.close();
    }
}
function validateChoice(field, value, choices) {
    const normalized = value.trim().toLowerCase();
    if (!choices.includes(normalized)) {
        throw new WardDbError(`${field} must be one of: ${choices.join(', ')}`);
    }
    return normalized;
}
function normalizeFileRef(ref) {
    const refPath = String(ref.path ?? '').trim();
    if (!refPath)
        throw new WardDbError('file reference path is required');
    const normalized = { path: refPath };
    const startLine = ref.start_line === '' || ref.start_line == null ? undefined : ref.start_line;
    const endLine = ref.end_line === '' || ref.end_line == null ? undefined : ref.end_line;
    if (startLine !== undefined) {
        const start = Number(startLine);
        if (!Number.isInteger(start) || start <= 0) {
            throw new WardDbError('file reference start_line must be positive');
        }
        normalized.start_line = start;
    }
    if (endLine !== undefined) {
        const end = Number(endLine);
        if (!Number.isInteger(end) || end <= 0) {
            throw new WardDbError('file reference end_line must be positive');
        }
        normalized.end_line = end;
    }
    if (normalized.start_line !== undefined &&
        normalized.end_line !== undefined &&
        normalized.end_line < normalized.start_line) {
        throw new WardDbError('file reference end_line must be greater than or equal to start_line');
    }
    return normalized;
}
export function normalizeFileRefs(fileRefs) {
    return [...(fileRefs ?? [])].map(normalizeFileRef);
}
export function parseFileRefs(values) {
    const refs = [];
    for (const raw of values ?? []) {
        const value = raw.trim();
        if (!value)
            continue;
        const match = fileRefPattern.exec(value);
        if (!match?.groups)
            throw new WardDbError(`invalid file reference: ${raw}`);
        const ref = { path: match.groups.path };
        if (match.groups.start)
            ref.start_line = Number(match.groups.start);
        if (match.groups.end)
            ref.end_line = Number(match.groups.end);
        refs.push(normalizeFileRef(ref));
    }
    return refs;
}
function decodeFileRefs(value) {
    try {
        const loaded = JSON.parse(value || '[]');
        if (!Array.isArray(loaded))
            return [];
        return loaded.filter((ref) => typeof ref === 'object' && ref !== null);
    }
    catch {
        return [];
    }
}
function projectPathsFromRow(row, conn) {
    const extras = conn
        .prepare('SELECT path FROM project_paths WHERE project_id = ? AND path != ? ORDER BY created_at ASC, path ASC')
        .all(row.id, row.path);
    return [row.path, ...extras.map((item) => item.path)];
}
function projectFromRow(row, conn) {
    return {
        id: row.id,
        name: row.name,
        path: row.path,
        paths: projectPathsFromRow(row, conn),
        git_remote_url: row.git_remote_url,
        git_branch: row.git_branch,
        git_commit_hash: row.git_commit_hash,
        git_dirty: Boolean(row.git_dirty),
        review_base_commit_hash: row.review_base_commit_hash,
        fix_review_commit_hash: row.fix_review_commit_hash,
        fix_review_requested_at: row.fix_review_requested_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
function findingFromRow(row) {
    return {
        id: row.id,
        project_id: row.project_id,
        title: row.title,
        severity: row.severity,
        file_refs: decodeFileRefs(row.file_refs),
        category: row.category,
        description: row.description,
        impact: row.impact,
        recommendation: row.recommendation,
        source: row.source,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
function getProjectRowByPath(projectPath, conn) {
    return conn
        .prepare(`
      SELECT DISTINCT projects.*
      FROM projects
      LEFT JOIN project_paths ON project_paths.project_id = projects.id
      WHERE projects.path = ? OR project_paths.path = ?
      LIMIT 1
    `)
        .get(projectPath, projectPath);
}
function ensureProjectPath(conn, projectId, candidatePath) {
    const normalized = absolutePath(candidatePath);
    const existing = getProjectRowByPath(normalized, conn);
    if (existing && existing.id !== projectId) {
        throw new WardDbError(`path is already registered to project: ${normalized}`);
    }
    const row = conn.prepare('SELECT id FROM project_paths WHERE path = ?').get(normalized);
    if (row)
        return;
    conn
        .prepare('INSERT INTO project_paths (id, project_id, path, created_at) VALUES (?, ?, ?, ?)')
        .run(randomUUID(), projectId, normalized, nowIso());
}
export function listProjectPaths(projectId, db) {
    return withDb(db, (conn) => {
        const project = getProject(projectId, conn);
        if (!project)
            throw new WardDbError('project not found');
        return project.paths;
    });
}
export function listProjects(db) {
    return withDb(db, (conn) => {
        const rows = conn.prepare('SELECT * FROM projects ORDER BY updated_at DESC, name ASC').all();
        return rows.map((row) => projectFromRow(row, conn));
    });
}
export function getProject(projectId, db) {
    return withDb(db, (conn) => {
        const row = conn.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        return row ? projectFromRow(row, conn) : null;
    });
}
export function getProjectByPath(projectPath, db) {
    return withDb(db, (conn) => {
        const row = getProjectRowByPath(absolutePath(projectPath), conn);
        return row ? projectFromRow(row, conn) : null;
    });
}
export function resolveProject(identifier, cwd = process.cwd(), db) {
    return withDb(db, (conn) => {
        if (identifier) {
            const byId = conn.prepare('SELECT * FROM projects WHERE id = ?').get(identifier);
            if (byId)
                return projectFromRow(byId, conn);
            const byPath = getProjectRowByPath(absolutePath(identifier), conn);
            return byPath ? projectFromRow(byPath, conn) : null;
        }
        const row = getProjectRowByPath(absolutePath(cwd), conn);
        return row ? projectFromRow(row, conn) : null;
    });
}
export function registerProject(options) {
    return withDb(options.db, (conn) => {
        const projectPath = absolutePath(options.path);
        const metadata = options.gitMetadata ?? {};
        const timestamp = nowIso();
        const existing = getProjectRowByPath(projectPath, conn);
        if (existing) {
            const nextName = options.name?.trim() || existing.name;
            const nextReviewBase = existing.review_base_commit_hash ?? metadata.git_commit_hash ?? null;
            conn
                .prepare(`
          UPDATE projects
          SET name = ?,
              git_remote_url = ?,
              git_branch = ?,
              git_commit_hash = ?,
              git_dirty = ?,
              review_base_commit_hash = ?,
              updated_at = ?
          WHERE id = ?
        `)
                .run(nextName, metadata.git_remote_url ?? null, metadata.git_branch ?? null, metadata.git_commit_hash ?? null, metadata.git_dirty ? 1 : 0, nextReviewBase, timestamp, existing.id);
            ensureProjectPath(conn, existing.id, projectPath);
            const updated = getProject(existing.id, conn);
            if (!updated)
                throw new WardDbError('project not found');
            return updated;
        }
        const projectId = randomUUID();
        const displayName = options.name?.trim() || path.basename(projectPath);
        conn
            .prepare(`
        INSERT INTO projects (
          id, name, path, git_remote_url, git_branch, git_commit_hash,
          git_dirty, review_base_commit_hash, fix_review_commit_hash,
          fix_review_requested_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
            .run(projectId, displayName, projectPath, metadata.git_remote_url ?? null, metadata.git_branch ?? null, metadata.git_commit_hash ?? null, metadata.git_dirty ? 1 : 0, metadata.git_commit_hash ?? null, null, null, timestamp, timestamp);
        ensureProjectPath(conn, projectId, projectPath);
        const created = getProject(projectId, conn);
        if (!created)
            throw new WardDbError('project not found');
        return created;
    });
}
export function addProjectPaths(options) {
    return withDb(options.db, (conn) => {
        const project = getProject(options.projectId, conn);
        if (!project)
            throw new WardDbError('project not found');
        const uniquePaths = [...new Set([...options.paths].map((candidate) => absolutePath(candidate)))];
        if (uniquePaths.length === 0)
            throw new WardDbError('at least one path is required');
        for (const candidate of uniquePaths) {
            ensureProjectPath(conn, project.id, candidate);
        }
        conn.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(nowIso(), project.id);
        const updated = getProject(project.id, conn);
        if (!updated)
            throw new WardDbError('project not found');
        return updated;
    });
}
export function requestFixReview(options) {
    return withDb(options.db, (conn) => {
        const project = getProject(options.projectId, conn);
        if (!project)
            throw new WardDbError('project not found');
        const metadata = options.gitMetadata ?? {};
        const nextCommit = options.commitHash?.trim() || metadata.git_commit_hash || project.git_commit_hash;
        if (!nextCommit)
            throw new WardDbError('project does not have a git commit to review');
        if (nextCommit === project.review_base_commit_hash) {
            throw new WardDbError('fix review commit must differ from the current review base commit');
        }
        conn
            .prepare(`
        UPDATE projects
        SET git_remote_url = ?,
            git_branch = ?,
            git_commit_hash = ?,
            git_dirty = ?,
            fix_review_commit_hash = ?,
            fix_review_requested_at = ?,
            updated_at = ?
        WHERE id = ?
      `)
            .run(metadata.git_remote_url ?? project.git_remote_url, metadata.git_branch ?? project.git_branch, metadata.git_commit_hash ?? project.git_commit_hash, metadata.git_dirty == null ? (project.git_dirty ? 1 : 0) : metadata.git_dirty ? 1 : 0, nextCommit, nowIso(), nowIso(), project.id);
        const updated = getProject(project.id, conn);
        if (!updated)
            throw new WardDbError('project not found');
        return updated;
    });
}
export function clearFixReview(options) {
    return withDb(options.db, (conn) => {
        const project = getProject(options.projectId, conn);
        if (!project)
            throw new WardDbError('project not found');
        conn
            .prepare(`
        UPDATE projects
        SET fix_review_commit_hash = NULL,
            fix_review_requested_at = NULL,
            updated_at = ?
        WHERE id = ?
      `)
            .run(nowIso(), project.id);
        const updated = getProject(project.id, conn);
        if (!updated)
            throw new WardDbError('project not found');
        return updated;
    });
}
export function deleteProject(projectId, db) {
    return withDb(db, (conn) => {
        const result = conn.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
        return result.changes > 0;
    });
}
export function createFinding(options) {
    return withDb(options.db, (conn) => {
        if (!getProject(options.project_id, conn))
            throw new WardDbError('project not found');
        const title = options.title.trim();
        if (!title)
            throw new WardDbError('title is required');
        const findingId = randomUUID();
        const timestamp = nowIso();
        const refs = normalizeFileRefs(options.file_refs);
        conn
            .prepare(`
        INSERT INTO findings (
          id, project_id, title, severity, file_refs, category, description,
          impact, recommendation, source, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
            .run(findingId, options.project_id, title, validateChoice('severity', options.severity, severities), JSON.stringify(refs), (options.category ?? '').trim(), (options.description ?? '').trim(), (options.impact ?? '').trim(), (options.recommendation ?? '').trim(), validateChoice('source', options.source ?? 'human', sources), validateChoice('status', options.status ?? 'draft', statuses), timestamp, timestamp);
        const created = getFinding(findingId, conn);
        if (!created)
            throw new WardDbError('finding not found');
        return created;
    });
}
export function getFinding(findingId, db) {
    return withDb(db, (conn) => {
        const row = conn.prepare('SELECT * FROM findings WHERE id = ?').get(findingId);
        return row ? findingFromRow(row) : null;
    });
}
function findingOrderExpression(sortBy, sortDir) {
    const direction = sortDir.toUpperCase();
    if (sortBy === 'created_at')
        return `created_at ${direction}`;
    if (sortBy === 'severity') {
        return `
      CASE severity
        WHEN 'critical' THEN 5
        WHEN 'high' THEN 4
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 2
        ELSE 1
      END ${direction}
    `.replace(/\n\s+/g, ' ');
    }
    if (sortBy === 'status') {
        return `
      CASE status
        WHEN 'reported' THEN 4
        WHEN 'valid' THEN 3
        WHEN 'draft' THEN 2
        ELSE 1
      END ${direction}
    `.replace(/\n\s+/g, ' ');
    }
    return `
    CASE source
      WHEN 'human' THEN 2
      ELSE 1
    END ${direction}
  `.replace(/\n\s+/g, ' ');
}
function parseSortRules(sortBy, sortDir) {
    const sortByValues = (sortBy ?? 'created_at')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    const sortDirValues = (sortDir ?? 'desc')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    return sortByValues.map((value, index) => ({
        sortBy: validateChoice('sort_by', value, findingSortBys),
        sortDir: validateChoice('sort_dir', sortDirValues[index] ?? sortDirValues[0] ?? 'desc', sortDirections),
    }));
}
function findingsOrderClause(sortBy, sortDir) {
    const seen = new Set();
    const clauses = parseSortRules(sortBy, sortDir)
        .filter((rule) => {
        if (seen.has(rule.sortBy))
            return false;
        seen.add(rule.sortBy);
        return true;
    })
        .map((rule) => findingOrderExpression(rule.sortBy, rule.sortDir));
    if (!seen.has('created_at'))
        clauses.push('created_at DESC');
    clauses.push('title ASC');
    return clauses.join(', ');
}
export function listFindings(projectId, filters = {}, db) {
    return withDb(db, (conn) => {
        const where = ['project_id = ?'];
        const params = [projectId];
        if (filters.search) {
            where.push('(lower(title) LIKE ? OR lower(category) LIKE ? OR lower(description) LIKE ? OR lower(file_refs) LIKE ?)');
            const needle = `%${filters.search.toLowerCase()}%`;
            params.push(needle, needle, needle, needle);
        }
        if (filters.severity) {
            where.push('severity = ?');
            params.push(validateChoice('severity', filters.severity, severities));
        }
        if (filters.status) {
            where.push('status = ?');
            params.push(validateChoice('status', filters.status, statuses));
        }
        if (filters.source) {
            where.push('source = ?');
            params.push(validateChoice('source', filters.source, sources));
        }
        if (filters.category) {
            where.push('category = ?');
            params.push(filters.category);
        }
        const rows = conn
            .prepare(`SELECT * FROM findings WHERE ${where.join(' AND ')} ORDER BY ${findingsOrderClause(filters.sort_by, filters.sort_dir)}`)
            .all(...params);
        return rows.map(findingFromRow);
    });
}
export function updateFinding(findingId, values, db) {
    return withDb(db, (conn) => {
        const existing = getFinding(findingId, conn);
        if (!existing)
            return null;
        const allowed = new Set([
            'title',
            'severity',
            'file_refs',
            'category',
            'description',
            'impact',
            'recommendation',
            'source',
            'status',
        ]);
        const assignments = [];
        const params = [];
        for (const [key, rawValue] of Object.entries(values)) {
            if (!allowed.has(key) || rawValue == null)
                continue;
            let value = rawValue;
            if (key === 'title') {
                value = String(rawValue).trim();
                if (!value)
                    throw new WardDbError('title is required');
            }
            else if (key === 'severity') {
                value = validateChoice('severity', String(rawValue), severities);
            }
            else if (key === 'source') {
                value = validateChoice('source', String(rawValue), sources);
            }
            else if (key === 'status') {
                value = validateChoice('status', String(rawValue), statuses);
            }
            else if (key === 'file_refs') {
                if (!Array.isArray(rawValue))
                    throw new WardDbError('file_refs must be a list');
                value = JSON.stringify(normalizeFileRefs(rawValue));
            }
            else {
                value = String(rawValue).trim();
            }
            assignments.push(`${key} = ?`);
            params.push(value);
        }
        if (assignments.length === 0)
            return existing;
        assignments.push('updated_at = ?');
        params.push(nowIso(), findingId);
        conn.prepare(`UPDATE findings SET ${assignments.join(', ')} WHERE id = ?`).run(...params);
        return getFinding(findingId, conn);
    });
}
export function deleteFinding(findingId, db) {
    return withDb(db, (conn) => {
        const result = conn.prepare('DELETE FROM findings WHERE id = ?').run(findingId);
        return result.changes > 0;
    });
}
//# sourceMappingURL=db.js.map