import type { Context } from 'hono';

import { env } from 'cloudflare:workers';

import { readableTimeDiff } from '@wpm/util/datetime';
import { getPackages, isAllowedSort, getPackagesCount } from '@wpm/d1/search';

import {
  Pagination,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationContent,
  PaginationEllipsis,
  PaginationPrevious,
} from '@/components/pagination';
import { Badge } from '@/components/badge';
import { BaseLayout } from '@/layouts/base';
import { Package } from '@/components/icon';
import { getCanonicalUrl } from '@/lib/utils';
import { Separator } from '@/components/separator';
import { buttonVariants } from '@/components/button';
import { PackageSort } from '@/components/package-sort';
import { Hero, HeroActions, HeroHeading, HeroDescription } from '@/components/hero';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/card';

const itemsPerPage = 12;

const getPageUrl = (url: URL, p: number | string) => {
  const newUrl = new URL(url);

  if (p === 1) {
    newUrl.searchParams.delete('page');
  } else {
    newUrl.searchParams.set('page', p.toString());
  }

  return newUrl.href;
};

export const ThemesPage = async (c: Context) => {
  const url = new URL(c.req.url);

  let currentPage = Number(c.req.query('page'));
  if (!currentPage || currentPage < 1) {
    currentPage = 1;
  }

  let sortVal = c.req.query('sort');
  if (!sortVal) {
    sortVal = 'popularity';
  }

  const session = env.registry_search.withSession('first-unconstrained');
  const totalPackages = await getPackagesCount(session, env.cache, c.executionCtx, 'theme');
  const totalPages = Math.ceil(totalPackages / itemsPerPage);
  const packages = await getPackages(session, url, c.executionCtx, {
    page: currentPage,
    type: 'theme',
    pageSize: itemsPerPage,
    sort: isAllowedSort(sortVal) ? sortVal : 'popularity',
  });

  const pageNumbers = (() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (currentPage <= 3) {
      return [1, 2, 3, '...', totalPages - 1, totalPages];
    }

    if (currentPage >= totalPages - 2) {
      return [1, 2, '...', totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  })();

  return c.html(
    <BaseLayout
      c={c}
      hasHero
      title="Themes"
      canonicalUrl={getCanonicalUrl(getPageUrl(url, currentPage))}
      description="Discover and manage WordPress themes with wpm."
    >
      <main>
        <Hero grid>
          <HeroHeading>WordPress Themes</HeroHeading>
          <HeroDescription>Discover and manage WordPress themes with wpm.</HeroDescription>
        </Hero>

        <section class="my-8">
          <div class="container">
            <PackageSort type="theme" />

            <div class="text-sm text-muted-foreground">{`${totalPackages} themes available`}</div>
          </div>
        </section>

        <section class="mb-8">
          <div class="container">
            {packages.results.length > 0 ? (
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {packages.results.map((pkg) => (
                  <Card key={pkg.id}>
                    {/* Header */}
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

                    {/* Content */}
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
              <div class="text-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 class="text-lg font-semibold mb-2">No themes found</h3>
                <p class="text-muted-foreground">
                  Try adjusting your search terms or filters to find what you're looking for.
                </p>
              </div>
            )}
          </div>
        </section>

        {totalPages > 1 && (
          <section class="mb-8">
            <div class="container">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href={currentPage > 1 ? getPageUrl(url, currentPage - 1) : undefined}
                      className={currentPage === 1 ? 'pointer-events-none opacity-50' : undefined}
                      rel="prev"
                    />
                  </PaginationItem>

                  {pageNumbers.map((num, i) => (
                    <PaginationItem key={i}>
                      {num === '...' ? (
                        <PaginationEllipsis />
                      ) : (
                        <PaginationLink
                          href={getPageUrl(url, num)}
                          isActive={currentPage === num}
                          className="w-auto min-w-9 px-2"
                        >
                          {num}
                        </PaginationLink>
                      )}
                    </PaginationItem>
                  ))}

                  <PaginationItem>
                    <PaginationNext
                      href={currentPage < totalPages ? getPageUrl(url, currentPage + 1) : undefined}
                      className={
                        currentPage === totalPages ? 'pointer-events-none opacity-50' : undefined
                      }
                      rel="next"
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </section>
        )}

        <Hero grid preFooter>
          <HeroHeading level={2} className="text-foreground">
            Start building with wpm
          </HeroHeading>
          <HeroDescription className="text-muted-foreground">
            Experience a workflow that keeps pace with your mind..
          </HeroDescription>
          <HeroActions>
            <a href="/waitlist" class={buttonVariants({ size: 'lg' })}>
              Join Waitlist
            </a>
            <a
              href="mailto:contact@wpm.com"
              class={buttonVariants({ variant: 'outline', size: 'lg' })}
            >
              Contact Us
            </a>
          </HeroActions>
        </Hero>
      </main>
    </BaseLayout>,
  );
};
