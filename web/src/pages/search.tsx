import type { Context } from 'hono';

import { searchPackages } from '@wpm/d1/search';
import { readableTimeDiff } from '@wpm/util/datetime';

import { Badge } from '@/components/badge';
import { BaseLayout } from '@/layouts/base';
import { Package } from '@/components/icon';
import { getCanonicalUrl } from '@/lib/utils';
import { Separator } from '@/components/separator';
import { PackageSearch } from '@/components/package-search';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/card';

export const SearchPage = async (c: Context) => {
  const url = new URL(c.req.url);

  let currentPage = Number(c.req.query('page'));
  if (!currentPage || currentPage < 1) {
    currentPage = 1;
  }

  const query = c.req.query('q') || '';
  const type = c.req.query('type') === 'theme' ? 'theme' : 'plugin';

  const session = c.env.registry_search.withSession(
    c.req.header('x-search-bm') ?? 'first-unconstrained',
  );

  const packages = await searchPackages(session, url, c.executionCtx, {
    q: query,
    type,
  });

  return c.html(
    <BaseLayout
      c={c}
      title="Search Packages"
      canonicalUrl={getCanonicalUrl(url)}
      description="Search and discover WordPress plugins and themes with wpm."
    >
      <main class="flex grow flex-col">
        <div class="container">
          <PackageSearch query={query} />
        </div>

        <section class="flex grow flex-col mb-8">
          <div class="container flex grow flex-col">
            {packages.results.length > 0 ? (
              <div class="grid gap-4">
                {packages.results.map((pkg) => (
                  <Card key={pkg.id}>
                    <CardHeader>
                      <div class="flex items-center gap-3">
                        <div class="p-2 bg-muted rounded-lg flex items-center justify-center w-9 h-9">
                          <Package className="h-5 w-5 text-primary" />
                        </div>
                        <div class="min-w-0 flex-1">
                          <CardTitle>
                            <a
                              href={`/package/${pkg.name}`}
                              class="hover:text-primary transition-colors"
                            >
                              {pkg.name}
                            </a>
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2">
                            <span>{pkg.version}</span>
                            <span>•</span>
                            <span>{readableTimeDiff(new Date(pkg.package_published))}</span>
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>

                    <Separator className="bg-border/50" />

                    <CardContent className="space-y-4">
                      <p class="text-sm text-muted-foreground line-clamp-2">{pkg.description}</p>

                      <div class="flex flex-wrap gap-1">
                        {pkg.tags.slice(0, 3).map((keyword: string) => (
                          <Badge key={keyword} variant="secondary" className="text-xs">
                            {keyword}
                          </Badge>
                        ))}
                        {pkg.tags.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{pkg.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div class="flex grow flex-col items-center justify-center text-center py-16">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 class="text-lg font-semibold mb-2">No packages found</h3>
                <p class="text-muted-foreground">
                  Try adjusting your search query to find what you're looking for.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </BaseLayout>,
  );
};
