import { cn } from '@/lib/utils';

import type { JSX } from 'hono/jsx';

export type SeparatorProps = JSX.IntrinsicElements['div'] & {
  decorative?: boolean;
  orientation?: 'horizontal' | 'vertical';
};

export const Separator = ({
  className,
  decorative = true,
  orientation = 'horizontal',
  ...props
}: SeparatorProps) => {
  const safeOrientation = orientation === 'vertical' ? 'vertical' : 'horizontal';

  const semanticProps = decorative
    ? { role: 'none' }
    : {
        role: 'separator',
        'aria-orientation': safeOrientation === 'vertical' ? 'vertical' : undefined,
      };

  return (
    <div
      data-slot="separator"
      data-orientation={safeOrientation}
      {...semanticProps}
      class={cn(
        'bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
        className
      )}
      {...props}
    />
  );
};
