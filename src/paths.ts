import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function expandHome(input: string): string {
  if (input === '~') return os.homedir()
  if (input.startsWith(`~${path.sep}`)) return path.join(os.homedir(), input.slice(2))
  return input
}

export function absolutePath(input: string): string {
  const resolved = path.resolve(expandHome(input))
  try {
    return fs.realpathSync.native(resolved)
  } catch {
    const parent = path.dirname(resolved)
    if (parent === resolved) return resolved
    try {
      return path.join(fs.realpathSync.native(parent), path.basename(resolved))
    } catch {
      return resolved
    }
  }
}

export function projectRoot(): string {
  const dirname = path.dirname(fileURLToPath(import.meta.url))
  const basename = path.basename(dirname)
  if (basename === 'src' || basename === 'dist') return path.dirname(dirname)
  return dirname
}

export function frontendDir(): string {
  return path.join(projectRoot(), 'frontend')
}

export function frontendDistDir(): string {
  return path.join(frontendDir(), 'dist')
}
