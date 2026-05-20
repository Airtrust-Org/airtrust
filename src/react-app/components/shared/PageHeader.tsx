import { ReactNode } from 'react';
import BasePageHeader from '@/react-app/components/PageHeader';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return <BasePageHeader title={title} subtitle={subtitle} actions={actions} />;
}
