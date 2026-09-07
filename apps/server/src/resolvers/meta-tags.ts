import * as cheerio from 'cheerio';
import type { Resolver, ResolverContext } from './base.js';
import type { ResolvedMedia, StreamInfo } from '@video-player/shared';
import { safeFetch } from '../http/client.js';
import { inferStreamType } from '../utils/mime.js';

export class MetaTagResolver implements Resolver {
  public readonly name = 'MetaTagResolver';

  public async resolve(ctx: ResolverContext): Promise<ResolvedMedia | null> {
    // Ensure HTML is fetched and stored in context
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

        // Only parse if text/html
        if (!ct || !ct.toLowerCase().includes('text/html')) {
          return null;
        }

        ctx.sharedHtml = await pageRes.text(3 * 1024 * 1024);
      } catch {
        return null;
      }
    }

    const $ = cheerio.load(ctx.sharedHtml);

    // Extract title & thumbnail
    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text().trim() ||
      'Extracted Media';

    const thumbnail =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      undefined;

    // Check twitter:player:stream
    const twitterStream = $('meta[name="twitter:player:stream"]').attr('content');
    const twitterStreamType = $('meta[name="twitter:player:stream:content_type"]').attr('content');
    if (twitterStream) {
      try {
        const streamUrl = new URL(twitterStream, ctx.rawUrl).toString();
        const type = inferStreamType(streamUrl, twitterStreamType);
        return {
          kind: 'player',
          title,
          thumbnail,
          originalUrl: ctx.rawUrl,
          streams: [
            {
              url: streamUrl,
              type,
              mimeType: twitterStreamType,
              label: 'Direct Stream',
              requiresProxy: true,
            },
          ],
        };
      } catch {
        // ignore invalid url
      }
    }

    // Check og:video / og:video:secure_url
    const ogVideo =
      $('meta[property="og:video:secure_url"]').attr('content') ||
      $('meta[property="og:video:url"]').attr('content') ||
      $('meta[property="og:video"]').attr('content');
    const ogVideoType = $('meta[property="og:video:type"]').attr('content') || '';

    if (ogVideo) {
      try {
        const streamUrl = new URL(ogVideo, ctx.rawUrl).toString();
        const type = inferStreamType(streamUrl, ogVideoType);

        // If it looks like a direct playable stream
        if (type !== 'other' || ogVideoType.includes('video/') || ogVideoType.includes('mpegurl')) {
          return {
            kind: 'player',
            title,
            thumbnail,
            originalUrl: ctx.rawUrl,
            streams: [
              {
                url: streamUrl,
                type: type === 'other' ? 'mp4' : type,
                mimeType: ogVideoType || 'video/mp4',
                label: 'OpenGraph Stream',
                requiresProxy: true,
              },
            ],
          };
        }

        // If og:video points to an embed/player page or iframe
        if (ogVideoType.includes('html') || streamUrl.includes('embed') || streamUrl.includes('player')) {
          return {
            kind: 'embed',
            title,
            thumbnail,
            originalUrl: ctx.rawUrl,
            embedHtml: `<iframe src="${streamUrl}" width="100%" height="100%" frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe>`,
          };
        }
      } catch {
        // ignore
      }
    }

    // Check JSON-LD VideoObject
    let jsonLdStream: StreamInfo | null = null;
    let jsonLdEmbed: string | null = null;

    $('script[type="application/ld+json"]').each((_, elem) => {
      try {
        const json = JSON.parse($(elem).html() || '{}');
        const items = Array.isArray(json) ? json : json['@graph'] || [json];
        for (const item of items) {
          if (item && (item['@type'] === 'VideoObject' || item['@type'] === 'MediaObject')) {
            if (item.contentUrl) {
              const url = new URL(item.contentUrl, ctx.rawUrl).toString();
              jsonLdStream = {
                url,
                type: inferStreamType(url),
                label: 'JSON-LD Stream',
                requiresProxy: true,
              };
            } else if (item.embedUrl) {
              const url = new URL(item.embedUrl, ctx.rawUrl).toString();
              jsonLdEmbed = `<iframe src="${url}" width="100%" height="100%" frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
            }
          }
        }
      } catch {
        // ignore malformed JSON-LD
      }
    });

    if (jsonLdStream) {
      return {
        kind: 'player',
        title,
        thumbnail,
        originalUrl: ctx.rawUrl,
        streams: [jsonLdStream],
      };
    }

    if (jsonLdEmbed) {
      return {
        kind: 'embed',
        title,
        thumbnail,
        originalUrl: ctx.rawUrl,
        embedHtml: jsonLdEmbed,
      };
    }

    return null;
  }
}
