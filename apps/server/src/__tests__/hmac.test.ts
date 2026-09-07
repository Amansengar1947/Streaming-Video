import { describe, it, expect } from 'vitest';
import { signProxyUrl, verifyProxySignature, assertValidProxySignature } from '../security/hmac.js';

describe('HMAC Proxy URL Signer', () => {
  it('signs and verifies a valid URL', () => {
    const targetUrl = 'https://example.com/stream.mp4';
    const { expires, signature } = signProxyUrl(targetUrl);

    expect(expires).toBeGreaterThan(Date.now());
    expect(signature).toBeDefined();
    expect(signature.length).toBe(64); // sha256 hex string

    const isValid = verifyProxySignature(targetUrl, expires.toString(), signature);
    expect(isValid).toBe(true);
  });

  it('rejects tampered URL with same signature', () => {
    const originalUrl = 'https://example.com/stream.mp4';
    const tamperedUrl = 'https://malicious.com/stream.mp4';
    const { expires, signature } = signProxyUrl(originalUrl);

    const isValid = verifyProxySignature(tamperedUrl, expires.toString(), signature);
    expect(isValid).toBe(false);
  });

  it('rejects expired signature', () => {
    const targetUrl = 'https://example.com/stream.mp4';
    // Expired 10 seconds ago
    const { expires, signature } = signProxyUrl(targetUrl, -10000);

    const isValid = verifyProxySignature(targetUrl, expires.toString(), signature);
    expect(isValid).toBe(false);

    expect(() => assertValidProxySignature(targetUrl, expires.toString(), signature)).toThrowError(
      /Invalid or expired proxy signature/
    );
  });
});
