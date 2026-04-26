import { Island } from '@/components/island';
import { Moon, Sun } from '@/components/icon';
import { Button } from '@/components/button';

export function ThemeToggle() {
  return (
    <Island name="theme-toggle">
      <wpm-theme-toggle>
        <Button
          variant="ghost"
          size="icon"
          data-theme-cycle
          aria-label="Toggle theme"
          className="group/toggle extend-touch-target size-8 relative"
          title="Toggle theme"
        >
          <Sun className="size-4.5 transition-all duration-200 ease-out rotate-0 scale-100 opacity-100 dark:-rotate-90 dark:scale-0 dark:opacity-0" />
          <Moon className="absolute inset-0 m-auto size-4.5 transition-all duration-200 ease-out rotate-90 scale-0 opacity-0 dark:rotate-0 dark:scale-100 dark:opacity-100" />
        </Button>
      </wpm-theme-toggle>
    </Island>
  );
}
