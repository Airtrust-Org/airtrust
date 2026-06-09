/**
 * AirTrust Design System - Component Library
 *
 * NEW DESIGN SYSTEM (FASE 2)
 */
export { Button } from './Button';
export { Badge } from './Badge';
export { StatusBadge } from './StatusBadge';
export type {
  QualificacaoStatus,
  FrmsStatus,
  SgsoStatus,
  EscalaStatus,
  GenericStatus,
} from './StatusBadge';
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './Card';
export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './Table';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';
export { EmptyState } from './EmptyState';
export { PageHeader } from './PageHeader';
export { StatCard } from './StatCard';
export { Calendar } from './Calendar';
export { VirtualTable } from './VirtualTable';
export { ColumnSelector } from './ColumnSelector';
export { Input, TextArea, Select } from './Input';
export { FormField } from './FormField';
export { DropdownMenu } from './DropdownMenu';
export type { DropdownMenuItem } from './DropdownMenu';

/**
 * LEGACY COMPONENTS (to be migrated)
 */
export { DataTable } from './DataTable';
export { StatusCard } from './StatusCard';
export { EnhancedStatusCard, type StatusCardProps } from './EnhancedStatusCard';
export { AdvancedDataTable } from './AdvancedDataTable';
export { GlobalTable, type TableColumn, type GlobalTableProps } from './TablesStandard';
export { GlobalTableEnhanced, type GlobalTablePropsEnhanced } from './GlobalTableEnhanced';
export { Spinner } from './Spinner';
export {
  Skeleton,
  SkeletonCard,
  SkeletonCardList,
  SkeletonTableRow,
  SkeletonTable,
  SkeletonForm,
  SkeletonHeader,
  SkeletonText,
  SkeletonAvatar,
  SkeletonImage,
  SkeletonProvider,
} from './Skeleton';
export {
  getGlobalRowStatus,
  statusStyles,
  defaultTableColumns,
  TABLE_PAGE_SIZES,
  EXPORT_FORMATS,
} from './TableUtils';
