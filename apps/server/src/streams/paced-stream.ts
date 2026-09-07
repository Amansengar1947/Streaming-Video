import { Transform, type TransformCallback, type TransformOptions } from 'node:stream';

export interface PacedStreamOptions extends TransformOptions {
  /**
   * Number of bytes to send at full unthrottled line speed upon stream start.
   * Allows media player to buffer container headers and initial keyframes instantly.
   * Default: 16 MB (16,777,216 bytes).
   */
  initialBurstBytes?: number;

  /**
   * Target pacing rate in bytes per second for steady-state playback.
   * Default: 1.5 MB/s (1,572,864 bytes/sec = ~12.5 Mbps).
   */
  pacingRateBytesPerSec?: number;

  /**
   * Maximum token bucket capacity during steady state (prevents excessive bursts after pauses).
   * Default: 2 MB (2,097,152 bytes).
   */
  steadyBucketCapacity?: number;

  /**
   * Optional callback triggered on each chunk dispatch with the chunk size in bytes.
   */
  onChunk?: (bytes: number) => void;
}

/**
 * Token-Bucket PacedStream
 *
 * Provides smooth, backpressure-aware bandwidth throttling for media streams.
 * Eliminates unthrottled full-file gigabyte downloads while ensuring instant playback starts.
 */
export class PacedStream extends Transform {
  private initialBurstBytes: number;
  private bytesPerSec: number;
  private steadyBucketCapacity: number;
  private onChunk?: (bytes: number) => void;

  private tokens: number;
  private lastRefillTime: number;
  private hasBurstCompleted = false;
  private totalBytesSent = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: PacedStreamOptions = {}) {
    super(options);

    this.initialBurstBytes = options.initialBurstBytes ?? 16 * 1024 * 1024;
    this.bytesPerSec = options.pacingRateBytesPerSec ?? Math.floor(1.5 * 1024 * 1024);
    this.steadyBucketCapacity = options.steadyBucketCapacity ?? 2 * 1024 * 1024;
    this.onChunk = options.onChunk;

    // Start with a full initial burst bucket
    this.tokens = this.initialBurstBytes;
    this.lastRefillTime = Date.now();
  }

  public getBytesSent(): number {
    return this.totalBytesSent;
  }

  public getPacingRate(): number {
    return this.bytesPerSec;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    if (this.destroyed) {
      return;
    }

    const chunkSize = chunk.length;
    const now = Date.now();

    // Refill tokens based on elapsed time since last chunk
    const elapsedSeconds = Math.max(0, (now - this.lastRefillTime) / 1000);
    this.lastRefillTime = now;

    if (!this.hasBurstCompleted) {
      // During burst phase:
      if (this.tokens >= chunkSize) {
        this.tokens -= chunkSize;
        this.totalBytesSent += chunkSize;
        this.onChunk?.(chunkSize);
        this.push(chunk);
        return callback();
      }

      // Initial burst has completed
      this.hasBurstCompleted = true;
      this.tokens = 0;
    } else {
      // Steady-state token bucket refill
      this.tokens = Math.min(
        this.steadyBucketCapacity,
        this.tokens + elapsedSeconds * this.bytesPerSec
      );
    }

    // Steady-state evaluation
    if (this.tokens >= chunkSize) {
      this.tokens -= chunkSize;
      this.totalBytesSent += chunkSize;
      this.onChunk?.(chunkSize);
      this.push(chunk);
      return callback();
    }

    // Need more tokens: calculate wait delay
    const neededTokens = chunkSize - this.tokens;
    const delayMs = Math.max(1, Math.ceil((neededTokens / this.bytesPerSec) * 1000));

    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.destroyed) {
        return;
      }
      this.lastRefillTime = Date.now();
      this.tokens = 0;
      this.totalBytesSent += chunkSize;
      this.onChunk?.(chunkSize);
      this.push(chunk);
      callback();
    }, delayMs);
  }

  override _destroy(err: Error | null, callback: (error: Error | null) => void): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    callback(err);
  }
}
