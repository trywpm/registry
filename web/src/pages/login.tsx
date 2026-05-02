import type { Context } from 'hono';

import { BaseLayout } from '@/layouts/base';
import { Spinner } from '@/components/spinner';
import { getAssetUrl, getCanonicalUrl } from '@/lib/utils';

export const LoginPage = (c: Context) => {
  return c.html(
    <BaseLayout
      c={c}
      title="Login"
      loadVendorScripts={{ clerk: true }}
      description="Login to your account."
      canonicalUrl={getCanonicalUrl(c.req.url)}
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
              id="sign-in-container"
              className="flex justify-center opacity-0 transition-opacity duration-500"
            ></div>
          </div>
        </div>
      </main>
      <script type="module" src={getAssetUrl(`/src/assets/js/clerk.ts`)}></script>
    </BaseLayout>,
  );
};
