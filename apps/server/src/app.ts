import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { resolveRoutes } from './routes/resolve.js';
import { proxyRoutes } from './routes/proxy.js';
import { remuxRoutes } from './routes/remux.js';
import { browserProxyRoutes } from './routes/browser-proxy.js';
import { telemetryRoutes } from './routes/telemetry.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.nodeEnv === 'test'
        ? false
        : {
            level: 'info',
            transport:
              config.nodeEnv === 'development'
                ? {
                    target: 'pino-pretty',
                    options: {
                      translateTime: 'HH:MM:ss Z',
                      ignore: 'pid,hostname',
                    },
                  }
                : undefined,
          },
  });

  // CORS setup
  await app.register(cors, {
    origin: (origin, cb) => {
      // In development or personal use, allow frontend origin or no-origin (curl/direct)
      if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        cb(null, true);
        return;
      }
      cb(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Range', 'Authorization', 'Accept'],
    exposedHeaders: ['Content-Range', 'Content-Length', 'Accept-Ranges'],
  });

  // Support form-urlencoded, multipart, and text payloads for browser proxy form submissions
  app.addContentTypeParser(
    ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'],
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    }
  );

  // Rate Limiting: High throughput for media proxy & browser (1200/min), standard for resolve (60/min)
  await app.register(rateLimit, {
    max: (req) => {
      if (req.url.startsWith('/api/proxy') || req.url.startsWith('/api/stream') || req.url.startsWith('/api/browser')) return 1200;
      if (req.url.startsWith('/api/health')) return 600;
      return config.resolveRateLimitMax;
    },
    timeWindow: config.rateLimitWindowMs,
  });

  // Register API routes
  await app.register(healthRoutes);
  await app.register(resolveRoutes);
  await app.register(proxyRoutes);
  await app.register(remuxRoutes);
  await app.register(browserProxyRoutes);
  await app.register(telemetryRoutes);

  return app;
}
