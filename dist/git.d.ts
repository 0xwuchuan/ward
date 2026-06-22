export type GitMetadata = {
    git_remote_url: string | null;
    git_branch: string | null;
    git_commit_hash: string | null;
    git_dirty: boolean;
};
export declare function resolveGitCommit(cwd: string, ref?: string): string | null;
export declare function getGitMetadata(cwd: string): GitMetadata;
