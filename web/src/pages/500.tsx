import type { Context } from 'hono';

import { BaseLayout } from '@/layouts/base';

export function ServerError(c: Context, err: Error) {
  console.error('Internal Server Error:', err);

  return c.html(
    <BaseLayout
      c={c}
      canonicalUrl=""
      title="Internal Server Error"
      description="A server error occurred while processing your request."
    >
      <main class="flex grow items-center justify-center p-6 md:p-10">
        <div class="container">
          <div class="flex flex-col items-center gap-4 text-center">
            <p class="font-mono">ERROR 500</p>
            <h1 class="text-3xl sm:text-5xl">Oops! Something went wrong.</h1>
          </div>
        </div>
      </main>
    </BaseLayout>,
    500,
  );
}
