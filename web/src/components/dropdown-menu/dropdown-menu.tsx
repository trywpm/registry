import type { JSX, Child } from 'hono/jsx';

import { cn } from '@/lib/utils';
import { Slot } from '@/components/slot';
import { Island } from '@/components/island';
import { CheckIcon, ChevronRightIcon, Circle } from '@/components/icon';

export function DropdownMenu({ children }: { children: Child | Child[] }) {
  return (
    <Island name="dropdown-menu">
      <wpm-dropdown-menu>{children}</wpm-dropdown-menu>
    </Island>
  );
}

export function DropdownMenuPortal({ children }: { children: Child | Child[] }) {
  return <>{children}</>;
}

export function DropdownMenuTrigger({
  className,
  asChild,
  children,
  ...props
}: JSX.IntrinsicElements['button'] & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      type="button"
      data-slot="dropdown-menu-trigger"
      aria-haspopup="menu"
      aria-expanded="false"
      data-state="closed"
      className={className}
      {...props}
    >
      {children}
    </Comp>
  );
}

export function DropdownMenuContent({
  className,
  children,
  sideOffset = 4,
  align = 'start',
  ...props
}: JSX.IntrinsicElements['div'] & {
  sideOffset?: number;
  align?: 'start' | 'center' | 'end';
  children: Child | Child[];
}) {
  return (
    <div
      data-slot="dropdown-menu-content"
      data-state="closed"
      data-side-offset={sideOffset}
      data-align={align}
      className={cn(
        'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 hidden absolute min-w-32 overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function DropdownMenuGroup({ ...props }: JSX.IntrinsicElements['div']) {
  return <div role="group" data-slot="dropdown-menu-group" {...props} />;
}

export function DropdownMenuItem({
  className,
  inset,
  variant = 'default',
  disabled,
  children,
  ...props
}: JSX.IntrinsicElements['div'] & {
  inset?: boolean;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
}) {
  return (
    <div
      role="menuitem"
      tabIndex={-1}
      data-slot="dropdown-menu-item"
      data-inset={inset ? 'true' : undefined}
      data-variant={variant}
      data-disabled={disabled ? 'true' : undefined}
      aria-disabled={disabled ? 'true' : undefined}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:text-destructive! [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[inset=true]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0[&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  disabled,
  ...props
}: JSX.IntrinsicElements['div'] & { checked?: boolean; disabled?: boolean }) {
  return (
    <div
      role="menuitemcheckbox"
      tabIndex={-1}
      data-slot="dropdown-menu-checkbox-item"
      data-state={checked ? 'checked' : 'unchecked'}
      aria-checked={checked ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : undefined}
      aria-disabled={disabled ? 'true' : undefined}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 group",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center opacity-0 group-data-[state=checked]:opacity-100">
        <CheckIcon className="size-4" />
      </span>
      {children}
    </div>
  );
}

export function DropdownMenuRadioGroup({ ...props }: JSX.IntrinsicElements['div']) {
  return <div role="group" data-slot="dropdown-menu-radio-group" {...props} />;
}

export function DropdownMenuRadioItem({
  className,
  children,
  checked,
  disabled,
  ...props
}: JSX.IntrinsicElements['div'] & { checked?: boolean; disabled?: boolean }) {
  return (
    <div
      role="menuitemradio"
      tabIndex={-1}
      data-slot="dropdown-menu-radio-item"
      data-state={checked ? 'checked' : 'unchecked'}
      aria-checked={checked ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : undefined}
      aria-disabled={disabled ? 'true' : undefined}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 group",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center opacity-0 group-data-[state=checked]:opacity-100">
        <Circle className="size-2 fill-current" />
      </span>
      {children}
    </div>
  );
}

export function DropdownMenuLabel({
  className,
  inset,
  ...props
}: JSX.IntrinsicElements['div'] & { inset?: boolean }) {
  return (
    <div
      data-slot="dropdown-menu-label"
      data-inset={inset ? 'true' : undefined}
      className={cn('px-2 py-1.5 text-sm font-medium data-[inset=true]:pl-8', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }: JSX.IntrinsicElements['div']) {
  return (
    <div
      role="separator"
      data-slot="dropdown-menu-separator"
      className={cn('bg-border -mx-1 my-1 h-px', className)}
      {...props}
    />
  );
}

export function DropdownMenuShortcut({ className, ...props }: JSX.IntrinsicElements['span']) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn('text-muted-foreground ml-auto text-xs tracking-widest', className)}
      {...props}
    />
  );
}

export function DropdownMenuSub({ children }: { children: Child | Child[] }) {
  return <wpm-dropdown-menu data-is-sub="true">{children}</wpm-dropdown-menu>;
}

export function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: JSX.IntrinsicElements['div'] & { inset?: boolean }) {
  return (
    <div
      role="menuitem"
      tabIndex={-1}
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset ? 'true' : undefined}
      data-state="closed"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[inset=true]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </div>
  );
}

export function DropdownMenuSubContent({
  className,
  children,
  ...props
}: JSX.IntrinsicElements['div']) {
  return (
    <div
      data-slot="dropdown-menu-content"
      data-state="closed"
      className={cn(
        'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 hidden absolute min-w-32 overflow-hidden rounded-md border p-1 shadow-lg',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
