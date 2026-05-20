import { useState, useEffect, memo } from 'react';
import { useLocation, Link } from 'react-router';
import {
  BarChart3,
  BookOpen,
  Users,
  Calendar,
  Building,
  ChevronDown,
  ChevronRight,
  Settings,
  Shield,
  FileText,
  CheckCircle,
  GraduationCap,
} from 'lucide-react';
import { NAVIGATION_CONFIG } from '../navigation.config';
import { useSystemSettings } from '../hooks/useSystemSettings';

const iconMap = {
  BarChart3,
  BookOpen,
  Users,
  Calendar,
  Building,
  Settings,
  Shield,
  FileText,
  CheckCircle,
  GraduationCap,
};

function MainSidebar() {
  const location = useLocation();
  const { logoSrc } = useSystemSettings();
  const [expandedItems, setExpandedItems] = useState<string[]>(['lms', 'pessoas']);
  useEffect(() => {}, []);

  const toggleExpanded = (itemId: string) => {
    setExpandedItems((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId],
    );
  };

  const isActiveRoute = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const isParentActive = (children: any[]) => {
    return children.some((child) => isActiveRoute(child.path));
  };

  const hasAccess = (_itemId: string) => {
    return true;
  };

  return (
    <div className="fixed left-0 top-0 w-64 bg-white shadow-lg border-r border-gray-200 flex flex-col h-screen z-30">
      {/* Logo */}
      <div className="p-6 border-b border-gray-100">
        <Link
          to="/"
          className="inline-flex items-center rounded-lg p-1 hover:bg-gray-50 transition-colors"
        >
          <img src={logoSrc} alt="AirTrust" className="h-10 w-[180px] object-contain object-left" />
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {NAVIGATION_CONFIG.main_menu
          .filter((item) => hasAccess(item.id))
          .map((item) => {
            const Icon = iconMap[item.icon as keyof typeof iconMap];
            const isExpanded = expandedItems.includes(item.id);
            const hasActiveChild = item.children ? isParentActive(item.children) : false;
            const isActive = item.path ? isActiveRoute(item.path) : hasActiveChild;

            return (
              <div key={item.id}>
                {/* Main Item */}
                {item.expandable && item.children ? (
                  <button
                    onClick={() => toggleExpanded(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive || hasActiveChild
                        ? 'bg-primary/10 text-blue-700 border border-blue-200'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                ) : (
                  <Link
                    to={item.path!}
                    className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-primary/10 text-blue-700 border border-blue-200'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                )}

                {/* Sub Items */}
                {item.expandable && item.children && isExpanded && (
                  <div className="ml-4 mt-2 space-y-1">
                    {item.children
                      .filter((child) => hasAccess(child.id))
                      .map((child) => (
                        <Link
                          key={child.id}
                          to={child.path}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                            isActiveRoute(child.path)
                              ? 'bg-primary/10 text-blue-700 border border-blue-200 font-medium'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                          }`}
                        >
                          <span>{child.label}</span>
                          {child.badge && (
                            <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
                              {child.badge}
                            </span>
                          )}
                        </Link>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
      </nav>

      {/* Settings Link - Disponível para todos no MVP */}
      <div className="p-4 border-t border-gray-100">
        <Link
          to="/configuracoes"
          className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            location.pathname.startsWith('/configuracoes')
              ? 'bg-gray-100 text-gray-900'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span>Configurações</span>
        </Link>
      </div>
    </div>
  );
}

export default memo(MainSidebar);
