import { isIP } from 'node:net';

/**
 * Strips the IPv4-mapped IPv6 prefix (::ffff:) often attached by proxies.
 * Case-insensitive (e.g., ::fFfF:) to prevent bypasses or parsing failures.
 */
export function normalizeIP(ip: string): string {
  if (ip.length >= 7 && ip.substring(0, 7).toLowerCase() === '::ffff:' && ip.includes('.')) {
    return ip.substring(7);
  }

  return ip;
}

export function isValidCidr(cidr: string): boolean {
  if (typeof cidr !== 'string' || !cidr) {
    return false;
  }

  const parts = cidr.split('/');
  if (parts.length > 2) {
    return false;
  }

  const ipStr = normalizeIP(parts[0]);
  const type = isIP(ipStr);

  if (type === 0) {
    return false;
  }

  // Reject embedded dotted-tail IPv6 formats (e.g. 2001:db8::1.2.3.4).
  // Node's isIP accepts these (RFC 4291 §2.2.3) but our integer parser does not.
  if (type === 6 && ipStr.includes('.')) {
    return false;
  }

  if (parts.length === 2) {
    const maskStr = parts[1];

    // Reject trailing slashes, non-numbers, and leading zeros (e.g., /024).
    if (!/^(0|[1-9]\d*)$/.test(maskStr)) {
      return false;
    }

    const bits = parseInt(maskStr, 10);

    if (type === 4 && (bits < 0 || bits > 32)) {
      return false;
    }

    if (type === 6 && (bits < 0 || bits > 128)) {
      return false;
    }
  }

  return true;
}

/**
 * Bitwise IP matcher optimized for hot-path use in Cloudflare Workers.
 *
 * Storage layout:
 *   v4: Int32Array, 2 ints per rule  -> [network, mask, network, mask, ...]
 *   v6: Int32Array, 8 ints per rule  -> [n0,n1,n2,n3, m0,m1,m2,m3, ...]
 *
 * Both contains() paths are zero-allocation: integer math, typed-array reads,
 * and pre-allocated scratch buffers for IPv6 parsing.
 */
export class IPCidrMatcher {
  private readonly v4: Int32Array;
  private readonly v6: Int32Array;

  private readonly _ip6 = new Int32Array(4);
  private readonly _groups = new Int32Array(8);

  constructor(cidrs: string[]) {
    const v4Temp: number[] = [];
    const v6Temp: number[] = [];

    for (const cidr of cidrs) {
      if (!isValidCidr(cidr)) {
        throw new Error(`Invalid CIDR block provided to matcher: ${cidr}`);
      }

      const parts = cidr.split('/');
      const ipStr = normalizeIP(parts[0]);
      const maskStr = parts.length > 1 ? parts[1] : undefined;

      const type = isIP(ipStr);
      const bits = maskStr !== undefined ? parseInt(maskStr, 10) : type === 4 ? 32 : 128;

      if (type === 4) {
        const network = this.parseIPv4(ipStr);
        const mask = bits === 0 ? 0 : (-1 << (32 - bits)) | 0;
        v4Temp.push((network & mask) | 0, mask);
      } else {
        this.parseIPv6Into(ipStr, this._ip6);
        const n0 = this._ip6[0];
        const n1 = this._ip6[1];
        const n2 = this._ip6[2];
        const n3 = this._ip6[3];

        // 128-bit mask split into four 32-bit chunks.
        let m0 = 0,
          m1 = 0,
          m2 = 0,
          m3 = 0;
        if (bits >= 32) {
          m0 = -1;
        } else if (bits > 0) {
          m0 = -1 << (32 - bits);
        }
        if (bits >= 64) {
          m1 = -1;
        } else if (bits > 32) {
          m1 = -1 << (64 - bits);
        }
        if (bits >= 96) {
          m2 = -1;
        } else if (bits > 64) {
          m2 = -1 << (96 - bits);
        }
        if (bits === 128) {
          m3 = -1;
        } else if (bits > 96) {
          m3 = -1 << (128 - bits);
        }

        v6Temp.push(
          (n0 & m0) | 0,
          (n1 & m1) | 0,
          (n2 & m2) | 0,
          (n3 & m3) | 0,
          m0 | 0,
          m1 | 0,
          m2 | 0,
          m3 | 0,
        );
      }
    }

    this.v4 = new Int32Array(v4Temp);
    this.v6 = new Int32Array(v6Temp);
  }

  public contains(clientIP: string | null): boolean {
    if (!clientIP) {
      return false;
    }

    clientIP = normalizeIP(clientIP);
    const type = isIP(clientIP);

    if (type === 4) {
      const v4 = this.v4;
      const len = v4.length;
      if (len === 0) {
        return false;
      }

      const ip = this.parseIPv4(clientIP);
      for (let i = 0; i < len; i += 2) {
        if ((ip & v4[i + 1]) === v4[i]) {
          return true;
        }
      }
      return false;
    }

    if (type === 6) {
      const v6 = this.v6;
      const len = v6.length;
      if (len === 0) {
        return false;
      }

      // Reject dotted-tail IPv6 on the hot path; the integer parser cannot
      // handle the embedded IPv4 form (e.g. 2001:db8::1.2.3.4).
      if (clientIP.includes('.')) {
        return false;
      }

      this.parseIPv6Into(clientIP, this._ip6);
      const a = this._ip6[0];
      const b = this._ip6[1];
      const c = this._ip6[2];
      const d = this._ip6[3];

      for (let i = 0; i < len; i += 8) {
        if (
          (a & v6[i + 4]) === v6[i] &&
          (b & v6[i + 5]) === v6[i + 1] &&
          (c & v6[i + 6]) === v6[i + 2] &&
          (d & v6[i + 7]) === v6[i + 3]
        ) {
          return true;
        }
      }
    }

    return false;
  }

  private parseIPv4(ip: string): number {
    let res = 0;
    let acc = 0;
    let shift = 24;

    for (let i = 0; i < ip.length; i++) {
      const code = ip.charCodeAt(i);
      if (code === 46) {
        res |= acc << shift;
        shift -= 8;
        acc = 0;
      } else {
        acc = acc * 10 + (code - 48);
      }
    }
    return res | (acc << shift) | 0;
  }

  /**
   * Parses an IPv6 address into four 32-bit signed integers (high to low),
   * written into `out[0..3]`. Allocation-free.
   *
   * Zone identifiers (e.g. "fe80::1%eth0") are link-local scope suffixes that
   * Node's isIP() accepts as type 6. We strip them by scanning for '%' and
   * setting an explicit end index, rather than ip.split('%')[0], to avoid the
   * per-call allocation. Without this, an interface-tagged address from a
   * proxy would either fail to match or, worse, skew the hex parse.
   */
  private parseIPv6Into(ip: string, out: Int32Array): void {
    const s = this._groups;
    s[0] = 0;
    s[1] = 0;
    s[2] = 0;
    s[3] = 0;
    s[4] = 0;
    s[5] = 0;
    s[6] = 0;
    s[7] = 0;

    // End of the address bits — before any zone-ID suffix.
    let end = ip.length;
    for (let i = 0; i < end; i++) {
      if (ip.charCodeAt(i) === 37 /* '%' */) {
        end = i;
        break;
      }
    }

    // Locate the "::" double-colon (compressed-zero region).
    let dc = -1;
    for (let i = 0; i < end - 1; i++) {
      if (ip.charCodeAt(i) === 58 /* ':' */ && ip.charCodeAt(i + 1) === 58) {
        dc = i;
        break;
      }
    }

    let gi = 0;
    let acc = 0;
    let c = 0;

    if (dc === -1) {
      // Full 8-group form: a:b:c:d:e:f:g:h
      for (let i = 0; i < end; i++) {
        c = ip.charCodeAt(i);
        if (c === 58) {
          s[gi++] = acc;
          acc = 0;
        } else {
          acc = (acc << 4) | (c <= 57 ? c - 48 : (c | 32) - 87);
        }
      }
      s[gi] = acc;
      out[0] = (s[0] << 16) | s[1] | 0;
      out[1] = (s[2] << 16) | s[3] | 0;
      out[2] = (s[4] << 16) | s[5] | 0;
      out[3] = (s[6] << 16) | s[7] | 0;
      return;
    }

    // Compressed form. Parse the left half into s[0..], then the right half
    // into s[8 - rCount..7]; middle slots stay zero from the reset above.
    for (let i = 0; i < dc; i++) {
      c = ip.charCodeAt(i);
      if (c === 58) {
        s[gi++] = acc;
        acc = 0;
      } else {
        acc = (acc << 4) | (c <= 57 ? c - 48 : (c | 32) - 87);
      }
    }
    if (dc > 0) {
      s[gi] = acc;
    }

    const rStart = dc + 2;
    if (rStart < end) {
      // Count groups on the right to know where to start placing.
      let rCount = 1;
      for (let i = rStart; i < end; i++) {
        if (ip.charCodeAt(i) === 58) {
          rCount++;
        }
      }

      let pi = 8 - rCount;
      acc = 0;
      for (let i = rStart; i < end; i++) {
        c = ip.charCodeAt(i);
        if (c === 58) {
          s[pi++] = acc;
          acc = 0;
        } else {
          acc = (acc << 4) | (c <= 57 ? c - 48 : (c | 32) - 87);
        }
      }

      s[pi] = acc;
    }

    out[0] = (s[0] << 16) | s[1] | 0;
    out[1] = (s[2] << 16) | s[3] | 0;
    out[2] = (s[4] << 16) | s[5] | 0;
    out[3] = (s[6] << 16) | s[7] | 0;
  }
}
