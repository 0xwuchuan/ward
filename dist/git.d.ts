export type GitMetadata = {
    git_remote_url: string | null;
    git_branch: string | null;
    git_commit_hash: string | null;
    git_dirty: boolean;
};
export declare function getGitMetadata(cwd: string): GitMetadata;
