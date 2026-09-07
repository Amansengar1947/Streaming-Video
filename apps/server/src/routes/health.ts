import type { FastifyPluginAsync } from 'fastify';
import type { HealthResponse } from '@video-player/shared';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: HealthResponse }>('/api/health', async (_request, _reply) => {
    return {
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  });
};
