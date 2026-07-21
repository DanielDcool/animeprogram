import os from 'node:os';
import path from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 3001),
  mediaDir: process.env.MEDIA_DIR ?? path.join(os.homedir(), 'AnimeLibrary'),
  dataDir: process.env.DATA_DIR ?? path.join(import.meta.dirname, '..', 'data'),
};
