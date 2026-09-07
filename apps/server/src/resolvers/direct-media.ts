import { spawn } from 'node:child_process';
import type { Resolver, ResolverContext } from './base.js';
import type { ResolvedMedia, StreamInfo } from '@video-player/shared';
import { AppError } from '@video-player/shared';
import { safeFetch } from '../http/client.js';
import { inferStreamType, isAllowedMediaContentType } from '../utils/mime.js';
import { config } from '../config.js';
import { streamTracker } from '../streams/stream-tracker.js';

// Fast pure JS parser for Matroska EBML Duration in the first 128KB
function parseMkvDuration(buf: Buffer): number | null {
  let timecodeScale = 1000000;
  const tcIdx = buf.indexOf(Buffer.from([0x2a, 0xd7, 0xb1]));
  if (tcIdx !== -1 && tcIdx + 4 < buf.length) {
    const sizeByte = buf[tcIdx + 3];
    let len = 0;
    let mask = 0x80;
    for (let i = 0; i < 8; i++) {
      if ((sizeByte & mask) !== 0) {
        len = i + 1;
        break;
      }
      mask >>= 1;
    }
    if (len > 0) {
      let val = sizeByte & (mask - 1);
      for (let i = 1; i < len; i++) {
        val = (val << 8) | buf[tcIdx + 3 + i];
      }
      const offset = tcIdx + 3 + len;
      let scale = 0;
      for (let i = 0; i < val; i++) {
        scale = (scale << 8) | buf[offset + i];
      }
      if (scale > 0) timecodeScale = scale;
    }
  }

  const durIdx = buf.indexOf(Buffer.from([0x44, 0x89]));
  if (durIdx !== -1 && durIdx + 3 < buf.length) {
    const sizeByte = buf[durIdx + 2];
    const len = sizeByte & 0x7f;
    const offset = durIdx + 3;
    if (len === 4 && offset + 4 <= buf.length) {
      return (buf.readFloatBE(offset) * timecodeScale) / 1e9;
    } else if (len === 8 && offset + 8 <= buf.length) {
      return (buf.readDoubleBE(offset) * timecodeScale) / 1e9;
    }
  }
  return null;
}

// Fast pure JS parser for MP4 mvhd duration in the first or last 128KB
function parseMp4Duration(buf: Buffer): number | null {
  const mvhdIdx = buf.indexOf(Buffer.from('mvhd'));
  if (mvhdIdx !== -1 && mvhdIdx + 36 <= buf.length) {
    const version = buf[mvhdIdx + 4];
    if (version === 0) {
      const timescale = buf.readUInt32BE(mvhdIdx + 16);
      const duration = buf.readUInt32BE(mvhdIdx + 20);
      if (timescale > 0 && duration > 0) return duration / timescale;
    } else if (version === 1) {
      const timescale = buf.readUInt32BE(mvhdIdx + 24);
      const duration = Number(buf.readBigUInt64BE(mvhdIdx + 28));
      if (timescale > 0 && duration > 0) return duration / timescale;
    }
  }
  return null;
}

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

    let headerBuffer: Buffer | null = null;

    // 2. If HEAD failed, was forbidden (common for S3 / Cloudflare R2 presigned URLs), or returned non-media,
    // fallback to a lightweight Range GET (first 128 KB) to inspect headers and format
    const isHeadForbiddenOrFailed = probeStatusCode === 401 || probeStatusCode === 403 || probeStatusCode === 405 || probeStatusCode >= 500 || !contentType;
    if (isHeadForbiddenOrFailed) {
      try {
        const getRes = await safeFetch(ctx.rawUrl, {
          method: 'GET',
          headers: { range: 'bytes=0-131071' },
          timeoutMs: hasMediaExt ? 6000 : 3500,
        });
        if (getRes.statusCode === 200 || getRes.statusCode === 206) {
          probeStatusCode = getRes.statusCode;
          const rawCt = getRes.headers['content-type'];
          contentType = Array.isArray(rawCt) ? rawCt[0] : (rawCt || '');
          const rawCd = getRes.headers['content-disposition'];
          contentDisposition = Array.isArray(rawCd) ? rawCd[0] : (rawCd || '');
          ctx.sharedContentType = contentType;
          ctx.sharedHeadHeaders = getRes.headers;

          const chunks: Buffer[] = [];
          for await (const chunk of getRes.body) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            if (chunks.reduce((acc, c) => acc + c.length, 0) >= 131072) break;
          }
          headerBuffer = Buffer.concat(chunks);
        } else {
          getRes.body.on('error', () => {});
          await getRes.body.dump();
        }
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

      // Multi-layer duration resolution (pure JS fast-probe first, ffprobe as fallback)
      let probedDuration: number | undefined;

      // 1. If headerBuffer not yet fetched, fetch first 128KB
      if (!headerBuffer) {
        try {
          const rangeRes = await safeFetch(ctx.rawUrl, {
            method: 'GET',
            headers: { range: 'bytes=0-131071' },
            timeoutMs: 3500,
          });
          if (rangeRes.statusCode === 200 || rangeRes.statusCode === 206) {
            const chunks: Buffer[] = [];
            for await (const chunk of rangeRes.body) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
              if (chunks.reduce((acc, c) => acc + c.length, 0) >= 131072) break;
            }
            headerBuffer = Buffer.concat(chunks);
          } else {
            rangeRes.body.on('error', () => {});
            await rangeRes.body.dump();
          }
        } catch {}
      }

      // 2. Parse from header buffer (MKV Segment Info or MP4 faststart mvhd)
      if (headerBuffer) {
        const mkvDur = parseMkvDuration(headerBuffer);
        const mp4Dur = parseMp4Duration(headerBuffer);
        if (mkvDur && mkvDur > 0) {
          probedDuration = Math.round(mkvDur * 10) / 10;
        } else if (mp4Dur && mp4Dur > 0) {
          probedDuration = Math.round(mp4Dur * 10) / 10;
        }
      }

      // 3. For MP4 with moov atom placed at EOF (non-faststart), check tail 128KB
      if (!probedDuration && fileSize && fileSize > 131072 && (pathname.endsWith('.mp4') || (contentType && contentType.includes('mp4')))) {
        try {
          const tailOffset = Math.max(0, fileSize - 131072);
          const tailRes = await safeFetch(ctx.rawUrl, {
            method: 'GET',
            headers: { range: `bytes=${tailOffset}-${fileSize - 1}` },
            timeoutMs: 3000,
          });
          if (tailRes.statusCode === 200 || tailRes.statusCode === 206) {
            const chunks: Buffer[] = [];
            for await (const chunk of tailRes.body) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            const tailBuf = Buffer.concat(chunks);
            const tailDur = parseMp4Duration(tailBuf);
            if (tailDur && tailDur > 0) {
              probedDuration = Math.round(tailDur * 10) / 10;
            }
          } else {
            tailRes.body.on('error', () => {});
            await tailRes.body.dump();
          }
        } catch {}
      }

      // 4. Fallback: Quick ffprobe with full browser User-Agent and WARP proxy support
      if (!probedDuration) {
        try {
          probedDuration = await new Promise<number | undefined>((resolve) => {
            const ffprobeArgs = [
              '-v', 'error',
              '-show_entries', 'format=duration',
              '-of', 'default=noprint_wrappers=1:nokey=1',
              '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              '-protocol_whitelist', 'http,https,tcp,tls',
              '-analyzeduration', '2000000',
              '-probesize', '2000000',
            ];
            if (config.warpProxyUrl) {
              ffprobeArgs.push('-http_proxy', config.warpProxyUrl);
            }
            ffprobeArgs.push(ctx.rawUrl);

            const proc = spawn('ffprobe', ffprobeArgs);
            let out = '';
            const timer = setTimeout(() => {
              try { proc.kill('SIGKILL'); } catch {}
              resolve(undefined);
            }, 2500);

            proc.stdout.on('data', (d) => { out += d.toString(); });
            proc.on('close', (code) => {
              clearTimeout(timer);
              if (code === 0) {
                const val = parseFloat(out.trim());
                if (!isNaN(val) && val > 0) {
                  resolve(Math.round(val * 10) / 10);
                  return;
                }
              }
              resolve(undefined);
            });
            proc.on('error', () => {
              clearTimeout(timer);
              resolve(undefined);
            });
          });
        } catch {}
      }

      if (probedDuration && probedDuration > 0) {
        streamTracker.setDuration(ctx.rawUrl, probedDuration);
      }

      return {
        kind: 'player',
        title: cleanTitle || 'Direct Media Stream',
        originalUrl: ctx.rawUrl,
        duration: probedDuration,
        streams: [stream],
      };
    }

    return null;
  }
}
