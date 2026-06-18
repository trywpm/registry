import type { Context } from 'hono';
import type { Prerender } from '@/prerender';

import { BaseLayout } from '@/layouts/base';
import { Spinner } from '@/components/spinner';
import { getAssetUrl, getCanonicalUrl } from '@/lib/utils';

export const WaitlistPage = (c: Context) => {
  return c.html(
    <BaseLayout
      c={c}
      title="Waitlist"
      description="Join the waitlist to get early access."
      canonicalUrl={getCanonicalUrl(c.req.url)}
      loadVendorScripts={{ clerk: true, clerkUi: true }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .cl-form {
              gap: 1rem;
            }
          `,
        }}
      />

      <main class="container flex grow items-center justify-center py-6 md:py-10">
        <div className="relative w-full max-w-sm">
          <div
            id="clerk-spinner"
            className="absolute inset-0 flex items-center justify-center z-30 transition-opacity duration-250"
          >
            <Spinner className="size-12" />
          </div>
          <div className="flex flex-col">
            <div
              id="waitlist-container"
              className="flex justify-center opacity-0 transition-opacity duration-500"
            ></div>
          </div>
        </div>
      </main>
      <script type="module" src={getAssetUrl(`/src/assets/js/clerk.ts`)}></script>
    </BaseLayout>,
  );
};

export const prerender: Prerender = { path: '/waitlist', render: WaitlistPage };
