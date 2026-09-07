import type { Resolver, ResolverContext } from './base.js';
import type { ResolvedMedia, StreamInfo } from '@video-player/shared';
import { AppError } from '@video-player/shared';
import { safeFetch } from '../http/client.js';
import { inferStreamType, isAllowedMediaContentType } from '../utils/mime.js';

const DIRECT_MEDIA_EXTENSIONS = new Set([
  '.mp4',
  '.webm',
  '.ogv',
  '.mov',
  '.m4v',
  '.mkv',
  '.avi',
  '.flv',
  '.wmv',
  '.mp3',
  '.wav',
  '.ogg',
  '.aac',
  '.flac',
]);

export class DirectMediaResolver implements Resolver {
  public readonly name = 'DirectMediaResolver';

  public async resolve(ctx: ResolverContext): Promise<ResolvedMedia | null> {
    const pathname = ctx.parsedUrl.pathname.toLowerCase();

    // Immediately skip HLS and DASH URLs (handled by specialized resolvers)
    if (pathname.endsWith('.m3u8') || pathname.endsWith('.mpd') || ctx.parsedUrl.search.toLowerCase().includes('.m3u8') || ctx.parsedUrl.search.toLowerCase().includes('.mpd')) {
      return null;
    }

    const hasMediaExt = Array.from(DIRECT_MEDIA_EXTENSIONS).some((ext) => pathname.endsWith(ext));

    let contentType = '';
    let probeStatusCode = 200;
    let contentDisposition = '';

    // 1. Try a HEAD request first
    try {
      const headRes = await safeFetch(ctx.rawUrl, {
        method: 'HEAD',
        timeoutMs: hasMediaExt ? 5000 : 2000,
      });
      probeStatusCode = headRes.statusCode;
      const rawCt = headRes.headers['content-type'];
      contentType = Array.isArray(rawCt) ? rawCt[0] : (rawCt || '');
      const rawCd = headRes.headers['content-disposition'];
      contentDisposition = Array.isArray(rawCd) ? rawCd[0] : (rawCd || '');
      ctx.sharedContentType = contentType;
      ctx.sharedHeadHeaders = headRes.headers;
    } catch {
      // ignore
    }

    // 2. If HEAD failed, was forbidden (common for S3 / Cloudflare R2 presigned URLs), or returned non-media,
    // fallback to a lightweight Range GET (first 100 bytes)
    const isHeadForbiddenOrFailed = probeStatusCode === 401 || probeStatusCode === 403 || probeStatusCode === 405 || probeStatusCode >= 500 || !contentType;
    if (isHeadForbiddenOrFailed) {
      try {
        const getRes = await safeFetch(ctx.rawUrl, {
          method: 'GET',
          headers: { range: 'bytes=0-100' },
          timeoutMs: hasMediaExt ? 6000 : 3000,
        });
        if (getRes.statusCode === 200 || getRes.statusCode === 206) {
          probeStatusCode = getRes.statusCode;
          const rawCt = getRes.headers['content-type'];
          contentType = Array.isArray(rawCt) ? rawCt[0] : (rawCt || '');
          const rawCd = getRes.headers['content-disposition'];
          contentDisposition = Array.isArray(rawCd) ? rawCd[0] : (rawCd || '');
          ctx.sharedContentType = contentType;
          ctx.sharedHeadHeaders = getRes.headers;
        }
        getRes.body.on('error', () => {});
        await getRes.body.dump();
      } catch {
        if (!hasMediaExt) {
          return null;
        }
      }
    }

    const isMediaMime = isAllowedMediaContentType(contentType);
    const isExplicitNonMedia =
      contentType.includes('xml') ||
      contentType.includes('html') ||
      contentType.includes('json');

    const cdHasMedia = /\.(mp4|mkv|webm|avi|flv|mov|m4v|mp3|wav|ogg|aac)/i.test(contentDisposition);

    // If server returned 404/410 not found
    if ((probeStatusCode === 404 || probeStatusCode === 410) && !isMediaMime && !cdHasMedia) {
      throw new AppError('NO_MEDIA_FOUND', 404, 'The requested media URL was not found on the remote server.');
    }

    // If server returned another 4xx/5xx status code and no media MIME
    if (probeStatusCode >= 400 && !isMediaMime && !cdHasMedia && !hasMediaExt) {
      return null;
    }

    // Skip if it is HLS or DASH (those belong to specialized resolvers)
    if (
      pathname.endsWith('.m3u8') ||
      pathname.endsWith('.mpd') ||
      contentType.includes('mpegurl') ||
      contentType.includes('dash+xml')
    ) {
      return null;
    }

    // If server returned XML, HTML, or JSON instead of media, do not treat as direct media
    if (isExplicitNonMedia && !isMediaMime && !cdHasMedia) {
      return null;
    }

    if (hasMediaExt || isMediaMime || cdHasMedia) {
      const streamType = inferStreamType(ctx.rawUrl, contentType);

      // Extract clean title from Content-Disposition or pathname
      let cleanTitle = '';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*?=['"]?(?:UTF-8'')?([^'";\r\n]+)['"]?/i) || [null, contentDisposition];
        if (match && match[1]) {
          cleanTitle = decodeURIComponent(match[1].trim()).replace(/\.[^/.]+$/, '');
        }
      }
      if (!cleanTitle) {
        const filename = pathname.split('/').pop() || 'Video';
        cleanTitle = decodeURIComponent(filename).replace(/\.[^/.]+$/, '');
      }

      const isMkv = pathname.endsWith('.mkv') || contentDisposition.toLowerCase().includes('.mkv') || contentType.includes('matroska');
      const resolvedMime = isMkv
        ? 'video/x-matroska'
        : isMediaMime
        ? contentType
        : streamType === 'mp4'
        ? 'video/mp4'
        : streamType === 'webm'
        ? 'video/webm'
        : undefined;

      let fileSize: number | undefined;
      const cr = ctx.sharedHeadHeaders?.['content-range'];
      const crStr = Array.isArray(cr) ? cr[0] : (cr || '');
      const crMatch = crStr.match(/\/(\d+)$/);
      if (crMatch && crMatch[1]) {
        fileSize = parseInt(crMatch[1], 10);
      } else {
        const cl = ctx.sharedHeadHeaders?.['content-length'];
        const clStr = Array.isArray(cl) ? cl[0] : (cl || '');
        if (clStr && !isNaN(Number(clStr))) {
          fileSize = parseInt(clStr, 10);
        }
      }

      const stream: StreamInfo = {
        url: ctx.rawUrl,
        type: streamType,
        mimeType: resolvedMime,
        requiresProxy: true, // Cross-origin direct stream needs CORS and header proxying
        label: isMkv ? 'MKV' : streamType.toUpperCase(),
        size: fileSize,
      };

      return {
        kind: 'player',
        title: cleanTitle || 'Direct Media Stream',
        originalUrl: ctx.rawUrl,
        streams: [stream],
      };
    }

    return null;
  }
}
