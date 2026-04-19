import * as React from 'react';
import { Filter, Search } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { allowedSorts } from '@/lib/d1';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function PackageSort({ isPlugins = true }: { isPlugins?: boolean }) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [sortBy, setSortBy] = React.useState<keyof typeof allowedSorts>('popularity');
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sortParam = params.get('sort');
    const queryParam = params.get('q');

    if (sortParam && sortParam in allowedSorts) {
      setSortBy(sortParam as keyof typeof allowedSorts);
    }
    if (queryParam) {
      setSearchTerm(queryParam);
    }
    setIsMounted(true);
  }, []);

  React.useEffect(() => {
    if (!isMounted) {
      return;
    }

    const timer = setTimeout(() => {
      if (searchTerm.length >= 3) {
        const currentParams = new URLSearchParams(window.location.search);
        const currentQuery = currentParams.get('q') || '';

        if (searchTerm !== currentQuery) {
          window.location.href = `/search?q=${encodeURIComponent(searchTerm)}`;
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm, isMounted]);

  const handleSortChange = (key: keyof typeof allowedSorts) => {
    const url = new URL(window.location.href);
    url.searchParams.set('sort', key);
    window.location.href = url.toString();
  };

  return (
    <div className="flex gap-3 items-center justify-between mb-4">
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder={isPlugins ? 'Search plugins...' : 'Search themes...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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
                Sort by {sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {Object.entries(allowedSorts).map(([key, label]) => (
              <DropdownMenuItem
                key={key}
                onSelect={() => handleSortChange(key as keyof typeof allowedSorts)}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
