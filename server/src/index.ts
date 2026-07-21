import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { createDb } from './db.js';
import { mediaRoutes } from './modules/media/routes.js';
import { subtitleRoutes } from './modules/subtitle/routes.js';
import { analyzeRoutes } from './modules/analyze/routes.js';
import { aiRoutes } from './modules/ai/routes.js';
import { miscRoutes } from './modules/misc/routes.js';
import { jimakuRoutes } from './modules/jimaku/routes.js';
import { vocabRoutes } from './modules/vocab/routes.js';

declare module 'fastify' {
  interface FastifyInstance { db: import('./db.js').Db }
}

export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  app.get('/api/health', async () => ({ ok: true }));

  const db = createDb(path.join(config.dataDir, 'library.db'));
  app.decorate('db', db);
  await app.register(mediaRoutes, { db, mediaDir: config.mediaDir });
  await app.register(subtitleRoutes, { db });
  await app.register(analyzeRoutes, { db });
  await app.register(aiRoutes, { db });
  await app.register(miscRoutes, { db });
  await app.register(jimakuRoutes, { db });
  await app.register(vocabRoutes, { db });
  return app;
}

const isMain = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');
if (isMain) {
  const app = await buildApp();
  app.listen({ port: config.port, host: '127.0.0.1' });
}
