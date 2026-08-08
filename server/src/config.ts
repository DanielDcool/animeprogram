import os from 'node:os';
import path from 'node:path';

export function resolveMediaDir(
  defaultMediaDir: string,
  savedMediaDir?: string,
  mediaDirOverride?: string,
): string {
  return mediaDirOverride?.trim() || savedMediaDir?.trim() || defaultMediaDir;
}

const defaultMediaDir = path.join(os.homedir(), 'AnimeLibrary');
const mediaDirOverride = process.env.MEDIA_DIR?.trim() || undefined;
const webPort = Number(process.env.WEB_PORT ?? 5173);
const configuredCorsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT ?? 3001),
  webPort,
  appBaseUrl: process.env.APP_BASE_URL?.trim() || `http://localhost:${webPort}`,
  corsOrigins: [
    `http://localhost:${webPort}`,
    `http://127.0.0.1:${webPort}`,
    ...configuredCorsOrigins,
  ],
  defaultMediaDir,
  mediaDirOverride,
  dataDir: process.env.DATA_DIR ?? path.join(import.meta.dirname, '..', 'data'),
};
