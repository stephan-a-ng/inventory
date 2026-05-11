import * as React from 'react';
import { cn } from '@/shared/lib/utils';

const TooltipContext = React.createContext({ open: false, setOpen: () => {} });

function TooltipProvider({ children, delayDuration = 200 }) {
  return <>{children}</>;
}

function Tooltip({ children }) {
  const [open, setOpen] = React.useState(false);
  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-flex">{children}</div>
    </TooltipContext.Provider>
  );
}

function TooltipTrigger({ children, asChild, ...props }) {
  const { setOpen } = React.useContext(TooltipContext);
  return (
    <div
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      {...props}
    >
      {children}
    </div>
  );
}

function TooltipContent({ className, children, side = 'right', ...props }) {
  const { open } = React.useContext(TooltipContext);
  if (!open) return null;

  const sideClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      className={cn(
        'absolute z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0',
        sideClasses[side],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
