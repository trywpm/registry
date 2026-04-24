import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/dropdown-menu';
import { Input } from '@/components/input';
import { Button } from '@/components/button';
import { Island } from '@/components/island';
import { Search, Filter } from '@/components/icon';

export const allowedSorts = {
  popularity: 'Most Popular',
  newest: 'Recently Updated',
  name: 'Name (A-Z)',
} as const;

export function PackageSort({
  isPlugins = true,
  currentQuery = '',
  currentSort = 'popularity',
}: {
  isPlugins?: boolean;
  currentQuery?: string;
  currentSort?: keyof typeof allowedSorts;
}) {
  return (
    <Island name="package-sort">
      <wpm-package-sort className="flex gap-3 items-center justify-between mb-4">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              type="search"
              data-slot="search-input"
              placeholder={isPlugins ? 'Search plugins...' : 'Search themes...'}
              defaultValue={currentQuery}
              className="pl-10 w-full"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="default" className="shrink-0">
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">
                  Sort by {currentSort.charAt(0).toUpperCase() + currentSort.slice(1)}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent data-align="end" class="w-48">
              {Object.entries(allowedSorts).map(([key, label]) => (
                <DropdownMenuItem key={key} data-sort-value={key}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </wpm-package-sort>
    </Island>
  );
}
