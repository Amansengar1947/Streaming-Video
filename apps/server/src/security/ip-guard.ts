import ipaddr from 'ipaddr.js';
import { AppError } from '@video-player/shared';

const DANGEROUS_RANGES = new Set([
  'loopback',
  'private',
  'linkLocal',
  'uniqueLocal',
  'unspecified',
  'broadcast',
  'carrierGradeNat',
  'reserved',
]);

const EXPLICIT_BLOCKED_IPS = new Set([
  '169.254.169.254', // AWS/GCP/Azure/OpenStack metadata endpoint
  'fd00:ec2::254',    // AWS IPv6 metadata
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  '::',
]);

/**
 * Validates whether an IP address is safe to connect to from the backend.
 * Blocks private networks, loopbacks, link-local, cloud metadata, and reserved ranges.
 */
export function isPrivateOrBlockedIp(ip: string): boolean {
  const trimmed = ip.trim();

  if (EXPLICIT_BLOCKED_IPS.has(trimmed)) {
    return true;
  }

  if (!ipaddr.isValid(trimmed)) {
    // If not a valid standard IP string, reject it for safety
    return true;
  }

  try {
    let parsed = ipaddr.parse(trimmed);

    // CRITICAL: Convert IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) to IPv4
    if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
      parsed = (parsed as ipaddr.IPv6).toIPv4Address();
    }

    const range = parsed.range();
    if (DANGEROUS_RANGES.has(range)) {
      return true;
    }

    // Additional check for 169.254.x.x link-local range in IPv4
    if (parsed.kind() === 'ipv4') {
      const octets = (parsed as ipaddr.IPv4).toByteArray();
      if (octets[0] === 169 && octets[1] === 254) {
        return true;
      }
      if (octets[0] === 127) {
        return true;
      }
      if (octets[0] === 10) {
        return true;
      }
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
        return true;
      }
      if (octets[0] === 192 && octets[1] === 168) {
        return true;
      }
      if (octets[0] === 0) {
        return true;
      }
    }

    return false;
  } catch {
    return true;
  }
}

/**
 * Throws an AppError if the IP is blocked.
 */
export function assertSafeIp(ip: string): void {
  if (isPrivateOrBlockedIp(ip)) {
    throw new AppError(
      'BLOCKED_URL',
      403,
      `Access to IP address '${ip}' is blocked for security reasons (private/internal address).`
    );
  }
}
