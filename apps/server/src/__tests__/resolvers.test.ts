import { describe, it, expect } from 'vitest';
import { inferStreamType, isAllowedMediaContentType } from '../utils/mime.js';
import { VideoTagResolver } from '../resolvers/video-tags.js';
import { MetaTagResolver } from '../resolvers/meta-tags.js';
import { DirectMediaResolver } from '../resolvers/direct-media.js';
import { GoogleDriveResolver } from '../resolvers/google-drive.js';
import { DropboxResolver } from '../resolvers/dropbox.js';
import { PixeldrainResolver } from '../resolvers/pixeldrain.js';

describe('MIME and Stream Type Detection', () => {
  it('correctly detects HLS, DASH, MP4, and WebM', () => {
    expect(inferStreamType('https://cdn.example.com/live/master.m3u8')).toBe('hls');
    expect(inferStreamType('https://cdn.example.com/manifest.mpd')).toBe('dash');
    expect(inferStreamType('https://cdn.example.com/clip.mp4')).toBe('mp4');
    expect(inferStreamType('https://cdn.example.com/clip.webm')).toBe('webm');
    expect(inferStreamType('https://cdn.example.com/movie.mkv')).toBe('mp4');
    expect(inferStreamType('https://cdn.example.com/stream', 'video/x-matroska')).toBe('mp4');
    expect(inferStreamType('https://cdn.example.com/stream', 'video/matroska')).toBe('mp4');
    expect(inferStreamType('https://cdn.example.com/track.mp3')).toBe('audio');
  });

  it('validates allowed media content types', () => {
    expect(isAllowedMediaContentType('video/mp4; codecs="avc1.42E01E"')).toBe(true);
    expect(isAllowedMediaContentType('video/x-matroska')).toBe(true);
    expect(isAllowedMediaContentType('video/matroska')).toBe(true);
    expect(isAllowedMediaContentType('application/x-mpegurl')).toBe(true);
    expect(isAllowedMediaContentType('application/dash+xml')).toBe(true);
    expect(isAllowedMediaContentType('text/html')).toBe(false);
    expect(isAllowedMediaContentType('application/json')).toBe(false);
  });
});

describe('Video Tag HTML Resolver', () => {
  it('extracts video and source tags from HTML', async () => {
    const resolver = new VideoTagResolver();
    const sampleHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Test Video Page</title></head>
        <body>
          <video poster="https://cdn.example.com/thumb.jpg" controls>
            <source src="https://cdn.example.com/video-1080p.mp4" type="video/mp4" size="1080p">
            <source src="https://cdn.example.com/video-720p.mp4" type="video/mp4" size="720p">
          </video>
        </body>
      </html>
    `;

    const result = await resolver.resolve({
      rawUrl: 'https://example.com/page.html',
      parsedUrl: new URL('https://example.com/page.html'),
      sharedHtml: sampleHtml,
    });

    expect(result).not.toBeNull();
    expect(result?.kind).toBe('player');
    expect(result?.title).toBe('Test Video Page');
    expect(result?.thumbnail).toBe('https://cdn.example.com/thumb.jpg');
    expect(result?.streams).toHaveLength(2);
    expect(result?.streams?.[0].url).toBe('https://cdn.example.com/video-1080p.mp4');
    expect(result?.streams?.[0].quality).toBe('1080p');
    expect(result?.streams?.[1].url).toBe('https://cdn.example.com/video-720p.mp4');
  });
});

describe('Meta Tag HTML Resolver', () => {
  it('extracts OpenGraph og:video tags from HTML', async () => {
    const resolver = new MetaTagResolver();
    const sampleHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta property="og:title" content="Awesome Clip">
          <meta property="og:image" content="https://cdn.example.com/og-thumb.jpg">
          <meta property="og:video" content="https://cdn.example.com/media.mp4">
          <meta property="og:video:type" content="video/mp4">
        </head>
        <body></body>
      </html>
    `;

    const result = await resolver.resolve({
      rawUrl: 'https://example.com/clip',
      parsedUrl: new URL('https://example.com/clip'),
      sharedHtml: sampleHtml,
    });

    expect(result).not.toBeNull();
    expect(result?.kind).toBe('player');
    expect(result?.title).toBe('Awesome Clip');
    expect(result?.thumbnail).toBe('https://cdn.example.com/og-thumb.jpg');
    expect(result?.streams?.[0].url).toBe('https://cdn.example.com/media.mp4');
    expect(result?.streams?.[0].type).toBe('mp4');
  });
});

describe('Google Drive Resolver', () => {
  it('correctly extracts file ID from various Google Drive URL formats', () => {
    const resolver = new GoogleDriveResolver();
    const testCases = [
      {
        url: 'https://drive.google.com/file/d/1mFqzNxWYF1yydDvj2xR9Sa234lpKHrNc/view?usp=sharing',
        expected: '1mFqzNxWYF1yydDvj2xR9Sa234lpKHrNc',
      },
      {
        url: 'https://drive.google.com/open?id=1mFqzNxWYF1yydDvj2xR9Sa234lpKHrNc',
        expected: '1mFqzNxWYF1yydDvj2xR9Sa234lpKHrNc',
      },
      {
        url: 'https://drive.google.com/uc?export=download&id=1mFqzNxWYF1yydDvj2xR9Sa234lpKHrNc',
        expected: '1mFqzNxWYF1yydDvj2xR9Sa234lpKHrNc',
      },
      {
        url: 'https://docs.google.com/file/d/1mFqzNxWYF1yydDvj2xR9Sa234lpKHrNc/edit',
        expected: '1mFqzNxWYF1yydDvj2xR9Sa234lpKHrNc',
      },
      {
        url: 'https://drive.google.com/file/d/12345/view', // Too short
        expected: null,
      },
    ];

    for (const { url, expected } of testCases) {
      const parsed = new URL(url);
      expect(resolver.extractFileId(parsed)).toBe(expected);
    }
  });

  it('skips non-Google Drive domains', async () => {
    const resolver = new GoogleDriveResolver();
    const result = await resolver.resolve({
      rawUrl: 'https://vimeo.com/12345',
      parsedUrl: new URL('https://vimeo.com/12345'),
    });
    expect(result).toBeNull();
  });
});

describe('Direct Media Resolver', () => {
  it('skips .m3u8 and .mpd manifest URLs', async () => {
    const resolver = new DirectMediaResolver();
    const hlsResult = await resolver.resolve({
      rawUrl: 'https://example.com/stream.m3u8',
      parsedUrl: new URL('https://example.com/stream.m3u8'),
    });
    expect(hlsResult).toBeNull();

    const dashResult = await resolver.resolve({
      rawUrl: 'https://example.com/manifest.mpd',
      parsedUrl: new URL('https://example.com/manifest.mpd'),
    });
    expect(dashResult).toBeNull();
  });
});

describe('Dropbox Resolver', () => {
  it('skips non-Dropbox domains', async () => {
    const resolver = new DropboxResolver();
    const result = await resolver.resolve({
      rawUrl: 'https://example.com/video.mp4',
      parsedUrl: new URL('https://example.com/video.mp4'),
    });
    expect(result).toBeNull();
  });
});

describe('Pixeldrain Resolver', () => {
  it('skips non-Pixeldrain domains', async () => {
    const resolver = new PixeldrainResolver();
    const result = await resolver.resolve({
      rawUrl: 'https://example.com/video.mp4',
      parsedUrl: new URL('https://example.com/video.mp4'),
    });
    expect(result).toBeNull();
  });

  it('recognizes Pixeldrain viewer URLs and resolves to download endpoint', async () => {
    const resolver = new PixeldrainResolver();
    const result = await resolver.resolve({
      rawUrl: 'https://pixeldrain.dev/u/WFZhMmMn',
      parsedUrl: new URL('https://pixeldrain.dev/u/WFZhMmMn'),
    });
    expect(result).not.toBeNull();
    expect(result?.kind).toBe('player');
    expect(result?.streams?.[0].url).toContain('https://pixeldrain.dev/api/file/WFZhMmMn?download');
  });
});



