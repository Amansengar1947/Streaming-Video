import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import { PacedStream } from '../streams/paced-stream.js';

describe('PacedStream', () => {
  it('allows initial burst data through without delay', async () => {
    // 50 KB burst, 10 KB/s rate
    const burstSize = 50 * 1024;
    const rate = 10 * 1024;
    const paced = new PacedStream({ initialBurstBytes: burstSize, pacingRateBytesPerSec: rate });

    const chunk1 = Buffer.alloc(20 * 1024, 0x01);
    const chunk2 = Buffer.alloc(20 * 1024, 0x02);

    const received: Buffer[] = [];
    const startTime = Date.now();

    await new Promise<void>((resolve, reject) => {
      const source = Readable.from([chunk1, chunk2]);
      source.pipe(paced);

      paced.on('data', (d) => received.push(d));
      paced.on('end', resolve);
      paced.on('error', reject);
    });

    const elapsed = Date.now() - startTime;
    // 40 KB is within the 50 KB burst, should complete instantly (< 200ms)
    expect(elapsed).toBeLessThan(500);
    expect(Buffer.concat(received).length).toBe(40 * 1024);
    expect(paced.getBytesSent()).toBe(40 * 1024);
  });

  it('paces subsequent data after burst is exhausted', async () => {
    // 10 KB burst, 20 KB/s rate. Sending 10 KB burst + 20 KB steady = 30 KB total.
    // 20 KB at 20 KB/s should take ~1 second (at least 700ms).
    const burstSize = 10 * 1024;
    const rate = 20 * 1024;
    const paced = new PacedStream({ initialBurstBytes: burstSize, pacingRateBytesPerSec: rate });

    const chunkBurst = Buffer.alloc(10 * 1024, 0x01);
    const chunkSteady1 = Buffer.alloc(10 * 1024, 0x02);
    const chunkSteady2 = Buffer.alloc(10 * 1024, 0x03);

    const received: Buffer[] = [];
    const startTime = Date.now();

    await new Promise<void>((resolve, reject) => {
      const source = Readable.from([chunkBurst, chunkSteady1, chunkSteady2]);
      source.pipe(paced);

      paced.on('data', (d) => received.push(d));
      paced.on('end', resolve);
      paced.on('error', reject);
    });

    const elapsed = Date.now() - startTime;
    // Should take between 600ms and 2000ms
    expect(elapsed).toBeGreaterThanOrEqual(600);
    expect(Buffer.concat(received).length).toBe(30 * 1024);
  });

  it('cancels timers and cleans up cleanly on destroy', async () => {
    const burstSize = 5 * 1024;
    const rate = 5 * 1024;
    const paced = new PacedStream({ initialBurstBytes: burstSize, pacingRateBytesPerSec: rate });

    // Feed burst + extra to trigger pacing timer
    const chunk1 = Buffer.alloc(5 * 1024);
    const chunk2 = Buffer.alloc(20 * 1024);

    const source = Readable.from([chunk1, chunk2]);
    source.pipe(paced);

    // Give it a moment to enter paced delay, then destroy
    await new Promise((r) => setTimeout(r, 50));
    expect(() => paced.destroy()).not.toThrow();
  });
});
