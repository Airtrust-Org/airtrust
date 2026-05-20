import React from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  currentPath?: string;
}

export function AppLayout({ children, title, currentPath = '' }: AppLayoutProps) {
  React.useEffect(() => {
    document.title = `${title} | AirTrust`;
  }, [title]);

  return (
    <div className="min-h-screen bg-gray-100">
      <Sidebar currentPath={currentPath} />

      <div className="lg:ml-72 transition-all duration-200">
        <Topbar />

        <main className="px-6 py-8">
          <div className="max-w-7xl mx-auto space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
