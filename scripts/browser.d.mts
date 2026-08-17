export function resolveWebUrl(env: Record<string, string | undefined>): string;

export function browserOpenCommand(
  platform: string,
  url: string,
): { command: string; args: string[] };

export function waitForHttpOk(
  url: string,
  options: {
    timeoutMs: number;
    intervalMs: number;
    fetchImpl: (url: string, init?: RequestInit) => Promise<unknown>;
  },
): Promise<boolean>;
