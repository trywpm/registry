import { cn } from '@/lib/utils';

import type { JSX } from 'hono/jsx';

type HeroProps = JSX.IntrinsicElements['section'] & {
  grid?: boolean;
  preFooter?: boolean;
};

function Hero({ className, children, grid, preFooter, ...props }: HeroProps) {
  return (
    <section className={cn('border-grid relative overflow-hidden', className)} {...props}>
      {grid && <HeroGridBackground preFooter={preFooter} />}

      <div className="container-wrapper relative z-10">
        <div className="container flex flex-col items-center gap-2 py-8 text-center md:py-16 lg:py-20 xl:gap-4">
          {children}
        </div>
      </div>
    </section>
  );
}

function HeroGridBackground({ preFooter }: { preFooter?: boolean | undefined }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern
            id="hero-grid-pattern"
            x="0"
            y="0"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 24 0 L 0 0 0 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              className="text-gray-400/20 dark:text-white/10"
            />
          </pattern>

          <pattern
            id="prefooter-grid-pattern"
            x="0"
            y="12"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 24 0 L 0 0 0 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              className="text-gray-400/20 dark:text-white/10"
            />
          </pattern>
        </defs>

        <rect
          width="100%"
          height="100%"
          fill={`url(#${preFooter ? 'prefooter' : 'hero'}-grid-pattern)`}
        />
      </svg>
    </div>
  );
}

function HeroHeading({
  className,
  level = 1,
  children,
  ...props
}: JSX.IntrinsicElements['h1'] & { level?: 1 | 2 | 3 | 4 | 5 | 6 }) {
  const Tag = `h${level}` as keyof JSX.IntrinsicElements;

  return (
    <Tag
      {...props}
      class={cn(
        'text-primary leading-tighter max-w-2xl text-4xl tracking-tight text-balance lg:leading-[1.1] xl:text-5xl xl:tracking-tighter',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

function HeroDescription({ className, ...props }: JSX.IntrinsicElements['p']) {
  return (
    <p
      className={cn('text-foreground max-w-3xl text-base text-balance sm:text-lg', className)}
      {...props}
    />
  );
}

function HeroActions({ className, ...props }: JSX.IntrinsicElements['div']) {
  return (
    <div
      className={cn(
        'flex w-full items-center justify-center gap-2 pt-2 **:data-[slot=button]:shadow-none',
        className,
      )}
      {...props}
    />
  );
}

export { Hero, HeroHeading, HeroDescription, HeroActions };
