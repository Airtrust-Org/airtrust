import React from 'react';
import { AIRTRUST_FRONT_VERSION } from '@/react-app/config/version';

export function SidebarFooter() {
  return (
    <div className="mt-auto border-t border-gray-200 px-4 py-2 text-[10px] text-gray-400">
      <p className="truncate">AirTrust · Front v{AIRTRUST_FRONT_VERSION}</p>
    </div>
  );
}

export default SidebarFooter;
