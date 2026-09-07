import type { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { streamTracker } from '../streams/stream-tracker.js';

export const telemetryRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<TypeBoxTypeProvider>();

  server.get(
    '/api/stream/telemetry',
    {
      schema: {
        querystring: Type.Object({
          url: Type.String({ minLength: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const { url } = request.query;
      const stats = streamTracker.getStats(url);

      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Cache-Control', 'no-cache, no-store');

      if (!stats) {
        return reply.status(200).send({
          active: false,
          bytesTransferred: 0,
          speedBytesPerSec: 0,
          pacingRate: 0,
          elapsedSeconds: 0,
          mode: 'proxy' as const,
        });
      }

      return reply.status(200).send(stats);
    }
  );
};
