import dns from 'node:dns/promises';
import { AppError } from '@video-player/shared';
import { assertSafeIp } from './ip-guard.js';

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

/**
 * Safely resolves a hostname to IP addresses and checks every resolved address
 * against anti-SSRF rules. Returns the pinned addresses.
 */
export async function resolveAndValidateHost(hostname: string): Promise<ResolvedAddress[]> {
  const cleanHost = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  let records: Array<{ address: string; family: number }>;
  try {
    const result = await dns.lookup(cleanHost, { all: true });
    records = Array.isArray(result) ? result : [result];
  } catch (err: any) {
    throw new AppError('NETWORK_ERROR', 502, `DNS resolution failed for host '${hostname}': ${err.message}`);
  }

  if (!records || records.length === 0) {
    throw new AppError('NETWORK_ERROR', 502, `No DNS records found for host '${hostname}'`);
  }

  // Validate EVERY address associated with this host
  for (const record of records) {
    assertSafeIp(record.address);
  }

  return records.map((r) => ({
    address: r.address,
    family: r.family as 4 | 6,
  }));
}
