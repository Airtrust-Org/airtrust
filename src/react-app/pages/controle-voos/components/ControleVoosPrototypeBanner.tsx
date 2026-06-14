import ModuleGovernanceBanner from '@/react-app/components/ModuleGovernanceBanner';
import { PRODUCT_MODULE_BY_KEY } from '@/react-app/lib/modules';

export default function ControleVoosPrototypeBanner() {
  const module = PRODUCT_MODULE_BY_KEY.controle_voos;

  return (
    <ModuleGovernanceBanner
      title="Módulo Controle de Voos"
      maturityLevel={module.maturityLevel}
      evidenceLevel={module.evidenceLevel}
      isPrototype={module.isPrototype}
      isRegulated={module.isRegulated}
      description="Uso operacional interno com dados reais N1. Não regulado. Não substitui registros oficiais da operação."
    />
  );
}
