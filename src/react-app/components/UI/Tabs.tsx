import {
  createContext,
  useContext,
  useId,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/react-app/lib/utils';

interface TabsContextType {
  activeTab: string;
  setActiveTab: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

interface TabsProps {
  children: ReactNode;
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

export function Tabs({
  children,
  defaultValue,
  value: controlledValue,
  onValueChange,
  className,
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const baseId = useId();

  const activeTab = controlledValue ?? internalValue;

  const setActiveTab = (value: string) => {
    if (controlledValue === undefined) {
      setInternalValue(value);
    }
    onValueChange?.(value);
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, baseId }}>
      <div className={cn('w-full', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const currentTab = target.closest<HTMLButtonElement>('[role="tab"]');

    if (!currentTab || !event.currentTarget.contains(currentTab)) return;

    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
    );
    const currentIndex = tabs.indexOf(currentTab);

    if (currentIndex === -1 || tabs.length === 0) return;

    let nextIndex: number | undefined;

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    tabs[nextIndex].focus();
  };

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className={cn('flex items-center gap-2 border-b border-slate-200 overflow-x-auto', className)}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  children,
  value,
  className,
}: {
  children: ReactNode;
  value: string;
  className?: string;
}) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsTrigger must be used within Tabs');

  const { activeTab, setActiveTab, baseId } = context;
  const isActive = activeTab === value;
  const triggerId = `${baseId}-trigger-${value}`;
  const panelId = `${baseId}-panel-${value}`;

  return (
    <button
      type="button"
      role="tab"
      id={triggerId}
      aria-selected={isActive}
      aria-controls={panelId}
      tabIndex={isActive ? 0 : -1}
      onClick={() => setActiveTab(value)}
      className={cn(
        'px-4 py-2 text-sm font-medium transition-[color,border-color] duration-150 ease-out border-b-2 whitespace-nowrap rounded-t-sm',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500',
        isActive
          ? 'border-primary text-primary'
          : 'border-transparent text-slate-600 hover:text-slate-800 hover:border-slate-300',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  children,
  value,
  className,
}: {
  children: ReactNode;
  value: string;
  className?: string;
}) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsContent must be used within Tabs');

  const { activeTab, baseId } = context;

  if (activeTab !== value) return null;

  const triggerId = `${baseId}-trigger-${value}`;
  const panelId = `${baseId}-panel-${value}`;

  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={triggerId}
      tabIndex={0}
      className={cn(
        'pt-6 animate-fade-in focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

// Utility types for Tabs sub-components
Tabs.List = TabsList;
Tabs.Trigger = TabsTrigger;
Tabs.Content = TabsContent;
