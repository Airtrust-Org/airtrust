import React from 'react';
import {
  DEPLOYMENT_VERSION,
  readServedFrontendVersionFromDocument,
} from '@/react-app/config/deployment';

function resolveFrontendVersion(): string {
  const servedVersion = readServedFrontendVersionFromDocument();
  if (servedVersion) return servedVersion;
  if (DEPLOYMENT_VERSION && DEPLOYMENT_VERSION !== '0.0.0-dev') return DEPLOYMENT_VERSION;
  return 'unknown';
}

export function SidebarFooter() {
  const version = resolveFrontendVersion();

  return (
    <div className="mt-auto border-t border-gray-200 px-4 py-2 text-[10px] text-gray-400">
      <p className="truncate font-mono">AirTrust · Front {version}</p>
    </div>
  );
}

export default SidebarFooter;
