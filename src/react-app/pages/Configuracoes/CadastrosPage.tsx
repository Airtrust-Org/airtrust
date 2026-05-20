import AppLayout from '@/react-app/components/AppLayout';
import { useLanguage } from '@/react-app/i18n/useLanguage';
import { Cadastros } from './Cadastros';

export default function ConfiguracoesCadastros() {
  const { t } = useLanguage();

  return (
    <AppLayout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          {t('settings.registry.title')}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{t('settings.registry.subtitle')}</p>
      </div>

      <Cadastros />
    </AppLayout>
  );
}
