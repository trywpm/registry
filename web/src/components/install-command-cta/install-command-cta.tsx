import { Island } from '@/components/island';
import { Button } from '@/components/button';
import { Copy, Check } from '@/components/icon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select';

export type OS = 'macos' | 'windows' | 'linux';

const commands: Record<OS, string> = {
  macos: 'curl -fsSL https://wpm.so/install | bash',
  linux: 'curl -fsSL https://wpm.so/install | bash',
  windows: `powershell -c "irm wpm.so/install.ps1 | iex"`,
};

const osLabels: Record<OS, string> = {
  macos: 'macOS',
  linux: 'Linux',
  windows: 'Windows',
};

export function getOSFromUserAgent(userAgent?: string | null): OS {
  if (!userAgent) {
    return 'macos';
  }
  if (/Win/i.test(userAgent)) {
    return 'windows';
  }
  if (/Linux/i.test(userAgent)) {
    return 'linux';
  }
  return 'macos';
}

export function InstallCommandCta({ defaultOS = 'macos' }: { defaultOS?: OS }) {
  const defaultCommand = commands[defaultOS];
  const defaultLabel = osLabels[defaultOS];

  return (
    <Island name="install-command-cta">
      <wpm-install-command-cta data-commands={JSON.stringify(commands)}>
        <div className="hidden md:flex items-center gap-3 p-2 rounded-lg backdrop-blur-sm bg-secondary/50">
          <Select defaultValue={defaultOS}>
            <SelectTrigger className="border border-border/50">
              <SelectValue>{defaultLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="macos">macOS</SelectItem>
              <SelectItem value="linux">Linux</SelectItem>
              <SelectItem value="windows">Windows</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex-1 overflow-hidden">
            <span
              data-target="prompt-prefix"
              className="text-muted-foreground font-mono text-sm mr-2 select-none"
            >
              {defaultOS === 'windows' ? '>' : '$'}
            </span>
            <code
              data-target="command-text"
              className="font-mono text-sm text-foreground break-all select-all"
            >
              {defaultCommand}
            </code>
          </div>

          <Button
            variant="secondary"
            data-target="copy-btn"
            data-copied="false"
            aria-label="Copy installation command"
            className="group relative"
            size="icon"
          >
            <div className="relative h-4 w-4">
              <Copy className="absolute inset-0 transition-all duration-200 ease-out text-muted-foreground hover:text-foreground scale-100 opacity-100 group-data-[copied=true]:scale-90 group-data-[copied=true]:opacity-0" />
              <Check className="absolute inset-0 transition-all duration-200 ease-out text-green-500 scale-90 opacity-0 group-data-[copied=true]:scale-100 group-data-[copied=true]:opacity-100" />
            </div>
          </Button>
        </div>

        <Button size="lg" className="md:hidden w-full" asChild>
          <a href="/waitlist">Get Early Access</a>
        </Button>
      </wpm-install-command-cta>
    </Island>
  );
}
