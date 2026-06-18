import { Context } from 'hono';

import { cspWithHashes, THEME_INIT_SCRIPT } from '@/lib/csp';

export type Prerender = {
  path: string;
  render: (c: Context) => Response | Promise<Response>;
};

export type StaticPage = { file: string; html: string };
export type PrerenderResult = { pages: StaticPage[]; csp: string };

const ORIGIN = 'https://wpm.so';

const routes = Object.values(
  import.meta.glob<{ prerender?: Prerender }>('./pages/**/*.tsx', { eager: true }),
)
  .map((mod) => mod.prerender)
  .filter((entry): entry is Prerender => Boolean(entry));

const fileFor = (path: string) => (path === '/' ? 'index.html' : `${path.slice(1)}.html`);

async function sha256(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

// A bare Context renders byte-identically to the Worker; calling the handler
// directly skips the `*` middleware, so cspNonce stays unset and no binding is touched.
async function renderPage(page: Prerender): Promise<StaticPage> {
  const res = await page.render(new Context(new Request(`${ORIGIN}${page.path}`)));
  return { file: fileFor(page.path), html: await res.text() };
}

export async function renderStaticPages(): Promise<PrerenderResult> {
  return {
    pages: await Promise.all(routes.map(renderPage)),
    csp: cspWithHashes([`'sha256-${await sha256(THEME_INIT_SCRIPT)}'`]),
  };
}
