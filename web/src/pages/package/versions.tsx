import type { Context } from 'hono';
import type { Package } from '@wpm/manifest/package';

import { Badge } from '@/components/badge';
import { BaseLayout } from '@/layouts/base';
import { getCanonicalUrl } from '@/lib/utils';
import { PackageTabs } from '@/components/package-tabs';
import { PackageHeader } from '@/components/package-header';
import { PackageSidebar } from '@/components/package-sidebar';
import { Card, CardTitle, CardHeader, CardContent, CardDescription } from '@/components/card';

export const VersionsPage = async (c: Context) => {
  const name = c.req.param('name');

  if (!name) {
    return c.notFound();
  }

  const [versionsRes, manifestRes] = await Promise.all([
    fetch(`https://registry.wpm.so/${name}`),
    fetch(`https://registry.wpm.so/${name}/latest`),
  ]);

  if (!manifestRes.ok) {
    return c.notFound();
  }

  const manifest = await manifestRes.json<
    Package & {
      created: string;
    }
  >();

  manifest.requires ??= {};
  manifest.dependencies ??= {};

  const pkg = await versionsRes.json<{
    versions?: string[];
  }>();

  if (!pkg.versions) {
    return new Response(null, { status: 404 });
  }

  const ogImage = `https://usercontent.wpm.so/og/${manifest.name}`;
  const versions = pkg.versions.filter((v) => v !== manifest.version);

  return c.html(
    <BaseLayout
      c={c}
      ogImage={ogImage}
      title={manifest.name}
      canonicalUrl={getCanonicalUrl(c.req.url)}
      description={`Browse all released versions of ${manifest.name} on wpm, including changelog and published release history.`}
    >
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
                <PackageTabs name={name} active="versions" />

                <Card>
                  <CardHeader>
                    <CardTitle>Version History</CardTitle>
                    <CardDescription>All published versions of this package</CardDescription>
                  </CardHeader>

                  <CardContent>
                    <div class="space-y-3">
                      <div class="flex items-center justify-between p-4 border rounded-lg">
                        <div class="flex items-center gap-3">
                          <div>
                            <div class="flex items-center gap-2 mb-1">
                              <span class="font-mono font-semibold">{manifest.version}</span>
                              <Badge variant="default">Latest</Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                      {versions.map((version) => (
                        <div
                          class="flex items-center justify-between p-4 border rounded-lg"
                          key={version}
                        >
                          <div class="flex items-center gap-3">
                            <div>
                              <div class="flex items-center gap-2 mb-1">
                                <span class="font-mono font-semibold">{version}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
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
