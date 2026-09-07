import { describe, it, expect } from 'vitest';
import { isPrivateOrBlockedIp, assertSafeIp } from '../security/ip-guard.js';

describe('SSRF IP Guard', () => {
  it('blocks loopback addresses', () => {
    expect(isPrivateOrBlockedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrBlockedIp('127.0.0.2')).toBe(true);
    expect(isPrivateOrBlockedIp('127.255.255.254')).toBe(true);
    expect(isPrivateOrBlockedIp('::1')).toBe(true);
  });

  it('blocks 0.0.0.0 and unspecified addresses', () => {
    expect(isPrivateOrBlockedIp('0.0.0.0')).toBe(true);
    expect(isPrivateOrBlockedIp('::')).toBe(true);
  });

  it('blocks private IPv4 RFC 1918 ranges', () => {
    // 10.0.0.0/8
    expect(isPrivateOrBlockedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrBlockedIp('10.254.0.1')).toBe(true);

    // 172.16.0.0/12
    expect(isPrivateOrBlockedIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrBlockedIp('172.31.255.255')).toBe(true);

    // 192.168.0.0/16
    expect(isPrivateOrBlockedIp('192.168.1.1')).toBe(true);
    expect(isPrivateOrBlockedIp('192.168.0.254')).toBe(true);
  });

  it('blocks cloud metadata endpoints (169.254.169.254) and link-local', () => {
    expect(isPrivateOrBlockedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrBlockedIp('169.254.1.1')).toBe(true);
    expect(isPrivateOrBlockedIp('fe80::1')).toBe(true);
    expect(isPrivateOrBlockedIp('fd00:ec2::254')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 bypass attempts', () => {
    // ::ffff:127.0.0.1
    expect(isPrivateOrBlockedIp('::ffff:127.0.0.1')).toBe(true);
    // ::ffff:169.254.169.254
    expect(isPrivateOrBlockedIp('::ffff:169.254.169.254')).toBe(true);
    // ::ffff:10.0.0.1
    expect(isPrivateOrBlockedIp('::ffff:10.0.0.1')).toBe(true);
    // ::ffff:192.168.1.1
    expect(isPrivateOrBlockedIp('::ffff:192.168.1.1')).toBe(true);
  });

  it('allows safe public unicast IP addresses', () => {
    expect(isPrivateOrBlockedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrBlockedIp('1.1.1.1')).toBe(false);
    expect(isPrivateOrBlockedIp('93.184.216.34')).toBe(false);
    expect(isPrivateOrBlockedIp('151.101.1.69')).toBe(false);
  });

  it('assertSafeIp throws AppError for blocked IPs', () => {
    expect(() => assertSafeIp('127.0.0.1')).toThrowError(/blocked for security reasons/);
    expect(() => assertSafeIp('169.254.169.254')).toThrowError(/blocked for security reasons/);
    expect(() => assertSafeIp('8.8.8.8')).not.toThrow();
  });
});
