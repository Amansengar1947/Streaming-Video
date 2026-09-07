import type { ErrorCode } from './types.js';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_URL: 'The provided URL is invalid or malformed. Please enter a valid HTTP or HTTPS URL.',
  BLOCKED_URL: 'This URL points to a restricted address or private network range and cannot be accessed.',
  UNSUPPORTED_URL: 'This URL format or protocol is not supported.',
  NETWORK_ERROR: 'Unable to reach the remote server. Please check the URL or your network connection.',
  TIMEOUT: 'The request to analyze this URL timed out. The remote server took too long to respond.',
  NO_MEDIA_FOUND: 'No playable video streams or media elements were detected at this URL.',
  DRM_PROTECTED: 'This media appears to be protected by DRM (Digital Rights Management) and cannot be played directly.',
  AUTH_REQUIRED: 'This content requires authentication or login credentials to access.',
  RESOLUTION_FAILED: 'An error occurred while processing and extracting media from this URL.',
  INTERNAL_ERROR: 'An unexpected internal error occurred. Please try again later.',
};

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly detail?: string;

  constructor(code: ErrorCode, statusCode: number = 400, detail?: string) {
    super(detail ? `${ERROR_MESSAGES[code] || code} (${detail})` : (ERROR_MESSAGES[code] || code));
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.detail = detail;
  }
}
