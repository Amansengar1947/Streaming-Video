import type { ResolvedMedia } from '@video-player/shared';

export interface ResolverContext {
  rawUrl: string;
  parsedUrl: URL;
  sharedHtml?: string;
  sharedContentType?: string;
  sharedHeadHeaders?: Record<string, string | string[] | undefined>;
}

export interface Resolver {
  name: string;
  resolve(ctx: ResolverContext): Promise<ResolvedMedia | null>;
}
