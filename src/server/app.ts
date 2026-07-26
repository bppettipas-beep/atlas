import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './env';
import { errorHandler, notFoundHandler } from './http/errors';
import { ensureUploadDir } from './lib/uploads';
import { attachAuth } from './middleware/authenticate';
import { prisma } from './prisma';
import { activityRouter } from './routes/activity.routes';
import { authRouter } from './routes/auth.routes';
import { companiesRouter } from './routes/companies.routes';
import { invitesRouter } from './routes/invites.routes';
import { knowledgeRouter } from './routes/knowledge.routes';
import { notificationsRouter } from './routes/notifications.routes';
import { organizationRouter } from './routes/organization.routes';
import { peopleRouter } from './routes/people.routes';
import { tasksRouter } from './routes/tasks.routes';
import { uploadsRouter } from './routes/uploads.routes';

export function createApp(): Express {
  const app = express();

  // Railway terminates TLS in front of the container; without this Express
  // sees http and would refuse to set `Secure` cookies.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // The React bundle is served from this same origin, and the dev server
      // needs inline styles, so CSP is configured explicitly rather than with
      // helmet's strict defaults.
      contentSecurityPolicy: env.isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
              imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
              connectSrc: ["'self'", 'ws:', 'wss:'],
              objectSrc: ["'none'"],
              frameAncestors: ["'self'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use(compression());

  // In production the API and the app share one origin, so CORS is a no-op.
  // In development the Vite dev server lives on :5173 and needs credentials.
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${origin} is not allowed by CORS.`));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // --------------------------------- health --------------------------------
  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        status: 'ok',
        service: 'atlas',
        database: 'connected',
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        status: 'degraded',
        service: 'atlas',
        database: 'unreachable',
        message: error instanceof Error ? error.message : 'Unknown database error',
      });
    }
  });

  // -------------------------------- uploads --------------------------------
  ensureUploadDir();
  app.use(
    '/uploads',
    express.static(env.uploadDir, {
      maxAge: '7d',
      index: false,
      dotfiles: 'deny',
      setHeaders: (res) => {
        // Uploaded files are never executed as HTML.
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );

  // ---------------------------------- api ----------------------------------
  app.use('/api', attachAuth);
  app.use('/api/auth', authRouter);
  app.use('/api/companies', companiesRouter);
  app.use('/api/invites', invitesRouter);
  app.use('/api/people', peopleRouter);
  app.use('/api/organization', organizationRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/knowledge', knowledgeRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/activity', activityRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api', notFoundHandler);

  // --------------------------- built React client --------------------------
  // In production one Node service serves both the API and the SPA.
  const clientDir = path.resolve(process.cwd(), 'dist/client');
  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  } else if (env.isProduction) {
    app.get('*', (_req, res) => {
      res
        .status(500)
        .send('The React app has not been built. Run `npm run build` before starting the server.');
    });
  }

  app.use(errorHandler);
  return app;
}
