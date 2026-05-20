import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '@/react-app/components/layout/Header';

export default function Layout() {
  return (
    <div className="min-h-screen bg-background-light text-gray-900 flex flex-col">
      {/* Top Header (Global) */}
      <Header />

      {/* Page content - Responsivo */}
      <main className="layout-content-container flex flex-col flex-1 px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 py-4 sm:py-6 md:py-8">
        <div className="max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
