import crypto from 'node:crypto';

export interface Config {
  port: number;
  host: string;
  corsOrigin: string;
  resolveTimeoutMs: number;
  proxyMaxBytes: number;
  proxyTimeoutMs: number;
  maxRedirects: number;
  cacheMaxEntries: number;
  cacheTtlMs: number;
  resolveRateLimitMax: number;
  proxyRateLimitMax: number;
  rateLimitWindowMs: number;
  proxySecret: string;
  nodeEnv: string;
  warpProxyUrl?: string;
}

const defaultSecret =
  process.env.NODE_ENV === 'production'
    ? crypto.randomBytes(32).toString('hex')
    : 'dev-proxy-secret-mediadeck-stream-2025';

export const config: Config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  resolveTimeoutMs: parseInt(process.env.RESOLVE_TIMEOUT_MS || '10000', 10),
  proxyMaxBytes: parseInt(process.env.PROXY_MAX_BYTES || '10737418240', 10), // 10GB limit
  proxyTimeoutMs: parseInt(process.env.PROXY_TIMEOUT_MS || '30000', 10),
  maxRedirects: parseInt(process.env.MAX_REDIRECTS || '5', 10),
  cacheMaxEntries: parseInt(process.env.CACHE_MAX_ENTRIES || '100', 10),
  cacheTtlMs: parseInt(process.env.CACHE_TTL_MS || '300000', 10), // 5 minutes
  resolveRateLimitMax: parseInt(process.env.RESOLVE_RATE_LIMIT_MAX || '60', 10),
  proxyRateLimitMax: parseInt(process.env.PROXY_RATE_LIMIT_MAX || '120', 10),
  rateLimitWindowMs: 60 * 1000,
  proxySecret: process.env.PROXY_SECRET || defaultSecret,
  nodeEnv: process.env.NODE_ENV || 'development',
  warpProxyUrl: process.env.WARP_PROXY_URL || process.env.HTTP_PROXY,
};
