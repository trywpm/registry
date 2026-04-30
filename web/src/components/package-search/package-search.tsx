import type { Type } from '@wpm/d1/search';

import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/dropdown-menu';
import { Input } from '@/components/input';
import { Button } from '@/components/button';
import { Island } from '@/components/island';
import { Search, Package } from '@/components/icon';

export function PackageSearch({ type, query }: { type?: Type; query?: string }) {
  return (
    <Island name="package-search">
      <wpm-package-search>
        <div className="flex my-8 items-center gap-2">
          <div className="relative flex-1">
            <label htmlFor="search-input" className="sr-only">
              Search packages
            </label>

            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
            </div>

            <Input
              id="search-input"
              name="q"
              type="search"
              value={query}
              data-slot="search-input"
              placeholder="Search packages..."
              className="pl-10 h-12 w-full md:text-md"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-12 focus:z-10"
                aria-label={type ? `Filter package type: currently ${type}` : 'Filter package type'}
                title="Filter package type"
              >
                <Package className="size-5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem data-type-value="all" disabled={!type}>
                All
              </DropdownMenuItem>
              <DropdownMenuItem data-type-value="plugin" disabled={type === 'plugin'}>
                Plugins
              </DropdownMenuItem>
              <DropdownMenuItem data-type-value="theme" disabled={type === 'theme'}>
                Themes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </wpm-package-search>
    </Island>
  );
}
