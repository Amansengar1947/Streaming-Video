import * as cheerio from 'cheerio';
import { repairMalformedForms } from '../browser/form-repair.js';

/**
 * Curated list of high-traffic ad networks, popunder networks, ad-trackers,
 * and malicious redirect domains commonly found on free streaming/download pages.
 */
export const AD_DOMAINS = new Set([
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'adnxs.com',
  'adsterra.com',
  'propellerads.com',
  'popads.net',
  'popcash.net',
  'exoclick.com',
  'trafficjunky.com',
  'outbrain.com',
  'taboola.com',
  'mgid.com',
  'criteo.com',
  'criteo.net',
  'bidswitch.net',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'appnexus.com',
  'media.net',
  'revcontent.com',
  'adthrive.com',
  'monetag.com',
  'admaven.com',
  'clickadu.com',
  'yllix.com',
  'adcash.com',
  'infolinks.com',
  'zeroredirect1.com',
  'bet365.com',
  '1xbet.com',
  'exosrv.com',
  'tsyndicate.com',
  'ad-delivery.net',
  'adservice.google.com',
  'scorecardresearch.com',
  'quantserve.com',
  'hotjar.com',
  'popunder.net',
  'adlightning.com',
  'driverhugoverblown.com',
  'llvpn.com',
  'deloton.com',
  'highperformanceformat.com',
  'onclickperformance.com',
]);

const AD_URL_PATTERNS = [
  /\/pagead\//i,
  /\/adservice\//i,
  /\/popunder/i,
  /\/pop_under/i,
  /\/adsterra/i,
  /\/exoclick/i,
  /\/propeller/i,
  /\/banner[-_]ad/i,
  /\/ad[-_]delivery/i,
  /\/ad[-_]server/i,
  /\/advertisement/i,
  /adsbygoogle/i,
];

/**
 * Checks whether a given URL belongs to an ad or tracker network.
 */
export function isAdUrl(rawUrl: string | URL): boolean {
  try {
    const parsed = typeof rawUrl === 'string' ? new URL(rawUrl) : rawUrl;
    const hostname = parsed.hostname.toLowerCase();

    // Check exact domain or subdomain match
    for (const adDomain of AD_DOMAINS) {
      if (hostname === adDomain || hostname.endsWith(`.${adDomain}`)) {
        return true;
      }
    }

    // Check URL pattern
    const fullUrl = parsed.toString();
    for (const pattern of AD_URL_PATTERNS) {
      if (pattern.test(fullUrl)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Strips ad scripts, iframes, and known ad elements from HTML.
 */
export function cleanAdHtml(html: string): { cleanedHtml: string; blockedCount: number } {
  try {
    const repaired = repairMalformedForms(html);
    const $ = cheerio.load(repaired);
    let blockedCount = 0;

    // 1. Remove script tags targeting ad domains or ad patterns
    $('script').each((_, el) => {
      const src = $(el).attr('src') || '';
      const text = $(el).text();

      if (src && isAdUrl(src)) {
        $(el).remove();
        blockedCount++;
        return;
      }

      // Inline scripts loading ad libraries or popunders
      if (
        text.includes('adsbygoogle') ||
        text.includes('adsterra') ||
        text.includes('exoclick') ||
        text.includes('popads') ||
        text.includes('propellerads')
      ) {
        $(el).remove();
        blockedCount++;
      }
    });

    // 2. Remove iframes targeting ad domains
    $('iframe').each((_, el) => {
      const src = $(el).attr('src') || '';
      if (src && isAdUrl(src)) {
        $(el).remove();
        blockedCount++;
      }
    });

    // 3. Remove common ad banner containers
    const adSelectors = [
      '.adsbygoogle',
      '[id*="google_ads"]',
      '[class*="ad-banner"]',
      '[class*="ad-container"]',
      '[id*="ad-banner"]',
      '[class*="popunder"]',
      '[id*="popunder"]',
    ];

    for (const selector of adSelectors) {
      const matches = $(selector);
      if (matches.length > 0) {
        blockedCount += matches.length;
        matches.remove();
      }
    }

    return {
      cleanedHtml: $.html(),
      blockedCount,
    };
  } catch {
    return {
      cleanedHtml: html,
      blockedCount: 0,
    };
  }
}
