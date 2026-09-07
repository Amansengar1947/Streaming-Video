import type { StreamTelemetry } from '@video-player/shared';

export interface StreamSession {
  url: string;
  mode: 'remux' | 'proxy';
  bytesTransferred: number;
  speedBytesPerSec: number;
  pacingRate: number;
  startTime: number;
  lastActivityTime: number;
  active: boolean;
  duration?: number;
}

export class StreamTracker {
  private sessions = new Map<string, StreamSession>();
  private speedWindows = new Map<string, { bytes: number; time: number }>();
  private cachedDurations = new Map<string, number>();

  private normalizeUrl(url: string): string {
    if (!url) return '';
    try {
      if (url.includes('url=')) {
        const dummy = new URL(url, 'http://localhost');
        const inner = dummy.searchParams.get('url');
        if (inner) return inner;
      }
    } catch {}
    return url;
  }

  public startSession(rawUrl: string, mode: 'remux' | 'proxy', pacingRate: number): void {
    const url = this.normalizeUrl(rawUrl);
    const now = Date.now();
    const existingDuration = this.cachedDurations.get(url);
    this.sessions.set(url, {
      url,
      mode,
      bytesTransferred: 0,
      speedBytesPerSec: 0,
      pacingRate,
      startTime: now,
      lastActivityTime: now,
      active: true,
      duration: existingDuration,
    });
    this.speedWindows.set(url, { bytes: 0, time: now });
  }

  public recordBytes(rawUrl: string, bytes: number): void {
    const url = this.normalizeUrl(rawUrl);
    const session = this.sessions.get(url);
    if (!session) return;

    session.bytesTransferred += bytes;
    const now = Date.now();
    session.lastActivityTime = now;
    session.active = true;

    const win = this.speedWindows.get(url);
    if (win) {
      const dt = (now - win.time) / 1000;
      if (dt >= 0.7) {
        const db = session.bytesTransferred - win.bytes;
        session.speedBytesPerSec = Math.round(db / dt);
        win.bytes = session.bytesTransferred;
        win.time = now;
      }
    }
  }

  public setDuration(rawUrl: string, duration: number): void {
    if (!duration || isNaN(duration) || duration <= 0) return;
    const url = this.normalizeUrl(rawUrl);
    this.cachedDurations.set(url, duration);
    const session = this.sessions.get(url);
    if (session) {
      session.duration = duration;
    }
  }

  public getDuration(rawUrl: string): number | undefined {
    const url = this.normalizeUrl(rawUrl);
    return this.cachedDurations.get(url);
  }

  public endSession(rawUrl: string): void {
    const url = this.normalizeUrl(rawUrl);
    const session = this.sessions.get(url);
    if (session) {
      session.active = false;
      session.speedBytesPerSec = 0;
    }
  }

  public getStats(rawUrl: string): StreamTelemetry | null {
    const url = this.normalizeUrl(rawUrl);
    const session = this.sessions.get(url);
    const cachedDur = this.cachedDurations.get(url);

    if (!session) {
      if (cachedDur && cachedDur > 0) {
        return {
          active: false,
          bytesTransferred: 0,
          speedBytesPerSec: 0,
          pacingRate: 0,
          elapsedSeconds: 0,
          mode: 'idle',
          duration: cachedDur,
        };
      }
      return null;
    }

    const now = Date.now();
    const elapsedSeconds = Math.max(0, Math.round(((now - session.startTime) / 1000) * 10) / 10);

    // If no chunk recorded in 3.5s, rate is idle (0 B/s)
    let speed = session.speedBytesPerSec;
    if (now - session.lastActivityTime > 3500) {
      speed = 0;
    }

    return {
      active: session.active,
      bytesTransferred: session.bytesTransferred,
      speedBytesPerSec: speed,
      pacingRate: session.pacingRate,
      elapsedSeconds,
      mode: session.mode,
      duration: session.duration || cachedDur,
    };
  }
}

export const streamTracker = new StreamTracker();
