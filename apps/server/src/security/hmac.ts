import crypto from 'node:crypto';
import { config } from '../config.js';
import { AppError } from '@video-player/shared';

const SIGNATURE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Creates an HMAC signature for a target URL and expiration timestamp.
 */
export function signProxyUrl(targetUrl: string, ttlMs: number = SIGNATURE_TTL_MS): { expires: number; signature: string } {
  const expires = Date.now() + ttlMs;
  const payload = `${targetUrl}:${expires}`;
  const signature = crypto
    .createHmac('sha256', config.proxySecret)
    .update(payload)
    .digest('hex');

  return { expires, signature };
}

/**
 * Verifies that the HMAC signature for a target URL and expiry is valid and unexpired.
 */
export function verifyProxySignature(targetUrl: string, expiresStr: string, signature: string): boolean {
  if (!targetUrl || !expiresStr || !signature) {
    return false;
  }

  const expires = parseInt(expiresStr, 10);
  if (isNaN(expires) || Date.now() > expires) {
    // Expired
    return false;
  }

  const payload = `${targetUrl}:${expires}`;
  const expectedSig = crypto
    .createHmac('sha256', config.proxySecret)
    .update(payload)
    .digest('hex');

  try {
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const providedBuf = Buffer.from(signature, 'hex');

    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}

/**
 * Throws AppError if proxy parameters are invalid or signature is bad.
 */
export function assertValidProxySignature(targetUrl: string, expiresStr: string, signature: string): void {
  if (!verifyProxySignature(targetUrl, expiresStr, signature)) {
    throw new AppError(
      'AUTH_REQUIRED',
      403,
      'Invalid or expired proxy signature. Proxy URLs must be generated via the resolve endpoint.'
    );
  }
}
