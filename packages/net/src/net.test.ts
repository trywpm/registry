import { fc, it } from '@fast-check/vitest';
import { describe, expect } from 'vite-plus/test';

import { isIP, normalizeIP, isValidCidr, IPCidrMatcher } from './net';

function ipv4ToBigInt(ip: string): bigint {
  const [a, b, c, d] = ip.split('.').map((s) => BigInt(parseInt(s, 10)));
  return (a << 24n) | (b << 16n) | (c << 8n) | d;
}

function ipv6ToBigInt(ip: string): bigint {
  const noZone = ip.split('%')[0];
  const parts = noZone.split('::');
  let groups: string[];

  if (parts.length === 1) {
    groups = parts[0].split(':');
  } else {
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    const middle = Array(8 - left.length - right.length).fill('0');
    groups = [...left, ...middle, ...right];
  }

  let res = 0n;
  for (const g of groups) {
    res = (res << 16n) | BigInt(parseInt(g || '0', 16));
  }

  return res;
}

function stripMappedPrefix(s: string): string {
  if (s.length >= 7 && s.substring(0, 7).toLowerCase() === '::ffff:' && s.includes('.')) {
    return s.substring(7);
  }

  return s;
}

function refContains(cidr: string, ip: string): boolean {
  const parts = cidr.split('/');
  const netStr = parts[0];
  const maskStr = parts.length > 1 ? parts[1] : undefined;

  const normIp = stripMappedPrefix(ip);
  const normNet = stripMappedPrefix(netStr);

  const ipType = isIP(normIp);
  const netType = isIP(normNet);

  if (netType === 0 || ipType === 0 || netType !== ipType) {
    return false;
  }

  if (netType === 4) {
    const bits = maskStr !== undefined ? parseInt(maskStr, 10) : 32;
    const mask = bits === 0 ? 0n : ((1n << 32n) - 1n) ^ ((1n << BigInt(32 - bits)) - 1n);
    return (ipv4ToBigInt(normNet) & mask) === (ipv4ToBigInt(normIp) & mask);
  }

  const bits = maskStr !== undefined ? parseInt(maskStr, 10) : 128;
  const mask = bits === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - bits)) - 1n);
  return (ipv6ToBigInt(normNet) & mask) === (ipv6ToBigInt(normIp) & mask);
}

function bigIntToIPv6(n: bigint): string {
  const groups: string[] = [];
  for (let i = 7; i >= 0; i--) {
    groups.push(((n >> BigInt(i * 16)) & 0xffffn).toString(16));
  }

  return groups.join(':');
}

// Compress longest run of zero groups (>= 2) into "::". RFC 5952-ish.
function compressIPv6(full: string): string {
  const groups = full.split(':').map((g) => parseInt(g, 16).toString(16));

  let bestLen = 0;
  let curLen = 0;
  let curStart = -1;
  let bestStart = -1;

  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === '0') {
      if (curStart === -1) {
        curStart = i;
      }
      curLen++;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }

  if (bestLen < 2) {
    return groups.join(':');
  }

  const before = groups.slice(0, bestStart).join(':');
  const after = groups.slice(bestStart + bestLen).join(':');

  return `${before}::${after}`;
}

describe('normalizeIP', () => {
  it('strips lowercase ::ffff: prefix', () => {
    expect(normalizeIP('::ffff:192.168.1.1')).toBe('192.168.1.1');
  });

  it('strips uppercase ::FFFF: prefix', () => {
    expect(normalizeIP('::FFFF:10.0.0.1')).toBe('10.0.0.1');
  });

  it('strips mixed-case ::fFfF: prefix', () => {
    expect(normalizeIP('::fFfF:8.8.8.8')).toBe('8.8.8.8');
    expect(normalizeIP('::FfFf:1.2.3.4')).toBe('1.2.3.4');
    expect(normalizeIP('::FffF:1.2.3.4')).toBe('1.2.3.4');
  });

  it('leaves a plain IPv4 unchanged', () => {
    expect(normalizeIP('192.168.1.1')).toBe('192.168.1.1');
  });

  it('leaves a regular IPv6 unchanged', () => {
    expect(normalizeIP('2001:db8::1')).toBe('2001:db8::1');
    expect(normalizeIP('::1')).toBe('::1');
    expect(normalizeIP('fe80::1')).toBe('fe80::1');
  });

  it('handles empty string without throwing', () => {
    expect(normalizeIP('')).toBe('');
  });

  it('handles strings shorter than 7 chars', () => {
    expect(normalizeIP('::1')).toBe('::1');
    expect(normalizeIP('a')).toBe('a');
    expect(normalizeIP('::ffff')).toBe('::ffff');
  });

  it('does not strip ::ffff without trailing colon', () => {
    expect(normalizeIP('::ffff0:0:0:1')).toBe('::ffff0:0:0:1');
  });

  it('does not strip prefixes appearing mid-string', () => {
    expect(normalizeIP('1::ffff:1.2.3.4')).toBe('1::ffff:1.2.3.4');
  });

  it('strips even when the embedded IPv4 is invalid (caller is responsible for validation)', () => {
    expect(normalizeIP('::ffff:not.an.ip')).toBe('not.an.ip');
  });

  it('does not strip ::ffff: when the tail is hex groups, not a dotted IPv4', () => {
    expect(normalizeIP('::ffff:0:0:1:0:0')).toBe('::ffff:0:0:1:0:0');
    expect(normalizeIP('::ffff:ffff:ffff')).toBe('::ffff:ffff:ffff');
    expect(normalizeIP('::ffff:1:2:3:4:5')).toBe('::ffff:1:2:3:4:5');
  });
});

describe('isValidCidr', () => {
  describe('non-string / malformed inputs', () => {
    it('rejects obscure dotted-tail IPv6 addresses', () => {
      expect(isValidCidr('2001:db8::1.2.3.4')).toBe(false);
      expect(isValidCidr('2001:db8::1.2.3.4/128')).toBe(false);
    });

    it.each([null, undefined, 123, {}, [], true])('rejects non-string types: %p', (input) => {
      // @ts-expect-error -- isValidCidr is typed to only accept string, but we want to test non-string inputs too
      expect(isValidCidr(input)).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidCidr('')).toBe(false);
    });

    it('rejects strings with more than one slash', () => {
      expect(isValidCidr('//')).toBe(false);
      expect(isValidCidr('1.2.3.4//24')).toBe(false);
      expect(isValidCidr('1.2.3.4/24/8')).toBe(false);
    });

    it('rejects whitespace-padded inputs (Node isIP rejects them)', () => {
      expect(isValidCidr(' 1.2.3.4/24')).toBe(false);
      expect(isValidCidr('1.2.3.4/24 ')).toBe(false);
      expect(isValidCidr('1.2.3.4 /24')).toBe(false);
    });
  });

  describe('IPv4 host-only (no mask)', () => {
    it('accepts plain IPv4 with no mask', () => {
      expect(isValidCidr('0.0.0.0')).toBe(true);
      expect(isValidCidr('192.168.1.1')).toBe(true);
      expect(isValidCidr('255.255.255.255')).toBe(true);
    });

    it('rejects IPv4 with leading zeros (Node isIP rejects)', () => {
      expect(isValidCidr('01.02.03.04')).toBe(false);
      expect(isValidCidr('192.168.001.1')).toBe(false);
    });

    it('rejects out-of-range octets', () => {
      expect(isValidCidr('256.0.0.0')).toBe(false);
      expect(isValidCidr('1.2.3.300')).toBe(false);
    });

    it('rejects malformed octet counts', () => {
      expect(isValidCidr('....')).toBe(false);
      expect(isValidCidr('1.2.3')).toBe(false);
      expect(isValidCidr('1.2.3.4.5')).toBe(false);
    });
  });

  describe('IPv4 with mask', () => {
    it('accepts every valid mask 0–32', () => {
      for (let bits = 0; bits <= 32; bits++) {
        expect(isValidCidr(`10.0.0.0/${bits}`)).toBe(true);
      }
    });

    it('rejects masks > 32', () => {
      expect(isValidCidr('10.0.0.0/33')).toBe(false);
      expect(isValidCidr('10.0.0.0/64')).toBe(false);
      expect(isValidCidr('10.0.0.0/128')).toBe(false);
      expect(isValidCidr('10.0.0.0/129')).toBe(false);
    });

    it('rejects negative masks', () => {
      expect(isValidCidr('10.0.0.0/-1')).toBe(false);
    });

    it('rejects non-numeric masks', () => {
      expect(isValidCidr('10.0.0.0/abc')).toBe(false);
      expect(isValidCidr('10.0.0.0/24a')).toBe(false);
      expect(isValidCidr('10.0.0.0/2.4')).toBe(false);
      expect(isValidCidr('10.0.0.0/+24')).toBe(false);
    });

    it('rejects empty mask (trailing slash)', () => {
      expect(isValidCidr('10.0.0.0/')).toBe(false);
    });

    it('rejects mask with leading zeros (e.g. /024)', () => {
      expect(isValidCidr('10.0.0.0/0')).toBe(true);
      expect(isValidCidr('10.0.0.0/01')).toBe(false);
      expect(isValidCidr('10.0.0.0/00')).toBe(false);
      expect(isValidCidr('10.0.0.0/024')).toBe(false);
    });
  });

  describe('IPv6 host-only (no mask)', () => {
    it('accepts canonical IPv6', () => {
      expect(isValidCidr('::')).toBe(true);
      expect(isValidCidr('::1')).toBe(true);
      expect(isValidCidr('fe80::1')).toBe(true);
      expect(isValidCidr('2001:db8::1')).toBe(true);
      expect(isValidCidr('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe(true);
    });

    it('rejects malformed IPv6', () => {
      expect(isValidCidr('gggg::1')).toBe(false); // non-hex
      expect(isValidCidr('12345::1')).toBe(false); // group > ffff
      expect(isValidCidr('2001:db8::1::2')).toBe(false); // double ::
    });
  });

  describe('IPv6 with mask', () => {
    it('accepts every valid mask 0–128 at sample points', () => {
      for (const bits of [0, 1, 32, 48, 64, 96, 127, 128]) {
        expect(isValidCidr(`2001:db8::/${bits}`)).toBe(true);
      }
    });

    it('rejects masks > 128', () => {
      expect(isValidCidr('2001:db8::/129')).toBe(false);
      expect(isValidCidr('2001:db8::/255')).toBe(false);
    });

    it('rejects non-numeric masks', () => {
      expect(isValidCidr('2001:db8::/abc')).toBe(false);
      expect(isValidCidr('2001:db8::/-1')).toBe(false);
      expect(isValidCidr('2001:db8::/')).toBe(false);
    });
  });

  describe('IPv4-mapped IPv6', () => {
    it('treats ::ffff:1.2.3.4 as IPv4 (validates as such)', () => {
      expect(isValidCidr('::ffff:1.2.3.4')).toBe(true);
      expect(isValidCidr('::ffff:1.2.3.4/24')).toBe(true);
      expect(isValidCidr('::ffff:1.2.3.4/32')).toBe(true);
      expect(isValidCidr('::ffff:1.2.3.4/33')).toBe(false);
      expect(isValidCidr('::FFFF:1.2.3.4/16')).toBe(true);
    });

    it('rejects ::ffff: prefix with no IPv4 tail', () => {
      expect(isValidCidr('::ffff:')).toBe(false);
    });

    it('rejects ::ffff: prefix with garbage after', () => {
      expect(isValidCidr('::ffff:not.an.ip/24')).toBe(false);
    });
  });

  describe('dotted-tail IPv6 rejection', () => {
    // Node's isIP accepts forms like 2001:db8::1.2.3.4 (RFC 4291 §2.2.3),
    // but parseIPv6 can't handle the embedded IPv4. The validator now
    // explicitly rejects them so they never reach the parser.
    it('rejects IPv6 with embedded dotted IPv4 tail', () => {
      expect(isValidCidr('::1.2.3.4')).toBe(false);
      expect(isValidCidr('::1.2.3.4/96')).toBe(false);
      expect(isValidCidr('2001:db8::1.2.3.4')).toBe(false);
      expect(isValidCidr('2001:db8::1.2.3.4/64')).toBe(false);
    });

    it('still accepts ::ffff:1.2.3.4 because normalize strips it to IPv4', () => {
      expect(isValidCidr('::ffff:1.2.3.4')).toBe(true);
      expect(isValidCidr('::ffff:1.2.3.4/24')).toBe(true);
    });
  });

  describe('regex-vs-parseInt boundary', () => {
    it('rejects masks parseInt would silently coerce', () => {
      expect(isValidCidr('10.0.0.0/24 ')).toBe(false);
      expect(isValidCidr('10.0.0.0/ 24')).toBe(false);
      expect(isValidCidr('10.0.0.0/24abc')).toBe(false);
    });
  });
});

describe('IPCidrMatcher construction', () => {
  it('accepts an empty list', () => {
    const m = new IPCidrMatcher([]);
    expect(m.contains('1.2.3.4')).toBe(false);
    expect(m.contains('::1')).toBe(false);
  });

  it('accepts a mixed list of IPv4 and IPv6 CIDRs', () => {
    expect(
      () => new IPCidrMatcher(['10.0.0.0/8', '2001:db8::/32', '127.0.0.1', '::1/128']),
    ).not.toThrow();
  });

  it('throws on any invalid CIDR', () => {
    expect(() => new IPCidrMatcher(['10.0.0.0/8', 'not-an-ip'])).toThrow(/Invalid CIDR block/);
    expect(() => new IPCidrMatcher(['10.0.0.0/33'])).toThrow();
    expect(() => new IPCidrMatcher(['10.0.0.0/'])).toThrow();
    expect(() => new IPCidrMatcher(['10.0.0.0/abc'])).toThrow();
    expect(() => new IPCidrMatcher(['10.0.0.0/-1'])).toThrow();
  });

  it('throws on undefined / null entries', () => {
    // @ts-expect-error -- IPCidrMatcher is typed to only accept string[], but we want to test invalid entries too
    expect(() => new IPCidrMatcher([null])).toThrow();

    // @ts-expect-error -- IPCidrMatcher is typed to only accept string[], but we want to test invalid entries too
    expect(() => new IPCidrMatcher([undefined])).toThrow();
  });

  it('normalizes IPv4-mapped IPv6 CIDRs into the IPv4 path', () => {
    const m = new IPCidrMatcher(['::ffff:10.0.0.0/24']);
    expect(m.contains('10.0.0.5')).toBe(true);
    expect(m.contains('10.0.1.5')).toBe(false);
    expect(m.contains('::ffff:10.0.0.5')).toBe(true);
  });
});

describe('IPCidrMatcher.contains — IPv4', () => {
  it('returns false for null', () => {
    const m = new IPCidrMatcher(['10.0.0.0/8']);
    expect(m.contains(null)).toBe(false);
  });

  it('returns false for empty string', () => {
    const m = new IPCidrMatcher(['10.0.0.0/8']);
    expect(m.contains('')).toBe(false);
  });

  it('returns false for syntactically invalid IPs', () => {
    const m = new IPCidrMatcher(['10.0.0.0/8']);
    expect(m.contains('not-an-ip')).toBe(false);
    expect(m.contains('999.999.999.999')).toBe(false);
    expect(m.contains('1.2.3')).toBe(false);
  });

  it('matches an exact /32 host route', () => {
    const m = new IPCidrMatcher(['10.0.0.5/32']);
    expect(m.contains('10.0.0.5')).toBe(true);
    expect(m.contains('10.0.0.6')).toBe(false);
    expect(m.contains('10.0.0.4')).toBe(false);
  });

  it('matches an exact host with no mask (defaults to /32)', () => {
    const m = new IPCidrMatcher(['10.0.0.5']);
    expect(m.contains('10.0.0.5')).toBe(true);
    expect(m.contains('10.0.0.6')).toBe(false);
  });

  it('matches every address in a /24 and rejects neighbors', () => {
    const m = new IPCidrMatcher(['192.168.1.0/24']);
    expect(m.contains('192.168.1.0')).toBe(true);
    expect(m.contains('192.168.1.1')).toBe(true);
    expect(m.contains('192.168.1.255')).toBe(true);
    expect(m.contains('192.168.0.255')).toBe(false);
    expect(m.contains('192.168.2.0')).toBe(false);
  });

  it('REGRESSION: high-bit IPv4 ranges (192.x, 172.x, 128.x) match correctly', () => {
    const m = new IPCidrMatcher([
      '128.0.0.0/1',
      '172.16.0.0/12',
      '192.168.0.0/16',
      '255.255.255.255/32',
    ]);
    expect(m.contains('128.0.0.0')).toBe(true);
    expect(m.contains('200.1.2.3')).toBe(true);
    expect(m.contains('172.32.0.0')).toBe(true);
    expect(m.contains('172.16.0.1')).toBe(true);
    expect(m.contains('192.168.1.5')).toBe(true);
    expect(m.contains('172.31.255.254')).toBe(true);
    expect(m.contains('192.168.255.255')).toBe(true);
    expect(m.contains('255.255.255.255')).toBe(true);
    expect(m.contains('127.255.255.255')).toBe(false);

    const m2 = new IPCidrMatcher(['192.168.0.0/16', '172.16.0.0/12']);
    expect(m2.contains('172.32.0.0')).toBe(false);
  });

  it('matches /0 against any IPv4 address', () => {
    const m = new IPCidrMatcher(['0.0.0.0/0']);
    expect(m.contains('0.0.0.0')).toBe(true);
    expect(m.contains('1.2.3.4')).toBe(true);
    expect(m.contains('255.255.255.255')).toBe(true);
    expect(m.contains('192.168.1.1')).toBe(true);
  });

  it('handles /31 (point-to-point) correctly', () => {
    const m = new IPCidrMatcher(['10.0.0.0/31']);
    expect(m.contains('10.0.0.0')).toBe(true);
    expect(m.contains('10.0.0.1')).toBe(true);
    expect(m.contains('10.0.0.2')).toBe(false);
  });

  it('handles non-aligned network addresses by masking the host bits', () => {
    const m = new IPCidrMatcher(['10.0.0.5/24']);
    expect(m.contains('10.0.0.0')).toBe(true);
    expect(m.contains('10.0.0.5')).toBe(true);
    expect(m.contains('10.0.0.255')).toBe(true);
    expect(m.contains('10.0.1.0')).toBe(false);
  });

  it('checks every CIDR in a multi-rule list', () => {
    const m = new IPCidrMatcher(['10.0.0.0/8', '192.168.0.0/16', '172.16.0.0/12']);
    expect(m.contains('10.1.2.3')).toBe(true);
    expect(m.contains('192.168.42.42')).toBe(true);
    expect(m.contains('172.20.0.1')).toBe(true);
    expect(m.contains('8.8.8.8')).toBe(false);
    expect(m.contains('11.0.0.0')).toBe(false);
  });

  it('matches ::ffff:-prefixed IPv4 addresses against IPv4 rules', () => {
    const m = new IPCidrMatcher(['10.0.0.0/8']);
    expect(m.contains('::ffff:10.1.2.3')).toBe(true);
    expect(m.contains('::FFFF:10.1.2.3')).toBe(true);
    expect(m.contains('::FfFf:10.1.2.3')).toBe(true);
    expect(m.contains('::ffff:11.0.0.0')).toBe(false);
  });

  it('returns false for IPv6 input against an IPv4-only matcher', () => {
    const m = new IPCidrMatcher(['10.0.0.0/8']);
    expect(m.contains('::1')).toBe(false);
    expect(m.contains('2001:db8::1')).toBe(false);
  });
});

describe('IPCidrMatcher.contains — IPv6', () => {
  it('securely rejects obscure dotted-tail IPv6 addresses during hot-path evaluation', () => {
    const m = new IPCidrMatcher(['2001:db8::/32']);
    expect(m.contains('2001:db8::1')).toBe(true);
    expect(m.contains('2001:db8::1.2.3.4')).toBe(false);
  });

  it('matches an exact /128 host route', () => {
    const m = new IPCidrMatcher(['2001:db8::1/128']);
    expect(m.contains('2001:db8::1')).toBe(true);
    expect(m.contains('2001:db8::2')).toBe(false);
  });

  it('matches an exact host with no mask (defaults to /128)', () => {
    const m = new IPCidrMatcher(['::1']);
    expect(m.contains('::1')).toBe(true);
    expect(m.contains('::2')).toBe(false);
  });

  it('matches every address in a /64', () => {
    const m = new IPCidrMatcher(['2001:db8:cafe:1::/64']);
    expect(m.contains('2001:db8:cafe:1::')).toBe(true);
    expect(m.contains('2001:db8:cafe:1::1')).toBe(true);
    expect(m.contains('2001:db8:cafe:2::1')).toBe(false);
    expect(m.contains('2001:db8:cafe:1:ffff:ffff:ffff:ffff')).toBe(true);
    expect(m.contains('2001:db8:cafe:0:ffff:ffff:ffff:ffff')).toBe(false);
  });

  it('REGRESSION: compressed addresses with multiple groups right of :: parse correctly', () => {
    const m = new IPCidrMatcher(['2001:db8::1:2/128']);
    expect(m.contains('2001:db8::1:2')).toBe(true);
    expect(m.contains('2001:db8::2:1')).toBe(false);
    expect(m.contains('2001:0db8:0000:0000:0000:0000:0001:0002')).toBe(true);
  });

  it('REGRESSION: same address in different notations matches the same rule', () => {
    const m = new IPCidrMatcher(['2001:db8:0:0:0:0:0:1/128']);
    expect(m.contains('2001:db8::1')).toBe(true);
    expect(m.contains('2001:db8:0::0:1')).toBe(true);
    expect(m.contains('2001:0db8::0001')).toBe(true);
    expect(m.contains('2001:db8:0:0:0:0:0:1')).toBe(true);
  });

  it('REGRESSION: ::ffff:-prefixed address with a hex tail is not mistaken for IPv4-mapped', () => {
    const m = new IPCidrMatcher(['0:0:ffff:0:0:1:0:0/128']);
    expect(m.contains('0:0:ffff:0:0:1:0:0')).toBe(true);
    expect(m.contains('::ffff:0:0:1:0:0')).toBe(true);
    expect(m.contains('::ffff:0:0:2:0:0')).toBe(false);
  });

  it('matches /0 against any IPv6 address', () => {
    const m = new IPCidrMatcher(['::/0']);
    expect(m.contains('::')).toBe(true);
    expect(m.contains('::1')).toBe(true);
    expect(m.contains('2001:db8::1')).toBe(true);
    expect(m.contains('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')).toBe(true);
  });

  it('handles all-zero (::) and all-ones boundaries', () => {
    const allOnes = 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff';
    const m = new IPCidrMatcher(['::/128', `${allOnes}/128`]);
    expect(m.contains('::')).toBe(true);
    expect(m.contains('::1')).toBe(false);
    expect(m.contains(allOnes)).toBe(true);
  });

  it('handles 1::', () => {
    const m = new IPCidrMatcher(['1::/16']);
    expect(m.contains('1::')).toBe(true);
    expect(m.contains('2::')).toBe(false);
    expect(m.contains('1:1::')).toBe(true);
    expect(m.contains('1::ffff')).toBe(true);
  });

  it('handles /127 point-to-point', () => {
    const m = new IPCidrMatcher(['2001:db8::/127']);
    expect(m.contains('2001:db8::')).toBe(true);
    expect(m.contains('2001:db8::1')).toBe(true);
    expect(m.contains('2001:db8::2')).toBe(false);
  });

  it('checks every prefix length boundary 1..128', () => {
    const base = ipv6ToBigInt('2001:db8:abcd:1234:5678:9abc:def0:1234');
    for (let bits = 1; bits <= 128; bits++) {
      const mask = ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - bits)) - 1n);
      const network = base & mask;
      const cidr = `${bigIntToIPv6(network)}/${bits}`;

      const m = new IPCidrMatcher([cidr]);
      expect(m.contains(bigIntToIPv6(network))).toBe(true);

      if (bits < 128) {
        const inside = network | 1n;
        expect(m.contains(bigIntToIPv6(inside))).toBe(true);
      }

      const outside = network ^ (1n << BigInt(128 - bits));
      expect(m.contains(bigIntToIPv6(outside & ((1n << 128n) - 1n)))).toBe(false);
    }
  });

  it('returns false for IPv4 input against an IPv6-only matcher', () => {
    const m = new IPCidrMatcher(['2001:db8::/32']);
    expect(m.contains('1.2.3.4')).toBe(false);
  });

  it('tolerates zone IDs (parseInt accidentally stops at %)', () => {
    // fe80::1%eth0 parses to fe80::1
    const m = new IPCidrMatcher(['fe80::/10']);
    expect(m.contains('fe80::1%eth0')).toBe(true);
    expect(m.contains('fe80::1%anything')).toBe(true);
  });

  it('returns false on the hot path for dotted-tail IPv6 input', () => {
    const m = new IPCidrMatcher(['2001:db8::/32', '0.0.0.0/0']);
    expect(m.contains('1.2.3.4')).toBe(true);
    expect(m.contains('::1.2.3.4')).toBe(false);
    expect(m.contains('::ffff:1.2.3.4')).toBe(true);
    expect(m.contains('2001:db8::1.2.3.4')).toBe(false);
  });
});

// ====== FUZZ TESTS =====

const FUZZ_RUNS = 500;

const octet = fc.integer({ min: 0, max: 255 });
const ipv4Arb = fc.tuple(octet, octet, octet, octet).map((parts) => parts.join('.'));
const highOctet = fc.integer({ min: 128, max: 255 });
const ipv6Group = fc.integer({ min: 0, max: 0xffff }).map((n) => n.toString(16));
const ipv6FullArb = fc
  .tuple(ipv6Group, ipv6Group, ipv6Group, ipv6Group, ipv6Group, ipv6Group, ipv6Group, ipv6Group)
  .map((groups) => groups.join(':'));
const highBitIPv4Arb = fc.tuple(highOctet, octet, octet, octet).map((parts) => parts.join('.'));

const ipv4MaskArb = fc.integer({ min: 0, max: 32 });
const ipv6MaskArb = fc.integer({ min: 0, max: 128 });

const ipv4CidrArb = fc.tuple(ipv4Arb, ipv4MaskArb).map(([ip, b]) => `${ip}/${b}`);
const ipv6CidrArb = fc.tuple(ipv6FullArb, ipv6MaskArb).map(([ip, b]) => `${ip}/${b}`);

const ipv4CidrsArb = fc.array(ipv4CidrArb, { minLength: 1, maxLength: 20 });
const mixedCidrsArb = fc.array(fc.oneof(ipv4CidrArb, ipv6CidrArb), { minLength: 1, maxLength: 15 });
const ipv4OrIpv6Arb = fc.oneof(ipv4Arb, ipv6FullArb);

const printableChar = fc.integer({ min: 32, max: 126 }).map((c) => String.fromCharCode(c));

const nonNumericStringArb = fc
  .array(printableChar, { minLength: 1, maxLength: 6 })
  .map((cs) => cs.join(''))
  .filter((s) => !/^\d+$/.test(s));

const asciiArb = fc.array(printableChar, { minLength: 0, maxLength: 40 }).map((cs) => cs.join(''));

describe('property: isValidCidr', () => {
  it.prop([ipv4Arb, ipv4MaskArb], { numRuns: FUZZ_RUNS })(
    'any well-formed IPv4 + valid mask is accepted',
    (ip, bits) => {
      const cidr = `${ip}/${bits}`;
      expect(isValidCidr(cidr), `cidr=${cidr}`).toBe(true);
    },
  );

  it.prop([ipv4Arb, fc.integer({ min: 33, max: 999 })], { numRuns: FUZZ_RUNS })(
    'any well-formed IPv4 with mask > 32 is rejected',
    (ip, bits) => {
      const cidr = `${ip}/${bits}`;
      expect(isValidCidr(cidr), `cidr=${cidr}`).toBe(false);
    },
  );

  it.prop([ipv6FullArb, ipv6MaskArb], { numRuns: FUZZ_RUNS })(
    'any well-formed IPv6 + valid mask is accepted',
    (ip, bits) => {
      const cidr = `${ip}/${bits}`;
      expect(isValidCidr(cidr), `cidr=${cidr}`).toBe(true);
    },
  );

  it.prop([ipv6FullArb, fc.integer({ min: 129, max: 999 })], { numRuns: FUZZ_RUNS })(
    'any well-formed IPv6 with mask > 128 is rejected',
    (ip, bits) => {
      const cidr = `${ip}/${bits}`;
      expect(isValidCidr(cidr), `cidr=${cidr}`).toBe(false);
    },
  );

  it.prop([ipv4Arb, nonNumericStringArb], { numRuns: FUZZ_RUNS })(
    'non-numeric mask suffix is always rejected',
    (ip, junk) => {
      const cidr = `${ip}/${junk}`;
      expect(isValidCidr(cidr), `cidr=${cidr}`).toBe(false);
    },
  );
});

describe('property: matcher agrees with reference (IPv4)', () => {
  it.prop([ipv4Arb, ipv4Arb], { numRuns: FUZZ_RUNS })(
    'host-only rule matches exactly the host',
    (ruleIp, queryIp) => {
      const m = new IPCidrMatcher([`${ruleIp}/32`]);
      const expected = ruleIp === queryIp;
      expect(m.contains(queryIp), `rule=${ruleIp} query=${queryIp}`).toBe(expected);
    },
  );

  it.prop([ipv4Arb, ipv4MaskArb, ipv4Arb], { numRuns: FUZZ_RUNS })(
    'arbitrary CIDR matches reference for arbitrary query',
    (ruleIp, bits, queryIp) => {
      const cidr = `${ruleIp}/${bits}`;
      const m = new IPCidrMatcher([cidr]);
      const expected = refContains(cidr, queryIp);
      expect(m.contains(queryIp), `cidr=${cidr} query=${queryIp}`).toBe(expected);
    },
  );

  it.prop([ipv4Arb, ipv4MaskArb], { numRuns: FUZZ_RUNS })(
    'an address inside its own subnet always matches',
    (ip, bits) => {
      const m = new IPCidrMatcher([`${ip}/${bits}`]);
      expect(m.contains(ip), `cidr=${ip}/${bits}`).toBe(true);
    },
  );

  it.prop([ipv4CidrsArb, ipv4Arb], { numRuns: FUZZ_RUNS })(
    'multi-rule matcher returns true iff any single rule would',
    (cidrs, queryIp) => {
      const m = new IPCidrMatcher(cidrs);
      const expected = cidrs.some((c) => refContains(c, queryIp));
      expect(m.contains(queryIp), `cidrs=${cidrs.join(',')} query=${queryIp}`).toBe(expected);
    },
  );

  it.prop([highBitIPv4Arb, ipv4MaskArb, highBitIPv4Arb], { numRuns: FUZZ_RUNS })(
    'REGRESSION: high-bit ranges (top octet >= 128) behave correctly',
    (ruleIp, bits, queryIp) => {
      const cidr = `${ruleIp}/${bits}`;
      const m = new IPCidrMatcher([cidr]);
      const expected = refContains(cidr, queryIp);
      expect(m.contains(queryIp), `cidr=${cidr} query=${queryIp}`).toBe(expected);
    },
  );
});

describe('property: matcher agrees with reference (IPv6)', () => {
  it.prop([ipv6FullArb, ipv6FullArb], { numRuns: FUZZ_RUNS })(
    'host-only rule matches exactly the host (full form)',
    (ruleIp, queryIp) => {
      const m = new IPCidrMatcher([`${ruleIp}/128`]);
      const expected = ipv6ToBigInt(ruleIp) === ipv6ToBigInt(queryIp);
      expect(m.contains(queryIp), `rule=${ruleIp} query=${queryIp}`).toBe(expected);
    },
  );

  it.prop([ipv6FullArb, ipv6MaskArb, ipv6FullArb], { numRuns: FUZZ_RUNS })(
    'arbitrary CIDR matches reference for arbitrary query',
    (ruleIp, bits, queryIp) => {
      const cidr = `${ruleIp}/${bits}`;
      const m = new IPCidrMatcher([cidr]);
      const expected = refContains(cidr, queryIp);
      expect(m.contains(queryIp), `cidr=${cidr} query=${queryIp}`).toBe(expected);
    },
  );

  it.prop([ipv6FullArb, ipv6MaskArb], { numRuns: FUZZ_RUNS })(
    'an address inside its own subnet always matches',
    (ip, bits) => {
      const m = new IPCidrMatcher([`${ip}/${bits}`]);
      expect(m.contains(ip), `cidr=${ip}/${bits}`).toBe(true);
    },
  );

  it.prop([ipv6FullArb], { numRuns: FUZZ_RUNS })(
    'REGRESSION: compressed forms parse to the same value as the canonical form',
    (full) => {
      const compressed = compressIPv6(full);
      const m = new IPCidrMatcher([`${full}/128`]);
      expect(m.contains(full), `full=${full}`).toBe(true);
      expect(m.contains(compressed), `full=${full} compressed=${compressed}`).toBe(true);
    },
  );

  it.prop([mixedCidrsArb, ipv4OrIpv6Arb], { numRuns: FUZZ_RUNS })(
    'multi-rule matcher matches iff any rule would (mixed v4 and v6)',
    (cidrs, queryIp) => {
      const m = new IPCidrMatcher(cidrs);
      const expected = cidrs.some((c) => refContains(c, queryIp));
      expect(m.contains(queryIp), `cidrs=${cidrs.join(',')} query=${queryIp}`).toBe(expected);
    },
  );
});

describe('property: ::ffff: normalization', () => {
  it.prop([ipv4Arb, ipv4MaskArb, ipv4Arb], { numRuns: FUZZ_RUNS })(
    '::ffff:X.Y.Z.W is treated identically to X.Y.Z.W on both sides',
    (ruleIp, bits, queryIp) => {
      const m1 = new IPCidrMatcher([`${ruleIp}/${bits}`]);
      const m2 = new IPCidrMatcher([`::ffff:${ruleIp}/${bits}`]);
      const ctx = `rule=${ruleIp}/${bits} query=${queryIp}`;
      expect(m2.contains(queryIp), `${ctx} (m2 vs m1)`).toBe(m1.contains(queryIp));
      expect(m1.contains(`::ffff:${queryIp}`), `${ctx} (mapped lower)`).toBe(m1.contains(queryIp));
      expect(m1.contains(`::FFFF:${queryIp}`), `${ctx} (mapped UPPER)`).toBe(m1.contains(queryIp));
    },
  );
});

describe('property: invalid input never throws from contains()', () => {
  const m = new IPCidrMatcher(['10.0.0.0/8', '2001:db8::/32']);

  it.prop([asciiArb], { numRuns: FUZZ_RUNS })(
    'any random ASCII string returns a boolean, never throws',
    (junk) => {
      const result = m.contains(junk);
      expect(typeof result, `junk=${JSON.stringify(junk)}`).toBe('boolean');
    },
  );
});
