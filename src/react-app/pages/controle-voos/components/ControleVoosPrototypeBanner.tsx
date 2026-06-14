import ModuleGovernanceBanner from '@/react-app/components/ModuleGovernanceBanner';
import { PRODUCT_MODULE_BY_KEY } from '@/react-app/lib/modules';

export default function ControleVoosPrototypeBanner() {
  const module = PRODUCT_MODULE_BY_KEY.controle_voos;

  return (
    <ModuleGovernanceBanner
      title="Módulo Controle de Voos em prévia"
      maturityLevel={module.maturityLevel}
      evidenceLevel={module.evidenceLevel}
      isPrototype={module.isPrototype}
      isRegulated={module.isRegulated}
      description="Dados demonstrativos. Não utilizar como registro oficial de voo, RDV, jornada, despacho ou fiscalização."
    />
  );
}
