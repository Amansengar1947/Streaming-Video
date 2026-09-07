import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

describe('Server API Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health returns ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('1.0.0');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('POST /api/resolve rejects missing URL', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/resolve',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('POST /api/resolve blocks localhost / 127.0.0.1 SSRF attempts', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/resolve',
      payload: {
        url: 'http://127.0.0.1:8080/secret.mp4',
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('BLOCKED_URL');
  });

  it('POST /api/resolve blocks metadata endpoint SSRF attempts', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/resolve',
      payload: {
        url: 'http://169.254.169.254/latest/meta-data/',
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('BLOCKED_URL');
  });

  it('GET /api/proxy rejects requests without signature', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/proxy?url=https://example.com/video.mp4',
    });

    expect(response.statusCode).toBe(400); // validation error: missing expires, sig
  });

  it('GET /api/proxy rejects invalid HMAC signatures', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/proxy?url=https://example.com/video.mp4&expires=${Date.now() + 10000}&sig=fake_invalid_signature_hex`,
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('AUTH_REQUIRED');
  });

  it('GET /api/stream/remux rejects requests without signature', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/stream/remux?url=https://example.com/video.mkv',
    });

    expect(response.statusCode).toBe(400); // validation error: missing expires, sig
  });

  it('GET /api/stream/remux rejects invalid HMAC signatures', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/stream/remux?url=https://example.com/video.mkv&expires=${Date.now() + 10000}&sig=fake_invalid_signature_hex`,
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('AUTH_REQUIRED');
  });
});
