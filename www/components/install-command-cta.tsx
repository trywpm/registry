import * as React from 'react';
import { Copy, Check } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type OS = 'macos' | 'windows' | 'linux';

const commands = {
  macos: 'curl -fsSL https://wpm.so/install | bash',
  linux: 'curl -fsSL https://wpm.so/install | bash',
  windows: `powershell -c "irm wpm.so/install.ps1 | iex"`,
};

export function InstallCommandCta() {
  const [copied, setCopied] = React.useState(false);
  const [selectedOS, setSelectedOS] = React.useState<OS>('macos');

  React.useEffect(() => {
    const userAgent = navigator.userAgent || navigator.platform;
    if (/Win/.test(userAgent)) {
      setSelectedOS('windows');
    } else if (/Mac/.test(userAgent)) {
      setSelectedOS('macos');
    } else {
      setSelectedOS('linux');
    }
  }, []);

  const command = commands[selectedOS];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <>
      {/* Command Box - Hidden on mobile */}
      <div className="hidden md:flex items-center gap-3 p-2 rounded-lg backdrop-blur-sm bg-secondary/50">
        {/* OS Dropdown */}
        <Select value={selectedOS} onValueChange={(value: OS) => setSelectedOS(value)}>
          <SelectTrigger className="border border-border/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="macos">macOS</SelectItem>
            <SelectItem value="linux">Linux</SelectItem>
            <SelectItem value="windows">Windows</SelectItem>
          </SelectContent>
        </Select>

        {/* Command Text */}
        <div className="flex-1 overflow-hidden">
          <span className="text-muted-foreground font-mono text-sm mr-2 select-none">
            {'windows' === selectedOS ? '>' : '$'}
          </span>
          <code className="font-mono text-sm text-foreground break-all select-all">{command}</code>
        </div>

        {/* Copy Button */}
        <Button variant="secondary" className="cursor-pointer" size="icon" onClick={handleCopy}>
          <div className="relative h-4 w-4">
            <Copy
              className={cn(
                'absolute inset-0 transition-all duration-150 ease-out',
                copied
                  ? 'scale-90 opacity-0'
                  : 'scale-100 opacity-100 text-muted-foreground hover:text-foreground',
              )}
            />

            <Check
              className={cn(
                'absolute inset-0 transition-all duration-150 ease-out text-green-500',
                copied ? 'scale-100 opacity-100' : 'scale-90 opacity-0',
              )}
            />
          </div>
        </Button>
      </div>

      {/* Buttons - Shown on mobile */}
      <Button size="lg" className="md:hidden" asChild>
        <a href="/waitlist">Get Early Access</a>
      </Button>
      {/* <Button variant="outline" className="md:hidden" size="lg" asChild>
        <a href="/docs">Learn More</a>
      </Button> */}
    </>
  );
}
