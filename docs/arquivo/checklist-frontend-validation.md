# ✅ CHECKLIST DE VALIDAÇÃO FRONTEND - AIRTRUST

**Data**: **_/_**/2025  
**Testador**: ********\_********  
**Navegador**: Chrome / Firefox / Safari  
**Versão**: ********\_********

---

## 🎯 INSTRUÇÕES

Para cada item:

- ✅ Marque se funcionou perfeitamente
- ⚠️ Marque se funcionou mas com pequenos problemas
- ❌ Marque se não funcionou ou teve erro crítico
- Anote observações quando relevante

---

## 1️⃣ PÁGINA: LOGIN E AUTENTICAÇÃO

| #   | Item                                          | Status | Observações |
| --- | --------------------------------------------- | ------ | ----------- |
| 1.1 | Página de login carrega sem erros console     | [ ]    |             |
| 1.2 | Formulário de login aceita credenciais        | [ ]    |             |
| 1.3 | Login bem-sucedido redireciona para dashboard | [ ]    |             |
| 1.4 | Token JWT é armazenado corretamente           | [ ]    |             |
| 1.5 | Logout funciona e limpa sessão                | [ ]    |             |

**Erros Console**: ********\_********

---

## 2️⃣ PÁGINA: FUNCIONÁRIOS

| #    | Item                                           | Status | Observações |
| ---- | ---------------------------------------------- | ------ | ----------- |
| 2.1  | Página /funcionarios carrega sem erros         | [ ]    |             |
| 2.2  | Listagem de funcionários exibe dados           | [ ]    |             |
| 2.3  | Tabela é responsiva e scroll funciona          | [ ]    |             |
| 2.4  | Filtros (busca, status) funcionam              | [ ]    |             |
| 2.5  | Paginação funciona (se houver)                 | [ ]    |             |
| 2.6  | Botão "Novo Funcionário" abre modal            | [ ]    |             |
| 2.7  | Modal ModalFuncionario carrega corretamente    | [ ]    |             |
| 2.8  | Formulário de criação valida campos            | [ ]    |             |
| 2.9  | Criar funcionário salva com sucesso            | [ ]    |             |
| 2.10 | Toast de sucesso aparece                       | [ ]    |             |
| 2.11 | Listagem atualiza automaticamente após criação | [ ]    |             |
| 2.12 | Botão "Editar" abre modal preenchido           | [ ]    |             |
| 2.13 | Editar funcionário salva com sucesso           | [ ]    |             |
| 2.14 | Botão "Deletar" pede confirmação               | [ ]    |             |
| 2.15 | Deletar funciona (soft delete)                 | [ ]    |             |
| 2.16 | Botão "Pasta Virtual" navega corretamente      | [ ]    |             |
| 2.17 | Performance: carregamento < 3s                 | [ ]    |             |
| 2.18 | Sem re-renders excessivos (sem "piscadas")     | [ ]    |             |

**Erros Console**: ********\_********

**Performance (DevTools Network)**:

- Requests totais: \_\_\_
- Tempo total: \_\_\_s
- Requests em paralelo? (Sim/Não): \_\_\_

---

## 3️⃣ PÁGINA: QUALIFICAÇÕES

| #    | Item                                          | Status | Observações |
| ---- | --------------------------------------------- | ------ | ----------- |
| 3.1  | Página /qualificacoes carrega sem erros       | [ ]    |             |
| 3.2  | Listagem de histórico exibe dados             | [ ]    |             |
| 3.3  | Cards de qualificação mostram info completa   | [ ]    |             |
| 3.4  | Filtros (funcionário, tipo, status) funcionam | [ ]    |             |
| 3.5  | Botão "Atribuir Qualificação" abre modal      | [ ]    |             |
| 3.6  | Modal ModalAtribuirQualificacao carrega       | [ ]    |             |
| 3.7  | Select de funcionário carrega opções          | [ ]    |             |
| 3.8  | Select de qualificação carrega opções         | [ ]    |             |
| 3.9  | Date pickers funcionam corretamente           | [ ]    |             |
| 3.10 | Atribuir qualificação salva com sucesso       | [ ]    |             |
| 3.11 | Toast de sucesso aparece                      | [ ]    |             |
| 3.12 | Listagem atualiza após atribuição             | [ ]    |             |
| 3.13 | Botão "Renovar" abre modal de renovação       | [ ]    |             |
| 3.14 | Modal ModalRenovarQualificacao funciona       | [ ]    |             |
| 3.15 | Renovar qualificação salva com sucesso        | [ ]    |             |
| 3.16 | Botão "Editar" abre modal preenchido          | [ ]    |             |
| 3.17 | Editar qualificação salva com sucesso         | [ ]    |             |
| 3.18 | Badge de status (válido/vencido) correto      | [ ]    |             |
| 3.19 | Botão "Certificados" abre gestão              | [ ]    |             |
| 3.20 | Performance: carregamento < 3s                | [ ]    |             |
| 3.21 | Sem re-renders excessivos                     | [ ]    |             |

**Erros Console**: ********\_********

**Performance**:

- Requests totais: \_\_\_
- Tempo total: \_\_\_s
- React Query fetchCount (DevTools): \_\_\_

---

## 4️⃣ PÁGINA: CERTIFICADOS (dentro de Qualificações)

| #    | Item                                          | Status | Observações |
| ---- | --------------------------------------------- | ------ | ----------- |
| 4.1  | Modal de certificados abre corretamente       | [ ]    |             |
| 4.2  | Listagem de certificados exibe dados          | [ ]    |             |
| 4.3  | Botão "Upload" abre área de upload            | [ ]    |             |
| 4.4  | Drag and drop de PDF funciona                 | [ ]    |             |
| 4.5  | Validação de arquivo (só PDF, <10MB) funciona | [ ]    |             |
| 4.6  | Upload salva com sucesso                      | [ ]    |             |
| 4.7  | Progress bar aparece durante upload           | [ ]    |             |
| 4.8  | Toast de sucesso aparece                      | [ ]    |             |
| 4.9  | Listagem atualiza após upload                 | [ ]    |             |
| 4.10 | Botão "Gerar Certificado" funciona            | [ ]    |             |
| 4.11 | PDF é gerado automaticamente                  | [ ]    |             |
| 4.12 | Nomenclatura do arquivo está padronizada      | [ ]    |             |
| 4.13 | Botão "Download" baixa arquivo                | [ ]    |             |
| 4.14 | Arquivo baixado é PDF válido                  | [ ]    |             |
| 4.15 | Botão "Visualizar" abre preview (se houver)   | [ ]    |             |
| 4.16 | Botão "Deletar" pede confirmação              | [ ]    |             |
| 4.17 | Deletar remove certificado                    | [ ]    |             |

**Erros Console**: ********\_********

---

## 5️⃣ PÁGINA: SIMULADORES

| #    | Item                                        | Status | Observações |
| ---- | ------------------------------------------- | ------ | ----------- |
| 5.1  | Página /simuladores carrega sem erros       | [ ]    |             |
| 5.2  | Listagem de simuladores exibe dados         | [ ]    |             |
| 5.3  | Cards mostram informações completas         | [ ]    |             |
| 5.4  | Botão "Nova Sessão" abre modal              | [ ]    |             |
| 5.5  | Modal SessionModal/SessaoModal carrega      | [ ]    |             |
| 5.6  | Formulário de sessão valida campos          | [ ]    |             |
| 5.7  | Criar sessão salva com sucesso              | [ ]    |             |
| 5.8  | Toast de sucesso aparece                    | [ ]    |             |
| 5.9  | Listagem atualiza após criação              | [ ]    |             |
| 5.10 | Botão "Editar sessão" funciona              | [ ]    |             |
| 5.11 | Dashboard de simuladores carrega            | [ ]    |             |
| 5.12 | Gráficos/estatísticas aparecem corretamente | [ ]    |             |
| 5.13 | Performance: carregamento < 3s              | [ ]    |             |

**Erros Console**: ********\_********

---

## 6️⃣ PÁGINA: PASTA VIRTUAL

| #    | Item                                            | Status | Observações |
| ---- | ----------------------------------------------- | ------ | ----------- |
| 6.1  | Página /pasta-virtual carrega sem erros         | [ ]    |             |
| 6.2  | Listagem de documentos exibe dados              | [ ]    |             |
| 6.3  | Categorias (certificados, exames, etc) aparecem | [ ]    |             |
| 6.4  | Filtros por categoria funcionam                 | [ ]    |             |
| 6.5  | Botão "Upload" funciona                         | [ ]    |             |
| 6.6  | Upload de documento salva                       | [ ]    |             |
| 6.7  | Botão "Download" baixa arquivo                  | [ ]    |             |
| 6.8  | Botão "Visualizar" funciona (se houver)         | [ ]    |             |
| 6.9  | Botão "Deletar" funciona                        | [ ]    |             |
| 6.10 | PastaVirtualCompleta restaurada funciona        | [ ]    |             |

**Erros Console**: ********\_********

---

## 7️⃣ PÁGINA: COMPLIANCE

| #   | Item                                          | Status | Observações |
| --- | --------------------------------------------- | ------ | ----------- |
| 7.1 | Página /compliance carrega sem erros          | [ ]    |             |
| 7.2 | Cards de compliance exibem status             | [ ]    |             |
| 7.3 | Indicadores visuais (verde/vermelho) corretos | [ ]    |             |
| 7.4 | Filtros funcionam                             | [ ]    |             |
| 7.5 | Performance: carregamento < 3s                | [ ]    |             |

**Erros Console**: ********\_********

---

## 8️⃣ PÁGINA: AUDITORIA

| #   | Item                                    | Status | Observações |
| --- | --------------------------------------- | ------ | ----------- |
| 8.1 | Página /auditoria carrega sem erros     | [ ]    |             |
| 8.2 | Tabela de logs exibe dados              | [ ]    |             |
| 8.3 | Filtros (data, usuário, ação) funcionam | [ ]    |             |
| 8.4 | Paginação funciona                      | [ ]    |             |
| 8.5 | Performance: carregamento < 3s          | [ ]    |             |

**Erros Console**: ********\_********

---

## 9️⃣ TESTES DE PERFORMANCE GERAIS

| #   | Item                                       | Status | Observações |
| --- | ------------------------------------------ | ------ | ----------- |
| 9.1 | Scroll em listas longas é fluido           | [ ]    |             |
| 9.2 | Digitação em inputs não trava              | [ ]    |             |
| 9.3 | Navegação entre páginas é rápida (<1s)     | [ ]    |             |
| 9.4 | Abertura de modais é instantânea           | [ ]    |             |
| 9.5 | Fechamento de modais é instantâneo         | [ ]    |             |
| 9.6 | Toasts aparecem e desaparecem corretamente | [ ]    |             |
| 9.7 | Loading states aparecem quando necessário  | [ ]    |             |
| 9.8 | Sem "branco" entre navegações              | [ ]    |             |

---

## 🔟 REACT QUERY DEVTOOLS

| #    | Item                                           | Status | Observações |
| ---- | ---------------------------------------------- | ------ | ----------- |
| 10.1 | React Query DevTools aparece no canto inferior | [ ]    |             |
| 10.2 | Queries aparecem no painel                     | [ ]    |             |
| 10.3 | Nenhuma query com fetchCount > 5               | [ ]    |             |
| 10.4 | Cache está sendo usado (staleTime funciona)    | [ ]    |             |
| 10.5 | Invalidações acontecem apenas após mutations   | [ ]    |             |

**Queries com fetchCount alto (>5)**:

- Query: ********\_******** fetchCount: \_\_\_
- Query: ********\_******** fetchCount: \_\_\_

---

## 📊 RESUMO FINAL

**Total de itens testados**: **_  
**✅ Funcionando perfeitamente**: _**  
**⚠️ Funcionando com ressalvas**: **_  
**❌ Não funcionando**: _**

**Taxa de sucesso**: \_\_\_%

**Principais problemas encontrados**:

1. ***
2. ***
3. ***

**Performance geral**: ⚡ Rápido / 😐 Normal / 🐌 Lento

**Sistema mais rápido que antes da refatoração?**: Sim / Não / Igual

**Recomendação**:
[ ] ✅ Sistema estável - APROVAR
[ ] ⚠️ Pequenos problemas - CORRIGIR e APROVAR
[ ] ❌ Problemas críticos - CORRIGIR antes de aprovar

---

**Assinatura**: ********\_********  
**Data**: **_/_**/2025
