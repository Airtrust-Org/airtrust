// Worker configuration types for Cloudflare Workers

declare module 'worker-configuration' {
  export interface Env {
    DB: D1Database;
    [key: string]: any;
  }
}

export {};
