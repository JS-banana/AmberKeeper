import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { cn } from '@/lib/cn';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: 'ghost' | 'outline' | 'secondary';
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, variant = 'ghost', className, children, ...props }, ref) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          variant={variant}
          size="icon"
          aria-label={label}
          className={cn('shrink-0', className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
);
IconButton.displayName = 'IconButton';

export { IconButton };
