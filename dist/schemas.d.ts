import { z } from 'zod';
export declare const severitySchema: z.ZodEnum<{
    critical: "critical";
    high: "high";
    medium: "medium";
    low: "low";
    info: "info";
}>;
export declare const sourceSchema: z.ZodEnum<{
    human: "human";
    agent: "agent";
}>;
export declare const statusSchema: z.ZodEnum<{
    draft: "draft";
    valid: "valid";
    invalid: "invalid";
    reported: "reported";
}>;
export declare const fileRefSchema: z.ZodObject<{
    path: z.ZodString;
    start_line: z.ZodOptional<z.ZodNumber>;
    end_line: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const projectOutSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    path: z.ZodString;
    git_remote_url: z.ZodNullable<z.ZodString>;
    git_branch: z.ZodNullable<z.ZodString>;
    git_commit_hash: z.ZodNullable<z.ZodString>;
    git_dirty: z.ZodBoolean;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, z.core.$strip>;
export declare const findingCreateSchema: z.ZodObject<{
    title: z.ZodString;
    severity: z.ZodDefault<z.ZodEnum<{
        critical: "critical";
        high: "high";
        medium: "medium";
        low: "low";
        info: "info";
    }>>;
    file_refs: z.ZodDefault<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        start_line: z.ZodOptional<z.ZodNumber>;
        end_line: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>>;
    category: z.ZodDefault<z.ZodString>;
    description: z.ZodDefault<z.ZodString>;
    impact: z.ZodDefault<z.ZodString>;
    recommendation: z.ZodDefault<z.ZodString>;
    source: z.ZodDefault<z.ZodEnum<{
        human: "human";
        agent: "agent";
    }>>;
    status: z.ZodDefault<z.ZodEnum<{
        draft: "draft";
        valid: "valid";
        invalid: "invalid";
        reported: "reported";
    }>>;
}, z.core.$strip>;
export declare const findingUpdateSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    severity: z.ZodOptional<z.ZodEnum<{
        critical: "critical";
        high: "high";
        medium: "medium";
        low: "low";
        info: "info";
    }>>;
    file_refs: z.ZodOptional<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        start_line: z.ZodOptional<z.ZodNumber>;
        end_line: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>>;
    category: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    impact: z.ZodOptional<z.ZodString>;
    recommendation: z.ZodOptional<z.ZodString>;
    source: z.ZodOptional<z.ZodEnum<{
        human: "human";
        agent: "agent";
    }>>;
    status: z.ZodOptional<z.ZodEnum<{
        draft: "draft";
        valid: "valid";
        invalid: "invalid";
        reported: "reported";
    }>>;
}, z.core.$strict>;
export declare const findingOutSchema: z.ZodObject<{
    title: z.ZodString;
    severity: z.ZodDefault<z.ZodEnum<{
        critical: "critical";
        high: "high";
        medium: "medium";
        low: "low";
        info: "info";
    }>>;
    file_refs: z.ZodDefault<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        start_line: z.ZodOptional<z.ZodNumber>;
        end_line: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>>;
    category: z.ZodDefault<z.ZodString>;
    description: z.ZodDefault<z.ZodString>;
    impact: z.ZodDefault<z.ZodString>;
    recommendation: z.ZodDefault<z.ZodString>;
    source: z.ZodDefault<z.ZodEnum<{
        human: "human";
        agent: "agent";
    }>>;
    status: z.ZodDefault<z.ZodEnum<{
        draft: "draft";
        valid: "valid";
        invalid: "invalid";
        reported: "reported";
    }>>;
    id: z.ZodString;
    project_id: z.ZodString;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, z.core.$strip>;
export declare const codePreviewSchema: z.ZodObject<{
    path: z.ZodString;
    start_line: z.ZodNumber;
    end_line: z.ZodNumber;
    language: z.ZodString;
    code: z.ZodString;
    error: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type Severity = z.infer<typeof severitySchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Status = z.infer<typeof statusSchema>;
export type FileRef = z.infer<typeof fileRefSchema>;
export type ProjectOut = z.infer<typeof projectOutSchema>;
export type FindingCreate = z.infer<typeof findingCreateSchema>;
export type FindingUpdate = z.infer<typeof findingUpdateSchema>;
export type FindingOut = z.infer<typeof findingOutSchema>;
export type CodePreview = z.infer<typeof codePreviewSchema>;
