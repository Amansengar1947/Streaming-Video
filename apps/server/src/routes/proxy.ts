import type { FastifyPluginAsync } from 'fastify';
import { request as undiciRequest } from 'undici';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@video-player/shared';
import { assertValidProxySignature } from '../security/hmac.js';
import { validateAndParseUrl } from '../security/url-validator.js';
import { resolveAndValidateHost } from '../security/dns-resolver.js';
import { ssrfSafeAgent } from '../http/client.js';
import { isAllowedMediaContentType } from '../utils/mime.js';
import { config } from '../config.js';
import { PacedStream } from '../streams/paced-stream.js';
import { streamTracker } from '../streams/stream-tracker.js';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

export const proxyRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<TypeBoxTypeProvider>();

  server.get(
    '/api/proxy',
    {
      schema: {
        querystring: Type.Object({
          url: Type.String({ minLength: 1 }),
          expires: Type.String({ minLength: 1 }),
          sig: Type.String({ minLength: 1 }),
          pacingRate: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const { url, expires, sig, pacingRate } = request.query;

      // 1. Verify HMAC signature & expiry
      try {
        assertValidProxySignature(url, expires, sig);
      } catch (err: any) {
        return reply.status(403).send({
          code: 'AUTH_REQUIRED',
          message: 'Invalid or expired proxy signature.',
        });
      }

      // 2. Validate URL and check SSRF
      let parsedUrl: URL;
      try {
        parsedUrl = validateAndParseUrl(url);
        await resolveAndValidateHost(parsedUrl.hostname);
      } catch (err: any) {
        const status = err instanceof AppError ? err.statusCode : 400;
        return reply.status(status).send({
          code: err instanceof AppError ? err.code : 'INVALID_URL',
          message: err.message,
        });
      }

      const abortController = new AbortController();

      // If client disconnects early, abort upstream request to free bandwidth & sockets
      request.raw.on('close', () => {
        if (!request.raw.complete) {
          abortController.abort();
        }
      });

      // 3. Prepare headers to forward upstream
      const upstreamHeaders: Record<string, string> = {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 VideoPlayer/1.0',
        accept: '*/*',
      };

      if (request.headers['range']) {
        upstreamHeaders['range'] = request.headers['range'];
      }
      if (request.headers['if-range']) {
        upstreamHeaders['if-range'] = request.headers['if-range'] as string;
      }

      try {
        let currentTarget = parsedUrl;
        let upstream: any = null;

        for (let hop = 0; hop <= config.maxRedirects; hop++) {
          upstream = await undiciRequest(currentTarget.toString(), {
            dispatcher: ssrfSafeAgent,
            signal: abortController.signal,
            headers: upstreamHeaders,
          });

          if ([301, 302, 303, 307, 308].includes(upstream.statusCode)) {
            const location = upstream.headers['location'];
            upstream.body.on('error', () => {});
            await upstream.body.dump();

            if (!location || typeof location !== 'string') {
              return reply.status(502).send({
                code: 'RESOLUTION_FAILED',
                message: 'Redirect response missing Location header.',
              });
            }

            currentTarget = new URL(location, currentTarget);
            currentTarget = validateAndParseUrl(currentTarget.toString());
            await resolveAndValidateHost(currentTarget.hostname);
            continue;
          }

          break;
        }

        if (!upstream) {
          return reply.status(502).send({
            code: 'RESOLUTION_FAILED',
            message: 'Failed to fetch media stream.',
          });
        }

        // 4. Upstream error check
        if (upstream.statusCode >= 400) {
          upstream.body.on('error', () => {});
          await upstream.body.dump();
          const isAuth = upstream.statusCode === 401 || upstream.statusCode === 403;
          return reply.status(upstream.statusCode).send({
            code: isAuth ? 'AUTH_REQUIRED' : upstream.statusCode === 404 ? 'NO_MEDIA_FOUND' : 'NETWORK_ERROR',
            message: `Upstream media server returned HTTP ${upstream.statusCode}.`,
          });
        }

        // 5. Content-Type security check
        const ctHeader = upstream.headers['content-type'];
        const ctStr = (Array.isArray(ctHeader) ? ctHeader[0] : (ctHeader || '')).toLowerCase();
        const isAllowed = isAllowedMediaContentType(ctStr);
        const isExplicitNonMedia = ctStr.includes('xml') || ctStr.includes('html') || ctStr.includes('json');

        // Allow HLS segments / byte streams or if extension is media
        const isExtMedia = /\.(mp4|webm|m3u8|ts|m4s|mpd|aac|mp3|ogg|mkv|avi|flv|mov|m4v)(\?.*)?$/i.test(currentTarget.pathname);

        if (isExplicitNonMedia || (!isAllowed && !isExtMedia)) {
          upstream.body.on('error', () => {});
          upstream.body.destroy();
          return reply.status(403).send({
            code: 'BLOCKED_URL',
            message: `Content-Type '${ctHeader}' is not an allowed media format for streaming.`,
          });
        }

        // 6. Size limit check for full non-media downloads
        const clHeader = upstream.headers['content-length'];
        if (clHeader && upstream.statusCode === 200 && !isExtMedia) {
          const size = parseInt(Array.isArray(clHeader) ? clHeader[0] : clHeader, 10);
          if (!isNaN(size) && size > config.proxyMaxBytes) {
            upstream.body.on('error', () => {});
            upstream.body.destroy();
            return reply.status(413).send({
              code: 'RESOLUTION_FAILED',
              message: `Media stream exceeds maximum allowable file size limit (${config.proxyMaxBytes / (1024 * 1024)}MB).`,
            });
          }
        }

        // 7. Relay response headers safely
        for (const [key, val] of Object.entries(upstream.headers)) {
          const lowerKey = key.toLowerCase();
          if (!HOP_BY_HOP_HEADERS.has(lowerKey) && val !== undefined) {
            reply.header(key, val);
          }
        }

        // Force Content-Disposition to inline so browser plays video in player rather than downloading
        reply.header('content-disposition', 'inline');

        // Provide valid video MIME for Matroska if server returned octet-stream
        const isMkv = /\.(mkv)(\?.*)?$/i.test(currentTarget.pathname) || ctStr.includes('matroska');
        if (isMkv && (ctStr === 'application/octet-stream' || ctStr === 'binary/octet-stream' || !ctStr)) {
          reply.header('content-type', 'video/x-matroska');
        }

        // Add CORS and caching headers for the player
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
        reply.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, x-mediadeck-pacing');
        reply.header('Timing-Allow-Origin', '*');

        const isMediaStream = isExtMedia || isMkv || ctStr.startsWith('video/') || ctStr.startsWith('audio/') || ctStr.includes('matroska');

        if (isMediaStream) {
          const parsedRate = pacingRate ? Number(pacingRate) : NaN;
          const targetPacingRate = !isNaN(parsedRate) && parsedRate > 0
            ? Math.min(10 * 1024 * 1024, Math.max(256 * 1024, parsedRate))
            : Math.floor(2.5 * 1024 * 1024); // 2.5 MB/s (~20 Mbps)

          streamTracker.startSession(url, 'proxy', targetPacingRate);

          const pacedStream = new PacedStream({
            initialBurstBytes: 24 * 1024 * 1024, // 24 MB initial burst
            pacingRateBytesPerSec: targetPacingRate,
            onChunk: (bytes) => {
              streamTracker.recordBytes(url, bytes);
            },
          });

          let isCleanedUp = false;
          const cleanup = () => {
            if (isCleanedUp) return;
            isCleanedUp = true;
            streamTracker.endSession(url);
            abortController.abort();
            if (!pacedStream.destroyed) {
              try {
                pacedStream.destroy();
              } catch {}
            }
          };

          reply.raw.on('close', cleanup);
          request.raw.on('close', cleanup);
          request.raw.socket?.on('close', cleanup);
          pacedStream.on('close', cleanup);

          upstream.body.pipe(pacedStream);
          reply.header('x-mediadeck-pacing', String(targetPacingRate));
          reply.status(upstream.statusCode);
          return reply.send(pacedStream);
        }

        reply.status(upstream.statusCode);
        return reply.send(upstream.body);
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return;
        }
        request.log.error(err, 'Proxy fetch failed');
        return reply.status(502).send({
          code: 'NETWORK_ERROR',
          message: `Proxy failed to stream content: ${err.message}`,
        });
      }
    }
  );
};
