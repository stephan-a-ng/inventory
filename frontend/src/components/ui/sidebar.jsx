import * as React from 'react';
import { cn } from '@/lib/utils';
import { PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SIDEBAR_WIDTH = '16rem';
const SIDEBAR_WIDTH_ICON = '3rem';
const SIDEBAR_COOKIE_NAME = 'sidebar_state';
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

const SidebarContext = React.createContext(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.');
  }
  return context;
}

function SidebarProvider({ children, defaultOpen = true }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [isMobile, setIsMobile] = React.useState(false);
  const [openMobile, setOpenMobile] = React.useState(false);

  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((o) => !o);
    } else {
      setOpen((o) => {
        const newState = !o;
        document.cookie = `${SIDEBAR_COOKIE_NAME}=${newState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
        return newState;
      });
    }
  }, [isMobile]);

  const value = React.useMemo(
    () => ({ open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar }),
    [open, isMobile, openMobile, toggleSidebar]
  );

  return (
    <SidebarContext.Provider value={value}>
      <div
        className="group/sidebar-wrapper flex min-h-svh w-full"
        style={{ '--sidebar-width': SIDEBAR_WIDTH, '--sidebar-width-icon': SIDEBAR_WIDTH_ICON }}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

function Sidebar({ children, className, side = 'left', collapsible = 'offcanvas' }) {
  const { isMobile, open, openMobile, setOpenMobile } = useSidebar();

  if (isMobile) {
    return (
      <>
        {openMobile && (
          <div className="fixed inset-0 z-50 bg-black/80" onClick={() => setOpenMobile(false)} />
        )}
        <div
          className={cn(
            'fixed inset-y-0 z-50 flex w-[var(--sidebar-width)] flex-col bg-sidebar transition-transform duration-200',
            side === 'left' ? 'left-0' : 'right-0',
            openMobile
              ? 'translate-x-0'
              : side === 'left'
                ? '-translate-x-full'
                : 'translate-x-full',
            className
          )}
        >
          {children}
        </div>
      </>
    );
  }

  return (
    <div
      className="group hidden md:block text-sidebar-foreground shrink-0 transition-[width] duration-200 ease-linear"
      style={{ width: open ? 'var(--sidebar-width)' : 'var(--sidebar-width-icon)' }}
    >
      <div
        className={cn(
          'fixed inset-y-0 z-10 flex flex-col bg-sidebar border-r border-sidebar-border transition-[width] duration-200 ease-linear overflow-hidden',
          side === 'left' ? 'left-0' : 'right-0',
          className
        )}
        style={{ width: open ? 'var(--sidebar-width)' : 'var(--sidebar-width-icon)' }}
      >
        {children}
      </div>
    </div>
  );
}

function SidebarHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-2 p-2', className)} {...props} />;
}

function SidebarContent({ className, ...props }) {
  return (
    <div
      className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2', className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }) {
  return <div className={cn('flex flex-col gap-2 p-2', className)} {...props} />;
}

function SidebarGroup({ className, ...props }) {
  return <div className={cn('relative flex w-full min-w-0 flex-col p-2', className)} {...props} />;
}

function SidebarGroupLabel({ className, ...props }) {
  const { open } = useSidebar();
  return (
    <div
      className={cn(
        'flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/50 outline-none transition-[margin,opacity] duration-200',
        !open && 'opacity-0',
        className
      )}
      {...props}
    />
  );
}

function SidebarGroupContent({ className, ...props }) {
  return <div className={cn('w-full text-sm', className)} {...props} />;
}

function SidebarMenu({ className, ...props }) {
  return <ul className={cn('flex w-full min-w-0 flex-col gap-1', className)} {...props} />;
}

function SidebarMenuItem({ className, ...props }) {
  return <li className={cn('group/menu-item relative', className)} {...props} />;
}

function SidebarMenuButton({
  className,
  isActive = false,
  tooltip,
  children,
  ...props
}) {
  const { open, isMobile } = useSidebar();
  const [showTooltip, setShowTooltip] = React.useState(false);

  const button = (
    <button
      className={cn(
        'flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        isActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
        !open && !isMobile && 'justify-center p-2',
        className
      )}
      onMouseEnter={() => !open && !isMobile && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      {...props}
    >
      {children}
    </button>
  );

  if (!open && !isMobile && tooltip) {
    return (
      <div className="relative">
        {button}
        {showTooltip && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground whitespace-nowrap">
            {tooltip}
          </div>
        )}
      </div>
    );
  }

  return button;
}

function SidebarTrigger({ className, ...props }) {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('h-7 w-7', className)}
      onClick={toggleSidebar}
      {...props}
    >
      <PanelLeft />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}

function SidebarInset({ className, children, ...props }) {
  return (
    <main
      className={cn('relative flex min-h-svh flex-1 flex-col bg-background', className)}
      {...props}
    >
      {children}
    </main>
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
};
