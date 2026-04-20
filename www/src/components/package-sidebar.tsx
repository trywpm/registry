import * as React from 'react';
import { Copy, Check, Download, ExternalLink, User } from 'lucide-react';

import { readableTimeDiff } from '@wpm/util/datetime';

import { humanSize } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Contributor = {
  name: string;
  role: string;
  username: string;
};

type PackageSidebarProps = {
  name: string;
  version: string;
  license: string;
  homepage: string;
  totalFiles: number;
  unpackedSize: number;
  registryHost: string;
  publishedDate: string | Date;
  collaborators: Contributor[];
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

  const [copied, setCopied] = React.useState(false);

  function copyInstallCommand() {
    navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <aside className="space-y-6 lg:sticky lg:top-24 self-start">
      <Card className="gap-2">
        <CardHeader>
          <CardTitle className="text-lg">Install Package</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <Button
            onClick={copyInstallCommand}
            variant="outline"
            className="w-full h-12 justify-start font-mono text-sm"
          >
            <Copy className="h-4 w-4 mr-2 shrink-0" />
            <span className="flex-1 text-left truncate">{installCommand}</span>
            {copied && <Check className="h-4 w-4 ml-2 text-green-600" />}
          </Button>

          <Button asChild className="w-full h-12 ">
            <a href={downloadUrl}>
              <Download className="h-4 w-4 mr-2" />
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

          <div
            className="text-center p-3 border rounded-lg bg-muted/30"
            title={new Date(publishedDate).toLocaleString()}
          >
            <div className="text-xs text-muted-foreground mb-1">Published</div>
            <div className="font-medium">{readableTimeDiff(new Date(publishedDate))}</div>
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href={homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2"
              >
                <ExternalLink className="h-3 w-3" />
                Homepage
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {collaborators.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Contributors</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="flex flex-wrap gap-3">
              {collaborators.map((contributor) => (
                <div key={contributor.username} className="group relative">
                  <Avatar className="h-12 w-12 border-2 border-border hover:border-primary transition-colors cursor-pointer">
                    <AvatarImage src="/placeholder-user.jpg" alt={contributor.name} />
                    <AvatarFallback className="text-muted-foreground">
                      <User className="h-6 w-6" />
                    </AvatarFallback>
                  </Avatar>

                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                    <div className="font-medium">{contributor.name}</div>
                    <div className="text-gray-300">@{contributor.username}</div>
                    <div className="text-xs capitalize text-gray-400">{contributor.role}</div>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-800" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </aside>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="p-3 border rounded-lg bg-card">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
