import React from 'react';
import { ListaTab } from './tabs/ListaTab';

// Compat wrapper: mantém a API solicitada pelo prompt (TabListaFuncionarios)
export function TabListaFuncionarios(props: React.ComponentProps<typeof ListaTab>) {
  return <ListaTab {...props} />;
}

export default TabListaFuncionarios;
