// Validation port of Masterminds/semver v3, the Go library used by the wpm cli.
// This ensures the registry accepts the same versions and constraints as the
// CLI, including comma separated AND groups, `!=`, reversed `=>` and `=<`
// operators, and x wildcards.

const UINT64_MAX = '18446744073709551615';

const MAX_VERSION_LEN = 256; // version.go MaxVersionLen
const MAX_CONSTRAINT_LEN = 512; // constraints.go MaxConstraintLen
const MAX_CONSTRAINT_GROUPS = 32; // constraints.go MaxConstraintGroups

/**
 * ASCII Character Codes Reference Table
 * -----------------------------------------------------------
 * Code(s)     | Character | Description
 * ------------|-----------|----------------------------------
 * 43          | '+'       | Plus sign
 * 45          | '-'       | Hyphen / Dash
 * 46          | '.'       | Period / Dot
 * 48 - 57     | '0' - '9' | Numeric digits
 * 65 - 90     | 'A' - 'Z' | Uppercase alphabet letters
 * 97 - 122    | 'a' - 'z' | Lowercase alphabet letters
 * -----------------------------------------------------------
 */

const isDigitCode = (c: number): boolean => c >= 48 && c <= 57;
const isAllowedCode = (c: number): boolean =>
  isDigitCode(c) || (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 45;

function allDigits(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (!isDigitCode(s.charCodeAt(i))) {
      return false;
    }
  }
  return true;
}

function allAllowed(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (!isAllowedCode(s.charCodeAt(i))) {
      return false;
    }
  }
  return true;
}

/** Mirrors Go's strconv.ParseUint(s, 10, 64) success for all-digit input. */
function fitsUint64(s: string): boolean {
  let i = 0;
  while (i < s.length - 1 && s.charCodeAt(i) === 48) {
    i++; // skip leading zeros; ParseUint accepts them
  }
  const len = s.length - i;
  return len < 20 || (len === 20 && s.slice(i) <= UINT64_MAX); // 20 === len('18446744073709551615')
}

/** version.go validatePrerelease(). */
function validatePrerelease(p: string): boolean {
  for (const part of p.split('.')) {
    if (part === '') {
      return false;
    }
    if (allDigits(part)) {
      if (part.length > 1 && part.charCodeAt(0) === 48) {
        return false; // numeric identifier with leading zero
      }
    } else if (!allAllowed(part)) {
      return false;
    }
  }
  return true;
}

/** version.go validateMetadata(). */
function validateMetadata(m: string): boolean {
  for (const part of m.split('.')) {
    if (part === '' || !allAllowed(part)) {
      return false;
    }
  }
  return true;
}

/** Equivalent to Go `semver.StrictNewVersion(v)` succeeding. */
export function isStrictSemver(v: string): boolean {
  const n = v.length;
  if (n === 0 || n > MAX_VERSION_LEN) {
    return false;
  }

  // strings.SplitN(v, ".", 3) must yield exactly 3 parts.
  const d1 = v.indexOf('.');
  const d2 = d1 === -1 ? -1 : v.indexOf('.', d1 + 1);
  if (d2 === -1) {
    return false;
  }

  const p0 = v.slice(0, d1);
  const p1 = v.slice(d1 + 1, d2);
  let p2 = v.slice(d2 + 1);

  // Build metadata is extracted before prerelease.
  const plus = p2.indexOf('+');
  if (plus !== -1) {
    if (!validateMetadata(p2.slice(plus + 1))) {
      return false;
    }
    p2 = p2.slice(0, plus);
  }

  const dash = p2.indexOf('-');
  if (dash !== -1) {
    if (!validatePrerelease(p2.slice(dash + 1))) {
      return false;
    }
    p2 = p2.slice(0, dash);
  }

  for (const p of [p0, p1, p2]) {
    if (p === '' || !allDigits(p)) {
      return false;
    }
    if (p.length > 1 && p.charCodeAt(0) === 48) {
      return false; // segment starts with 0
    }
    if (!fitsUint64(p)) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Constraints. These regexes are ported directly from constraints.go. `S`
// represents Go RE2's `\s` character class (`[\t\n\f\r ]`). JavaScript `\s`
// matches additional Unicode whitespace characters and would accept inputs
// that the Go parser rejects.
// ---------------------------------------------------------------------------

// IMPORTANT: this section is a linear time implementation of constraints.go.
// The original Go library relies on RE2, which guarantees linear matching.
// A direct JavaScript RegExp port of `validConstraintRegex` is vulnerable to
// catastrophic backtracking on long whitespace sequences. For example, a
// 500 character input can take over a second to evaluate. To preserve RE2
// behavior and avoid ReDoS risks, structural parsing is performed with a hand
// written scanner, and the remaining regexes operate only on short,
// pretokenized version segments.

// Matches the whitespace characters accepted by Go RE2 `\s`:
// space, tab, newline, form feed, and carriage return.
// This is intentionally narrower than JavaScript `\s`.
function isWs(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 12 || c === 13;
}

// CV matches a version token. The character class `[0-9|x|X|*]` includes
// the literal `|` character, mirroring a quirk of the original Masterminds
// implementation.
//
// The sticky (`y`) flag forces matching at the current index, avoiding any
// forward scanning. The pattern is linear time because each component has a
// clear delimiter and does not rely on ambiguous nested quantifiers.
const CV_STICKY =
  /v?([0-9|x|X|*]+)(\.[0-9|x|X|*]+)?(\.[0-9|x|X|*]+)?(-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?/y;

const isX = (s: string): boolean => s === 'x' || s === 'X' || s === '*';

/** Returns true if `s` contains only decimal digits and fits in a uint64. */
function numericFits(s: string): boolean {
  if (s.length === 0) {
    return false;
  }
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) {
      return false;
    }
  }
  return fitsUint64(s);
}

/**
 * Validates the version coercion performed by constraints.go's
 * `parseConstraint`.
 *
 * Wildcard components (`x`, `X`, `*`) are treated as zeroes and terminate the
 * remaining numeric components, build metadata is ignored, and the resulting
 * coerced version must satisfy the same validation performed by
 * Masterminds/semver's `NewVersion`.
 *
 * Rather than rebuilding a version string and reparsing it, this function
 * validates the captured components directly. Differential fuzzing confirmed
 * the behavior is equivalent while avoiding an extra regex match and string
 * allocation.
 */
function cvCoercionValid(match: RegExpExecArray): boolean {
  const major = match[1]; // always present when CV matches
  // Optional groups are undefined at runtime despite the array element type.
  const m = match as Array<string | undefined>;
  const minorDot = m[2]; // ".minor" or undefined
  const patchDot = m[3]; // ".patch" or undefined
  const pre = m[4] ?? ''; // "-prerelease" (with leading '-') or empty

  // Compute the length of the coerced core version while validating every
  // numeric component that survives wildcard truncation. Once a wildcard is
  // encountered, it and all subsequent numeric components are treated as zero.
  let coreLen: number;
  if (isX(major)) {
    coreLen = 5; // "0.0.0"
  } else if (!minorDot || isX(minorDot.slice(1))) {
    if (!numericFits(major)) {
      return false;
    }
    coreLen = major.length + 4; // "<major>.0.0"
  } else if (!patchDot || isX(patchDot.slice(1))) {
    if (!numericFits(major) || !numericFits(minorDot.slice(1))) {
      return false;
    }
    coreLen = major.length + minorDot.length + 2; // "<major>.<minor>.0"
  } else {
    if (!numericFits(major) || !numericFits(minorDot.slice(1)) || !numericFits(patchDot.slice(1))) {
      return false;
    }
    coreLen = major.length + minorDot.length + patchDot.length;
  }

  // `NewVersion` rejects coerced versions longer than `MaxVersionLen`.
  // Build metadata does not contribute to the limit.
  if (coreLen + pre.length > MAX_VERSION_LEN) {
    return false;
  }

  return pre.length === 0 || validatePrerelease(pre.slice(1));
}

/**
 * Matches the longest valid constraint operator at `i` and returns the index
 * immediately after it. Returns `i` when no operator is present.
 */
function matchOp(g: string, i: number, n: number): number {
  if (i >= n) {
    return i;
  }
  const c0 = g.charCodeAt(i);
  const c1 = i + 1 < n ? g.charCodeAt(i + 1) : -1;
  // two-char: != >= => <= =< ~>
  if (
    (c0 === 33 && c1 === 61) || // !=
    (c0 === 62 && c1 === 61) || // >=
    (c0 === 61 && c1 === 62) || // =>
    (c0 === 60 && c1 === 61) || // <=
    (c0 === 61 && c1 === 60) || // =<
    (c0 === 126 && c1 === 62) // ~>
  ) {
    return i + 2;
  }
  // one-char: > < ~ ^ =
  if (c0 === 62 || c0 === 60 || c0 === 126 || c0 === 94 || c0 === 61) {
    return i + 1;
  }
  return i;
}

/**
 * Rewrites hyphen ranges using the same rules as constraints.go's
 * `rewriteRange`.
 *
 * Every match of `S*(CV)S+-S+(CV)S*` becomes `>= A, <= B `.
 * The entire match, including surrounding whitespace, is replaced exactly as
 * in the Go implementation. As a result, malformed inputs such as
 * `1.2 3 - 4` become `1.2>= 3, <= 4 `, which is later rejected by the
 * constraint parser.
 */
export function rewriteRange(c: string): string {
  const n = c.length;

  // Fast path: a range requires whitespace on both sides of `-`.
  // If no such `-` exists, there is nothing to rewrite.
  let hasRange = false;
  for (let p = c.indexOf('-'); p !== -1; p = c.indexOf('-', p + 1)) {
    if (p > 0 && p + 1 < n && isWs(c.charCodeAt(p - 1)) && isWs(c.charCodeAt(p + 1))) {
      hasRange = true;
      break;
    }
  }
  if (!hasRange) {
    return c;
  }

  let out = '';
  let i = 0;

  // Linear scan. On failure, advance past the region already examined instead
  // of retrying from the next character. This mirrors RE2's linear matching
  // behavior and avoids rescanning input.
  while (i < n) {
    let j = i;
    while (j < n && isWs(c.charCodeAt(j))) {
      j++; // Look for `S+-S+(CV)S*` following the left version token.
    }

    CV_STICKY.lastIndex = j;
    const left = CV_STICKY.exec(c);
    if (!left || left.index !== j || left[0].length === 0) {
      // Version token that is not part of a range. Emit it unchanged and continue
      // scanning after it.
      if (j > i) {
        out += c.slice(i, j);
        i = j;
      } else {
        out += c[i];
        i++;
      }
      continue;
    }
    const cvEnd = CV_STICKY.lastIndex;

    // Look for `S+-S+(CV)S*` after the left version token.
    let k = cvEnd;
    while (k < n && isWs(c.charCodeAt(k))) {
      k++;
    }
    if (k > cvEnd && k < n && c.charCodeAt(k) === 45) {
      k++;
      const wsAfter = k;
      while (k < n && isWs(c.charCodeAt(k))) {
        k++;
      }
      if (k > wsAfter) {
        CV_STICKY.lastIndex = k;
        const right = CV_STICKY.exec(c);
        if (right && right.index === k && right[0].length > 0) {
          let m = CV_STICKY.lastIndex;
          while (m < n && isWs(c.charCodeAt(m))) {
            m++; // trailing \s* (greedy, consumed by the match)
          }
          out += `>= ${left[0]}, <= ${right[0]} `;
          i = m;
          continue;
        }
      }
    }

    // A version token but not a range: emit it verbatim and jump past it.
    out += c.slice(i, cvEnd);
    i = cvEnd;
  }

  return out;
}

/**
 * Parses a single OR group and returns its comparator count.
 * Returns null if the group is not a valid constraint.
 */
function scanGroup(g: string): number | null {
  const n = g.length;
  let i = 0;
  while (i < n && isWs(g.charCodeAt(i))) {
    i++; // leading whitespace
  }
  if (i === n) {
    return null; // A group must contain at least one comparator.
  }

  let count = 0;
  for (;;) {
    i = matchOp(g, i, n);
    while (i < n && isWs(g.charCodeAt(i))) {
      i++; // whitespace between operator and version
    }

    CV_STICKY.lastIndex = i;
    const m = CV_STICKY.exec(g);
    if (!m || m.index !== i || m[0].length === 0) {
      return null; // version token required
    }
    if (!cvCoercionValid(m)) {
      return null;
    }
    count++;
    i = CV_STICKY.lastIndex;

    // Separator: whitespace or comma.
    const afterCv = i;
    while (i < n && isWs(g.charCodeAt(i))) {
      i++;
    }
    let comma = false;
    if (i < n && g.charCodeAt(i) === 44) {
      // ','
      i++;
      comma = true;
      while (i < n && isWs(g.charCodeAt(i))) {
        i++;
      }
    }
    if (i === n) {
      // A trailing command is not allowed.
      return comma ? null : count;
    }
    if (i === afterCv && !comma) {
      return null; // Adjacent comparators require a separator.
    }
  }
}

/**
 * Parses a constraint using the same rules as Go NewConstraint().
 *
 * Returns the comparator count for each OR group, or null if the constraint
 * is invalid.
 *
 * Exported for the ported Masterminds test suite. Most callers should use
 * isValidConstraint().
 */
export function parseConstraintGroups(c: string): number[] | null {
  if (c.length > MAX_CONSTRAINT_LEN) {
    return null;
  }

  const rewritten = rewriteRange(c);

  // Fast path for the common case of a single OR group..
  if (rewritten.indexOf('||') === -1) {
    const count = scanGroup(rewritten);
    return count == null ? null : [count];
  }

  const ors = rewritten.split('||');
  if (ors.length > MAX_CONSTRAINT_GROUPS) {
    return null;
  }

  const counts: number[] = [];
  for (const group of ors) {
    const count = scanGroup(group);
    if (count == null) {
      return null;
    }
    counts.push(count);
  }

  return counts;
}

/** Equivalent to Go `semver.NewConstraint(c)` succeeding. */
export function isValidConstraint(c: string): boolean {
  return parseConstraintGroups(c) != null;
}
