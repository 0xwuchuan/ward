import Database from 'better-sqlite3';
import type { FileRef, FindingOut, ProjectOut } from './schemas.js';
import { absolutePath } from './paths.js';
import type { GitMetadata } from './git.js';
type Sqlite = Database.Database;
export declare class WardDbError extends Error {
    constructor(message: string);
}
export declare function nowIso(): string;
export declare function dbPath(): string;
export { absolutePath };
export declare function connect(target?: string): Sqlite;
export declare function initDb(db: Sqlite): void;
export declare function normalizeFileRefs(fileRefs?: Iterable<Record<string, unknown>> | null): FileRef[];
export declare function parseFileRefs(values?: Iterable<string> | null): FileRef[];
export declare function listProjects(db?: Sqlite): ProjectOut[];
export declare function getProject(projectId: string, db?: Sqlite): ProjectOut | null;
export declare function getProjectByPath(projectPath: string, db?: Sqlite): ProjectOut | null;
export declare function resolveProject(identifier?: string | null, cwd?: string, db?: Sqlite): ProjectOut | null;
export declare function registerProject(options: {
    path: string;
    name?: string | null;
    gitMetadata?: Partial<GitMetadata> | null;
    db?: Sqlite;
}): ProjectOut;
export declare function createFinding(options: {
    project_id: string;
    title: string;
    severity: string;
    file_refs?: Iterable<Record<string, unknown>> | null;
    category?: string;
    description?: string;
    impact?: string;
    recommendation?: string;
    source?: string;
    status?: string;
    db?: Sqlite;
}): FindingOut;
export declare function getFinding(findingId: string, db?: Sqlite): FindingOut | null;
export declare function listFindings(projectId: string, filters?: {
    search?: string | null;
    severity?: string | null;
    status?: string | null;
    source?: string | null;
    category?: string | null;
}, db?: Sqlite): FindingOut[];
export declare function updateFinding(findingId: string, values: Record<string, unknown>, db?: Sqlite): FindingOut | null;
export declare function deleteFinding(findingId: string, db?: Sqlite): boolean;
