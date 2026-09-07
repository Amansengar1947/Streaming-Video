import type { Resolver, ResolverContext } from './base.js';
import type { ResolvedMedia, StreamInfo } from '@video-player/shared';
import { safeFetch } from '../http/client.js';
import { inferStreamType, isAllowedMediaContentType } from '../utils/mime.js';

const GOOGLE_DRIVE_HOSTS = new Set([
  'drive.google.com',
  'docs.google.com',
  'drive.usercontent.google.com',
]);

export class GoogleDriveResolver implements Resolver {
  public readonly name = 'GoogleDriveResolver';

  public async resolve(ctx: ResolverContext): Promise<ResolvedMedia | null> {
    const host = ctx.parsedUrl.hostname.toLowerCase();
    if (!GOOGLE_DRIVE_HOSTS.has(host) && !host.endsWith('.google.com')) {
      return null;
    }

    const fileId = this.extractFileId(ctx.parsedUrl);
    if (!fileId) {
      return null;
    }

    const embedFallback: ResolvedMedia = {
      kind: 'embed',
      title: `Google Drive Video (${fileId})`,
      originalUrl: ctx.rawUrl,
      provider: 'Google Drive',
      embedHtml: `<iframe src="https://drive.google.com/file/d/${fileId}/preview" width="100%" height="100%" frameborder="0" allowfullscreen allow="autoplay"></iframe>`,
    };

    // Construct export download endpoint for direct streaming
    const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

    try {
      const headRes = await safeFetch(directUrl, {
        method: 'HEAD',
        timeoutMs: 6000,
      });

      const rawCt = headRes.headers['content-type'];
      const contentType = Array.isArray(rawCt) ? rawCt[0] : (rawCt || '');

      if (isAllowedMediaContentType(contentType)) {
        let title = `Google Drive Video (${fileId})`;
        const cdHeader = headRes.headers['content-disposition'];
        const cdStr = Array.isArray(cdHeader) ? cdHeader[0] : (cdHeader || '');

        // Extract filename from Content-Disposition header
        const filenameMatch = cdStr.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
        if (filenameMatch && filenameMatch[1]) {
          const rawFilename = decodeURIComponent(filenameMatch[1].trim());
          title = rawFilename.replace(/\.[^/.]+$/, '');
        }

        const streamTargetUrl = headRes.finalUrl || directUrl;
        const streamType = inferStreamType(streamTargetUrl, contentType);

        const stream: StreamInfo = {
          url: streamTargetUrl,
          type: streamType,
          mimeType: contentType,
          requiresProxy: true,
          label: 'Google Drive Stream',
        };

        return {
          kind: 'player',
          title,
          originalUrl: ctx.rawUrl,
          provider: 'Google Drive',
          streams: [stream],
        };
      }
    } catch {
      // Direct stream probe failed or timed out; fall back to embed preview
    }

    // Direct download is not a media stream or requires confirmation (e.g. >100MB virus scan)
    return embedFallback;
  }

  public extractFileId(url: URL): string | null {
    // 1. Check query parameter ?id=...
    const queryId = url.searchParams.get('id');
    if (queryId && /^[a-zA-Z0-9_-]{10,}$/.test(queryId)) {
      return queryId;
    }

    // 2. Check path /file/d/{fileId}
    const path = url.pathname;
    const fileDMatch = path.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/i);
    if (fileDMatch && fileDMatch[1]) {
      return fileDMatch[1];
    }

    // 3. Check /open?id={fileId}
    const openMatch = path.match(/\/open\/([a-zA-Z0-9_-]{10,})/i);
    if (openMatch && openMatch[1]) {
      return openMatch[1];
    }

    // 4. Check /d/{fileId}
    const dMatch = path.match(/\/d\/([a-zA-Z0-9_-]{10,})/i);
    if (dMatch && dMatch[1]) {
      return dMatch[1];
    }

    return null;
  }
}
