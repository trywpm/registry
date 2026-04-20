import * as React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Theme = 'dark' | 'light' | 'system';

export function ThemeToggle() {
  const [mounted, setMounted] = React.useState(false);
  const [theme, setThemeState] = React.useState<Theme>('system');

  React.useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
      setThemeState(savedTheme);
    }
  }, []);

  const applyTheme = (newTheme: Theme) => {
    setThemeState(newTheme);

    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');

    if (newTheme === 'system') {
      localStorage.removeItem('theme');
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
    } else {
      localStorage.setItem('theme', newTheme);
      root.classList.add(newTheme);
    }
  };

  if (!mounted) {
    return <div className="h-10 w-35 animate-pulse rounded-full bg-muted" />;
  }

  const themeOptions = [
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'system', label: 'Device', icon: Monitor },
  ] as const;

  return (
    <div className="inline-flex items-center rounded-full bg-muted p-1">
      {themeOptions.map((option) => {
        const Icon = option.icon;
        const isActive = theme === option.value;

        return (
          <Button
            key={option.value}
            variant="ghost"
            size="sm"
            onClick={() => applyTheme(option.value)}
            className={cn(
              'h-8 px-3 rounded-full transition-all duration-200 ease-in-out',
              'hover:bg-background/80',
              isActive && 'bg-background shadow-sm text-foreground',
              !isActive && 'text-muted-foreground hover:text-foreground',
            )}
            title={`Switch to ${option.label.toLowerCase()} theme`}
          >
            <Icon className="h-4 w-4 mr-1.5" />
            <span className="text-xs font-medium">{option.label}</span>
            <span className="sr-only">Switch to {option.label.toLowerCase()} theme</span>
          </Button>
        );
      })}
    </div>
  );
}
