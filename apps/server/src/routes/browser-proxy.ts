import type { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { request as undiciRequest } from 'undici';
import * as cheerio from 'cheerio';
import { AppError } from '@video-player/shared';
import { validateAndParseUrl } from '../security/url-validator.js';
import { resolveAndValidateHost } from '../security/dns-resolver.js';
import { ssrfSafeAgent } from '../http/client.js';
import { isAdUrl, cleanAdHtml } from '../security/adblock.js';
import { proxyCookieJar } from '../security/cookie-jar.js';
import { generateSnifferScript } from '../browser/sniffer-script.js';
import { repairMalformedForms, associateOrphanedFormElements } from '../browser/form-repair.js';
import { config } from '../config.js';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-security-policy',
  'x-frame-options',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
]);

export const browserProxyRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<TypeBoxTypeProvider>();

  // Serves standalone sniffer script if needed
  server.get('/api/browser/sniffer.js', async (_req, reply) => {
    reply.header('Content-Type', 'application/javascript; charset=utf-8');
    reply.header('Cache-Control', 'public, max-age=3600');
    return reply.send(generateSnifferScript({ adBlockEnabled: true }));
  });

  // Handles both GET and POST requests for the in-app browser proxy
  server.route({
    method: ['GET', 'POST'],
    url: '/api/browser/proxy',
    schema: {
      querystring: Type.Object({
        url: Type.String({ minLength: 1 }),
        adblock: Type.Optional(Type.String()),
        ref: Type.Optional(Type.String()),
      }),
    },
    handler: async (request, reply) => {
      const { url, adblock = '1', ref } = request.query;
      const isAdBlockOn = adblock !== '0';

      // 1. URL Validation
      let targetUrl: URL;
      try {
        targetUrl = validateAndParseUrl(url);
      } catch (err: any) {
        const status = err instanceof AppError ? err.statusCode : 400;
        return reply.status(status).send({
          code: err instanceof AppError ? err.code : 'INVALID_URL',
          message: err.message || 'Invalid browser proxy URL.',
        });
      }

      // 2. Ad-Block check: if ad blocking is active and target URL is known ad/tracker, drop it immediately without DNS overhead
      if (isAdBlockOn && isAdUrl(targetUrl)) {
        reply.header('x-mediadeck-blocked-ad', 'true');
        return reply.status(204).send();
      }

      // 3. SSRF & Host Validation for legitimate targets
      try {
        await resolveAndValidateHost(targetUrl.hostname);
      } catch (err: any) {
        const status = err instanceof AppError ? err.statusCode : 400;
        return reply.status(status).send({
          code: err instanceof AppError ? err.code : 'INVALID_URL',
          message: err.message || 'Invalid browser proxy URL.',
        });
      }

      const abortController = new AbortController();
      request.raw.on('close', () => {
        if (!request.raw.complete) {
          abortController.abort();
        }
      });

      // Realistic modern browser headers (Chrome 131)
      const requestHeaders: Record<string, string> = {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-origin',
      };

      let currentMethod = request.method as 'GET' | 'POST';
      let currentBody: any = undefined;

      // Handle POST form submission data
      if (currentMethod === 'POST') {
        currentBody = request.body;
        const incomingCt = request.headers['content-type'];
        if (incomingCt) {
          requestHeaders['content-type'] = incomingCt;
        }
        requestHeaders['origin'] = targetUrl.origin;
        requestHeaders['referer'] = targetUrl.href;
      } else if (ref) {
        requestHeaders['referer'] = ref;
      }

      // Inject persistent session cookies for this domain
      const existingCookies = proxyCookieJar.getCookieHeader(targetUrl.hostname);
      if (existingCookies) {
        requestHeaders['cookie'] = existingCookies;
      }

      try {
        let currentTarget = targetUrl;
        let upstream: any = null;

        // Follow redirects safely
        for (let hop = 0; hop <= config.maxRedirects; hop++) {
          upstream = await undiciRequest(currentTarget.toString(), {
            dispatcher: ssrfSafeAgent,
            signal: abortController.signal,
            method: currentMethod,
            headers: requestHeaders,
            body: currentBody,
          });

          // Save upstream cookies from every hop
          if (upstream.headers['set-cookie']) {
            proxyCookieJar.saveCookies(currentTarget.hostname, upstream.headers['set-cookie']);
          }

          if ([301, 302, 303, 307, 308].includes(upstream.statusCode)) {
            const location = upstream.headers['location'];
            upstream.body.on('error', () => {});
            await upstream.body.dump();

            if (!location || typeof location !== 'string') {
              break;
            }

            currentTarget = new URL(location, currentTarget);
            currentTarget = validateAndParseUrl(currentTarget.toString());
            await resolveAndValidateHost(currentTarget.hostname);

            // RFC 7231 / RFC 9110: 301, 302, and 303 switch method to GET and clear body
            if ([301, 302, 303].includes(upstream.statusCode)) {
              currentMethod = 'GET';
              currentBody = undefined;
              delete requestHeaders['content-type'];
              delete requestHeaders['content-length'];
            }

            // Update cookie header for the new host
            const nextCookies = proxyCookieJar.getCookieHeader(currentTarget.hostname);
            if (nextCookies) {
              requestHeaders['cookie'] = nextCookies;
            } else {
              delete requestHeaders['cookie'];
            }
            requestHeaders['referer'] = currentTarget.href;
            continue;
          }

          break;
        }

        if (!upstream) {
          return reply.status(502).send({
            code: 'RESOLUTION_FAILED',
            message: 'Failed to connect to target URL.',
          });
        }

        // Save cookies from final response
        if (upstream.headers['set-cookie']) {
          proxyCookieJar.saveCookies(currentTarget.hostname, upstream.headers['set-cookie']);
        }

        const rawCt = upstream.headers['content-type'];
        const contentType = Array.isArray(rawCt) ? rawCt[0] : (rawCt || '');
        const isHtml = contentType.toLowerCase().includes('text/html');

        // Forward safe response headers
        for (const [key, val] of Object.entries(upstream.headers)) {
          const lowerKey = key.toLowerCase();
          if (!HOP_BY_HOP_HEADERS.has(lowerKey) && val !== undefined) {
            reply.header(key, val);
          }
        }

        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');

        // Handle HTML pages: clean ads, rewrite navigation, inject 1DM sniffer
        if (isHtml) {
          const chunks: Buffer[] = [];
          for await (const chunk of upstream.body) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const rawHtml = Buffer.concat(chunks).toString('utf-8');
          let processedHtml = repairMalformedForms(rawHtml);
          let blockedAdCount = 0;

          if (isAdBlockOn) {
            const cleanRes = cleanAdHtml(processedHtml);
            processedHtml = cleanRes.cleanedHtml;
            blockedAdCount = cleanRes.blockedCount;
          }

          const $ = cheerio.load(processedHtml);

          const clientHost = request.headers['host'] || 'localhost:3001';
          const clientProto = (request.headers['x-forwarded-proto'] as string) || 'http';
          const proxyBase = `${clientProto}://${clientHost}/api/browser/proxy`;

          // Strip frame-busting headers or meta refresh tags
          $('meta[http-equiv="X-Frame-Options"]').remove();
          $('meta[http-equiv="Content-Security-Policy"]').remove();

          // Strip any <base> tag so the browser does not resolve relative proxy links to upstream origins
          $('base').remove();

          // Rewrite subresources so relative stylesheets, scripts, images, and video sources resolve directly to upstream origin
          $('link[href]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && !href.startsWith('data:') && !href.startsWith('#') && !href.startsWith('javascript:')) {
              try {
                $(el).attr('href', new URL(href, currentTarget.href).href);
              } catch {}
            }
          });
          $('script[src]').each((_, el) => {
            const src = $(el).attr('src');
            if (src && !src.startsWith('data:') && !src.startsWith('javascript:')) {
              try {
                $(el).attr('src', new URL(src, currentTarget.href).href);
              } catch {}
            }
          });
          $('img[src]').each((_, el) => {
            const src = $(el).attr('src');
            if (src && !src.startsWith('data:')) {
              try {
                $(el).attr('src', new URL(src, currentTarget.href).href);
              } catch {}
            }
          });
          $('source[src]').each((_, el) => {
            const src = $(el).attr('src');
            if (src && !src.startsWith('data:')) {
              try {
                $(el).attr('src', new URL(src, currentTarget.href).href);
              } catch {}
            }
          });
          $('iframe[src]').each((_, el) => {
            const src = $(el).attr('src');
            if (src && !src.startsWith('data:') && !src.startsWith('javascript:') && !src.startsWith('about:')) {
              try {
                $(el).attr('src', new URL(src, currentTarget.href).href);
              } catch {}
            }
          });

          // Rewrite <a href> so clicks stay inside in-app browser proxy with absolute URL authority
          $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            const target = $(el).attr('target');
            if (
              href &&
              !href.startsWith('#') &&
              !href.startsWith('javascript:') &&
              !href.startsWith('mailto:') &&
              !href.startsWith('tel:')
            ) {
              try {
                const abs = new URL(href, currentTarget.href).href;
                const proxyHref = `${proxyBase}?url=${encodeURIComponent(abs)}&adblock=${adblock}`;
                $(el).attr('href', proxyHref);
                $(el).attr('data-original-url', abs);

                // If link was originally target="_blank", mark it for the sniffer script to open in a new tab
                if (target === '_blank') {
                  $(el).attr('data-mediadeck-newtab', 'true');
                }
                $(el).attr('target', '_self'); // Don't break out of the iframe
              } catch {}
            }
          });

          // Rewrite <form action> and assign unique IDs to each form
          $('form').each((i, el) => {
            const formId = $(el).attr('id') || `mediadeck-form-${i}`;
            $(el).attr('id', formId);

            const action = $(el).attr('action');
            let resolvedAction = currentTarget.href;
            if (action && !action.startsWith('javascript:')) {
              try {
                resolvedAction = new URL(action, currentTarget.href).href;
              } catch {}
            }
            const proxyAction = `${proxyBase}?url=${encodeURIComponent(resolvedAction)}&adblock=${adblock}`;
            $(el).attr('action', proxyAction);
            $(el).attr('target', '_self');
          });

          // Ensure orphaned submit buttons/inputs are bound to nearest preceding form
          associateOrphanedFormElements($);

          // Inject 1DM-style Media Sniffer & Popup Suppressor script
          const snifferJs = generateSnifferScript({
            adBlockEnabled: isAdBlockOn,
            currentTargetUrl: currentTarget.href,
          });
          $('head').prepend(`<script id="mediadeck-sniffer">${snifferJs}</script>`);

          reply.header('Content-Type', 'text/html; charset=utf-8');
          reply.header('x-mediadeck-blocked-ads-count', blockedAdCount.toString());
          reply.status(200);
          return reply.send($.html());
        }

        // Non-HTML content (images, styles, audio/video streams)
        reply.status(upstream.statusCode);
        return reply.send(upstream.body);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        return reply.status(502).send({
          code: 'NETWORK_ERROR',
          message: `Browser proxy failed: ${err.message}`,
        });
      }
    },
  });
};
