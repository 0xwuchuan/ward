import { z } from 'zod';
export const severitySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export const sourceSchema = z.enum(['human', 'agent']);
export const statusSchema = z.enum(['draft', 'valid', 'invalid', 'reported']);
export const fileRefSchema = z.object({
    path: z.string().min(1),
    start_line: z.number().int().positive().optional(),
    end_line: z.number().int().positive().optional(),
});
export const projectOutSchema = z.object({
    id: z.string(),
    name: z.string(),
    path: z.string(),
    git_remote_url: z.string().nullable(),
    git_branch: z.string().nullable(),
    git_commit_hash: z.string().nullable(),
    git_dirty: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
});
export const findingCreateSchema = z.object({
    title: z.string(),
    severity: severitySchema.default('medium'),
    file_refs: z.array(fileRefSchema).default([]),
    category: z.string().default(''),
    description: z.string().default(''),
    impact: z.string().default(''),
    recommendation: z.string().default(''),
    source: sourceSchema.default('human'),
    status: statusSchema.default('draft'),
});
export const findingUpdateSchema = z
    .object({
    title: z.string().optional(),
    severity: severitySchema.optional(),
    file_refs: z.array(fileRefSchema).optional(),
    category: z.string().optional(),
    description: z.string().optional(),
    impact: z.string().optional(),
    recommendation: z.string().optional(),
    source: sourceSchema.optional(),
    status: statusSchema.optional(),
})
    .strict();
export const findingOutSchema = findingCreateSchema.extend({
    id: z.string(),
    project_id: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
});
export const codePreviewSchema = z.object({
    path: z.string(),
    start_line: z.number().int().positive(),
    end_line: z.number().int().positive(),
    language: z.string(),
    code: z.string(),
    error: z.string().nullable(),
});
//# sourceMappingURL=schemas.js.map