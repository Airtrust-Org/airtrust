import React, { useEffect } from 'react';
import AppLayout from '../../react-app/components/AppLayout';

interface TopNavLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function TopNavLayout({ children, title }: TopNavLayoutProps) {
  useEffect(() => {
    if (title) document.title = `${title} | AirTrust`;
  }, [title]);

  // Important: Delegate rendering entirely to the new global AppLayout so
  // any legacy page that still imports TopNavLayout adopts the new standard.
  return <AppLayout>{children}</AppLayout>;
}
