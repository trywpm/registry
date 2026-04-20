import * as React from 'react';
import {
  Zap,
  Globe,
  Server,
  Shield,
  WifiOff,
  Terminal,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Feature = {
  icon: React.ElementType;
  title: string;
  description: string;
  visual: React.ReactNode;
  colSpan?: string;
};

const VisualWrapper = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={cn('mt-auto flex w-full items-end justify-center overflow-hidden px-4', className)}
  >
    {children}
  </div>
);

const GlobalRegistryVisual = () => (
  <VisualWrapper>
    <div className="w-full rounded-t-lg border-x border-t border-border/80 bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Server className="size-3 text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground">Edge Latency</span>
        </div>
        <div className="flex gap-1.5">
          <div className="size-1.5 rounded-full bg-emerald-500" />
          <div className="size-1.5 rounded-full bg-emerald-500" />
        </div>
      </div>
      <div className="divide-y divide-border/50">
        <div className="flex items-center justify-between px-4 py-2 text-xs">
          <span className="text-muted-foreground">us-east-1</span>
          <span className="font-mono text-[10px] font-medium text-emerald-600">12ms</span>
        </div>
        <div className="flex items-center justify-between px-4 py-2 text-xs">
          <span className="text-muted-foreground">eu-central-1</span>
          <span className="font-mono text-[10px] font-medium text-emerald-600">24ms</span>
        </div>
        <div className="flex items-center justify-between px-4 py-2 text-xs">
          <span className="text-muted-foreground">ap-northeast-1</span>
          <span className="font-mono text-[10px] font-medium text-emerald-600">45ms</span>
        </div>
        <div className="flex items-center justify-between px-4 py-2 text-xs">
          <span className="text-muted-foreground">sa-east-1</span>
          <span className="font-mono text-[10px] font-medium text-emerald-600">78ms</span>
        </div>
      </div>
    </div>
  </VisualWrapper>
);

const PackageManagerVisual = () => (
  <VisualWrapper>
    <div className="flex h-full w-full flex-col rounded-t-lg border-x border-t border-border/80 bg-zinc-50 dark:bg-zinc-950 transition-colors">
      <div className="flex items-center gap-1.5 border-b rounded-t-lg border-border bg-white dark:bg-zinc-900/50 px-4 py-2">
        <div className="size-2.5 rounded-full bg-red-500/20 dark:bg-red-500/30" />
        <div className="size-2.5 rounded-full bg-yellow-500/20 dark:bg-yellow-500/30" />
        <div className="size-2.5 rounded-full bg-green-500/20 dark:bg-green-500/30" />
      </div>

      <div className="flex-1 p-4 font-mono text-[10px] leading-relaxed text-zinc-700 dark:text-zinc-300">
        <div className="flex items-center gap-2">
          <span className="text-emerald-600 dark:text-emerald-500 font-bold">➜</span>
          <span className="text-blue-500 dark:text-blue-400 font-medium">~</span>
          <span className="font-medium text-foreground">wpm install jetpack@latest</span>
        </div>

        <div className="text-muted-foreground">wpm install v0.1.7</div>

        <div className="my-3 space-y-0.5">
          <div className="flex gap-2">
            <span className="font-bold text-emerald-600 dark:text-emerald-500">+</span>
            <span>jetpack 15.3.1</span>
          </div>
        </div>

        <div className="font-bold text-emerald-600 dark:text-emerald-400">1 package installed</div>

        <div className="flex items-center gap-2">
          <span className="text-emerald-600 dark:text-emerald-500 font-bold">➜</span>
          <span className="text-blue-500 dark:text-blue-400 font-medium">~</span>
          <span className="h-4 w-2 animate-pulse bg-zinc-400/50 dark:bg-zinc-500/50" />
        </div>
      </div>
    </div>
  </VisualWrapper>
);

const RegistryVisual = () => (
  <VisualWrapper>
    <div className="flex w-full flex-col gap-3 pb-4">
      <div className="flex items-center gap-3 rounded-lg border border-border/80 bg-background p-3">
        <div className="flex size-8 items-center justify-center rounded bg-primary/10 text-primary">
          <Shield className="size-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-[12px] font-medium text-foreground">object-cache-pro</span>
          <span className="text-[10px] text-muted-foreground">Private • v2.1.0</span>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-border/80 bg-background p-3">
        <div className="flex size-8 items-center justify-center rounded bg-muted text-foreground">
          <Globe className="size-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-medium text-foreground">advanced-custom-fields</span>
          <span className="text-[10px] text-muted-foreground">Public • v6.2.4</span>
        </div>
      </div>
    </div>
  </VisualWrapper>
);

const OfflineVisual = () => (
  <VisualWrapper>
    <div className="flex h-full w-full flex-col rounded-t-lg border-x border-t border-border/80 bg-zinc-50 dark:bg-zinc-950 transition-colors">
      <div className="flex items-center gap-1.5 border-b rounded-t-lg border-border bg-white dark:bg-zinc-900/50 px-4 py-2">
        <div className="size-2.5 rounded-full bg-red-500/20 dark:bg-red-500/30" />
        <div className="size-2.5 rounded-full bg-yellow-500/20 dark:bg-yellow-500/30" />
        <div className="size-2.5 rounded-full bg-green-500/20 dark:bg-green-500/30" />
      </div>

      <div className="flex-1 p-4 font-mono text-[10px] leading-relaxed text-zinc-700 dark:text-zinc-300">
        <div className="flex items-center gap-2">
          <span className="text-emerald-600 dark:text-emerald-500 font-bold">➜</span>
          <span className="text-blue-500 dark:text-blue-400 font-medium">~</span>
          <span className="font-medium text-foreground">wpm install</span>
        </div>

        <div className="text-muted-foreground">wpm install v0.1.7</div>

        <div className="my-2 space-y-0.5">
          <div className="flex gap-2">
            <span className="font-bold text-emerald-600 dark:text-emerald-500">+</span>
            <span>elementor 3.34.1</span>
          </div>
        </div>

        <div className="font-bold text-emerald-600 dark:text-emerald-400">1 package installed</div>

        <div className="flex items-center gap-2">
          <span className="text-emerald-600 dark:text-emerald-500 font-bold">➜</span>
          <span className="text-blue-500 dark:text-blue-400 font-medium">~</span>
          <span className="h-4 w-2 animate-pulse bg-zinc-400/50 dark:bg-zinc-500/50" />
        </div>
      </div>
    </div>
  </VisualWrapper>
);

const SecurityVisual = () => (
  <VisualWrapper>
    <div className="w-full h-full pb-4 flex flex-col justify-end">
      <div className="w-full rounded-lg border border-border/80 bg-background p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded bg-green-100 dark:bg-green-900/30 text-green-600">
              <ShieldCheck className="size-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium">gravityforms</span>
              <span className="text-[10px] text-muted-foreground">v2.8.0</span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="size-3" />
            Verified
          </div>
        </div>
        <div className="space-y-1.5 border-t border-border/50 pt-3">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Signer</span>
            <span className="font-medium text-foreground">Rocketgenius</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 bg-muted/30 rounded px-2 py-1.5 overflow-hidden">
            <span className="text-[10px] font-mono text-muted-foreground truncate">
              digest: sha256:e3b0c442...
            </span>
          </div>
        </div>
      </div>
    </div>
  </VisualWrapper>
);

const features: Feature[] = [
  {
    icon: Zap,
    title: 'Globally Distributed Registry',
    description:
      'Ultra-fast installs backed by a globally distributed registry. Packages are delivered from locations close to your infrastructure, significantly reducing install times in local and CI environments.',
    visual: <GlobalRegistryVisual />,
    colSpan: 'md:col-span-2',
  },
  {
    icon: Terminal,
    title: 'Package Manager',
    description:
      'Manage WordPress plugins and themes from the command line with speed, simplicity, and reliability.',
    visual: <PackageManagerVisual />,
    colSpan: 'md:col-span-1',
  },
  {
    icon: Shield,
    title: 'Private & Public Packages',
    description:
      'Publish and consume both public and private plugins and themes from a single registry.',
    visual: <RegistryVisual />,
    colSpan: 'md:col-span-1',
  },
  {
    icon: WifiOff,
    title: 'Offline-Ready Workflows',
    description:
      'Installed packages are cached locally, allowing installs and builds to proceed even without network access.',
    visual: <OfflineVisual />,
    colSpan: 'md:col-span-1',
  },
  {
    icon: ShieldCheck,
    title: 'End-to-End Supply Chain Security',
    description:
      'Packages are distributed with a security-first design, supporting verifiable artifacts and provenance.',
    visual: <SecurityVisual />,
    colSpan: 'md:col-span-1',
  },
];

export function FeaturesBento() {
  return (
    <div className="container">
      <h2 className="sr-only">Features</h2>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 md:grid-cols-2">
        {features.map((feature, index) => (
          <Card
            key={index}
            className={cn(
              'group relative gap-4 flex flex-col overflow-hidden bg-background/50 border border-border/50 shadow-none pb-0',
              feature.colSpan,
            )}
          >
            <CardHeader className="flex flex-row items-center">
              <div className="flex items-center justify-center text-primary">
                <feature.icon className="size-5" />
              </div>

              <CardTitle>{feature.title}</CardTitle>
            </CardHeader>

            <CardContent>
              <CardDescription>{feature.description}</CardDescription>
            </CardContent>

            {feature.visual}
          </Card>
        ))}
      </div>
    </div>
  );
}
