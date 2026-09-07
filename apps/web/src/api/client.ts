import type { ResolvedMedia, ResolveErrorResponse, HealthResponse } from '@video-player/shared';

export class ApiError extends Error {
  public readonly code: string;
  public readonly detail?: string;
  public readonly status: number;

  constructor(data: ResolveErrorResponse, status: number) {
    super(data.message);
    this.name = 'ApiError';
    this.code = data.code;
    this.detail = data.detail;
    this.status = status;
  }
}

export async function resolveUrl(url: string, signal?: AbortSignal): Promise<ResolvedMedia> {
  let response: Response;
  try {
    response = await fetch('/api/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
      signal,
    });
  } catch (err: any) {
    throw new ApiError(
      {
        code: 'NETWORK_ERROR',
        message: 'Network connection failed. Unable to reach the server.',
        detail: err.message,
      },
      0
    );
  }

  if (!response.ok) {
    let errorData: ResolveErrorResponse;
    try {
      const text = await response.text();
      errorData = JSON.parse(text);
    } catch {
      if (response.status === 500 || response.status === 502 || response.status === 503) {
        errorData = {
          code: 'NETWORK_ERROR',
          message:
            'Backend server is offline or unreachable. Please ensure the backend server is running with "pnpm dev" or "pnpm dev:server".',
          detail: `HTTP ${response.status}: ${response.statusText}`,
        };
      } else {
        errorData = {
          code: 'RESOLUTION_FAILED',
          message: `Request failed with status ${response.status} (${response.statusText})`,
        };
      }
    }
    throw new ApiError(errorData, response.status);
  }

  return response.json();
}

export async function checkHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal });
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  return response.json();
}
