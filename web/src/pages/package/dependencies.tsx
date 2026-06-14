import type { Context } from 'hono';
import type { Package } from '@wpm/manifest';

import { Badge } from '@/components/badge';
import { BaseLayout } from '@/layouts/base';
import { getCanonicalUrl } from '@/lib/utils';
import { PackageTabs } from '@/components/package-tabs';
import { PackageHeader } from '@/components/package-header';
import { PackageSidebar } from '@/components/package-sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/card';

export const DependenciesPage = async (c: Context) => {
  const name = c.req.param('name');
  if (!name) {
    return c.notFound();
  }

  const repos = c.get('repos');

  const tag = await repos.packages.getTagVersion(name, 'latest');
  if (!tag || tag.visibility !== 'public') {
    return c.notFound();
  }

  const result = await repos.packages.getManifest(name, tag.version);
  if (!result) {
    return c.notFound();
  }

  const manifest: Package & { created: string } = JSON.parse(result.value);
  const requires = manifest.requires ?? {};
  const dependencies = manifest.dependencies ?? {};

  const ogImage = `https://usercontent.wpm.so/og/${manifest.name}`;

  return c.html(
    <BaseLayout
      c={c}
      ogImage={ogImage}
      title={manifest.name}
      canonicalUrl={getCanonicalUrl(c.req.url)}
      description={`View all dependencies required by the ${manifest.name} package on wpm, including version constraints and dependency tree details.`}
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
                visibility={tag.visibility}
                description={manifest.description || 'No description provided.'}
                created={manifest.created}
              />

              <div class="flex flex-col gap-2 space-y-4">
                <PackageTabs name={name} active="dependencies" />

                <Card>
                  <CardHeader>
                    <CardTitle>Dependencies</CardTitle>
                    <CardDescription>Required dependencies for this package</CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {Object.keys(requires).length === 0 ? null : (
                      <div class="space-y-3">
                        {Object.entries(requires).map((dep) => (
                          <div
                            class="flex items-center justify-between p-3 border rounded-lg"
                            key={dep[0]}
                          >
                            <div class="flex items-center gap-3">
                              <span class="font-mono font-medium">{dep[0]}</span>
                              <Badge variant="outline">runtime</Badge>
                            </div>
                            <span class="font-mono text-sm text-muted-foreground">{dep[1]}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {Object.keys(dependencies).length === 0 ? (
                      <p class="text-muted-foreground text-center py-8">
                        No dependencies found for this package.
                      </p>
                    ) : (
                      <div class="space-y-3">
                        {Object.entries(dependencies).map((dep) => (
                          <div
                            class="flex items-center justify-between p-3 border rounded-lg"
                            key={dep[0]}
                          >
                            <div class="flex items-center gap-3">
                              <span class="font-mono font-medium">{dep[0]}</span>
                            </div>
                            <span class="font-mono text-sm text-muted-foreground">
                              {dep[1] === '*' ? 'latest' : dep[1]}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
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
