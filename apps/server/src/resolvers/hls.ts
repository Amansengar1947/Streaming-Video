import type { Resolver, ResolverContext } from './base.js';
import type { ResolvedMedia, StreamInfo } from '@video-player/shared';

export class HLSResolver implements Resolver {
  public readonly name = 'HLSResolver';

  public async resolve(ctx: ResolverContext): Promise<ResolvedMedia | null> {
    const pathname = ctx.parsedUrl.pathname.toLowerCase();
    const isHlsUrl = pathname.endsWith('.m3u8') || ctx.parsedUrl.search.toLowerCase().includes('.m3u8');
    const ct = (ctx.sharedContentType || '').toLowerCase();
    const isHlsContentType = ct.includes('mpegurl') || ct.includes('application/x-mpegurl');

    if (!isHlsUrl && !isHlsContentType) {
      return null;
    }

    const filename = pathname.split('/').pop() || 'stream.m3u8';
    const cleanTitle = decodeURIComponent(filename).replace(/\.[^/.]+$/, '');

    const stream: StreamInfo = {
      url: ctx.rawUrl,
      type: 'hls',
      mimeType: 'application/x-mpegURL',
      label: 'HLS Adaptive Stream',
      requiresProxy: true,
    };

    return {
      kind: 'player',
      title: cleanTitle || 'HLS Live/VOD Stream',
      originalUrl: ctx.rawUrl,
      streams: [stream],
    };
  }
}
