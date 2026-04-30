import { cn } from '@/lib/utils';
import { Island } from '@/components/island';
import type { JSX } from 'hono/jsx';

// oxlint-disable jsx_a11y/label-has-associated-control - htmlFor is not needed here.
function Label({ className, ...props }: JSX.IntrinsicElements['label']) {
  return (
    <Island name="label">
      <wpm-label style={{ display: 'contents' }}>
        <label
          data-slot="label"
          className={cn(
            'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
            className,
          )}
          {...props}
        />
      </wpm-label>
    </Island>
  );
}

export { Label };
