import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Section(props: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('space-y-4', props.className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{props.title}</h2>
          {props.description && (
            <p className="text-sm text-muted-foreground mt-1">{props.description}</p>
          )}
        </div>
        {props.actions && <div className="flex items-center gap-2 shrink-0">{props.actions}</div>}
      </div>
      {props.children}
    </section>
  );
}
