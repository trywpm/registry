import type { Child } from 'hono/jsx';

import { humanSize, cn } from '@/lib/utils';
import { Button } from '@/components/button';
import { Island } from '@/components/island';
import { Separator } from '@/components/separator';
import { readableTimeDiff } from '@wpm/util/datetime';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/card';
import { Copy, Check, Download, ExternalLink, User } from '@/components/icon';

type PackageSidebarProps = {
  name: string;
  version: string;
  license: string;
  homepage: string;
  totalFiles: number;
  unpackedSize: number;
  registryHost: string;
  publishedDate: string | Date;
  collaborators: string[];
};

export function PackageSidebar({
  name,
  version,
  license,
  unpackedSize,
  totalFiles,
  publishedDate,
  homepage,
  collaborators,
  registryHost,
}: PackageSidebarProps) {
  const installCommand = `wpm install ${name}`;
  const downloadUrl = `${registryHost}/${name}/${version}.tar.zst`;
  const parsedDate = new Date(publishedDate);

  let safeHomepageUrl = '';
  try {
    const url = new URL(homepage);
    safeHomepageUrl = url.href;
  } catch {}

  return (
    <aside className="space-y-6 lg:sticky lg:top-23 self-start">
      <Island name="package-sidebar">
        <wpm-package-sidebar data-copied="false" class="group/sidebar space-y-4 block">
          <span aria-live="polite" className="sr-only" data-target="sr-feedback"></span>

          <Card className="gap-2">
            <CardHeader>
              <CardTitle className="text-lg">Install Package</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <Button
                variant="outline"
                data-target="copy-btn"
                aria-label="Copy install command"
                className="w-full h-12 justify-start font-mono text-sm"
              >
                <div className="relative flex items-center justify-center h-4 w-4 mr-2 shrink-0">
                  <Copy
                    aria-hidden="true"
                    className="absolute inset-0 h-4 w-4 transition-all duration-300 ease-in-out scale-100 opacity-100 group-data-[copied=true]/sidebar:scale-50 group-data-[copied=true]/sidebar:opacity-0"
                  />
                  <Check
                    aria-hidden="true"
                    className="absolute inset-0 h-4 w-4 text-green-600 transition-all duration-300 ease-in-out scale-50 opacity-0 group-data-[copied=true]/sidebar:scale-100 group-data-[copied=true]/sidebar:opacity-100"
                  />
                </div>
                <span data-target="command-text" className="flex-1 text-left truncate">
                  {installCommand}
                </span>
              </Button>

              <Button asChild className="w-full h-12">
                <a href={downloadUrl} aria-label={`Download tarball for ${name}`}>
                  <Download aria-hidden="true" className="h-4 w-4 mr-2" />
                  Download Tarball
                </a>
              </Button>

              <Separator />

              <div className="grid grid-cols-2 gap-3">
                <Info label="Version" value={version} />
                <Info label="License" value={license} />
                <Info label="Unpacked Size" value={humanSize(unpackedSize)} />
                <Info label="Total Files" value={totalFiles} />
              </div>

              <div className="text-center p-3 border rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Published</div>
                <time
                  className="font-medium"
                  dateTime={parsedDate.toISOString()}
                  title={parsedDate.toLocaleString()}
                >
                  {readableTimeDiff(parsedDate)}
                </time>
              </div>

              <Separator />

              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={safeHomepageUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open homepage in a new tab"
                    className={cn('flex items-center justify-center gap-2', {
                      'pointer-events-none opacity-50': !safeHomepageUrl,
                    })}
                  >
                    <ExternalLink aria-hidden="true" className="h-3 w-3" />
                    Homepage
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {collaborators.length > 0 && (
            <Card className="gap-2">
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">Contributors</CardTitle>
              </CardHeader>

              <CardContent className="flex flex-wrap gap-2">
                {collaborators.map((username) => (
                  <a
                    key={username}
                    href={`/${username}`}
                    aria-label={`View ${username}'s profile`}
                    title={username}
                    className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage
                        src={`https://github.com/${username}.png`}
                        decoding="async"
                        alt=""
                      />
                      <AvatarFallback>
                        <User aria-hidden="true" />
                      </AvatarFallback>
                    </Avatar>
                  </a>
                ))}
              </CardContent>
            </Card>
          )}
        </wpm-package-sidebar>
      </Island>
    </aside>
  );
}

function Info({ label, value }: { label: string; value: Child }) {
  return (
    <div className="p-3 border rounded-lg bg-card">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
