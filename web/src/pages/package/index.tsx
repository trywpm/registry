import type { Context } from 'hono';

import {
  ImgHandler,
  EmbedsState,
  EmbedHandler,
  LinksHandler,
  ElementHandler,
  ShortcodeHandler,
  ScreenshotHandler,
  EnqueuedEmbedAsset,
} from '@wpm/util/html-rewriter';

import { BaseLayout } from '@/layouts/base';
import { PackageTabs } from '@/components/package-tabs';
import { Card, CardContent } from '@/components/card';
import { PackageHeader } from '@/components/package-header';
import { PackageSidebar } from '@/components/package-sidebar';
import { getCachedReadme, getCanonicalUrl } from '@/lib/utils';

import type { Package } from '@wpm/manifest/package';

export const PackagePage = async (c: Context) => {
  const name = c.req.param('name');

  if (!name) {
    return c.notFound();
  }

  const [readme, res] = await Promise.all([
    getCachedReadme(c, `${name}.html`),
    fetch(`https://registry.wpm.so/${name}/latest`),
  ]);

  if (!res.ok) {
    return c.notFound();
  }

  const manifest = await res.json<
    Package & {
      created: string;
    }
  >();

  const embedsState = new EmbedsState();
  const ssHandler = new ScreenshotHandler(manifest.name);

  const rewriter = new HTMLRewriter()
    .on('img', ssHandler)
    .on('a', ssHandler)
    .on('p', new ShortcodeHandler(embedsState))
    .on('a[href]', new EmbedHandler(embedsState))
    .on('*', new ElementHandler())
    .on('img', new ImgHandler())
    .on('a', new LinksHandler())
    .on('*', new EnqueuedEmbedAsset(embedsState));

  const ogImage = `https://usercontent.wpm.so/og/${manifest.name}`;

  let readmeHtml = null;
  if (readme.body) {
    const transformedResponse = rewriter.transform(readme);
    readmeHtml = await transformedResponse.text();
  }

  const imageFallbackScript =
    '(()=>{const t=["png","jpg","gif"];document.addEventListener("error",(e=>{const s=e.target;"IMG"===s.tagName&&s.closest("#package-readme")&&function(e){const s=e.src,n=s.match(/\\.(png|jpg|gif)(\\?.*)?$/i);if(!n){return;}const i=n[1].toLowerCase();e.dataset.triedExtensions||(e.dataset.triedExtensions=JSON.stringify([i]));const a=JSON.parse(e.dataset.triedExtensions),r=t.find((t=>!a.includes(t)));r?(a.push(r),e.dataset.triedExtensions=JSON.stringify(a),e.src=s.replace(new RegExp(`\\\\.${i}(?=\\\\?|$)`,"i"),`.${r}`)):e.style.display="none"}(s)}),!0)})();';

  return c.html(
    <BaseLayout
      c={c}
      ogImage={ogImage}
      title={manifest.name}
      canonicalUrl={getCanonicalUrl(c.req.url)}
      description={
        manifest.description
          ? manifest.description
          : `View ${manifest.name} on the wpm package registry with version details, dependency info, and installation instructions.`
      }
    >
      <script dangerouslySetInnerHTML={{ __html: imageFallbackScript }} />

      <main class="grow">
        <div class="container mx-auto py-6 sm:py-8">
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div class="lg:col-span-2 space-y-6 sm:space-y-8">
              <PackageHeader
                name={manifest.name}
                type={manifest.type}
                version={manifest.version}
                tags={manifest.tags ?? []}
                visibility={manifest.visibility}
                description={manifest.description || 'No description provided.'}
                created={manifest.created}
              />

              <div class="flex flex-col gap-2 space-y-4">
                <PackageTabs name={name} active="overview" />

                <article aria-labelledby="package-readme">
                  <Card>
                    <CardContent className="py-6">
                      {readmeHtml ? (
                        <div
                          id="package-readme"
                          class="prose prose-neutral dark:prose-invert max-w-none wrap-break-word"
                          dangerouslySetInnerHTML={{ __html: readmeHtml }}
                        />
                      ) : (
                        <div
                          id="package-readme"
                          class="prose prose-neutral dark:prose-invert max-w-none wrap-break-word"
                        >
                          <p>No README found.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </article>
              </div>
            </div>

            <PackageSidebar
              name={name}
              version={manifest.version}
              license={manifest.license ?? 'UNLICENSED'}
              homepage={manifest.homepage || ''}
              totalFiles={manifest.dist.totalFiles}
              unpackedSize={manifest.dist.unpackedSize}
              registryHost="https://registry.wpm.so"
              publishedDate={manifest.created}
              collaborators={[]}
            />
          </div>
        </div>
      </main>
    </BaseLayout>,
  );
};
