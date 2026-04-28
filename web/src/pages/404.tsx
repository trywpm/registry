import type { Context } from 'hono';

import { BaseLayout } from '@/layouts/base';

export function NotFound(c: Context) {
  return c.html(
    <BaseLayout
      c={c}
      canonicalUrl=""
      title="Not Found"
      description="The page you are looking for does not exist."
    >
      <main class="flex grow items-center justify-center p-6 md:p-10">
        <div class="container">
          <div class="flex flex-col items-center gap-4 text-center">
            <p class="font-mono">ERROR 404</p>
            <h1 class="text-3xl sm:text-5xl">Sorry, we can't find that page.</h1>
          </div>
        </div>
      </main>
    </BaseLayout>,
  );
}
