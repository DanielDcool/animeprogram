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

export const config = {
  port: Number(process.env.PORT ?? 3001),
  defaultMediaDir,
  mediaDirOverride,
  dataDir: process.env.DATA_DIR ?? path.join(import.meta.dirname, '..', 'data'),
};
