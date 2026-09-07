import * as cheerio from 'cheerio';
import type { Resolver, ResolverContext } from './base.js';
import type { ResolvedMedia, StreamInfo } from '@video-player/shared';
import { safeFetch } from '../http/client.js';
import { inferStreamType } from '../utils/mime.js';

export class VideoTagResolver implements Resolver {
  public readonly name = 'VideoTagResolver';

  public async resolve(ctx: ResolverContext): Promise<ResolvedMedia | null> {
    if (!ctx.sharedHtml) {
      try {
        const pageRes = await safeFetch(ctx.rawUrl, {
          headers: {
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });

        const ct = Array.isArray(pageRes.headers['content-type'])
          ? pageRes.headers['content-type'][0]
          : pageRes.headers['content-type'];

        if (!ct || !ct.toLowerCase().includes('text/html')) {
          return null;
        }

        ctx.sharedHtml = await pageRes.text(3 * 1024 * 1024);
      } catch {
        return null;
      }
    }

    const $ = cheerio.load(ctx.sharedHtml);
    const videoElements = $('video');

    if (videoElements.length === 0) {
      return null;
    }

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('title').text().trim() ||
      'HTML5 Video';

    const streams: StreamInfo[] = [];
    let thumbnail: string | undefined = undefined;

    videoElements.each((_, videoEl) => {
      const poster = $(videoEl).attr('poster');
      if (poster && !thumbnail) {
        try {
          thumbnail = new URL(poster, ctx.rawUrl).toString();
        } catch {
          // ignore
        }
      }

      // Check direct src on <video>
      const directSrc = $(videoEl).attr('src');
      if (directSrc) {
        try {
          const parsed = new URL(directSrc, ctx.rawUrl);
          if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            const streamUrl = parsed.toString();
            const type = inferStreamType(streamUrl);
            streams.push({
              url: streamUrl,
              type,
              label: `Source (${type.toUpperCase()})`,
              requiresProxy: true,
            });
          }
        } catch {
          // ignore invalid url
        }
      }

      // Check nested <source> tags
      $(videoEl)
        .find('source')
        .each((__, sourceEl) => {
          const src = $(sourceEl).attr('src');
          const typeAttr = $(sourceEl).attr('type');
          const resAttr = $(sourceEl).attr('size') || $(sourceEl).attr('title');

          if (src) {
            try {
              const parsed = new URL(src, ctx.rawUrl);
              if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
                const streamUrl = parsed.toString();
                const type = inferStreamType(streamUrl, typeAttr);

                streams.push({
                  url: streamUrl,
                  type,
                  quality: resAttr,
                  mimeType: typeAttr,
                  label: resAttr ? `${resAttr} (${type.toUpperCase()})` : `Source (${type.toUpperCase()})`,
                  requiresProxy: true,
                });
              }
            } catch {
              // ignore
            }
          }
        });
    });

    if (streams.length === 0) {
      return null;
    }

    // Deduplicate streams by URL
    const uniqueStreams: StreamInfo[] = [];
    const seen = new Set<string>();

    for (const stream of streams) {
      if (!seen.has(stream.url)) {
        seen.add(stream.url);
        uniqueStreams.push(stream);
      }
    }

    return {
      kind: 'player',
      title,
      thumbnail,
      originalUrl: ctx.rawUrl,
      streams: uniqueStreams,
    };
  }
}
