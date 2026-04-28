import type { Context } from 'hono';

import { BaseLayout } from '@/layouts/base';
import { getCanonicalUrl } from '@/lib/utils';

export const DocsPage = (c: Context) => {
  return c.html(
    <BaseLayout
      c={c}
      title="Docs"
      description="Documentation for the project."
      canonicalUrl={getCanonicalUrl(c.req.url)}
    >
      <main class="flex grow items-center justify-center p-6 md:p-10">
        <div class="container">
          <div class="flex flex-col items-center gap-4 text-center">
            <p class="font-mono">Docs</p>
            <h1 class="text-3xl sm:text-5xl">We are writing the docs. Stay tuned!</h1>
          </div>
        </div>
      </main>
    </BaseLayout>,
  );
};
