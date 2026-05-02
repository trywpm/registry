import { cn } from '@/lib/utils';
import { Loader2Icon } from '@/components/icon';

function Spinner({
  className,
  ...props
}: {
  role?: string;
  className?: string;
  [key: string]: unknown;
}) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
