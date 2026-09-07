import type { FastifyPluginAsync } from 'fastify';
import { spawn } from 'node:child_process';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@video-player/shared';
import { assertValidProxySignature } from '../security/hmac.js';
import { validateAndParseUrl } from '../security/url-validator.js';
import { resolveAndValidateHost } from '../security/dns-resolver.js';
import { PacedStream } from '../streams/paced-stream.js';
import { streamTracker } from '../streams/stream-tracker.js';
import { config } from '../config.js';

export const remuxRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<TypeBoxTypeProvider>();

  server.get(
    '/api/stream/remux',
    {
      schema: {
        querystring: Type.Object({
          url: Type.String({ minLength: 1 }),
          expires: Type.String({ minLength: 1 }),
          sig: Type.String({ minLength: 1 }),
          startTime: Type.Optional(Type.String()),
          pacingRate: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const { url, expires, sig, startTime, pacingRate } = request.query;

      // 1. Verify HMAC proxy signature
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

      // 3. Prepare FFmpeg args for zero-re-encode stream copy (-c copy) to fragmented MP4
      const ffmpegArgs: string[] = ['-loglevel', 'info'];

      // Fast seek before input for instant keyframe jump
      if (startTime && !isNaN(Number(startTime)) && Number(startTime) > 0) {
        ffmpegArgs.push('-ss', String(startTime));
      }

      // Network & probe optimizations for near-instant seek response
      ffmpegArgs.push(
        '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        '-protocol_whitelist', 'http,https,tcp,tls',
        '-probesize', '1000000',
        '-analyzeduration', '1000000',
        '-fflags', '+nobuffer+fastseek',
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '2'
      );

      if (config.warpProxyUrl) {
        ffmpegArgs.push('-http_proxy', config.warpProxyUrl);
      }

      ffmpegArgs.push(
        '-i', parsedUrl.toString(),
        '-c', 'copy',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        'pipe:1'
      );

      let ffmpegProc: any = null;
      try {
        ffmpegProc = spawn('ffmpeg', ffmpegArgs);
      } catch (err: any) {
        request.log.error({ err }, 'Failed to spawn ffmpeg remux process');
        return reply.status(500).send({
          code: 'INTERNAL_ERROR',
          message: `Failed to initialize media remuxing: ${err.message}`,
        });
      }

      // 4. Create PacedStream to shape bandwidth:
      // Burst 24 MB immediately for instant startup/seeking, then pace at 2.5 MB/s (~20 Mbps) steady-state.
      const parsedRate = pacingRate ? Number(pacingRate) : NaN;
      const targetPacingRate = !isNaN(parsedRate) && parsedRate > 0
        ? Math.min(10 * 1024 * 1024, Math.max(256 * 1024, parsedRate))
        : Math.floor(2.5 * 1024 * 1024); // 2.5 MB/s (~20 Mbps)

      streamTracker.startSession(url, 'remux', targetPacingRate);

      const pacedStream = new PacedStream({
        initialBurstBytes: 24 * 1024 * 1024, // 24 MB burst
        pacingRateBytesPerSec: targetPacingRate,
        onChunk: (bytes) => {
          streamTracker.recordBytes(url, bytes);
        },
      });

      // Kill ffmpeg process and destroy stream if client disconnects early
      let isCleanedUp = false;
      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        streamTracker.endSession(url);

        if (!pacedStream.destroyed) {
          try {
            pacedStream.destroy();
          } catch {}
        }
        if (ffmpegProc && !ffmpegProc.killed) {
          try {
            ffmpegProc.kill('SIGKILL');
          } catch {}
        }
      };

      reply.raw.on('close', cleanup);
      request.raw.on('close', cleanup);
      request.raw.socket?.on('close', cleanup);
      pacedStream.on('close', cleanup);
      ffmpegProc.stdout.on('close', cleanup);

      ffmpegProc.on('error', (err: any) => {
        request.log.error({ err }, 'FFmpeg remux process encountered an error');
        cleanup();
      });

      ffmpegProc.stdout.on('error', (err: any) => {
        request.log.error({ err }, 'FFmpeg stdout pipe error');
        cleanup();
      });

      let stderrAcc = '';
      ffmpegProc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrAcc += text;
        const durMatch = stderrAcc.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (durMatch) {
          const hours = parseInt(durMatch[1], 10);
          const mins = parseInt(durMatch[2], 10);
          const secs = parseFloat(durMatch[3]);
          const totalSecs = Math.round((hours * 3600 + mins * 60 + secs) * 10) / 10;
          if (totalSecs > 0) {
            streamTracker.setDuration(url, totalSecs);
          }
        }
        if (text.toLowerCase().includes('error')) {
          request.log.warn({ ffmpegStderr: text }, 'FFmpeg remux stderr');
        }
      });

      ffmpegProc.stdout.pipe(pacedStream);

      reply.header('Content-Type', 'video/mp4');
      reply.header('Content-Disposition', 'inline');
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
      reply.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, x-mediadeck-pacing');
      reply.header('Timing-Allow-Origin', '*');
      reply.header('x-mediadeck-pacing', String(targetPacingRate));
      reply.header('Cache-Control', 'no-cache');

      reply.status(200);
      return reply.send(pacedStream);
    }
  );
};
