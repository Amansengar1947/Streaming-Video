import { describe, it, expect } from 'vitest';
import { validateAndParseUrl } from '../security/url-validator.js';
import { AppError } from '@video-player/shared';

describe('URL Validator', () => {
  it('accepts valid HTTP and HTTPS URLs', () => {
    const url1 = validateAndParseUrl('https://example.com/video.mp4');
    expect(url1.protocol).toBe('https:');
    expect(url1.hostname).toBe('example.com');
    expect(url1.pathname).toBe('/video.mp4');

    const url2 = validateAndParseUrl('http://cdn.example.org:8080/stream.m3u8?token=xyz');
    expect(url2.port).toBe('8080');
    expect(url2.searchParams.get('token')).toBe('xyz');
  });

  it('rejects disallowed protocols (file, ftp, javascript, gopher)', () => {
    expect(() => validateAndParseUrl('file:///etc/passwd')).toThrowError(AppError);
    expect(() => validateAndParseUrl('ftp://example.com/file')).toThrowError(AppError);
    expect(() => validateAndParseUrl('javascript:alert(1)')).toThrowError(AppError);
    expect(() => validateAndParseUrl('data:text/html,test')).toThrowError(AppError);
  });

  it('rejects embedded credentials in URL', () => {
    expect(() => validateAndParseUrl('http://admin:secret@example.com/video.mp4')).toThrowError(
      /authentication credentials/
    );
  });

  it('rejects localhost and private hostnames', () => {
    expect(() => validateAndParseUrl('http://localhost/video.mp4')).toThrowError(/blocked/);
    expect(() => validateAndParseUrl('http://127.0.0.1/video.mp4')).toThrowError(/blocked/);
    expect(() => validateAndParseUrl('http://0.0.0.0:80/video.mp4')).toThrowError(/blocked/);
    expect(() => validateAndParseUrl('http://app.local/video.mp4')).toThrowError(/blocked/);
    expect(() => validateAndParseUrl('http://server.internal/video.mp4')).toThrowError(/blocked/);
  });

  it('rejects forbidden ports', () => {
    expect(() => validateAndParseUrl('http://example.com:22/video.mp4')).toThrowError(/Port 22 is not allowed/);
    expect(() => validateAndParseUrl('http://example.com:25/video.mp4')).toThrowError(/Port 25 is not allowed/);
    expect(() => validateAndParseUrl('http://example.com:3306/video.mp4')).toThrowError(/Port 3306 is not allowed/);
  });

  it('rejects numeric/hex encoded IP tricks', () => {
    expect(() => validateAndParseUrl('http://0x7f000001/video.mp4')).toThrowError(/blocked/i);
    expect(() => validateAndParseUrl('http://2130706433/video.mp4')).toThrowError(/blocked/i);
  });

  it('rejects overly long URLs', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2500);
    expect(() => validateAndParseUrl(longUrl)).toThrowError(/maximum permitted length/);
  });
});
