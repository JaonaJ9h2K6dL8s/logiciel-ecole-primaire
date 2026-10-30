import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { apiRouter } from './routes';
import { errorHandler } from './shared/errors';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  // CORS restrictif : uniquement l'origine frontend configurée.
  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1', apiRouter);

  app.use(errorHandler);

  return app;
}
