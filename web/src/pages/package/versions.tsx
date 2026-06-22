import type { Context } from 'hono';
import type { Package } from '@wpm/manifest';

import { Badge } from '@/components/badge';
import { BaseLayout } from '@/layouts/base';
import { getCanonicalUrl } from '@/lib/utils';
import { PackageTabs } from '@/components/package-tabs';
import { PackageHeader } from '@/components/package-header';
import { PackageSidebar } from '@/components/package-sidebar';
import { Card, CardTitle, CardHeader, CardContent, CardDescription } from '@/components/card';

type Requires = { wp?: string; php?: string };

const reqText = (req: Requires | undefined): string => {
  const parts: string[] = [];
  if (req?.wp) {
    parts.push(`WP ${req.wp}`);
  }
  if (req?.php) {
    parts.push(`PHP ${req.php}`);
  }
  return parts.join(' · ');
};

export const VersionsPage = async (c: Context) => {
  const name = c.req.param('name');

  if (!name) {
    return c.notFound();
  }

  const repos = c.get('repos');

  const doc = await repos.packages.getPackageDocument(name);
  if (!doc || doc.metadata.v !== 'public') {
    return c.notFound();
  }

  const pkg: {
    'dist-tags': Record<string, string>;
    versions: Record<string, Requires>;
  } = JSON.parse(doc.value);

  const latest = pkg['dist-tags'].latest;
  if (!latest) {
    return c.notFound();
  }

  const result = await repos.packages.getManifest(name, latest);
  if (!result) {
    return c.notFound();
  }

  const manifest: Package & { created: string } = JSON.parse(result.value);

  const ogImage = `https://usercontent.wpm.so/og/${manifest.name}`;
  const versions = Object.keys(pkg.versions).filter((v) => v !== latest);
  const latestReq = reqText(pkg.versions[latest]);

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
                visibility={doc.metadata.v}
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
                        <div class="flex items-center gap-2">
                          <span class="font-mono font-semibold">{manifest.version}</span>
                          <Badge variant="default">Latest</Badge>
                        </div>
                        {latestReq ? (
                          <span class="font-mono text-sm text-muted-foreground">{latestReq}</span>
                        ) : null}
                      </div>
                      {versions.map((version) => {
                        const req = reqText(pkg.versions[version]);
                        return (
                          <div
                            class="flex items-center justify-between p-4 border rounded-lg"
                            key={version}
                          >
                            <span class="font-mono font-semibold">{version}</span>
                            {req ? (
                              <span class="font-mono text-sm text-muted-foreground">{req}</span>
                            ) : null}
                          </div>
                        );
                      })}
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
