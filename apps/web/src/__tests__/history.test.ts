import { describe, it, expect } from 'vitest';
import { extractTitleFromUrl, normalizeHistoryId } from '../hooks/useWatchHistory.js';
import { formatTimeAgo } from '../components/History/HistoryCard.js';

describe('Watch History Utilities', () => {
  describe('extractTitleFromUrl', () => {
    it('extracts filename and strips file extension', () => {
      const url = 'https://example.com/videos/Big_Buck_Bunny_1080p.mp4';
      expect(extractTitleFromUrl(url)).toBe('Big Buck Bunny 1080p');
    });

    it('handles url encoded filenames', () => {
      const url = 'https://r2.cloudflarestorage.com/hubv/Mirzapur%20The%20Movie%202026.mkv';
      expect(extractTitleFromUrl(url)).toBe('Mirzapur The Movie 2026');
    });

    it('falls back to hostname and path if no filename with extension', () => {
      const url = 'https://example.com/watch/video-stream';
      expect(extractTitleFromUrl(url)).toBe('example.com/watch/video-stream');
    });
  });

  describe('normalizeHistoryId', () => {
    it('strips query parameters and hashes for canonical identification', () => {
      const u1 = 'https://example.com/video.mp4?token=123&expires=456';
      const u2 = 'https://example.com/video.mp4?token=789';
      expect(normalizeHistoryId(u1)).toBe(normalizeHistoryId(u2));
      expect(normalizeHistoryId(u1)).toBe('https://example.com/video.mp4');
    });

    it('handles lowercase normalization', () => {
      const u = 'HTTPS://EXAMPLE.COM/Path/To/Video.mkv';
      expect(normalizeHistoryId(u)).toBe('https://example.com/path/to/video.mkv');
    });
  });

  describe('formatTimeAgo', () => {
    it('formats recent timestamps correctly', () => {
      const now = Date.now();
      expect(formatTimeAgo(now - 10 * 1000)).toBe('Just now');
      expect(formatTimeAgo(now - 120 * 1000)).toBe('2m ago');
      expect(formatTimeAgo(now - 3600 * 2 * 1000)).toBe('2h ago');
      expect(formatTimeAgo(now - 86400 * 3 * 1000)).toBe('3d ago');
    });
  });
});
