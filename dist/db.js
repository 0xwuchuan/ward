import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { absolutePath, expandHome } from './paths.js';
const severities = ['critical', 'high', 'medium', 'low', 'info'];
const sources = ['human', 'agent'];
const statuses = ['draft', 'valid', 'invalid', 'reported'];
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
export function initDb(db) {
    db.exec(`
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
function projectFromRow(row) {
    return {
        id: row.id,
        name: row.name,
        path: row.path,
        git_remote_url: row.git_remote_url,
        git_branch: row.git_branch,
        git_commit_hash: row.git_commit_hash,
        git_dirty: Boolean(row.git_dirty),
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
export function listProjects(db) {
    return withDb(db, (conn) => {
        const rows = conn.prepare('SELECT * FROM projects ORDER BY updated_at DESC, name ASC').all();
        return rows.map(projectFromRow);
    });
}
export function getProject(projectId, db) {
    return withDb(db, (conn) => {
        const row = conn.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        return row ? projectFromRow(row) : null;
    });
}
export function getProjectByPath(projectPath, db) {
    return withDb(db, (conn) => {
        const row = conn.prepare('SELECT * FROM projects WHERE path = ?').get(absolutePath(projectPath));
        return row ? projectFromRow(row) : null;
    });
}
export function resolveProject(identifier, cwd = process.cwd(), db) {
    return withDb(db, (conn) => {
        if (identifier) {
            const byId = conn.prepare('SELECT * FROM projects WHERE id = ?').get(identifier);
            if (byId)
                return projectFromRow(byId);
            const byPath = conn.prepare('SELECT * FROM projects WHERE path = ?').get(absolutePath(identifier));
            return byPath ? projectFromRow(byPath) : null;
        }
        const row = conn.prepare('SELECT * FROM projects WHERE path = ?').get(absolutePath(cwd));
        return row ? projectFromRow(row) : null;
    });
}
export function registerProject(options) {
    return withDb(options.db, (conn) => {
        const projectPath = absolutePath(options.path);
        const metadata = options.gitMetadata ?? {};
        const timestamp = nowIso();
        const existing = conn.prepare('SELECT * FROM projects WHERE path = ?').get(projectPath);
        if (existing) {
            const nextName = options.name?.trim() || existing.name;
            conn
                .prepare(`
          UPDATE projects
          SET name = ?,
              git_remote_url = ?,
              git_branch = ?,
              git_commit_hash = ?,
              git_dirty = ?,
              updated_at = ?
          WHERE id = ?
        `)
                .run(nextName, metadata.git_remote_url ?? null, metadata.git_branch ?? null, metadata.git_commit_hash ?? null, metadata.git_dirty ? 1 : 0, timestamp, existing.id);
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
          git_dirty, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
            .run(projectId, displayName, projectPath, metadata.git_remote_url ?? null, metadata.git_branch ?? null, metadata.git_commit_hash ?? null, metadata.git_dirty ? 1 : 0, timestamp, timestamp);
        const created = getProject(projectId, conn);
        if (!created)
            throw new WardDbError('project not found');
        return created;
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
            .prepare(`SELECT * FROM findings WHERE ${where.join(' AND ')} ORDER BY created_at DESC, title ASC`)
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