import { HardRefreshButton } from '@/react-app/components/configuracoes/HardRefreshButton';
import { useLanguage } from '@/react-app/i18n/useLanguage';

export default function HardRefresh() {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <section>
        <h2 className="text-2xl font-semibold text-gray-900">{t('settings.hardRefresh.title')}</h2>
        <p className="text-gray-600 mt-1">{t('settings.hardRefresh.subtitle')}</p>
      </section>

      <HardRefreshButton />

      <section className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-gray-900">{t('settings.hardRefresh.whenUse')}</h3>
        <ul className="mt-3 list-disc list-inside text-sm text-gray-700 space-y-1">
          <li>{t('settings.hardRefresh.item1')}</li>
          <li>{t('settings.hardRefresh.item2')}</li>
          <li>{t('settings.hardRefresh.item3')}</li>
        </ul>
      </section>
    </div>
  );
}
