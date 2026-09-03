import ModuleGovernanceBanner from '@/react-app/components/ModuleGovernanceBanner';
import { PRODUCT_MODULE_BY_KEY } from '@/react-app/lib/modules';

export default function MroPrototypeBanner() {
  const module = PRODUCT_MODULE_BY_KEY.mro;

  return (
    <ModuleGovernanceBanner
      title="MRO"
      maturityLevel={module.maturityLevel}
      evidenceLevel={module.evidenceLevel}
      isPrototype={module.isPrototype}
      isRegulated={module.isRegulated}
      description="Dados demonstrativos; não usar como registro oficial de manutenção ou aeronavegabilidade."
    />
  );
}
