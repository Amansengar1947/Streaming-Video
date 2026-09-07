import type { Resolver, ResolverContext } from './base.js';
import type { ResolvedMedia, StreamInfo } from '@video-player/shared';
import { safeFetch } from '../http/client.js';
import { inferStreamType, isAllowedMediaContentType } from '../utils/mime.js';

export class DropboxResolver implements Resolver {
  public readonly name = 'DropboxResolver';

  public async resolve(ctx: ResolverContext): Promise<ResolvedMedia | null> {
    const host = ctx.parsedUrl.hostname.toLowerCase();
    if (!host.includes('dropbox.com')) {
      return null;
    }

    // Convert share link to direct download/stream link
    const directUrl = new URL(ctx.parsedUrl.toString());
    directUrl.searchParams.set('raw', '1');
    directUrl.searchParams.delete('dl');

    try {
      const headRes = await safeFetch(directUrl.toString(), {
        method: 'HEAD',
        timeoutMs: 6000,
      });

      const rawCt = headRes.headers['content-type'];
      const contentType = Array.isArray(rawCt) ? rawCt[0] : (rawCt || '');

      if (isAllowedMediaContentType(contentType)) {
        const pathname = ctx.parsedUrl.pathname;
        const filename = pathname.split('/').pop() || 'Dropbox Video';
        const cleanTitle = decodeURIComponent(filename).replace(/\.[^/.]+$/, '');

        const streamTargetUrl = headRes.finalUrl || directUrl.toString();
        const streamType = inferStreamType(streamTargetUrl, contentType);

        const stream: StreamInfo = {
          url: streamTargetUrl,
          type: streamType,
          mimeType: contentType,
          requiresProxy: true,
          label: 'Dropbox Stream',
        };

        return {
          kind: 'player',
          title: cleanTitle || 'Dropbox Video',
          originalUrl: ctx.rawUrl,
          provider: 'Dropbox',
          streams: [stream],
        };
      }
    } catch {
      // Direct stream probe failed
    }

    return null;
  }
}
