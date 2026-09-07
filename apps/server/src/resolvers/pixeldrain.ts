import type { Resolver, ResolverContext } from './base.js';
import type { ResolvedMedia, StreamInfo } from '@video-player/shared';
import { safeFetch } from '../http/client.js';
import { inferStreamType } from '../utils/mime.js';

const PIXELDRAIN_HOSTS = new Set([
  'pixeldrain.com',
  'pixeldrain.dev',
]);

export class PixeldrainResolver implements Resolver {
  public readonly name = 'PixeldrainResolver';

  public async resolve(ctx: ResolverContext): Promise<ResolvedMedia | null> {
    const host = ctx.parsedUrl.hostname.toLowerCase();
    if (!PIXELDRAIN_HOSTS.has(host)) {
      return null;
    }

    const pathname = ctx.parsedUrl.pathname;
    let fileId = '';

    // Match /u/:id or /api/file/:id
    const uMatch = pathname.match(/^\/u\/([a-zA-Z0-9_-]+)/);
    const apiMatch = pathname.match(/^\/api\/file\/([a-zA-Z0-9_-]+)/);

    if (uMatch && uMatch[1]) {
      fileId = uMatch[1];
    } else if (apiMatch && apiMatch[1]) {
      fileId = apiMatch[1];
    }

    if (!fileId) {
      return null;
    }

    const directStreamUrl = `https://${host}/api/file/${fileId}?download`;

    try {
      // Probe with lightweight range GET to retrieve content-type and filename
      const getRes = await safeFetch(directStreamUrl, {
        method: 'GET',
        headers: { range: 'bytes=0-100' },
        timeoutMs: 6000,
      });

      getRes.body.on('error', () => {});
      await getRes.body.dump();

      if (getRes.statusCode === 200 || getRes.statusCode === 206) {
        const rawCt = getRes.headers['content-type'];
        const contentType = Array.isArray(rawCt) ? rawCt[0] : (rawCt || 'video/mp4');
        const rawCd = getRes.headers['content-disposition'];
        const cdStr = Array.isArray(rawCd) ? rawCd[0] : (rawCd || '');

        let title = `Pixeldrain Video (${fileId})`;
        const filenameMatch = cdStr.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
        if (filenameMatch && filenameMatch[1]) {
          const rawFilename = decodeURIComponent(filenameMatch[1].trim());
          title = rawFilename.replace(/\.[^/.]+$/, '');
        }

        const isMkv = cdStr.toLowerCase().includes('.mkv') || contentType.includes('matroska');
        const streamType = inferStreamType(directStreamUrl, contentType);

        let fileSize: number | undefined;
        const cr = getRes.headers['content-range'];
        const crStr = Array.isArray(cr) ? cr[0] : (cr || '');
        const crMatch = crStr.match(/\/(\d+)$/);
        if (crMatch && crMatch[1]) {
          fileSize = parseInt(crMatch[1], 10);
        } else {
          const cl = getRes.headers['content-length'];
          const clStr = Array.isArray(cl) ? cl[0] : (cl || '');
          if (clStr && !isNaN(Number(clStr))) {
            fileSize = parseInt(clStr, 10);
          }
        }

        const stream: StreamInfo = {
          url: directStreamUrl,
          type: streamType,
          mimeType: isMkv ? 'video/x-matroska' : contentType,
          requiresProxy: true,
          label: isMkv ? 'MKV (Pixeldrain)' : `${streamType.toUpperCase()} (Pixeldrain)`,
          size: fileSize,
        };

        return {
          kind: 'player',
          title,
          originalUrl: ctx.rawUrl,
          provider: 'Pixeldrain',
          streams: [stream],
        };
      }
    } catch {
      // Fall through if network probe fails
    }

    // Direct fallback stream info if probe failed but URL matched
    const stream: StreamInfo = {
      url: directStreamUrl,
      type: 'mp4',
      mimeType: 'video/x-matroska',
      requiresProxy: true,
      label: 'Pixeldrain Stream',
    };

    return {
      kind: 'player',
      title: `Pixeldrain Video (${fileId})`,
      originalUrl: ctx.rawUrl,
      provider: 'Pixeldrain',
      streams: [stream],
    };
  }
}
