import type { Resolver, ResolverContext } from './base.js';
import type { ResolvedMedia } from '@video-player/shared';
import { AppError } from '@video-player/shared';
import { validateAndParseUrl } from '../security/url-validator.js';
import { signProxyUrl } from '../security/hmac.js';
import { DirectMediaResolver } from './direct-media.js';
import { HLSResolver } from './hls.js';
import { DASHResolver } from './dash.js';
import { GoogleDriveResolver } from './google-drive.js';
import { DropboxResolver } from './dropbox.js';
import { PixeldrainResolver } from './pixeldrain.js';
import { OEmbedResolver } from './oembed.js';
import { MetaTagResolver } from './meta-tags.js';
import { VideoTagResolver } from './video-tags.js';

export class ResolverChain {
  private readonly resolvers: Resolver[];

  constructor() {
    this.resolvers = [
      new DirectMediaResolver(),
      new HLSResolver(),
      new DASHResolver(),
      new GoogleDriveResolver(),
      new DropboxResolver(),
      new PixeldrainResolver(),
      new OEmbedResolver(),
      new MetaTagResolver(),
      new VideoTagResolver(),
    ];
  }

  public async resolve(rawUrl: string): Promise<ResolvedMedia> {
    const parsedUrl = validateAndParseUrl(rawUrl);

    const ctx: ResolverContext = {
      rawUrl: parsedUrl.toString(),
      parsedUrl,
    };

    const host = parsedUrl.hostname.toLowerCase();
    const isKnownEmbed = /^(.*\.)?(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|dai\.ly|tiktok\.com|soundcloud\.com)$/i.test(host);

    // If it's a known embed provider, test OEmbedResolver first
    const orderedResolvers = isKnownEmbed
      ? [
          this.resolvers.find((r) => r.name === 'OEmbedResolver')!,
          ...this.resolvers.filter((r) => r.name !== 'OEmbedResolver'),
        ]
      : this.resolvers;

    let result: ResolvedMedia | null = null;

    for (const resolver of orderedResolvers) {
      try {
        result = await resolver.resolve(ctx);
        if (result) {
          break;
        }
      } catch (err: any) {
        if (err instanceof AppError && (err.code === 'BLOCKED_URL' || err.code === 'DRM_PROTECTED' || err.code === 'AUTH_REQUIRED')) {
          throw err;
        }
      }
    }

    if (!result) {
      throw new AppError(
        'NO_MEDIA_FOUND',
        404,
        `Could not detect playable video or media streams at URL: ${rawUrl}`
      );
    }

    // Attach HMAC signed proxy URLs to all streams
    if (result.streams && result.streams.length > 0) {
      const finalStreams: any[] = [];

      for (const stream of result.streams) {
        const { expires, signature } = signProxyUrl(stream.url);
        const encodedTarget = encodeURIComponent(stream.url);
        const proxyUrl = `/api/proxy?url=${encodedTarget}&expires=${expires}&sig=${signature}`;

        // If stream is an MKV, provide a zero-loss MP4 remux stream as PRIMARY for universal browser playback
        const isMkv =
          stream.mimeType?.includes('matroska') ||
          /\.(mkv)(\?.*)?$/i.test(stream.url) ||
          stream.label?.toUpperCase().includes('MKV');

        if (isMkv) {
          const remuxUrl = `/api/stream/remux?url=${encodedTarget}&expires=${expires}&sig=${signature}`;
          // 1. Primary stream: MP4 Universal Stream (Remuxed, Fast Start)
          finalStreams.push({
            ...stream,
            type: 'mp4',
            mimeType: 'video/mp4',
            requiresProxy: true,
            proxyUrl: remuxUrl,
            label: 'MP4 (Universal Stream - Fast Start)',
          });

          // 2. Secondary alternative: Raw MKV container
          finalStreams.push({
            ...stream,
            proxyUrl,
            label: 'MKV (Raw Direct Stream)',
          });
        } else {
          finalStreams.push({
            ...stream,
            proxyUrl,
          });
        }
      }

      result.streams = finalStreams;
    }

    return result;
  }
}

export const resolverChain = new ResolverChain();
