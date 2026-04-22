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

import { getCachedReadme } from '@/lib/utils';
import { BaseLayout } from '@/views/layouts/base';
import { PackageTabs } from '@/components/package-tabs';
import { Card, CardContent } from '@/components/ui/card';
import { PackageHeader } from '@/components/package-header';
import { PackageSidebar } from '@/components/package-sidebar';

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

  const reqUrl = new URL(c.req.url);
  const canonicalUrl = new URL(c.req.path, reqUrl.origin).href;
  const ogImage = `https://usercontent.wpm.so/og/${manifest.name}`;

  // Process HTMLRewriter and extract string since we are doing SSR in Hono JSX
  let readmeHtml = null;
  if (readme?.body) {
    const transformedResponse = rewriter.transform(readme);
    readmeHtml = await transformedResponse.text();
  }

  // Safe inline script content
  const imageFallbackScript = ``;

  return c.html(
    <BaseLayout
      c={c}
      ogImage={ogImage}
      title={`${manifest.name}`}
      canonicalUrl={canonicalUrl}
      description={
        manifest.description
          ? manifest.description
          : `View ${manifest.name} on the wpm package registry with version details, dependency info, and installation instructions.`
      }
    >
      <script dangerouslySetInnerHTML={{ __html: imageFallbackScript }} />

      <div class="min-h-screen bg-background">
        <main class="container py-6 sm:py-8">
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Main Content Area */}
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

              {/* Tabs and Readme Section */}
              <div class="flex flex-col gap-2 space-y-4">
                <PackageTabs name={name} active="overview" />

                <article aria-labelledby="package-readme">
                  <Card>
                    {/* Preserving className as requested for your modified shadcn components */}
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
        </main>
      </div>
    </BaseLayout>,
  );
};
