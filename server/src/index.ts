import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config, resolveMediaDir } from './config.js';
import { createDb, getSetting } from './db.js';
import { mediaRoutes } from './modules/media/routes.js';
import { subtitleRoutes } from './modules/subtitle/routes.js';
import { analyzeRoutes } from './modules/analyze/routes.js';
import { aiRoutes } from './modules/ai/routes.js';
import { miscRoutes } from './modules/misc/routes.js';
import { jimakuRoutes } from './modules/jimaku/routes.js';
import { vocabRoutes } from './modules/vocab/routes.js';
import { createAniListCatalog } from './modules/catalog/client.js';
import { catalogRoutes } from './modules/catalog/routes.js';
import { createNyaaResourceProvider } from './modules/resource/nyaa.js';
import { resourceRoutes } from './modules/resource/routes.js';
import { createSubtitleSyncCoordinator } from './modules/jimaku/sync.js';
import { createMediaDirectoryWatcher } from './modules/media/watcher.js';

declare module 'fastify' {
  interface FastifyInstance { db: import('./db.js').Db }
}

export async function buildApp(opts: {
  enableMediaAutomation?: boolean;
  allowedOrigins?: string[];
  appBaseUrl?: string;
} = {}) {
  const app = Fastify({ logger: true });
  const allowedOrigins = opts.allowedOrigins ?? config.corsOrigins;
  await app.register(cors, {
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.includes(origin));
    },
  });
  app.get('/api/health', async () => ({ ok: true }));

  const db = createDb(path.join(config.dataDir, 'library.db'));
  app.decorate('db', db);
  const mediaDir = resolveMediaDir(
    config.defaultMediaDir,
    getSetting(db, 'media_dir'),
    config.mediaDirOverride,
  );
  const subtitleSync = opts.enableMediaAutomation
    ? createSubtitleSyncCoordinator({ db, log: app.log })
    : null;
  const mediaWatcher = subtitleSync
    ? createMediaDirectoryWatcher({
      db,
      mediaDir,
      onImported: (mediaIds) => subtitleSync.reconcile(mediaIds),
      log: app.log,
    })
    : null;
  await app.register(mediaRoutes, {
    db,
    mediaDir,
    onImported: subtitleSync ? (mediaIds) => subtitleSync.reconcile(mediaIds) : undefined,
  });
  await app.register(subtitleRoutes, { db });
  await app.register(analyzeRoutes, { db });
  await app.register(aiRoutes, { db });
  await app.register(miscRoutes, {
    db,
    mediaDir,
    defaultMediaDir: config.defaultMediaDir,
    mediaDirOverridden: config.mediaDirOverride != null,
  });
  await app.register(jimakuRoutes, { db });
  await app.register(vocabRoutes, { db, appBaseUrl: opts.appBaseUrl ?? config.appBaseUrl });
  const catalog = createAniListCatalog();
  await app.register(catalogRoutes, { client: catalog });
  await app.register(resourceRoutes, { catalog, resources: createNyaaResourceProvider() });
  if (subtitleSync && mediaWatcher) {
    app.addHook('onReady', async () => {
      await subtitleSync.reconcile();
      await mediaWatcher.start();
    });
    app.addHook('onClose', async () => {
      mediaWatcher.stop();
      subtitleSync.stop();
    });
  }
  return app;
}

const isMain = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');
if (isMain) {
  const app = await buildApp({ enableMediaAutomation: true });
  app.listen({ port: config.port, host: '127.0.0.1' });
}
