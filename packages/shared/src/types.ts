export type MediaKind = 'player' | 'embed';

export type StreamType = 'mp4' | 'webm' | 'mkv' | 'hls' | 'dash' | 'audio' | 'other';

export interface StreamInfo {
  url: string;
  type: StreamType;
  quality?: string;
  label?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  mimeType?: string;
  requiresProxy?: boolean;
  proxyUrl?: string;
  size?: number;
}

export interface StreamTelemetry {
  active: boolean;
  bytesTransferred: number;
  speedBytesPerSec: number;
  pacingRate: number;
  elapsedSeconds: number;
  mode: 'remux' | 'proxy' | 'idle';
  totalSize?: number;
  duration?: number;
}

export interface ResolvedMedia {
  kind: MediaKind;
  title?: string;
  thumbnail?: string;
  duration?: number;
  provider?: string;
  originalUrl: string;
  streams?: StreamInfo[];
  embedHtml?: string;
  warning?: string;
}

export interface SniffedMediaItem {
  id: string;
  url: string;
  title: string;
  type: StreamType;
  mimeType?: string;
  sourcePageUrl: string;
  timestamp: number;
  fileSize?: number;
}

export interface ResolveRequest {
  url: string;
}

export type ErrorCode =
  | 'INVALID_URL'
  | 'BLOCKED_URL'
  | 'UNSUPPORTED_URL'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'NO_MEDIA_FOUND'
  | 'DRM_PROTECTED'
  | 'AUTH_REQUIRED'
  | 'RESOLUTION_FAILED'
  | 'INTERNAL_ERROR';

export interface ResolveErrorResponse {
  code: ErrorCode;
  message: string;
  detail?: string;
}

export interface HealthResponse {
  status: 'ok';
  uptime: number;
  timestamp: string;
  version: string;
}
