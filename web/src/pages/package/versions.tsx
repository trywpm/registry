import type { Context } from 'hono';
import type { Package } from '@wpm/manifest/package';

import { BaseLayout } from '@/layouts/base';
import { Badge } from '@/components/ui/badge';
import { PackageTabs } from '@/components/package-tabs';
import { PackageHeader } from '@/components/package-header';
import { PackageSidebar } from '@/components/package-sidebar';
import { Card, CardTitle, CardHeader, CardContent, CardDescription } from '@/components/ui/card';

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

  if (!manifest.dependencies) {
    manifest.dependencies = {};
  }

  if (!manifest.requires) {
    manifest.requires = {};
  }

  const pkg = await versionsRes.json<{
    versions: string[];
  }>();

  if (!pkg || !pkg.versions) {
    return new Response(null, { status: 404 });
  }

  const reqUrl = new URL(c.req.url);
  const canonicalUrl = new URL(c.req.path, reqUrl.origin).href;
  const ogImage = `https://usercontent.wpm.so/og/${manifest.name}`;
  const versions = pkg.versions.filter((v) => v !== manifest.version);

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
        </main>
      </div>
    </BaseLayout>,
  );
};
