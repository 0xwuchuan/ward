#!/usr/bin/env node
import { Cli } from 'incur';
export declare const cli: Cli.Cli<{
    place: {
        args: {};
        options: {
            name?: string | undefined;
        };
    };
} & {
    [x: `${string} get`]: {
        args: {
            id: string;
        };
        options: {};
    };
    [x: `${string} delete`]: {
        args: {
            id: string;
        };
        options: {};
    };
    [x: `${string} create`]: {
        args: {};
        options: {
            title: string;
            severity: "critical" | "high" | "medium" | "low" | "info";
            fileRef: string[];
            category: string;
            description: string;
            impact: string;
            recommendation: string;
            source: "human" | "agent";
            status: "draft" | "valid" | "invalid" | "reported";
            project?: string | undefined;
        };
    };
    [x: `${string} list`]: {
        args: {};
        options: {
            project?: string | undefined;
            search?: string | undefined;
            severity?: "critical" | "high" | "medium" | "low" | "info" | undefined;
            status?: "draft" | "valid" | "invalid" | "reported" | undefined;
            source?: "human" | "agent" | undefined;
            category?: string | undefined;
        };
    };
    [x: `${string} update`]: {
        args: {
            id: string;
        };
        options: {
            title?: string | undefined;
            severity?: "critical" | "high" | "medium" | "low" | "info" | undefined;
            fileRef?: string[] | undefined;
            category?: string | undefined;
            description?: string | undefined;
            impact?: string | undefined;
            recommendation?: string | undefined;
            source?: "human" | "agent" | undefined;
            status?: "draft" | "valid" | "invalid" | "reported" | undefined;
        };
    };
} & {
    serve: {
        args: {};
        options: {
            host: string;
            port: number;
        };
    };
} & {
    start: {
        args: {};
        options: {
            debug: boolean;
        };
    };
}, undefined, undefined>;
