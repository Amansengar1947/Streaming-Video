import { Agent, ProxyAgent, buildConnector, request as undiciRequest, Dispatcher } from 'undici';
import { AppError } from '@video-player/shared';
import { validateAndParseUrl } from '../security/url-validator.js';
import { resolveAndValidateHost } from '../security/dns-resolver.js';
import { config } from '../config.js';

const customConnector = buildConnector({
  lookup: async (hostname, options, callback) => {
    try {
      const records = await resolveAndValidateHost(hostname);
      if (options && options.all) {
        callback(null, records as any);
      } else {
        callback(null, records[0].address as any, records[0].family as any);
      }
    } catch (err: any) {
      callback(err, null as any);
    }
  },
});

const defaultAgent = new Agent({
  connect: customConnector,
  connectTimeout: 5000,
  headersTimeout: config.resolveTimeoutMs,
  bodyTimeout: config.resolveTimeoutMs * 2,
});

export const ssrfSafeAgent: Dispatcher = config.warpProxyUrl
  ? new ProxyAgent({
      uri: config.warpProxyUrl,
      connectTimeout: 5000,
      headersTimeout: config.resolveTimeoutMs,
      bodyTimeout: config.resolveTimeoutMs * 2,
    })
  : defaultAgent;

export interface SafeHttpResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  finalUrl: string;
  body: Dispatcher.ResponseData['body'];
  text: (maxBytes?: number) => Promise<string>;
  json: <T = unknown>(maxBytes?: number) => Promise<T>;
}

export interface SafeFetchOptions {
  method?: Dispatcher.HttpMethod;
  headers?: Record<string, string>;
  maxRedirects?: number;
  timeoutMs?: number;
}

/**
 * Safely fetches a URL by enforcing SSRF checks on initial target and every redirect hop.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeHttpResponse> {
  const maxRedirects = options.maxRedirects ?? config.maxRedirects;
  let currentUrl = validateAndParseUrl(rawUrl);

  for (let redirectHop = 0; redirectHop <= maxRedirects; redirectHop++) {
    // Validate DNS and IP before connecting
    await resolveAndValidateHost(currentUrl.hostname);

    let response: Dispatcher.ResponseData;

    const timeoutMs = options.timeoutMs ?? config.resolveTimeoutMs;
    const signal = AbortSignal.timeout(timeoutMs);

    try {
      response = await undiciRequest(currentUrl.toString(), {
        dispatcher: ssrfSafeAgent,
        method: options.method ?? 'GET',
        signal,
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 VideoPlayer/1.0',
          accept: '*/*',
          'accept-language': 'en-US,en;q=0.9',
          ...(options.headers || {}),
        },
      });
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.code === 'UND_ERR_HEADERS_TIMEOUT' || err.code === 'UND_ERR_BODY_TIMEOUT') {
        throw new AppError('TIMEOUT', 504, `Request to ${currentUrl.hostname} timed out after ${timeoutMs}ms.`);
      }
      throw new AppError('NETWORK_ERROR', 502, `Network error connecting to ${currentUrl.hostname}: ${err.message}`);
    }

    // Check for HTTP redirect
    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      const location = response.headers['location'];
      response.body.on('error', () => {});
      await response.body.dump();

      if (!location || typeof location !== 'string') {
        throw new AppError('RESOLUTION_FAILED', 502, 'Redirect response missing Location header.');
      }

      // Resolve relative redirect safely
      try {
        currentUrl = new URL(location, currentUrl);
      } catch {
        throw new AppError('INVALID_URL', 400, `Invalid redirect target: ${location}`);
      }

      // Re-validate new URL
      currentUrl = validateAndParseUrl(currentUrl.toString());
      continue;
    }

    const finalUrlStr = currentUrl.toString();

    const readToBuffer = async (maxBytes: number = 5 * 1024 * 1024): Promise<Buffer> => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      for await (const chunk of response.body) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buf.length;
        if (totalBytes > maxBytes) {
          response.body.on('error', () => {});
          response.body.destroy();
          throw new AppError(
            'RESOLUTION_FAILED',
            413,
            `Response body exceeded maximum allowed size of ${maxBytes} bytes.`
          );
        }
        chunks.push(buf);
      }
      return Buffer.concat(chunks);
    };

    return {
      statusCode: response.statusCode,
      headers: response.headers,
      finalUrl: finalUrlStr,
      body: response.body,
      text: async (maxBytes?: number) => {
        const buf = await readToBuffer(maxBytes);
        return buf.toString('utf-8');
      },
      json: async <T>(maxBytes?: number) => {
        const buf = await readToBuffer(maxBytes);
        return JSON.parse(buf.toString('utf-8')) as T;
      },
    };
  }

  throw new AppError('RESOLUTION_FAILED', 502, `Exceeded maximum redirect limit of ${maxRedirects}.`);
}
