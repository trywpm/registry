import { cn } from '@/lib/utils';
import { Island } from '@/components/island';

import type { JSX } from 'hono/jsx';

function Avatar({
  className,
  size = 'default',
  ...props
}: JSX.HTMLAttributes & {
  size?: 'default' | 'sm' | 'lg';
}) {
  return (
    <Island name="avatar">
      <wpm-avatar
        data-slot="avatar"
        data-size={size}
        data-state="loading"
        className={cn(
          'group/avatar relative flex size-8 shrink-0 items-center justify-center rounded-full select-none data-[size=lg]:size-10 data-[size=sm]:size-6',
          className,
        )}
        {...props}
      />
    </Island>
  );
}

function AvatarImage({ className, ...props }: JSX.IntrinsicElements['img']) {
  return (
    <img
      data-slot="avatar-image"
      alt={props.alt || 'Avatar'}
      className={cn(
        'aspect-square size-full object-cover rounded-full',
        'hidden group-data-[state=loaded]/avatar:block',
        className,
      )}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  delayMs,
  ...props
}: JSX.IntrinsicElements['span'] & { delayMs?: number }) {
  return (
    <span
      data-slot="avatar-fallback"
      data-delay-ms={delayMs}
      className={cn(
        'bg-muted text-muted-foreground flex size-full items-center justify-center rounded-full text-sm group-data-[size=sm]/avatar:text-xs',
        '[&>svg]:size-4 group-data-[size=sm]/avatar:[&>svg]:size-3 group-data-[size=lg]/avatar:[&>svg]:size-5',
        'group-data-[state=loaded]/avatar:hidden',
        'group-data-[fallback=delayed]/avatar:opacity-0',
        className,
      )}
      {...props}
    />
  );
}

function AvatarBadge({ className, ...props }: JSX.IntrinsicElements['span']) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        'bg-primary text-primary-foreground ring-background absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full ring-2 select-none',
        'group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden',
        'group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2',
        'group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2',
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroup({ className, ...props }: JSX.IntrinsicElements['div']) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        '*:data-[slot=avatar]:ring-background group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2',
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroupCount({ className, ...props }: JSX.IntrinsicElements['div']) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        'bg-muted text-muted-foreground ring-background relative flex size-8 shrink-0 items-center justify-center rounded-full text-sm ring-2 group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3',
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback, AvatarBadge, AvatarGroup, AvatarGroupCount };
