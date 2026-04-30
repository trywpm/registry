const UNSAFE_CHARS_REGEXP = /[<>/\u2028\u2029]/g;
const ESCAPED_CHARS: Record<string, string> = {
  '<': '\\u003C',
  '>': '\\u003E',
  '/': '\\u002F',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

export function serialize(obj: unknown, space?: string | number): string {
  const str = JSON.stringify(obj, null, space);
  if (typeof str !== 'string') {
    return String(str);
  }

  return str.replace(UNSAFE_CHARS_REGEXP, (match) => ESCAPED_CHARS[match]);
}
