## Context & Objectives

*(Existing narrative placeholder – retain any prior context as needed.)*

### Audited & Updated Endpoints

| Rota | Componente | Handler | Confirmação | Método | Endpoint literal | Guarda/RBAC comprovado |
|------|------------|---------|-------------|--------|------------------|-------------------------|
| /simuladores/cadastros/modelos-sessao | src/react-app/pages/simuladores/cadastros/modelos-sessao/index.tsx | excluir(id) | confirmDialog('Excluir este modelo?') | DELETE | ${API_BASE_URL}/simuladores/modelos-sessao/${id} | none (generic ProtectedRoute) |
| /simuladores/cadastros/tipos | src/react-app/pages/simuladores/cadastros/tipos-sessao/index.tsx | excluir(id) | confirmDialog('Excluir este tipo de sessão?') | DELETE | ${API_BASE_URL}/simuladores/tipos-sessao/${id} | none |
| /simuladores/cadastros/categorias | src/react-app/pages/simuladores/cadastros/categorias/index.tsx | excluir(id) | confirmDialog('Excluir esta categoria?') | DELETE | ${API_BASE_URL}/simuladores/categorias/${id} | none |
| /simuladores/cadastros/simuladores | src/react-app/pages/simuladores/cadastros/simuladores/crud-completo.tsx | excluir(id) | confirmDialog('Excluir este simulador?') | DELETE | ${API_BASE_URL}/simuladores/${id} | none |
| /simuladores/cadastros/instrutores | src/react-app/pages/simuladores/cadastros/instrutores/index.tsx | excluir(id) | confirmDialog('Tem certeza que deseja remover este instrutor?') | DELETE | ${API_BASE_URL}/simuladores/instrutores/${id} | none |
| /simuladores/cadastros/modelos | src/react-app/pages/simuladores/cadastros/modelos/index.tsx | excluir(id) | confirmDialog('Tem certeza que deseja excluir este modelo?') | DELETE | ${API_BASE_URL}/simuladores/modelos-sessao/${id} | none |
| /simuladores/fichas | src/react-app/pages/simuladores/fichas/index.tsx | handleDeletar(id) | confirmDialog('Excluir esta ficha?') | DELETE | ${API_BASE_URL}/simuladores/fichas/${id} | canDeleteFicha (admin/gestor) |
| *Manobra removal* (extra) | src/react-app/pages/simuladores/cadastros/modelos-sessao/index.tsx | removerManobra(manobraId) | confirmDialog('Deseja remover esta manobra do modelo?') | DELETE | ${API_BASE_URL}/simuladores/modelos-sessao/${modeloSelecionado.id}/manobras/${manobraId} | none |

