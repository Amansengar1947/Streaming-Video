import { LRUCache } from 'lru-cache';

interface CookieEntry {
  value: string;
  expires?: number;
}

export class ProxyCookieJar {
  // Domain -> (CookieName -> CookieEntry)
  private readonly store: LRUCache<string, Map<string, CookieEntry>>;

  constructor(maxDomains = 200) {
    this.store = new LRUCache<string, Map<string, CookieEntry>>({
      max: maxDomains,
      ttl: 24 * 60 * 60 * 1000, // 24 hours
    });
  }

  /**
   * Parses and stores cookies from an upstream 'Set-Cookie' header.
   */
  public saveCookies(hostname: string, setCookies: string | string[] | undefined): void {
    if (!setCookies) return;

    const lowerHost = hostname.toLowerCase();
    let domainMap = this.store.get(lowerHost);
    if (!domainMap) {
      domainMap = new Map<string, CookieEntry>();
      this.store.set(lowerHost, domainMap);
    }

    const rawList = Array.isArray(setCookies) ? setCookies : [setCookies];

    for (const rawCookie of rawList) {
      if (!rawCookie || typeof rawCookie !== 'string') continue;

      const parts = rawCookie.split(';');
      const firstPart = parts[0]?.trim();
      if (!firstPart) continue;

      const eqIndex = firstPart.indexOf('=');
      if (eqIndex <= 0) continue;

      const name = firstPart.substring(0, eqIndex).trim();
      const value = firstPart.substring(eqIndex + 1).trim();

      // Check max-age or expires
      let expires: number | undefined;
      for (let i = 1; i < parts.length; i++) {
        const attr = parts[i]?.trim().toLowerCase() || '';
        if (attr.startsWith('max-age=')) {
          const sec = parseInt(attr.substring(8).trim(), 10);
          if (!isNaN(sec)) {
            expires = Date.now() + sec * 1000;
          }
        } else if (attr.startsWith('expires=')) {
          const dateStr = parts[i].trim().substring(8).trim();
          const expTime = Date.parse(dateStr);
          if (!isNaN(expTime)) {
            expires = expTime;
          }
        }
      }

      // If cookie expired (e.g. max-age=0), remove it
      if (expires !== undefined && expires <= Date.now()) {
        domainMap.delete(name);
      } else {
        domainMap.set(name, { value, expires });
      }
    }
  }

  /**
   * Generates the 'Cookie' header string for a given hostname.
   */
  public getCookieHeader(hostname: string): string | undefined {
    const lowerHost = hostname.toLowerCase();
    const domainMap = this.store.get(lowerHost);
    if (!domainMap || domainMap.size === 0) return undefined;

    const now = Date.now();
    const activeCookies: string[] = [];

    for (const [name, entry] of domainMap.entries()) {
      if (entry.expires !== undefined && entry.expires <= now) {
        domainMap.delete(name);
        continue;
      }
      activeCookies.push(`${name}=${entry.value}`);
    }

    if (activeCookies.length === 0) return undefined;
    return activeCookies.join('; ');
  }

  /**
   * Clears cookies for a specific domain or entirely.
   */
  public clear(hostname?: string): void {
    if (hostname) {
      this.store.delete(hostname.toLowerCase());
    } else {
      this.store.clear();
    }
  }
}

export const proxyCookieJar = new ProxyCookieJar();
