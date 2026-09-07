import type { StreamType } from '@video-player/shared';

export const MEDIA_MIME_TYPES = new Set([
  // Video
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-matroska',
  'video/matroska',
  'video/mp2t',
  // HLS
  'application/x-mpegurl',
  'application/vnd.apple.mpegurl',
  'audio/x-mpegurl',
  // DASH
  'application/dash+xml',
  // Audio
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/aac',
  'audio/flac',
  // Segments / generic binary chunks
  'application/octet-stream',
]);

/**
 * Checks if a Content-Type header corresponds to permitted media stream content.
 */
export function isAllowedMediaContentType(contentTypeHeader?: string | string[]): boolean {
  if (!contentTypeHeader) return false;
  const raw = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader;
  const mime = raw.split(';')[0].trim().toLowerCase();
  if (MEDIA_MIME_TYPES.has(mime)) return true;
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return true;
  return false;
}

/**
 * Determines stream type from extension or MIME type.
 */
export function inferStreamType(url: string, contentType?: string): StreamType {
  const mime = (contentType || '').split(';')[0].trim().toLowerCase();
  const pathname = new URL(url, 'https://dummy.base').pathname.toLowerCase();

  if (mime === 'application/x-mpegurl' || mime === 'application/vnd.apple.mpegurl' || pathname.endsWith('.m3u8')) {
    return 'hls';
  }
  if (mime === 'application/dash+xml' || pathname.endsWith('.mpd')) {
    return 'dash';
  }
  if (mime === 'video/webm' || pathname.endsWith('.webm')) {
    return 'webm';
  }
  if (mime.startsWith('audio/') || pathname.endsWith('.mp3') || pathname.endsWith('.wav') || pathname.endsWith('.aac') || pathname.endsWith('.flac')) {
    return 'audio';
  }
  if (
    mime.startsWith('video/') ||
    mime.includes('matroska') ||
    pathname.endsWith('.mp4') ||
    pathname.endsWith('.m4v') ||
    pathname.endsWith('.mov') ||
    pathname.endsWith('.mkv') ||
    pathname.endsWith('.avi') ||
    pathname.endsWith('.flv') ||
    pathname.endsWith('.wmv')
  ) {
    return 'mp4';
  }
  return 'other';
}
