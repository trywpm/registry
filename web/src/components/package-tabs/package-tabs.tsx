import { Island } from '@/components/island';

type Props = {
  name: string;
  active: 'overview' | 'versions' | 'dependencies';
};

export function PackageTabs({ name, active }: Props) {
  const tabs = [
    { key: 'overview', label: 'Overview', href: `/package/${name}` },
    { key: 'versions', label: 'Versions', href: `/package/${name}/versions` },
    {
      key: 'dependencies',
      label: 'Dependencies',
      href: `/package/${name}/dependencies`,
    },
  ];

  return (
    <Island name="package-tabs">
      <wpm-package-tabs class="w-full overflow-x-auto block">
        <div
          role="tablist"
          aria-label="Package details"
          aria-orientation="horizontal"
          data-slot="tabs-list"
          data-orientation="horizontal"
          class="grid grid-flow-col auto-cols-[minmax(8rem,1fr)] min-w-max rounded-lg p-0.75 bg-muted text-muted-foreground"
        >
          {tabs.map((tab) => {
            const isActive = tab.key === active;
            return (
              <a
                href={tab.href}
                role="tab"
                key={tab.key}
                aria-selected={isActive ? 'true' : 'false'}
                aria-current={isActive ? 'page' : undefined}
                data-state={isActive ? 'active' : 'inactive'}
                data-slot="tabs-trigger"
                data-orientation="horizontal"
                tabIndex={isActive ? 0 : -1}
                class="data-[state=active]:bg-background dark:data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
              >
                {tab.label}
              </a>
            );
          })}
        </div>
      </wpm-package-tabs>
    </Island>
  );
}
