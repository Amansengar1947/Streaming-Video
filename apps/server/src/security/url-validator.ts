import { AppError } from '@video-player/shared';
import { isPrivateOrBlockedIp } from './ip-guard.js';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);
const MAX_URL_LENGTH = 2048;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  'instance-data',
]);

/**
 * Validates and normalizes a candidate URL string.
 * Enforces protocol, port, hostname, and anti-SSRF formatting rules.
 */
export function validateAndParseUrl(rawUrl: string): URL {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new AppError('INVALID_URL', 400, 'URL must be a non-empty string.');
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new AppError('INVALID_URL', 400, `URL exceeds maximum permitted length of ${MAX_URL_LENGTH} characters.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (err: any) {
    throw new AppError('INVALID_URL', 400, `Failed to parse URL: ${err.message}`);
  }

  // Check protocol
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new AppError(
      'UNSUPPORTED_URL',
      400,
      `Protocol '${parsed.protocol}' is not allowed. Only HTTP and HTTPS are supported.`
    );
  }

  // Reject URLs with embedded credentials (e.g., http://user:pass@host)
  if (parsed.username || parsed.password) {
    throw new AppError(
      'INVALID_URL',
      400,
      'URLs containing username or password authentication credentials are not permitted.'
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  // Check hostname against blocked list
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new AppError('BLOCKED_URL', 403, `Access to host '${hostname}' is blocked.`);
  }

  // Reject local domain suffixes
  if (
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.home') ||
    hostname.endsWith('.corp') ||
    hostname.endsWith('.arpa')
  ) {
    throw new AppError('BLOCKED_URL', 403, `Access to private domain '${hostname}' is blocked.`);
  }

  // Validate port if specified
  if (parsed.port) {
    const portNum = parseInt(parsed.port, 10);
    if (isNaN(portNum) || !ALLOWED_PORTS.has(portNum)) {
      throw new AppError(
        'BLOCKED_URL',
        403,
        `Port ${parsed.port} is not allowed. Only standard web ports (80, 443, 8080, 8443) are permitted.`
      );
    }
  }

  // Detect decimal / octal / hex encoded IP addresses (e.g. 2130706433 or 0x7f.1)
  if (/^(0x[0-9a-f]+|\d+)$/i.test(hostname)) {
    throw new AppError('BLOCKED_URL', 403, 'Numeric IP representations are prohibited.');
  }

  // If hostname is directly an IP literal, validate it immediately
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.startsWith('[') || hostname.includes(':')) {
    const cleanIp = hostname.replace(/^\[|\]$/g, '');
    if (isPrivateOrBlockedIp(cleanIp)) {
      throw new AppError('BLOCKED_URL', 403, `IP address '${cleanIp}' is restricted.`);
    }
  }

  return parsed;
}
