const CLERK_DOMAIN = import.meta.env.VITE_CLERK_DOMAIN;

// Single source of truth: the Worker inlines this under a nonce, the prerender hashes it for the static CSP.
export const THEME_INIT_SCRIPT =
  'const getTheme=()=>"undefined"!==typeof localStorage&&localStorage.getItem("theme")?localStorage.getItem("theme"):window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";"dark"===getTheme()?document.documentElement.classList.add("dark"):document.documentElement.classList.remove("dark");';

const DIRECTIVES = [
  `base-uri 'self'`,
  `default-src 'none'`,
  `object-src 'none'`,
  `form-action 'self'`,
  `font-src 'self' https:`,
  `frame-ancestors 'none'`,
  `worker-src 'self' blob:`,
  `img-src 'self' data: https:`,
  `style-src 'self' 'unsafe-inline'`,
  `connect-src 'self' ${CLERK_DOMAIN}`,
  `frame-src 'self' https://www.youtube-nocookie.com https://videopress.com https://challenges.cloudflare.com`,
];

// Joined once at module-eval so each Worker request pays a single concatenation.
const SCRIPT_SRC_HEAD = `${DIRECTIVES.join('; ')}; script-src `;
const SCRIPT_SRC_TAIL = ` 'self' ${CLERK_DOMAIN} https://challenges.cloudflare.com`;

/** Dynamic pages: inline scripts run via an unguessable per-request nonce. */
export function cspWithNonce(nonce: string): string {
  return `${SCRIPT_SRC_HEAD}'nonce-${nonce}'${SCRIPT_SRC_TAIL}`;
}

/** Static pages: inline scripts run via content hashes (a static asset can't carry a fresh nonce). */
export function cspWithHashes(hashes: string[]): string {
  return `${SCRIPT_SRC_HEAD}${hashes.join(' ')}${SCRIPT_SRC_TAIL}`;
}
