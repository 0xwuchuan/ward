import fs from 'node:fs/promises';
import path from 'node:path';
import { serve as serveNode } from '@hono/node-server';
import { Hono } from 'hono';
import { createFinding, deleteFinding, getFinding, getProject, listFindings, listProjects, updateFinding, WardDbError, } from './db.js';
import { codePreviewSchema, findingCreateSchema, findingUpdateSchema } from './schemas.js';
import { frontendDistDir } from './paths.js';
const maxCodePreviewLines = 80;
const languageBySuffix = {
    '.c': 'c',
    '.cpp': 'cpp',
    '.cs': 'csharp',
    '.css': 'css',
    '.go': 'go',
    '.html': 'html',
    '.java': 'java',
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.json': 'json',
    '.md': 'markdown',
    '.py': 'python',
    '.rs': 'rust',
    '.sol': 'solidity',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.yaml': 'yaml',
    '.yml': 'yaml',
};
const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
};
function errorStatus(error) {
    if (error instanceof WardDbError) {
        return Response.json({ detail: error.message }, { status: 422 });
    }
    throw error;
}
async function jsonBody(c) {
    try {
        return await c.req.json();
    }
    catch {
        return {};
    }
}
async function codePreview(project, ref) {
    const rawPath = String(ref.path ?? '');
    const startLine = Number(ref.start_line ?? 1);
    const requestedEnd = Number(ref.end_line ?? startLine + 24);
    const endLine = Math.min(requestedEnd, startLine + maxCodePreviewLines - 1);
    const projectPath = path.resolve(project.path);
    const target = path.resolve(projectPath, rawPath);
    const language = languageBySuffix[path.extname(target).toLowerCase()] ?? 'text';
    const preview = {
        path: rawPath,
        start_line: startLine,
        end_line: endLine,
        language,
        code: '',
        error: null,
    };
    const relative = path.relative(projectPath, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return { ...preview, error: 'File reference is outside the registered project path.' };
    }
    let content;
    try {
        const stat = await fs.stat(target);
        if (!stat.isFile())
            return { ...preview, error: 'File was not found.' };
        const buffer = await fs.readFile(target);
        content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return { ...preview, error: 'File was not found.' };
        if (error instanceof TypeError)
            return { ...preview, error: 'File is not valid UTF-8 text.' };
        return { ...preview, error: error instanceof Error ? error.message : String(error) };
    }
    const lines = content.split(/\r?\n/);
    if (lines.length > 0 && lines.at(-1) === '')
        lines.pop();
    if (lines.length === 0)
        return { ...preview, end_line: startLine, error: 'File is empty.' };
    const boundedStart = Math.max(1, Math.min(startLine, lines.length));
    const boundedEnd = Math.max(boundedStart, Math.min(endLine, lines.length));
    return codePreviewSchema.parse({
        ...preview,
        start_line: boundedStart,
        end_line: boundedEnd,
        code: lines.slice(boundedStart - 1, boundedEnd).join('\n'),
    });
}
async function staticResponse(filePath) {
    const dist = frontendDistDir();
    const target = path.resolve(dist, filePath);
    const relative = path.relative(dist, target);
    if (relative.startsWith('..') || path.isAbsolute(relative))
        return null;
    try {
        const data = await fs.readFile(target);
        const contentType = contentTypes[path.extname(target).toLowerCase()] ?? 'application/octet-stream';
        return new Response(data, { headers: { 'Content-Type': contentType } });
    }
    catch {
        return null;
    }
}
async function indexResponse() {
    const built = await staticResponse('index.html');
    if (built)
        return built;
    return new Response(`<!doctype html>
<html>
  <head><title>Ward</title></head>
  <body>
    <main style="font-family: system-ui; max-width: 720px; margin: 64px auto;">
      <h1>Ward UI has not been built</h1>
      <p>Run <code>npm --prefix frontend install</code> and <code>npm --prefix frontend run build</code>, then restart <code>ward serve</code>.</p>
    </main>
  </body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
export function createApp() {
    const app = new Hono();
    app.get('/api/health', (c) => c.json({ status: 'ok' }));
    app.get('/api/projects', (c) => c.json(listProjects()));
    app.get('/api/projects/:projectId', (c) => {
        const project = getProject(c.req.param('projectId'));
        if (!project)
            return c.json({ detail: 'project not found' }, 404);
        return c.json(project);
    });
    app.get('/api/projects/:projectId/findings', (c) => {
        const projectId = c.req.param('projectId');
        if (!getProject(projectId))
            return c.json({ detail: 'project not found' }, 404);
        try {
            return c.json(listFindings(projectId, {
                search: c.req.query('search'),
                severity: c.req.query('severity'),
                status: c.req.query('status'),
                source: c.req.query('source'),
                category: c.req.query('category'),
            }));
        }
        catch (error) {
            return errorStatus(error);
        }
    });
    app.post('/api/projects/:projectId/findings', async (c) => {
        try {
            const payload = findingCreateSchema.parse(await jsonBody(c));
            const finding = createFinding({ project_id: c.req.param('projectId'), ...payload });
            return c.json(finding, 201);
        }
        catch (error) {
            return errorStatus(error);
        }
    });
    app.get('/api/findings/:findingId', (c) => {
        const finding = getFinding(c.req.param('findingId'));
        if (!finding)
            return c.json({ detail: 'finding not found' }, 404);
        return c.json(finding);
    });
    app.get('/api/findings/:findingId/related-code', async (c) => {
        const finding = getFinding(c.req.param('findingId'));
        if (!finding)
            return c.json({ detail: 'finding not found' }, 404);
        const project = getProject(finding.project_id);
        if (!project)
            return c.json({ detail: 'project not found' }, 404);
        return c.json(await Promise.all(finding.file_refs.map((ref) => codePreview(project, ref))));
    });
    app.patch('/api/findings/:findingId', async (c) => {
        try {
            const payload = findingUpdateSchema.parse(await jsonBody(c));
            const finding = updateFinding(c.req.param('findingId'), payload);
            if (!finding)
                return c.json({ detail: 'finding not found' }, 404);
            return c.json(finding);
        }
        catch (error) {
            return errorStatus(error);
        }
    });
    app.delete('/api/findings/:findingId', (c) => {
        if (!deleteFinding(c.req.param('findingId')))
            return c.json({ detail: 'finding not found' }, 404);
        return new Response(null, { status: 204 });
    });
    app.get('/assets/*', async (c) => {
        const response = await staticResponse(c.req.path.replace(/^\//, ''));
        return response ?? c.notFound();
    });
    app.get('/', () => indexResponse());
    app.get('*', async (c) => {
        if (c.req.path.startsWith('/api/'))
            return c.json({ detail: 'not found' }, 404);
        return indexResponse();
    });
    return app;
}
export function serve(options = {}) {
    const host = options.host ?? '127.0.0.1';
    const port = options.port ?? 8765;
    console.log(`Ward serving at http://${host}:${port}`);
    return serveNode({
        fetch: createApp().fetch,
        hostname: host,
        port,
    });
}
if (import.meta.url === `file://${process.argv[1]}`) {
    serve({
        host: process.env.WARD_HOST ?? '127.0.0.1',
        port: Number(process.env.WARD_PORT ?? 8765),
    });
}
//# sourceMappingURL=server.js.map