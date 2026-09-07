import * as cheerio from 'cheerio';
import type { Resolver, ResolverContext } from './base.js';
import type { ResolvedMedia } from '@video-player/shared';
import { safeFetch } from '../http/client.js';

interface OEmbedData {
  type?: string;
  version?: string;
  title?: string;
  author_name?: string;
  provider_name?: string;
  thumbnail_url?: string;
  html?: string;
  width?: number;
  height?: number;
}

function getKnownOEmbedEndpoint(targetUrl: string, parsed: URL): string | null {
  const host = parsed.hostname.toLowerCase();

  // YouTube
  if (host.includes('youtube.com') || host === 'youtu.be') {
    return `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;
  }

  // Vimeo
  if (host.includes('vimeo.com')) {
    return `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(targetUrl)}`;
  }

  // Dailymotion
  if (host.includes('dailymotion.com') || host === 'dai.ly') {
    return `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;
  }

  // TikTok
  if (host.includes('tiktok.com')) {
    return `https://www.tiktok.com/oembed?url=${encodeURIComponent(targetUrl)}`;
  }

  // SoundCloud
  if (host.includes('soundcloud.com')) {
    return `https://soundcloud.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;
  }

  return null;
}

export class OEmbedResolver implements Resolver {
  public readonly name = 'OEmbedResolver';

  public async resolve(ctx: ResolverContext): Promise<ResolvedMedia | null> {
    let endpoint = getKnownOEmbedEndpoint(ctx.rawUrl, ctx.parsedUrl);

    // If not in known list, check for oEmbed autodiscovery in HTML
    if (!endpoint && ctx.sharedHtml) {
      const $ = cheerio.load(ctx.sharedHtml);
      const jsonLink = $('link[rel="alternate"][type="application/json+oembed"]').attr('href');
      if (jsonLink) {
        try {
          endpoint = new URL(jsonLink, ctx.rawUrl).toString();
        } catch {
          // ignore malformed link
        }
      }
    }

    if (!endpoint) {
      return null;
    }

    try {
      const res = await safeFetch(endpoint, {
        headers: {
          accept: 'application/json',
        },
      });

      if (res.statusCode < 200 || res.statusCode >= 300) {
        return null;
      }

      const data = await res.json<OEmbedData>();
      if (!data) return null;

      // Check if it has embed HTML or video type
      if (data.html || data.type === 'video' || data.type === 'rich') {
        return {
          kind: 'embed',
          title: data.title || `${data.provider_name || 'Embedded'} Media`,
          thumbnail: data.thumbnail_url,
          provider: data.provider_name,
          originalUrl: ctx.rawUrl,
          embedHtml: data.html,
        };
      }
    } catch {
      // Fall through to next resolver if oEmbed fails
      return null;
    }

    return null;
  }
}
