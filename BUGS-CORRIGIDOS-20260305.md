# BUGS CORRIGIDOS — 2026-03-05

**Commit:** `ee429dc8`  
**Deploy:** Worker `4b93a2ca` + Pages production  
**Arquivos alterados:** 9 (159 inserções, 83 deleções)

---

## 1. Bugs Reportados (4/4 corrigidos)

### BUG-01 — Crash ao clicar nome do tripulante ✅

**Sintoma:** `ReferenceError: Cannot access 'aeronaves' before initialization`  
**Causa raiz:** TDZ (Temporal Dead Zone) — `const aeronaves = useMemo(...)` declarado **após** um `useEffect` que o referenciava.  
**Correção:** Movidos os 3 `useMemo` (`aeronaves`, `padroes`, `pilotos`) para **antes** do `useEffect`.  
**Arquivo:** `ModalAdicionarTripulacao.tsx`

### BUG-02 — Sem opção de editar/remover tripulação ✅

**Sintoma:** Tripulação adicionada sem forma de editar ou remover pelo Gantt.  
**Correção:**

- Adicionados botões ✏️ Editar / 🗑 Remover / ➕ Evento no hover da linha PIC (modo edição)
- Dialog de confirmação com aviso de remoção de eventos automáticos
- Integração com `removerTripulacao` mutation existente  
  **Arquivos:** `GradeGantt.tsx`, `EscalasPage.tsx`

### BUG-03 — "Exibir nomes de guerra" sem efeito ✅

**Sintoma:** Configuração `exibirNome: 'guerra'` não alterava o avatar do tripulante.  
**Causa raiz:** O avatar usava `membro.nome.charAt(0)` fixo, ignorando a config.  
**Correção:** Avatar agora usa `exibirNome === 'guerra' && membro.nomeGuerra ? membro.nomeGuerra : membro.nome`.  
**Arquivo:** `GradeGantt.tsx`

### BUG-04 — Nome "Adriana Brasil" no card da escala ✅

**Sintoma:** Nome aparecia no rodapé do card sem contexto, confundindo com tripulante.  
**Causa raiz:** Campo `criado_por_nome` (criador da escala) exibido sem label.  
**Correção:** Adicionado prefixo `Criada por` antes do nome.  
**Arquivo:** `EscalasPage.tsx`

---

## 2. Varredura Preventiva (V-01 a V-08)

| ID   | Categoria                             | Achados | Corrigidos | Arquivos                                                           |
| ---- | ------------------------------------- | ------- | ---------- | ------------------------------------------------------------------ |
| V-04 | `key={index}` em listas               | 4       | 4          | ModalVerificarConflitos, EscalasPage                               |
| V-06 | Datas não formatadas (slice manual)   | 3       | 3          | ModalVerificarConflitos, PainelTripulacoes, ConfirmacaoInline      |
| V-07 | Toasts genéricos sem mensagem do erro | 9       | 9          | GradeGantt, EscalasPage, ConfirmacaoInline, ConfiguracaoEscalaPage |
| V-08 | Botões sem `disabled` durante loading | 2       | 2          | EscalasPage (delete + remover trip)                                |

**Total varredura:** 18 issues encontrados → 18 corrigidos

---

## 3. Resumo de Arquivos Modificados

| Arquivo                        | Mudanças                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `ModalAdicionarTripulacao.tsx` | BUG-01: Reordenação useMemo antes de useEffect                                                                               |
| `GradeGantt.tsx`               | BUG-02: Botões edit/remove hover; BUG-03: Avatar nome guerra; V-07: toasts export                                            |
| `EscalasPage.tsx`              | BUG-02: Dialog confirmação remover; BUG-04: Label "Criada por"; V-04: fdpAlertas key; V-07: 3 toasts; V-08: disabled buttons |
| `ModalVerificarConflitos.tsx`  | V-04: 3 composite keys; V-06: toLocaleDateString                                                                             |
| `PainelTripulacoes.tsx`        | V-06: toLocaleDateString datas                                                                                               |
| `ConfirmacaoInline.tsx`        | V-06: toLocaleDateString; V-07: 2 toasts                                                                                     |
| `ConfiguracaoEscalaPage.tsx`   | V-07: toast template remove                                                                                                  |
| `useEscalasQuery.ts`           | Ajuste query (sessão anterior)                                                                                               |
| `deployment.ts`                | Auto-versão deploy                                                                                                           |

---

## 4. Score de Qualidade

| Métrica                | Antes            | Depois |
| ---------------------- | ---------------- | ------ |
| Crashes em produção    | 1 (BUG-01)       | 0      |
| `key={index}`          | 4 ocorrências    | 0      |
| Toasts genéricos       | 9 ocorrências    | 0      |
| Datas com slice manual | 3 ocorrências    | 0      |
| Botões sem disabled    | 2 ocorrências    | 0      |
| Ações CRUD sem UI      | 1 (remover trip) | 0      |

**Nota:** 22 issues resolvidos nesta sessão. Zero regressões no build.
