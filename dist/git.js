import { execFileSync } from 'node:child_process';
function git(cwd, args) {
    try {
        const value = execFileSync('git', ['-C', cwd, ...args], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return value || null;
    }
    catch {
        return null;
    }
}
export function getGitMetadata(cwd) {
    const worktree = git(cwd, ['rev-parse', '--show-toplevel']);
    if (!worktree) {
        return {
            git_remote_url: null,
            git_branch: null,
            git_commit_hash: null,
            git_dirty: false,
        };
    }
    return {
        git_remote_url: git(cwd, ['remote', 'get-url', 'origin']),
        git_branch: git(cwd, ['branch', '--show-current']),
        git_commit_hash: git(cwd, ['rev-parse', 'HEAD']),
        git_dirty: Boolean(git(cwd, ['status', '--porcelain'])),
    };
}
//# sourceMappingURL=git.js.map