import { useLocation } from 'react-router';
import { ChevronRight, Home } from 'lucide-react';
import { NAVIGATION_CONFIG, SettingsItem } from '../../navigation.config';
import { useAuth } from '@/react-app/hooks/useAuth';
import { canAccessModule } from '@/react-app/lib/module-access';

interface MasterDetailLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export default function MasterDetailLayout({ children, title, description }: MasterDetailLayoutProps) {
  const location = useLocation();
  const { empresas = [], empresaAtualId = null } = useAuth();
  const empresaAtual = empresas.find((empresa) => empresa.id === empresaAtualId) || null;
  const modulosAtivos = empresaAtual?.modulos_ativos;
  const visibleSettingsMenu = NAVIGATION_CONFIG.settings_menu
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => canAccessModule(item.id, modulosAtivos)),
    }))
    .filter((category) => category.items.length > 0);

  const getCurrentItem = (): SettingsItem | undefined => {
    for (const category of visibleSettingsMenu) {
      const item = category.items.find(item => item.path === location.pathname);
      if (item) return item;
    }
    return undefined;
  };

  const currentItem = getCurrentItem();
  const currentTitle = title || currentItem?.label || 'Configurações';
  const currentDescription = description || currentItem?.description || 'Gerencie as configurações do sistema';

  const isActiveItem = (itemPath: string) => {
    return location.pathname === itemPath;
  };

  const renderBreadcrumbs = () => (
    <nav className="flex items-center space-x-2 text-sm text-gray-500 mb-4">
      <a href="/" className="flex items-center gap-1 text-primary hover:underline">
        <Home className="w-4 h-4" />
        <span>Início</span>
      </a>
      <ChevronRight className="w-4 h-4" />
      <span>Configurações</span>
      {currentItem && (
        <>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gray-900 font-medium">{currentItem.label}</span>
        </>
      )}
    </nav>
  );

  return (
    <div className="flex h-full min-h-screen bg-gray-50 w-full">
      {/* Master - Sidebar Secundário */}
      <div className="w-80 bg-white shadow-lg border-r border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Configurações</h2>
          <p className="text-sm text-gray-600 mt-1">
            Gerencie os recursos do sistema
          </p>
        </div>

        <div className="p-4">
          {visibleSettingsMenu.map((category) => (
            <div key={category.category} className="mb-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {category.category}
              </h3>
              <ul className="space-y-1">
                {category.items.map((item) => (
                  <li key={item.id}>
                    <a
                      href={item.path}
                      className={`block px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        isActiveItem(item.path)
                          ? 'bg-primary/20 text-blue-700 shadow-sm'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <div className="font-medium">{item.label}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {item.description}
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Detail - Área de Conteúdo */}
      <div className="flex-1 flex flex-col min-h-screen">
        <div className="bg-white border-b border-gray-200 px-8 py-8">
          {renderBreadcrumbs()}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{currentTitle}</h1>
            <p className="text-gray-600 mt-2 text-lg">{currentDescription}</p>
          </div>
        </div>

        <main className="flex-1 p-5 overflow-auto w-full">
          <div className="w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
