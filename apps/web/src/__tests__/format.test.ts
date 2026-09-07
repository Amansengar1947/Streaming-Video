import { describe, it, expect } from 'vitest';
import { formatTime, formatBitrate, formatBytes } from '../utils/format.js';

describe('Frontend Format Utilities', () => {
  describe('formatTime', () => {
    it('formats seconds under an hour as MM:SS', () => {
      expect(formatTime(0)).toBe('00:00');
      expect(formatTime(5)).toBe('00:05');
      expect(formatTime(65)).toBe('01:05');
      expect(formatTime(599)).toBe('09:59');
    });

    it('formats hours as H:MM:SS', () => {
      expect(formatTime(3600)).toBe('1:00:00');
      expect(formatTime(3665)).toBe('1:01:05');
      expect(formatTime(7325)).toBe('2:02:05');
    });

    it('handles negative or NaN values safely', () => {
      expect(formatTime(-10)).toBe('00:00');
      expect(formatTime(NaN)).toBe('00:00');
    });
  });

  describe('formatBitrate', () => {
    it('formats bits per second into readable Mbps or kbps', () => {
      expect(formatBitrate(undefined)).toBe('');
      expect(formatBitrate(0)).toBe('');
      expect(formatBitrate(500000)).toBe('500 kbps');
      expect(formatBitrate(1500000)).toBe('1.5 Mbps');
      expect(formatBitrate(10000000)).toBe('10.0 Mbps');
    });
  });

  describe('formatBytes', () => {
    it('formats bytes into readable B, KB, MB, GB', () => {
      expect(formatBytes(undefined)).toBe('0 B');
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1572864)).toBe('1.5 MB');
      expect(formatBytes(1073741824)).toBe('1.0 GB');
    });
  });
});
