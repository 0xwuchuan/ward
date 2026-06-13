import Database from 'better-sqlite3'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createFinding,
  getProjectByPath,
  listFindings,
  listProjects,
  registerProject,
} from '../src/db.js'
import { createApp } from '../src/server.js'

const repoRoot = path.resolve(import.meta.dirname, '..')
let tmp: string

function cli(args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  return execFileSync('npx', ['tsx', path.join(repoRoot, 'src', 'cli.ts'), ...args], {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function pythonStyleDb(file: string, projectPath: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file)
  db.exec(`
    CREATE TABLE projects (
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
    CREATE TABLE findings (
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
  `)
  db.prepare(
    `INSERT INTO projects (
      id, name, path, git_remote_url, git_branch, git_commit_hash, git_dirty, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('project-python', 'Python Project', projectPath, null, 'main', 'abc123', 1, '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00')
  db.prepare(
    `INSERT INTO findings (
      id, project_id, title, severity, file_refs, category, description, impact,
      recommendation, source, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'finding-python',
    'project-python',
    'Python-created finding',
    'high',
    '[{"path":"src/Vault.sol","start_line":42,"end_line":51}]',
    'validation',
    '',
    '',
    '',
    'agent',
    'draft',
    '2026-01-01T00:00:00+00:00',
    '2026-01-01T00:00:00+00:00',
  )
  db.close()
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ward-'))
  process.env.WARD_DB_PATH = path.join(tmp, 'ward.db')
})

afterEach(() => {
  delete process.env.WARD_DB_PATH
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('TypeScript persistence', () => {
  it('registerProject is idempotent and updates metadata', () => {
    const projectPath = path.join(tmp, 'target')
    fs.mkdirSync(projectPath)

    const first = registerProject({ path: projectPath, gitMetadata: { git_branch: 'main' } })
    const second = registerProject({
      path: projectPath,
      name: 'Custom',
      gitMetadata: {
        git_remote_url: 'git@example.com:repo.git',
        git_branch: 'audit',
        git_commit_hash: 'abc123',
        git_dirty: true,
      },
    })

    expect(first.id).toBe(second.id)
    expect(second.name).toBe('Custom')
    expect(second.path).toBe(fs.realpathSync.native(projectPath))
    expect(second.git_remote_url).toBe('git@example.com:repo.git')
    expect(second.git_branch).toBe('audit')
    expect(second.git_commit_hash).toBe('abc123')
    expect(second.git_dirty).toBe(true)
    expect(listProjects()).toHaveLength(1)
  })

  it('honors WARD_DB_PATH', () => {
    const projectPath = path.join(tmp, 'repo')
    fs.mkdirSync(projectPath)
    registerProject({ path: projectPath, name: 'Env DB' })

    expect(fs.existsSync(process.env.WARD_DB_PATH!)).toBe(true)
    expect(getProjectByPath(projectPath)?.name).toBe('Env DB')
  })

  it('reads existing Python-created SQLite databases', () => {
    const projectPath = path.join(tmp, 'legacy')
    fs.mkdirSync(projectPath)
    pythonStyleDb(process.env.WARD_DB_PATH!, fs.realpathSync.native(projectPath))

    const project = getProjectByPath(projectPath)
    expect(project?.id).toBe('project-python')
    expect(project?.git_dirty).toBe(true)
    expect(listFindings('project-python')[0]?.file_refs).toEqual([
      { path: 'src/Vault.sol', start_line: 42, end_line: 51 },
    ])
  })
})

describe('incur CLI', () => {
  it('project registration and finding creation write without a service', () => {
    const projectPath = path.join(tmp, 'repo')
    fs.mkdirSync(projectPath)

    cli(['place', '--name', 'CLI Project'], { cwd: projectPath, env: { WARD_DB_PATH: process.env.WARD_DB_PATH! } })
    cli(
      [
        'finding',
        'create',
        '--project',
        projectPath,
        '--title',
        'Unchecked transfer',
        '--severity',
        'high',
        '--file-ref',
        'src/Vault.sol:42-51',
        '--category',
        'access-control',
        '--description',
        'External call result is ignored.',
        '--impact',
        'Assets may be misaccounted.',
        '--recommendation',
        'Check the return value.',
        '--source',
        'agent',
      ],
      { env: { WARD_DB_PATH: process.env.WARD_DB_PATH! } },
    )

    const project = getProjectByPath(projectPath)
    expect(project).not.toBeNull()
    const findings = listFindings(project!.id)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      title: 'Unchecked transfer',
      source: 'agent',
      status: 'draft',
      file_refs: [{ path: 'src/Vault.sol', start_line: 42, end_line: 51 }],
    })
  })

  it('defaults to TOON and supports JSON', () => {
    const projectPath = path.join(tmp, 'repo')
    fs.mkdirSync(projectPath)

    const toon = cli(['place', '--name', 'TOON Project'], {
      cwd: projectPath,
      env: { WARD_DB_PATH: process.env.WARD_DB_PATH! },
    })
    expect(toon).toContain('name: TOON Project')
    expect(toon.trim().startsWith('{')).toBe(false)

    const json = cli(['finding', 'list', '--project', projectPath, '--json'], {
      env: { WARD_DB_PATH: process.env.WARD_DB_PATH! },
    })
    expect(JSON.parse(json)).toEqual({ findings: [] })
  })
})

describe('HTTP API', () => {
  it('uses the shared database layer and supports finding CRUD', async () => {
    const app = createApp()
    const projectPath = path.join(tmp, 'repo')
    fs.mkdirSync(projectPath)
    const project = registerProject({ path: projectPath, name: 'API Project' })

    const created = await app.request(`/api/projects/${project.id}/findings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Missing validation',
        severity: 'medium',
        file_refs: [{ path: 'src/Token.sol', start_line: 9 }],
        category: 'validation',
        description: 'Input is not constrained.',
        impact: 'Unexpected state transitions.',
        recommendation: 'Validate input bounds.',
        source: 'human',
        status: 'draft',
      }),
    })
    expect(created.status).toBe(201)
    const finding = await created.json()

    const patched = await app.request(`/api/findings/${finding.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'valid' }),
    })
    expect(patched.status).toBe(200)
    expect((await patched.json()).status).toBe('valid')

    const listed = await app.request(`/api/projects/${project.id}/findings?status=valid`)
    expect(listed.status).toBe(200)
    expect((await listed.json()).map((item: { id: string }) => item.id)).toEqual([finding.id])

    const deleted = await app.request(`/api/findings/${finding.id}`, { method: 'DELETE' })
    expect(deleted.status).toBe(204)
    expect(listFindings(project.id)).toEqual([])
  })

  it('related-code previews are scoped to the registered project path', async () => {
    const app = createApp()
    const repo = path.join(tmp, 'repo')
    const source = path.join(repo, 'src', 'Vault.sol')
    fs.mkdirSync(path.dirname(source), { recursive: true })
    fs.writeFileSync(source, 'line 1\nline 2\nline 3\n', 'utf8')
    fs.writeFileSync(path.join(tmp, 'outside.sol'), 'secret\n', 'utf8')

    const project = registerProject({ path: repo, name: 'Code Project' })
    const finding = createFinding({
      project_id: project.id,
      title: 'Related code',
      severity: 'medium',
      file_refs: [
        { path: 'src/Vault.sol', start_line: 2, end_line: 3 },
        { path: '../outside.sol', start_line: 1 },
      ],
      category: 'validation',
      source: 'agent',
      status: 'draft',
    })

    const response = await app.request(`/api/findings/${finding.id}/related-code`)
    expect(response.status).toBe(200)
    const previews = await response.json()
    expect(previews[0]).toMatchObject({
      path: 'src/Vault.sol',
      language: 'solidity',
      start_line: 2,
      end_line: 3,
      code: 'line 2\nline 3',
      error: null,
    })
    expect(previews[1].code).toBe('')
    expect(previews[1].error).toContain('outside')
  })
})
