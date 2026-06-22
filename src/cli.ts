#!/usr/bin/env node
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Cli, z } from 'incur'

import {
  addProjectPaths,
  createFinding,
  deleteFinding,
  deleteProject,
  getFinding,
  listFindings,
  parseFileRefs,
  registerProject,
  requestFixReview,
  resolveProject,
  updateFinding,
  WardDbError,
} from './db.js'
import { getGitMetadata, resolveGitCommit } from './git.js'
import { frontendDir } from './paths.js'
import { serve as serveHttp } from './server.js'
import {
  findingCreateSchema,
  findingOutSchema,
  findingSortBySchema,
  projectOutSchema,
  severitySchema,
  sortDirectionSchema,
  sourceSchema,
  statusSchema,
} from './schemas.js'

type ManagedCommand = {
  label: string
  command: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
}

function currentFile(): string {
  return fileURLToPath(import.meta.url)
}

function serverCommand(): string[] {
  if (currentFile().endsWith(path.join('dist', 'cli.js'))) return [process.execPath, path.join(path.dirname(currentFile()), 'server.js')]
  return ['npx', 'tsx', 'src/server.ts']
}

function terminate(processes: Array<[string, ChildProcess]>): void {
  for (const [, child] of processes) {
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
  }
  setTimeout(() => {
    for (const [, child] of processes) {
      if (child.exitCode === null && !child.killed) child.kill('SIGKILL')
    }
  }, 5000).unref()
}

function startCommands(commands: ManagedCommand[]): Promise<number> {
  const processes: Array<[string, ChildProcess]> = []
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (code: number) => {
      if (settled) return
      settled = true
      terminate(processes)
      resolve(code)
    }

    for (const managed of commands) {
      console.error(`[ward] starting ${managed.label}: ${managed.command.join(' ')}`)
      const child = spawn(managed.command[0]!, managed.command.slice(1), {
        cwd: managed.cwd,
        env: managed.env ?? process.env,
        stdio: 'inherit',
      })
      processes.push([managed.label, child])
      child.on('error', reject)
      child.on('exit', (code) => {
        if (!settled) {
          console.error(`[ward] ${managed.label} exited with code ${code ?? 0}; stopping remaining servers.`)
          finish(code ?? 0)
        }
      })
    }

    process.once('SIGINT', () => finish(130))
    process.once('SIGTERM', () => finish(143))
  })
}

function requireProject(identifier?: string | null) {
  const project = resolveProject(identifier, process.cwd())
  if (!project) throw new WardDbError(`project is not registered: ${identifier || process.cwd()}`)
  return project
}

const findingCli = Cli.create('finding', {
  description: 'Manage findings.',
})
  .command('create', {
    description: 'Create a finding directly in SQLite.',
    options: z.object({
      project: z.string().optional().describe('Registered project id or path. Defaults to the current directory.'),
      title: z.string().describe('Finding title.'),
      severity: severitySchema.default('medium').describe('Finding severity.'),
      fileRef: z.array(z.string()).default([]).describe('Related file reference, for example src/Vault.sol:42-51.'),
      category: z.string().default('').describe('Finding category.'),
      description: z.string().default('').describe('Technical description.'),
      impact: z.string().default('').describe('Security impact.'),
      recommendation: z.string().default('').describe('Suggested remediation.'),
      source: sourceSchema.default('human').describe('human or agent.'),
      status: statusSchema.default('draft').describe('draft, valid, invalid, or reported.'),
    }),
    alias: { project: 'p', title: 't', severity: 's', fileRef: 'f', category: 'c', description: 'd', recommendation: 'r' },
    output: findingOutSchema,
    run(c) {
      const project = requireProject(c.options.project)
      const payload = findingCreateSchema.parse({
        title: c.options.title,
        severity: c.options.severity,
        file_refs: parseFileRefs(c.options.fileRef),
        category: c.options.category,
        description: c.options.description,
        impact: c.options.impact,
        recommendation: c.options.recommendation,
        source: c.options.source,
        status: c.options.status,
      })
      return createFinding({ project_id: project.id, ...payload })
    },
  })
  .command('list', {
    description: 'List findings for a registered project.',
    options: z.object({
      project: z.string().optional().describe('Registered project id or path. Defaults to the current directory.'),
      search: z.string().optional(),
      severity: severitySchema.optional(),
      status: statusSchema.optional(),
      source: sourceSchema.optional(),
      category: z.string().optional(),
      sortBy: findingSortBySchema.default('created_at'),
      sortDir: sortDirectionSchema.default('desc'),
    }),
    alias: { project: 'p' },
    output: z.object({ findings: z.array(findingOutSchema) }),
    run(c) {
      const project = requireProject(c.options.project)
      return {
        findings: listFindings(project.id, {
          search: c.options.search,
          severity: c.options.severity,
          status: c.options.status,
          source: c.options.source,
          category: c.options.category,
          sort_by: c.options.sortBy,
          sort_dir: c.options.sortDir,
        }),
      }
    },
  })
  .command('get', {
    description: 'Get a finding by id.',
    args: z.object({ id: z.string().describe('Finding id') }),
    output: findingOutSchema.nullable(),
    run(c) {
      return getFinding(c.args.id)
    },
  })
  .command('update', {
    description: 'Update a finding by id.',
    args: z.object({ id: z.string().describe('Finding id') }),
    options: z.object({
      title: z.string().optional(),
      severity: severitySchema.optional(),
      fileRef: z.array(z.string()).optional().describe('Replacement related file references.'),
      category: z.string().optional(),
      description: z.string().optional(),
      impact: z.string().optional(),
      recommendation: z.string().optional(),
      source: sourceSchema.optional(),
      status: statusSchema.optional(),
    }),
    alias: { title: 't', severity: 's', fileRef: 'f', category: 'c', description: 'd', recommendation: 'r' },
    output: findingOutSchema.nullable(),
    run(c) {
      const values: Record<string, unknown> = { ...c.options }
      if (c.options.fileRef) {
        values.file_refs = parseFileRefs(c.options.fileRef)
        delete values.fileRef
      }
      return updateFinding(c.args.id, values)
    },
  })
  .command('delete', {
    description: 'Delete a finding by id.',
    args: z.object({ id: z.string().describe('Finding id') }),
    output: z.object({ deleted: z.boolean() }),
    run(c) {
      return { deleted: deleteFinding(c.args.id) }
    },
  })

const projectCli = Cli.create('project', {
  description: 'Manage registered projects.',
})
  .command('add-path', {
    description: 'Attach additional directories to an existing project.',
    options: z.object({
      project: z.string().optional().describe('Registered project id or path. Defaults to the current directory.'),
      path: z.array(z.string()).min(1).describe('Additional directory path. Repeat to attach more than one.'),
    }),
    alias: { project: 'p' },
    output: projectOutSchema,
    run(c) {
      const project = requireProject(c.options.project)
      return addProjectPaths({ projectId: project.id, paths: c.options.path })
    },
  })
  .command('request-fix-review', {
    description: 'Mark the current or supplied git commit as ready for fix review.',
    options: z.object({
      project: z.string().optional().describe('Registered project id or path. Defaults to the current directory.'),
      commit: z.string().optional().describe('Commit hash or rev-parse expression. Defaults to HEAD.'),
    }),
    alias: { project: 'p' },
    output: projectOutSchema,
    run(c) {
      const project = requireProject(c.options.project)
      const commit = c.options.commit ? resolveGitCommit(project.path, c.options.commit) : undefined
      if (c.options.commit && !commit) throw new WardDbError(`git commit not found: ${c.options.commit}`)
      return requestFixReview({
        projectId: project.id,
        commitHash: commit,
        gitMetadata: getGitMetadata(project.path),
      })
    },
  })
  .command('delete', {
    description: 'Delete a registered project and all of its findings.',
    options: z.object({
      project: z.string().optional().describe('Registered project id or path. Defaults to the current directory.'),
    }),
    alias: { project: 'p' },
    output: z.object({ deleted: z.boolean(), project_id: z.string() }),
    run(c) {
      const project = requireProject(c.options.project)
      return { deleted: deleteProject(project.id), project_id: project.id }
    },
  })

export const cli = Cli.create('ward', {
  description: 'Ward local audit findings workspace.',
  version: '0.1.0',
})
  .command('place', {
    description: 'Register the current directory as an audit project.',
    options: z.object({
      name: z.string().optional().describe('Custom project display name.'),
    }),
    alias: { name: 'n' },
    output: projectOutSchema,
    run(c) {
      return registerProject({
        path: process.cwd(),
        name: c.options.name,
        gitMetadata: getGitMetadata(process.cwd()),
      })
    },
  })
  .command(projectCli)
  .command(findingCli)
  .command('serve', {
    description: 'Start the local HTTP API and serve the built web UI.',
    options: z.object({
      host: z.string().default('127.0.0.1').describe('Host interface for the local service.'),
      port: z.coerce.number().int().positive().default(8765).describe('Port for the local service.'),
    }),
    outputPolicy: 'agent-only',
    run(c) {
      serveHttp(c.options)
      return new Promise(() => undefined)
    },
  })
  .command('start', {
    description: 'Start the Ward backend and Vite app together.',
    options: z.object({
      debug: z.boolean().default(false).describe('Also start the Agentation MCP server for UI annotation feedback.'),
    }),
    outputPolicy: 'agent-only',
    async run(c) {
      const commands: ManagedCommand[] = [
        { label: 'backend', command: serverCommand(), env: { ...process.env, WARD_HOST: '127.0.0.1', WARD_PORT: '8765' } },
        {
          label: 'app',
          command: ['npm', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'],
          cwd: frontendDir(),
        },
      ]
      if (c.options.debug) {
        commands.push({
          label: 'agentation mcp',
          command: ['npm', 'run', 'agentation:mcp'],
          cwd: frontendDir(),
        })
      }
      console.error('[ward] app: http://127.0.0.1:5173')
      console.error('[ward] backend: http://127.0.0.1:8765')
      if (c.options.debug) console.error('[ward] agentation mcp: http://localhost:4747')
      const code = await startCommands(commands)
      process.exitCode = code
      return { exitCode: code }
    },
  })

cli.serve()
