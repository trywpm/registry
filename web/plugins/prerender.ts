import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

import type { Plugin } from 'vite-plus';
import type { PrerenderResult } from '../src/prerender';

const CSP_MARKER = '# prerender:csp (auto-generated)';

// Build-time-only SSR bundle that renders the static pages. `noExternal` bundles
// the workspace packages (they ship TS source) so it runs standalone under Node.
export function prerender(): Plugin {
  return {
    name: 'wpm:prerender',
    config: () => ({
      environments: {
        prerender: {
          consumer: 'server',
          resolve: { noExternal: true },
          build: {
            ssr: true,
            outDir: 'dist/prerender',
            emptyOutDir: true,
            rolldownOptions: {
              input: { index: 'src/prerender.ts' },
              output: { format: 'esm', entryFileNames: '[name].js' },
            },
          },
        },
      },
    }),
  };
}

// Emit the rendered HTML into the assets dir and scope a hash-based CSP to those
// pages via `_headers` (Worker routes keep their own per-request nonce CSP).
export async function emitStaticPages(root: string): Promise<void> {
  const publicDir = resolve(root, 'dist/public');
  const mod = await import(pathToFileURL(resolve(root, 'dist/prerender/index.js')).href);
  const { pages, csp }: PrerenderResult = await mod.renderStaticPages();

  await Promise.all(pages.map((page) => writeFile(join(publicDir, page.file), page.html, 'utf-8')));

  const file = join(publicDir, '_headers');
  const base = (await readFile(file, 'utf-8').catch(() => '')).split(CSP_MARKER)[0].trimEnd();
  await writeFile(
    file,
    `${base}\n\n${CSP_MARKER}\n/*\n  Content-Security-Policy: ${csp}\n`,
    'utf-8',
  );
}
