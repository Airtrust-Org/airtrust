import React from 'react';

/**
 * Skeleton loading state para o dashboard completo
 */
export function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Critical Alerts Skeleton */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gray-200 rounded-full" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-gray-200 rounded w-1/4" />
            <div className="h-3 bg-gray-200 rounded w-1/3" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-20 bg-gray-100 rounded-lg" />
          <div className="h-20 bg-gray-100 rounded-lg" />
        </div>
      </div>

      {/* Metrics Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gray-200 rounded-lg" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
            <div className="h-10 bg-gray-200 rounded w-3/4 mb-3" />
            <div className="h-3 bg-gray-200 rounded w-1/2" />
          </div>
        ))}
      </div>

      {/* Bottom Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton para metric card individual
 */
export function MetricCardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gray-200 rounded-lg" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
      </div>
      <div className="h-10 bg-gray-200 rounded w-3/4 mb-3" />
      <div className="h-3 bg-gray-200 rounded w-1/2" />
    </div>
  );
}

/**
 * Skeleton para compliance score
 */
export function ComplianceScoreSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-1/3 mb-6" />
      <div className="flex justify-center mb-8">
        <div className="w-48 h-24 bg-gray-200 rounded-full" />
      </div>
      <div className="space-y-3">
        <div className="h-3 bg-gray-200 rounded" />
        <div className="h-3 bg-gray-200 rounded" />
        <div className="h-3 bg-gray-200 rounded w-5/6" />
      </div>
    </div>
  );
}
