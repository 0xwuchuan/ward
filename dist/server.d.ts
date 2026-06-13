import { Hono } from 'hono';
export declare function createApp(): Hono;
export declare function serve(options?: {
    host?: string;
    port?: number;
}): import("@hono/node-server").ServerType;
