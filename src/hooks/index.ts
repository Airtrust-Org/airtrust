/**
 * COMPATIBILITY LAYER: Re-export modern hooks from react-app/hooks
 *
 * The modern hooks are in /src/react-app/hooks
 * This index maintains backward compatibility with legacy imports:
 *   import { useFuncionarios } from '@/hooks'
 */

// Modern hooks (from src/react-app/hooks)
export { useFuncionarios } from '../react-app/hooks/useFuncionarios';
export { useQualificacoes } from '../react-app/hooks/useQualificacoes';
export { useApi } from '../react-app/hooks/useApi';
export { useToast } from '../react-app/hooks/useToast';
export { useAuth } from '../react-app/hooks/useAuth';
export { useFuncionariosSimples } from '../react-app/hooks/useFuncionariosSimples';
export type { ColumnConfig, SchemaField } from '../react-app/hooks/useFuncionariosConfig';
export { useFuncionariosConfig } from '../react-app/hooks/useFuncionariosConfig';
