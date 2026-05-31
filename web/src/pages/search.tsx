import type { Context } from 'hono';

import { formatDate } from '@wpm/datetime';
import { getCookie, setCookie } from 'hono/cookie';
import { searchPackages, isType } from '@wpm/d1/search';
import type { D1ResultWithNext, SearchPackageRow } from '@wpm/d1/search';

import { Badge } from '@/components/badge';
import { BaseLayout } from '@/layouts/base';
import { Package } from '@/components/icon';
import { Button } from '@/components/button';
import { getCanonicalUrl } from '@/lib/utils';
import { Separator } from '@/components/separator';
import { PackageSearch } from '@/components/package-search';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/card';

const StateMessage = ({ heading, description }: { heading: string; description: string }) => (
  <div class="flex grow flex-col items-center justify-center text-center py-16 w-full">
    <Package
      className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50"
      aria-hidden="true"
    />
    <h2 class="text-lg font-semibold mb-2">{heading}</h2>
    <p class="text-muted-foreground">{description}</p>
  </div>
);

const PackageCard = ({ pkg }: { pkg: SearchPackageRow }) => (
  <Card key={pkg.id}>
    <CardHeader>
      <div class="flex items-center gap-3">
        <div
          class="p-2 bg-muted rounded-lg flex items-center justify-center w-9 h-9"
          aria-hidden="true"
        >
          <Package className="h-5 w-5 text-primary" />
        </div>
        <div class="min-w-0 flex-1">
          <CardTitle>
            <a
              href={`/package/${pkg.name}`}
              class="hover:text-primary transition-colors focus-visible:outline focus-visible:outline-primary focus-visible:rounded-sm"
            >
              {pkg.name}
            </a>
          </CardTitle>
          <CardDescription className="flex items-center gap-1.5 text-muted-foreground font-mono">
            <span>{pkg.version}</span>
            <span aria-hidden="true">•</span>
            <span>{pkg.type}</span>
            <span aria-hidden="true">•</span>
            <span>{formatDate(new Date(pkg.package_published))}</span>
          </CardDescription>
        </div>
      </div>
    </CardHeader>
    <Separator className="bg-border/50" />
    <CardContent className="space-y-4">
      <p class="text-sm text-muted-foreground line-clamp-2">{pkg.description}</p>

      {pkg.tags.length > 0 && (
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
      )}
    </CardContent>
  </Card>
);

const LoadMoreButton = ({
  query,
  type,
  cursor,
}: {
  query: string;
  type?: string;
  cursor: string;
}) => {
  const nextParams = new URLSearchParams();
  if (query) {
    nextParams.set('q', query);
  }
  if (cursor) {
    nextParams.set('cursor', cursor);
  }
  if (type) {
    nextParams.set('type', type);
  }

  return (
    <div id="load-more-wrapper" class="flex justify-center mt-4 w-full">
      <Button
        size="lg"
        type="button"
        variant="outline"
        hx-get={`/search?${nextParams.toString()}`}
        hx-swap="outerHTML"
        hx-target="#load-more-wrapper"
        aria-label="Load more search results"
      >
        Load More
      </Button>
    </div>
  );
};

export const SearchPage = async (c: Context) => {
  const url = new URL(c.req.url);
  const isHtmxReq = c.req.header('hx-request') === 'true';
  const cursorParam = c.req.query('cursor');
  const isLoadMore = isHtmxReq && !!cursorParam;

  let query = c.req.query('q');
  if (typeof query !== 'string') {
    query = '';
  }

  let type = c.req.query('type');
  if (!isType(type)) {
    type = undefined;
  }

  let packages: D1ResultWithNext<SearchPackageRow> | null = null;

  if (query.trim() !== '') {
    const session = c.env.registry_search.withSession(
      getCookie(c, 'search_bm') ?? 'first-unconstrained',
    );

    packages = await searchPackages(session, url, c.executionCtx, {
      q: query,
      type,
      cursor: cursorParam,
    });

    setCookie(c, 'search_bm', session.getBookmark() ?? '', {
      path: url.pathname,
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
    });
  }

  if (isHtmxReq) {
    if (!packages) {
      return c.html(
        <StateMessage
          heading="Start searching"
          description="Type at least 3 characters to search for WordPress plugins and themes."
        />,
      );
    }

    if (isLoadMore) {
      return c.html(
        <>
          {packages.results.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} />
          ))}
          {packages.nextCursor && (
            <LoadMoreButton query={query} type={type} cursor={packages.nextCursor} />
          )}
        </>,
      );
    }

    if (packages.results.length === 0) {
      return c.html(
        <StateMessage
          heading="No packages found"
          description="Try adjusting your search query to find what you're looking for."
        />,
      );
    }

    return c.html(
      <div class="grid gap-4 w-full">
        {packages.results.map((pkg) => (
          <PackageCard key={pkg.id} pkg={pkg} />
        ))}
        {packages.nextCursor && (
          <LoadMoreButton query={query} type={type} cursor={packages.nextCursor} />
        )}
      </div>,
    );
  }

  return c.html(
    <BaseLayout
      c={c}
      loadVendorScripts={{ htmx: true }}
      title={query ? `Search: ${query}` : 'Search Packages'}
      canonicalUrl={getCanonicalUrl(url)}
      description={
        query
          ? `Search results for "${query}"`
          : 'Search and discover WordPress plugins and themes with wpm.'
      }
    >
      <main class="flex grow flex-col">
        <section class="container" aria-label="Search form">
          <form
            role="search"
            hx-get="/search"
            hx-target="#search-results"
            hx-push-url="true"
            hx-trigger="wpm-package-search-trigger delay:300ms, submit"
          >
            {type && <input type="hidden" name="type" value={type} />}
            <PackageSearch type={type} query={query} />
          </form>
        </section>

        <section
          id="search-results"
          class="container flex grow flex-col mb-8"
          aria-label="Search results"
          aria-live="polite"
        >
          {packages ? (
            packages.results.length > 0 ? (
              <div class="grid gap-4 w-full">
                {packages.results.map((pkg) => (
                  <PackageCard key={pkg.id} pkg={pkg} />
                ))}
                {packages.nextCursor && (
                  <LoadMoreButton query={query} type={type} cursor={packages.nextCursor} />
                )}
              </div>
            ) : (
              <StateMessage
                heading="No packages found"
                description="Try adjusting your search query to find what you're looking for."
              />
            )
          ) : (
            <StateMessage
              heading="Start searching"
              description="Type at least 3 characters to search for WordPress plugins and themes."
            />
          )}
        </section>
      </main>
    </BaseLayout>,
  );
};
