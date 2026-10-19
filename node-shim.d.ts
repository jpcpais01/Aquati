// Minimal Node typings for vite.config.ts (no @types/node in this project).
declare module 'node:child_process' {
  export function execSync(cmd: string): { toString(): string };
}
declare const process: { env: Record<string, string | undefined> };
