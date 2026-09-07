import type { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { LRUCache } from 'lru-cache';
import type { ResolvedMedia, ResolveErrorResponse } from '@video-player/shared';
import { AppError } from '@video-player/shared';
import { resolverChain } from '../resolvers/index.js';
import { config } from '../config.js';

// In-memory LRU cache for resolution results
const resolutionCache = new LRUCache<string, ResolvedMedia>({
  max: config.cacheMaxEntries,
  ttl: config.cacheTtlMs,
});

export const resolveRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<TypeBoxTypeProvider>();

  server.post(
    '/api/resolve',
    {
      schema: {
        body: Type.Object({
          url: Type.String({ minLength: 1, maxLength: 2048 }),
        }),
      },
    },
    async (request, reply) => {
      const { url } = request.body;
      const normalizedUrl = url.trim();

      // Check cache first
      const cached = resolutionCache.get(normalizedUrl);
      if (cached) {
        request.log.info({ url: normalizedUrl }, 'Serving resolve from cache');
        return reply.status(200).send(cached);
      }

      try {
        request.log.info({ url: normalizedUrl }, 'Resolving URL');
        const resolved = await resolverChain.resolve(normalizedUrl);

        // Store in cache
        resolutionCache.set(normalizedUrl, resolved);

        return reply.status(200).send(resolved);
      } catch (err: any) {
        if (err instanceof AppError) {
          request.log.warn({ url: normalizedUrl, code: err.code, detail: err.detail }, 'Resolve AppError');
          const errorBody: ResolveErrorResponse = {
            code: err.code,
            message: err.message,
            detail: config.nodeEnv === 'development' ? err.detail : undefined,
          };
          return reply.status(err.statusCode).send(errorBody);
        }

        request.log.error(err, 'Unhandled error during URL resolution');
        const errorBody: ResolveErrorResponse = {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected internal error occurred while analyzing the URL.',
          detail: config.nodeEnv === 'development' ? err.message : undefined,
        };
        return reply.status(500).send(errorBody);
      }
    }
  );
};
