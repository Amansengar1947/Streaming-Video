import type { Resolver, ResolverContext } from './base.js';
import type { ResolvedMedia, StreamInfo } from '@video-player/shared';

export class DASHResolver implements Resolver {
  public readonly name = 'DASHResolver';

  public async resolve(ctx: ResolverContext): Promise<ResolvedMedia | null> {
    const pathname = ctx.parsedUrl.pathname.toLowerCase();
    const isDashUrl = pathname.endsWith('.mpd') || ctx.parsedUrl.search.toLowerCase().includes('.mpd');
    const ct = (ctx.sharedContentType || '').toLowerCase();
    const isDashContentType = ct.includes('dash+xml');

    if (!isDashUrl && !isDashContentType) {
      return null;
    }

    const filename = pathname.split('/').pop() || 'manifest.mpd';
    const cleanTitle = decodeURIComponent(filename).replace(/\.[^/.]+$/, '');

    const stream: StreamInfo = {
      url: ctx.rawUrl,
      type: 'dash',
      mimeType: 'application/dash+xml',
      label: 'DASH Adaptive Stream',
      requiresProxy: true,
    };

    return {
      kind: 'player',
      title: cleanTitle || 'DASH Stream',
      originalUrl: ctx.rawUrl,
      streams: [stream],
    };
  }
}
