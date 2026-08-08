export function checkNodeVersion(versionString: string): { ok: boolean; major: number };

export function runPrecheck(input: {
  nodeVersion: string;
  platform: string;
  checkCommand: (command: string) => boolean;
  env: Record<string, string | undefined>;
}): { skipped: boolean; failures: string[]; warnings: string[] };

export function defaultCheckCommand(command: string): boolean;
