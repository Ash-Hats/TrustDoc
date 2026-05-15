/**
 * Loader and Skeleton Utilities
 * Provides skeleton components and loading states
 */

import Skeleton from '../components/ui/Skeleton.jsx';

/**
 * Get loading skeleton for a specific component type
 * @param {string} type - Type of skeleton to load
 * @param {number} count - Number of skeletons
 * @returns {React.ReactNode}
 */
export function getSkeleton(type, count = 1) {
  const skeletons = [];

  for (let i = 0; i < count; i++) {
    switch (type) {
      case 'document-card':
        skeletons.push(
          <div key={i} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-16" />
            </div>
          </div>
        );
        break;

      case 'stat-card':
        skeletons.push(
          <div key={i} className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        );
        break;

      case 'list-item':
        skeletons.push(
          <div key={i} className="space-y-2 border-b border-white/10 py-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        );
        break;

      case 'button':
        skeletons.push(<Skeleton key={i} className="h-10 w-20 rounded-lg" />);
        break;

      case 'text':
        skeletons.push(<Skeleton key={i} className="h-4 w-full" />);
        break;

      case 'avatar':
        skeletons.push(<Skeleton key={i} className="h-10 w-10 rounded-full" />);
        break;

      default:
        skeletons.push(<Skeleton key={i} className="h-4 w-full" />);
    }
  }

  return skeletons;
}

/**
 * Document card skeleton grid
 * @param {number} count - Number of skeleton cards
 * @returns {React.ReactNode}
 */
export function DocumentCardSkeletons({ count = 8 }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {getSkeleton('document-card', count)}
    </div>
  );
}

/**
 * Stat card skeleton grid
 * @param {number} count - Number of skeleton cards
 * @returns {React.ReactNode}
 */
export function StatCardSkeletons({ count = 4 }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {getSkeleton('stat-card', count)}
    </div>
  );
}

/**
 * List item skeleton
 * @param {number} count - Number of skeleton items
 * @returns {React.ReactNode}
 */
export function ListItemSkeletons({ count = 5 }) {
  return (
    <div>
      {getSkeleton('list-item', count)}
    </div>
  );
}

/**
 * Modal content skeleton
 * @returns {React.ReactNode}
 */
export function ModalContentSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-40" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-10 w-24 rounded-lg" />
        <Skeleton className="h-10 w-24 rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Check if component should show skeleton
 * @param {boolean} isLoading - Loading state
 * @param {*} data - Data to check
 * @returns {boolean}
 */
export function shouldShowSkeleton(isLoading, data) {
  return isLoading || !data;
}

/**
 * Get empty state component
 * @param {string} type - Type of empty state
 * @returns {React.ReactNode}
 */
export function EmptyStateSkeletons(type = 'documents') {
  const messages = {
    documents: 'No documents yet',
    'audit-logs': 'No audit logs',
    users: 'No users found',
    analytics: 'No analytics data',
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-3 py-12">
      <Skeleton className="h-10 w-10 rounded-full" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-48" />
    </div>
  );
}

export default {
  getSkeleton,
  DocumentCardSkeletons,
  StatCardSkeletons,
  ListItemSkeletons,
  ModalContentSkeleton,
  shouldShowSkeleton,
  EmptyStateSkeletons,
};
