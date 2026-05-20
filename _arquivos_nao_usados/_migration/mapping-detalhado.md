# 📋 MAPEAMENTO COMPLETO - MIGRAÇÃO DE ARQUIVOS

**Gerado**: 01/12/2025 14:16  
**Status**: 🚧 Em execução

---

## INSTRUÇÕES

Para cada linha:

1. Verificar se arquivo existe no caminho ORIGEM
2. Executar migração
3. Atualizar imports manualmente
4. Marcar ✅ quando completo

---

## 📊 ANÁLISE INICIAL

**Total de arquivos na raiz**: 29 arquivos .tsx
**Estrutura target**: Feature-based em subpastas
**Objetivo**: 29 → 1 arquivo na raiz (apenas index.tsx)

---

## DASHBOARD

| #   | Arquivo ORIGEM | Destino TARGET      | Ação  | Status |
| --- | -------------- | ------------------- | ----- | ------ |
| 1   | Dashboard.tsx  | dashboard/index.tsx | Mover | ⏳     |

---

## CADASTROS - SIMULADORES

| #   | Arquivo ORIGEM      | Destino TARGET                                           | Ação                          | Status |
| --- | ------------------- | -------------------------------------------------------- | ----------------------------- | ------ |
| 2   | Lista.tsx           | cadastros/simuladores/index.tsx                          | Mover (lista)                 | ⏳     |
| 3   | FormSimulador.tsx   | cadastros/simuladores/components/FormularioSimulador.tsx | Mover (componente form)       | ⏳     |
| 4   | CrudSimuladores.tsx | ❌ ANALISAR                                              | Ver se é redundante com Lista | ⏳     |

**Novos arquivos**:

- `cadastros/simuladores/novo.tsx` (usar FormularioSimulador)
- `cadastros/simuladores/[id].tsx` (detalhes view)
- `cadastros/simuladores/[id]/editar.tsx` (edit mode)

---

## CADASTROS - MANOBRAS

| #   | Arquivo ORIGEM   | Destino TARGET               | Ação             | Status |
| --- | ---------------- | ---------------------------- | ---------------- | ------ |
| 5   | CrudManobras.tsx | cadastros/manobras/index.tsx | Mover ou quebrar | ⏳     |

**Se for CRUD completo**: Quebrar em lista + form

---

## CADASTROS - TEMPLATES

| #   | Arquivo ORIGEM    | Destino TARGET                | Ação                          | Status |
| --- | ----------------- | ----------------------------- | ----------------------------- | ------ |
| 6   | CrudTemplates.tsx | cadastros/templates/index.tsx | Mover ou quebrar              | ⏳     |
| 7   | Templates.tsx     | ❌ VERIFICAR                  | Redundante com CrudTemplates? | ⏳     |

---

## CADASTROS - MODELOS

| #   | Arquivo ORIGEM  | Destino TARGET              | Ação                 | Status |
| --- | --------------- | --------------------------- | -------------------- | ------ |
| 8   | CrudModelos.tsx | cadastros/modelos/index.tsx | Mover (nova feature) | ⏳     |

---

## CADASTROS - CATEGORIAS

| #   | Arquivo ORIGEM     | Destino TARGET                 | Ação                 | Status |
| --- | ------------------ | ------------------------------ | -------------------- | ------ |
| 9   | CrudCategorias.tsx | cadastros/categorias/index.tsx | Mover (nova feature) | ⏳     |

---

## CADASTROS - INSTRUTORES

| #   | Arquivo ORIGEM      | Destino TARGET                  | Ação                 | Status |
| --- | ------------------- | ------------------------------- | -------------------- | ------ |
| 10  | CrudInstrutores.tsx | cadastros/instrutores/index.tsx | Mover (nova feature) | ⏳     |

---

## CADASTROS - TIPOS DE SESSÃO

| #   | Arquivo ORIGEM      | Destino TARGET                   | Ação                 | Status |
| --- | ------------------- | -------------------------------- | -------------------- | ------ |
| 11  | CrudTiposSessao.tsx | cadastros/tipos-sessao/index.tsx | Mover (nova feature) | ⏳     |

---

## CADASTROS - EQUIPAMENTOS

| #   | Arquivo ORIGEM   | Destino TARGET                   | Ação                 | Status |
| --- | ---------------- | -------------------------------- | -------------------- | ------ |
| 12  | Equipamentos.tsx | cadastros/equipamentos/index.tsx | Mover (nova feature) | ⏳     |

---

## CADASTROS - CONFIGURAÇÕES

| #   | Arquivo ORIGEM             | Destino TARGET                    | Ação  | Status |
| --- | -------------------------- | --------------------------------- | ----- | ------ |
| 13  | ConfiguracoesCadastros.tsx | cadastros/configuracoes/index.tsx | Mover | ⏳     |

---

## SESSÕES

| #   | Arquivo ORIGEM         | Destino TARGET                          | Ação               | Status |
| --- | ---------------------- | --------------------------------------- | ------------------ | ------ |
| 14  | NovaSessao.tsx         | sessoes/nova.tsx                        | Mover              | ⏳     |
| 15  | FormSessao.tsx         | sessoes/components/FormularioSessao.tsx | Mover (componente) | ⏳     |
| 16  | NovoAgendamento.tsx    | sessoes/components/NovoAgendamento.tsx  | Mover (componente) | ⏳     |
| 17  | DetalhesSessao.tsx     | sessoes/[id]/index.tsx                  | Mover (detalhes)   | ⏳     |
| 18  | ExecutarSessao.tsx     | sessoes/[id]/executar.tsx               | Mover (execução)   | ⏳     |
| 19  | AprovarSessao.tsx      | sessoes/[id]/aprovar.tsx                | Mover (aprovação)  | ⏳     |
| 20  | EditarModeloSessao.tsx | sessoes/[id]/editar-modelo.tsx          | Mover              | ⏳     |

**Nova lista**: Criar `sessoes/index.tsx` (lista de sessões)

---

## FICHAS

| #   | Arquivo ORIGEM   | Destino TARGET        | Ação               | Status |
| --- | ---------------- | --------------------- | ------------------ | ------ |
| 21  | FichasSessao.tsx | fichas/index.tsx      | Mover (lista)      | ⏳     |
| 22  | FichaDetalhe.tsx | fichas/[id]/index.tsx | Mover (visualizar) | ⏳     |

**Novos arquivos**:

- `fichas/[id]/preencher.tsx` (preencher/avaliar)
- `fichas/[id]/pdf.tsx` (gerar PDF)

---

## AGENDA/CALENDÁRIO

| #   | Arquivo ORIGEM       | Destino TARGET     | Ação               | Status |
| --- | -------------------- | ------------------ | ------------------ | ------ |
| 23  | AgendaCalendario.tsx | agenda/index.tsx   | Mover (nova seção) | ⏳     |
| 24  | AgendaMensal.tsx     | agenda/mensal.tsx  | Mover              | ⏳     |
| 25  | AgendaSemanal.tsx    | agenda/semanal.tsx | Mover              | ⏳     |

---

## RELATÓRIOS

| #   | Arquivo ORIGEM            | Destino TARGET       | Ação  | Status |
| --- | ------------------------- | -------------------- | ----- | ------ |
| 26  | RelatoriosSimuladores.tsx | relatorios/index.tsx | Mover | ⏳     |

---

## HISTÓRICO

| #   | Arquivo ORIGEM           | Destino TARGET            | Ação               | Status |
| --- | ------------------------ | ------------------------- | ------------------ | ------ |
| 27  | HistoricoFuncionario.tsx | historico/funcionario.tsx | Mover (nova seção) | ⏳     |

---

## IMPORTAÇÃO

| #   | Arquivo ORIGEM                  | Destino TARGET                  | Ação           | Status |
| --- | ------------------------------- | ------------------------------- | -------------- | ------ |
| 28  | ImportarRelacoesInteligente.tsx | components/ImportarRelacoes.tsx | Mover (shared) | ⏳     |

---

## RAIZ (MANTER)

| #   | Arquivo ORIGEM | Destino TARGET | Ação      | Status |
| --- | -------------- | -------------- | --------- | ------ |
| 29  | index.tsx      | index.tsx      | ✅ MANTER | ✅     |

---

## 📊 RESUMO

- **Total de arquivos**: 29
- **Arquivos a mover**: 28
- **Arquivos a manter na raiz**: 1 (index.tsx)
- **Novas features descobertas**: agenda/, historico/, cadastros/{modelos,categorias,instrutores,tipos-sessao,equipamentos,configuracoes}
- **Arquivos novos a criar**: ~8

---

## 🎯 ESTRATÉGIA DE EXECUÇÃO

### Fase 1: Principais (Alta prioridade)

1. ✅ Dashboard
2. ✅ Cadastros/Simuladores (Lista, Form)
3. ✅ Sessões (Nova, Detalhes, Form)
4. ✅ Fichas (Lista, Detalhe)
5. ✅ Relatórios

### Fase 2: Cadastros Auxiliares (Média prioridade)

6. Manobras, Templates, Modelos
7. Categorias, Instrutores, Tipos Sessão
8. Equipamentos, Configurações

### Fase 3: Features Secundárias (Baixa prioridade)

9. Agenda (Calendário, Mensal, Semanal)
10. Histórico
11. Importação

---

## 📝 DECISÕES NECESSÁRIAS

### CrudSimuladores.tsx vs Lista.tsx

- [ ] Verificar se são redundantes
- [ ] Se sim, manter apenas Lista.tsx
- [ ] Se não, entender diferença

### Templates.tsx vs CrudTemplates.tsx

- [ ] Verificar se são redundantes
- [ ] Manter apenas 1 versão

---

## ✅ PROGRESSO

- [ ] Dashboard (1 arquivo)
- [ ] Cadastros - Simuladores (3 arquivos)
- [ ] Cadastros - Manobras (1 arquivo)
- [ ] Cadastros - Templates (2 arquivos)
- [ ] Cadastros - Modelos (1 arquivo)
- [ ] Cadastros - Categorias (1 arquivo)
- [ ] Cadastros - Instrutores (1 arquivo)
- [ ] Cadastros - Tipos Sessão (1 arquivo)
- [ ] Cadastros - Equipamentos (1 arquivo)
- [ ] Cadastros - Configurações (1 arquivo)
- [ ] Sessões (7 arquivos)
- [ ] Fichas (2 arquivos)
- [ ] Agenda (3 arquivos)
- [ ] Relatórios (1 arquivo)
- [ ] Histórico (1 arquivo)
- [ ] Importação (1 arquivo)

**Total**: 28 arquivos a migrar
