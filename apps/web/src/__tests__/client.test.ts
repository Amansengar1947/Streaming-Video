import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveUrl, checkHealth, ApiError } from '../api/client.js';

describe('Frontend API Client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('resolveUrl successfully parses JSON response', async () => {
    const mockMedia = {
      kind: 'player',
      title: 'Sample Video',
      originalUrl: 'https://example.com/video.mp4',
      streams: [{ url: 'https://example.com/video.mp4', type: 'mp4' }],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMedia,
    });

    const result = await resolveUrl('https://example.com/video.mp4');
    expect(result).toEqual(mockMedia);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/resolve',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/video.mp4' }),
      })
    );
  });

  it('resolveUrl throws ApiError on failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({
        code: 'BLOCKED_URL',
        message: 'Restricted address',
      }),
    });

    await expect(resolveUrl('http://127.0.0.1')).rejects.toThrow(ApiError);
  });

  it('checkHealth returns health status', async () => {
    const mockHealth = {
      status: 'ok',
      uptime: 120,
      timestamp: '2026-09-06T00:00:00Z',
      version: '1.0.0',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockHealth,
    });

    const result = await checkHealth();
    expect(result).toEqual(mockHealth);
  });
});
