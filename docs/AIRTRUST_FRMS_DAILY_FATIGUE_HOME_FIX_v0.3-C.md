# AIRTRUST — FRMS Fadiga Diária: Fix Card HomePerfil
## v0.3-C · Correção de Rota de Navegação
**Data:** 2026-05-21  
**Branch:** `main`  
**HEAD:** `968164f3f71743720d039e75ab02466b31b763a7` (merge: add Fadiga Diária card to crew home)  
**Arquivo corrigido:** `src/react-app/pages/HomePerfil.tsx`

---

## 1. Problema Observado

O card "Fadiga Diária" adicionado ao dashboard do perfil Aluno/Tripulante (`HomePerfil`) não levava o usuário à tela correta ao ser clicado. O botão estava presente visualmente, mas a rota configurada no card não correspondia à rota registrada no roteador da aplicação.

**Impacto prático:** clicar no card resultaria em navegação para uma URL inexistente (`/frms/fadiga-checkin`), causando provavelmente um fallback de "Página não encontrada" ou redirect inesperado. O check-in de fadiga diária seria inacessível para ALUNO/INSTRUTOR via HomePerfil.

---

## 2. Causa Raiz

**Mismatch de rota no campo `route` do card:**

| | Valor |
|---|---|
| Rota configurada no card (errada) | `/frms/fadiga-checkin` |
| Rota registrada em `App.tsx` | `/frms/checkin` |
| Rota em `navigation.config.ts` | `/frms/checkin` |
| Rota usada em `FrmsDashboard.tsx` | `/frms/checkin` |
| Rota usada em `FrmsFadigaPainel.tsx` | `/frms/checkin` |
| Rota usada em `FrmsFadigaHistorico.tsx` | `/frms/checkin` |

O valor `/frms/fadiga-checkin` é o **prefixo das rotas da API backend** (ex: `POST /api/frms/fadiga-checkin`), não a rota frontend. O card usou o nome da rota de API ao invés do path do roteador React.

---

## 3. Arquivos Alterados

| Arquivo | Tipo de alteração | Linhas |
|---|---|---|
| `src/react-app/pages/HomePerfil.tsx` | Correção de string de rota | 1 linha |

### Diff exato:

```diff
- route: '/frms/fadiga-checkin',
+ route: '/frms/checkin',
```

Nenhum outro arquivo foi alterado.

---

## 4. Como o Card Aparece Agora para Aluno/Tripulante

O card "Fadiga Diária" é renderizado como **primeiro card** da grade de acesso rápido em `HomePerfil` para os roles:
- `ALUNO`
- `INSTRUTOR`
- `USUARIO`

**Visual:**
- Ícone: `HeartPulse` (ícone de pulsação cardíaca da Lucide)
- Cor de fundo: `bg-amber-50` (âmbar claro)
- Cor do ícone: `text-amber-600`
- Título: "Fadiga Diária"
- Descrição: "Registre rapidamente seu estado antes da jornada."

**Comportamento ao clicar:** navega para `/frms/checkin`, que renderiza `FrmsCheckinFadiga` — o formulário de check-in de fadiga simplificado.

---

## 5. Rota Usada

| Item | Valor |
|---|---|
| Rota frontend | `/frms/checkin` |
| Componente renderizado | `FrmsCheckinFadiga` |
| Guard de acesso | `ProtectedRoute` (apenas autenticação — sem `requiredRole`) |
| Acessível para ALUNO? | ✅ Sim — qualquer usuário autenticado pode acessar |
| Acesso extra para Gestor/Admin | Aba "Equipe" adicional (painel de visão da equipe) |

---

## 6. Análise do FrmsCheckinFadiga (commit anterior — sem alterações nesta fase)

O componente atualizado no commit `9a0f515` foi avaliado e está correto:

| Critério | Status |
|---|---|
| Não quebra tela existente | ✅ Redesign visual apenas, lógica inalterada |
| Não exige backend novo | ✅ Usa hooks e endpoints existentes |
| Não altera regras de negócio | ✅ Payload idêntico ao anterior |
| Trata loading/error/empty state | ✅ Existente via hooks (useCheckinHoje) |
| Funciona para ALUNO | ✅ Sem requiredRole no ProtectedRoute |
| Não expõe dados indevidos | ✅ Aba gestor visível apenas para isAdmin/isGestor |
| Não depende de escala existente | ✅ Card aparece por role, não por escala |
| Payload de submissão intacto | ✅ Todos os campos confirmados (horas_sono_24h, kss_score, fit_for_duty, etc.) |

---

## 7. Validações Executadas

| Validação | Resultado |
|---|---|
| `npx tsc --noEmit` (pré-fix) | ✅ Zero erros |
| `npx tsc --noEmit` (pós-fix) | ✅ Zero erros |
| `npm run build` | ✅ `✓ 3826 modules transformed. ✓ built in 18.89s` — zero erros, zero warnings |
| Rota `/frms/checkin` em `App.tsx` | ✅ Registrada e acessível |
| Rota `/frms/checkin` em `navigation.config.ts` | ✅ Presente |
| Consistência com outras referências à rota | ✅ 4 outros arquivos usam `/frms/checkin` corretamente |

---

## 8. Confirmações Negativas

| Ação proibida | Realizada? |
|---|---|
| Deploy | ❌ Não |
| Push | ❌ Não |
| Migration | ❌ Não |
| Escrita remota (D1/R2/Wrangler) | ❌ Não |
| Alteração de `.env` | ❌ Não |
| Alteração de secrets | ❌ Não |
| BFG / filter-repo | ❌ Não |
| Deleção de arquivos | ❌ Não |
| Movimentação de arquivos | ❌ Não |
| Renomeação de arquivos | ❌ Não |
| Alteração de migrations | ❌ Não |
| Alteração de banco de dados | ❌ Não |
| `git add .` | ❌ Não |
| Refatoração ampla | ❌ Não |

---

## 9. Riscos Remanescentes

| Risco | Severidade | Observação |
|---|---|---|
| A rota `/frms/checkin` não tem guard de role | Baixo | Comportamento intencional — qualquer usuário autenticado pode acessar o check-in. O componente esconde a aba "Equipe" para não-gestores. |
| `USUARIO` incluído nos roles do card | Baixo | O role `USUARIO` é genérico; confirmar se tripulantes reais têm este role ou apenas `ALUNO`/`INSTRUTOR`. Se `USUARIO` nunca for usado, a condição é inócua. |
| Worker TypeScript errors (67 erros) | Médio | Não relacionados a este fix. Permanecem como tarefa separada (ver plano v0.3-B Fase 2). |

---

## 10. Próxima Fase Recomendada

1. **Commit e push desta correção** (ver comandos abaixo).
2. **Deploy de produção** para que o card funcione para usuários reais.
3. **Validar manualmente** no perfil de um ALUNO real que o card aparece e navega corretamente para o check-in.
4. **Retomar** a correção dos 67 erros TypeScript do worker (Fase 2 do plano v0.3-B).

---

*Gerado em 2026-05-21 · Airtrust FRMS Daily Fatigue Home Fix v0.3-C*
