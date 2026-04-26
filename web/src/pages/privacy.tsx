import type { Context } from 'hono';

import { BaseLayout } from '@/layouts/base';
import { getCanonicalUrl } from '@/lib/utils';

export const PrivacyPolicyPage = (c: Context) => {
  return c.html(
    <BaseLayout
      c={c}
      title="Privacy Policy"
      canonicalUrl={getCanonicalUrl(c.req.url)}
      description="Read the privacy policy for using wpm registry."
    >
      <main class="flex min-h-screen w-full items-center justify-center p-6 md:p-10">
        <div class="flex flex-col items-center gap-4 text-center">
          <p class="font-mono">Privacy Policy</p>
          <h1 class="text-3xl sm:text-5xl">Our Privacy Policy is coming soon.</h1>
        </div>
      </main>
    </BaseLayout>,
  );
};
