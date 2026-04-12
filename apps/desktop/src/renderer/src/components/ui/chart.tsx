import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function ChartContainer(props: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('w-full', props.className)}>
      {props.children}
    </div>
  );
}
