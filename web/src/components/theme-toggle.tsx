import { Button } from '@/components/ui/button';
import { Moon, Sun } from '@/components/icon';

export function ThemeToggle() {
  return (
    <theme-toggle>
      <Button
        variant="ghost"
        size="icon"
        data-theme-cycle
        className="group/toggle extend-touch-target size-8 cursor-pointer"
        title="Toggle theme"
      >
        <Sun className="size-4.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute size-4.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    </theme-toggle>
  );
}
