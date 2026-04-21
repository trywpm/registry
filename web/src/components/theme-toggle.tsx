import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Monitor, Moon, Sun } from '@/components/icon';

export function ThemeToggle() {
  const themeOptions = [
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'system', label: 'Device', icon: Monitor },
  ] as const;

  return (
    <theme-toggle className="inline-flex items-center rounded-full bg-muted p-1">
      {themeOptions.map((option) => {
        const Icon = option.icon;

        return (
          <Button
            key={option.value}
            variant="ghost"
            size="sm"
            data-theme={option.value}
            className={cn(
              'h-8 px-3 rounded-full transition-all duration-200 ease-in-out',
              'hover:bg-background/80',
              'text-muted-foreground hover:text-foreground',
            )}
            title={`Switch to ${option.label.toLowerCase()} theme`}
          >
            <Icon className="h-4 w-4 mr-1.5" />
            <span className="text-xs font-medium">{option.label}</span>
            <span className="sr-only">Switch to {option.label.toLowerCase()} theme</span>
          </Button>
        );
      })}
    </theme-toggle>
  );
}
