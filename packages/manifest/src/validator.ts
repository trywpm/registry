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

export function isValidPackageName(name: string): boolean {
  const n = name.length;

  if (n < 3 || n > 164) {
    return false;
  }

  for (let i = 0; i < n; i++) {
    const code = name.charCodeAt(i);

    if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
      continue;
    }

    if (code === 45) {
      if (i === 0 || i === n - 1 || name.charCodeAt(i - 1) === 45) {
        return false;
      }

      continue;
    }

    return false;
  }

  return true;
}

export function isValidTagName(name: string): boolean {
  const n = name.length;
  if (n < 3 || n > 64) {
    return false;
  }

  return isValidPackageName(name);
}

export function isValidSemver(v: string): boolean {
  const n = v.length;
  if (n < 5 || n > 64) {
    return false;
  }

  let i = 0;
  let c = v.charCodeAt(0);

  if (c < 48 || c > 57) {
    return false;
  }

  while (++i < n) {
    c = v.charCodeAt(i);
    if (c < 48 || c > 57) {
      break;
    }
  }

  if (c !== 46) {
    return false;
  }

  c = v.charCodeAt(++i);
  if (c < 48 || c > 57) {
    return false;
  }

  while (++i < n) {
    c = v.charCodeAt(i);
    if (c < 48 || c > 57) {
      break;
    }
  }

  if (c !== 46) {
    return false;
  }

  c = v.charCodeAt(++i);
  if (c < 48 || c > 57) {
    return false;
  }

  while (++i < n) {
    c = v.charCodeAt(i);
    if (c < 48 || c > 57) {
      break;
    }
  }

  if (i === n) {
    return true;
  }

  if (c !== 45 && c !== 43) {
    return false;
  }

  while (++i < n) {
    c = v.charCodeAt(i);

    if (
      !(c >= 48 && c <= 57) &&
      !(c >= 97 && c <= 122) &&
      !(c >= 65 && c <= 90) &&
      c !== 45 &&
      c !== 46 &&
      c !== 43
    ) {
      return false;
    }
  }

  return true;
}
