import { describe, it, expect } from 'vitest';
import { StreamTracker } from '../streams/stream-tracker.js';

describe('StreamTracker', () => {
  it('initializes session and returns telemetry', () => {
    const tracker = new StreamTracker();
    const url = 'https://example.com/video.mkv';

    tracker.startSession(url, 'remux', 1500000);
    const stats = tracker.getStats(url);

    expect(stats).toBeDefined();
    expect(stats?.active).toBe(true);
    expect(stats?.bytesTransferred).toBe(0);
    expect(stats?.mode).toBe('remux');
    expect(stats?.pacingRate).toBe(1500000);
  });

  it('records bytes and normalizes query URLs', () => {
    const tracker = new StreamTracker();
    const rawUrl = 'https://example.com/video.mkv';
    const proxyUrl = `/api/stream/remux?url=${encodeURIComponent(rawUrl)}&sig=abc`;

    tracker.startSession(rawUrl, 'remux', 1500000);
    tracker.recordBytes(proxyUrl, 1024 * 1024);

    const stats = tracker.getStats(proxyUrl);
    expect(stats?.bytesTransferred).toBe(1024 * 1024);

    tracker.endSession(rawUrl);
    const endedStats = tracker.getStats(rawUrl);
    expect(endedStats?.active).toBe(false);
  });
});
