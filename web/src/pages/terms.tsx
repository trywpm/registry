import type { Context } from 'hono';

import { BaseLayout } from '@/layouts/base';
import { getCanonicalUrl } from '@/lib/utils';

export const TermsOfServicePage = (c: Context) => {
  return c.html(
    <BaseLayout
      c={c}
      title="Terms of Service"
      canonicalUrl={getCanonicalUrl(c.req.url)}
      description="Read the terms of service for using wpm registry."
    >
      <main class="flex min-h-screen w-full items-center justify-center p-6 md:p-10">
        <div class="flex flex-col items-center gap-4 text-center">
          <p class="font-mono">Terms of Service</p>
          <h1 class="text-3xl sm:text-5xl">Our Terms of Service are coming soon.</h1>
        </div>
      </main>
    </BaseLayout>,
  );
};
