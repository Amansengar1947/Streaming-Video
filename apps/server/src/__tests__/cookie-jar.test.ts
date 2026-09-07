import { describe, it, expect, beforeEach } from 'vitest';
import { ProxyCookieJar } from '../security/cookie-jar.js';

describe('ProxyCookieJar', () => {
  let jar: ProxyCookieJar;

  beforeEach(() => {
    jar = new ProxyCookieJar();
  });

  it('stores and retrieves session cookies for a domain', () => {
    jar.saveCookies('example.com', 'PHPSESSID=abc123xyz; path=/; secure; HttpOnly');
    const header = jar.getCookieHeader('example.com');
    expect(header).toBe('PHPSESSID=abc123xyz');
  });

  it('handles multiple cookies and updates existing ones', () => {
    jar.saveCookies('example.com', [
      'session_id=123; path=/',
      'theme=dark; path=/',
    ]);

    let header = jar.getCookieHeader('example.com');
    expect(header).toContain('session_id=123');
    expect(header).toContain('theme=dark');

    // Update session_id
    jar.saveCookies('example.com', 'session_id=456; path=/');
    header = jar.getCookieHeader('example.com');
    expect(header).toContain('session_id=456');
    expect(header).not.toContain('session_id=123');
  });

  it('isolates cookies by domain', () => {
    jar.saveCookies('site-a.com', 'token=a');
    jar.saveCookies('site-b.com', 'token=b');

    expect(jar.getCookieHeader('site-a.com')).toBe('token=a');
    expect(jar.getCookieHeader('site-b.com')).toBe('token=b');
    expect(jar.getCookieHeader('site-c.com')).toBeUndefined();
  });

  it('removes expired cookies (max-age=0)', () => {
    jar.saveCookies('example.com', 'token=valid; path=/');
    expect(jar.getCookieHeader('example.com')).toBe('token=valid');

    jar.saveCookies('example.com', 'token=; max-age=0; path=/');
    expect(jar.getCookieHeader('example.com')).toBeUndefined();
  });
});
