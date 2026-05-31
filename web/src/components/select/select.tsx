import { cn } from '@/lib/utils';
import { Island } from '@/components/island';
import { CheckIcon, ChevronDownIcon } from '@/components/icon';

import type { JSX, Child } from 'hono/jsx';

export function Select({
  children,
  defaultValue,
  value,
  name,
  disabled,
  ...props
}: JSX.IntrinsicElements['select'] & {
  defaultValue?: string;
  children: Child | Child[];
}) {
  return (
    <Island name="select">
      <wpm-select
        data-slot="select"
        data-name={name}
        data-default-value={defaultValue || value}
        data-disabled={disabled ? 'true' : undefined}
        {...props}
      >
        {name && (
          <input
            type="hidden"
            name={name}
            value={defaultValue || value || ''}
            data-slot="select-hidden-input"
          />
        )}
        {children}
      </wpm-select>
    </Island>
  );
}

export function SelectGroup({ ...props }: JSX.IntrinsicElements['div']) {
  return <div role="group" data-slot="select-group" {...props} />;
}

export function SelectValue({
  children,
  placeholder,
  ...props
}: JSX.IntrinsicElements['span'] & { placeholder?: string; children?: Child | Child[] }) {
  return (
    <span data-slot="select-value" data-placeholder={placeholder ? '' : undefined} {...props}>
      {children || placeholder}
    </span>
  );
}

export function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: JSX.IntrinsicElements['button'] & { size?: 'default' | 'sm'; children?: Child | Child[] }) {
  return (
    <button
      type="button"
      role="combobox"
      aria-expanded="false"
      data-slot="select-trigger"
      aria-controls={props['aria-controls']}
      data-size={size}
      data-state="closed"
      className={cn(
        'border-input data-placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon className="size-4 opacity-50 shrink-0 pointer-events-none" />
    </button>
  );
}

export function SelectContent({
  className,
  children,
  position = 'popper',
  ...props
}: JSX.IntrinsicElements['div'] & {
  children: Child | Child[];
  position?: 'popper' | 'popper-viewport';
}) {
  return (
    <div
      data-slot="select-content"
      data-state="closed"
      role="listbox"
      style={{ display: 'none' }}
      className={cn(
        'absolute z-50 max-h-96 min-w-32 origin-top overflow-x-hidden overflow-y-auto rounded-md border shadow-md bg-popover text-popover-foreground',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    >
      <div
        data-slot="select-viewport"
        className={cn('p-1', position === 'popper' && 'w-full min-w-(--wpm-select-trigger-width)')}
      >
        {children}
      </div>
    </div>
  );
}

export function SelectLabel({ className, ...props }: JSX.IntrinsicElements['div']) {
  return (
    <div
      data-slot="select-label"
      className={cn('text-muted-foreground px-2 py-1.5 text-xs', className)}
      {...props}
    />
  );
}

export function SelectItem({
  className,
  children,
  value,
  disabled,
  ...props
}: JSX.IntrinsicElements['div'] & {
  value: string;
  disabled?: boolean;
  children: Child | Child[];
}) {
  return (
    <div
      role="option"
      tabIndex={-1}
      data-slot="select-item"
      data-value={value}
      data-state="unchecked"
      aria-selected="false"
      aria-disabled={disabled ? 'true' : undefined}
      data-disabled={disabled ? '' : undefined}
      className={cn(
        'focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 group',
        className,
      )}
      {...props}
    >
      <span
        data-slot="select-item-indicator"
        className="absolute right-2 flex size-3.5 items-center justify-center opacity-0 group-data-[state=checked]:opacity-100 transition-none"
      >
        <CheckIcon className="size-4 shrink-0 pointer-events-none" />
      </span>
      <span data-slot="select-item-text">{children}</span>
    </div>
  );
}

export function SelectSeparator({ className, ...props }: JSX.IntrinsicElements['div']) {
  return (
    <div
      role="separator"
      data-slot="select-separator"
      className={cn('bg-border pointer-events-none -mx-1 my-1 h-px', className)}
      {...props}
    />
  );
}
