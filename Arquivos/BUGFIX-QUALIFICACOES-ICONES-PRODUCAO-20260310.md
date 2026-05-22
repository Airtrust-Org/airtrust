# BUGFIX — Qualificações: Ícones como Texto em Produção

**Deploy**: `065d0022` · Worker Version: `b2a3e2ae-5868-409c-b46d-b826c518b6d4`  
**Tests**: 292 passing · Build: ✅ zero erros  
**Data**: 10 de março de 2026

---

## 1. CAUSA RAIZ

O projeto carregava **Material Symbols Outlined via Google Fonts CDN** com
`display=block` no `index.html`:

```html
<link
  href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,...&display=block"
  rel="stylesheet"
/>
```

### Por que acontece APENAS em produção

| Ambiente  | Comportamento da CDN                                          |
| --------- | ------------------------------------------------------------- |
| localhost | Font carrega em <100ms (cache local, rede rápida) → ícones OK |
| Produção  | Font CDN demora ou falha (CSP, latência, timeout)             |

Com `display=block`:

- Durante o período de bloqueio (~3s): texto **invisível** (FOIT)
- Após o período expirar: navegador usa **fonte fallback de sistema**

Material Symbols usa **ligaduras OpenType** para mapear texto → ícone.
Quando a source da font não carrega, a ligadura não existe na fonte fallback
e o texto literal aparece: `"edit"`, `"delete"`, `"workspace_premium"`.

### Por que o badge verde "vazava"

O botão de certificado usa `h-8 w-8` (32×32px). Com a font fallback,
`"workspace_premium"` é uma string longa (~160px de largura) que não cabe
na div, causando overflow visível como um "badge" verde saindo da célula.

```html
<!-- Botão 32×32px contendo texto 160px → overflow -->
<button class="flex h-8 w-8 items-center justify-center ... bg-green-600 text-white">
  <span class="material-symbols-outlined text-xl">workspace_premium</span>
</button>
```

---

## 2. EVIDÊNCIAS DO DIAGNÓSTICO

```bash
# Arquivos com material-symbols no projeto
grep -rn "material-symbols" src/react-app/ --include="*.tsx" -l

src/react-app/components/qualificacoes/ModalCertificados.tsx  # 6 instâncias
src/react-app/pages/Qualificacoes.tsx                         # 36 instâncias
src/react-app/components/layout/Header.tsx                    # 5 instâncias
src/react-app/components/AppLayout.tsx                        # 4 instâncias
src/react-app/pages/Funcionarios.tsx                          # 2 instâncias
src/react-app/components/NotificacoesEscala.tsx               # 2 instâncias
src/react-app/components/ProtectedRoute.tsx                   # 1 instância
src/react-app/components/modals/SessaoModal.tsx               # 4 instâncias
src/react-app/components/modals/ModalAlertaEAD.tsx            # 5 instâncias
src/react-app/components/SimuladoresLayout.tsx                # 4 instâncias (dinâmico)
src/react-app/components/ImportarXLSX.tsx                     # 3 instâncias
src/react-app/pages/ConfiguracoesPage.tsx                     # 5 instâncias (dinâmico)
```

**index.html**: Confirmado — carregamento via CDN com `display=block`.  
**Tailwind purge**: Não é o problema — a CDN não usa classes Tailwind.  
**Lucide React**: Já instalado no projeto (`0.510.0`), usa SVG → sem CDN.

---

## 3. CORREÇÃO APLICADA

### Estratégia dupla

| Arquivo                 | Estratégia                                                           |
| ----------------------- | -------------------------------------------------------------------- |
| `Qualificacoes.tsx`     | **Migração para Lucide React** (36 ícones → SVG) — foco do bug       |
| `ModalCertificados.tsx` | **Migração para Lucide React** (6 ícones → SVG)                      |
| Demais 10 arquivos      | **`material-symbols` npm** (local, sem CDN — cobre ícones dinâmicos) |
| `index.html`            | **CDN removida** — substituída por bundle local                      |
| `main.tsx`              | **`import 'material-symbols/outlined.css'`** adicionado              |

### Ícones migrados em `Qualificacoes.tsx`

| Material Symbol            | Lucide React            | Contexto                         |
| -------------------------- | ----------------------- | -------------------------------- |
| `check_circle` (text-xl)   | `CheckCircle2 w-5 h-5`  | Confirmar qualificação hoje      |
| `check` (text-xl)          | `Check w-5 h-5`         | Confirmar realização             |
| `cancel` (text-xl)         | `XCircle w-5 h-5`       | Cancelar qualificação            |
| `edit` (text-xl)           | `Pencil w-5 h-5`        | Editar (histórico, tipos, cats)  |
| `delete` (text-xl)         | `Trash2 w-5 h-5`        | Deletar (histórico, tipos, cats) |
| `refresh` (text-xl)        | `RefreshCw w-5 h-5`     | Renovar qualificação             |
| `workspace_premium`        | `Award w-5 h-5`         | **Bug principal** — certificado  |
| `notifications_active`     | `BellRing w-5 h-5`      | Alerta EAD/CMA                   |
| `add` (text-base)          | `Plus w-4 h-4`          | Toolbar buttons (5×)             |
| `history` (tab, dinâmico)  | `History size=16`       | Tab Histórico                    |
| `bookmark` (tab, dinâmico) | `Bookmark size=16`      | Tab Tipos                        |
| `folder_open` (tab, din.)  | `FolderOpen size=16`    | Tab Categorias                   |
| `search` (absolute input)  | `Search size=16`        | Search boxes (2×)                |
| `filter_list`              | `ListFilter w-4 h-4`    | Filtrar Status                   |
| `view_column`              | `Columns2 w-4 h-4`      | Configurar Colunas               |
| `error` (text-2xl)         | `AlertCircle w-6 h-6`   | Error banners (3×)               |
| `refresh` (text-sm)        | `RefreshCw w-3.5 h-3.5` | Retry em errors (3×)             |
| `restart_alt`              | `RotateCcw w-3.5 h-3.5` | Reload em errors (3×)            |
| `badge` (text-6xl)         | `BadgeCheck size=60`    | Empty state histórico            |
| `category` (text-6xl)      | `Tag size=60`           | Empty state tipos                |
| `palette` (text-6xl)       | `Palette size=60`       | Empty state categorias           |
| `check` (text-base)        | `Check w-4 h-4`         | Botão confirmar modal categoria  |

### Ícones migrados em `ModalCertificados.tsx`

| Material Symbol     | Lucide React           | Contexto                 |
| ------------------- | ---------------------- | ------------------------ |
| `folder_open`       | `FolderOpen w-4 h-4`   | Botão Pasta Virtual      |
| `picture_as_pdf`    | `FileText w-4 h-4`     | Botão Gerar certificado  |
| `upload`            | `Upload w-4 h-4`       | Botão Anexar             |
| `workspace_premium` | `Award w-10 h-10`      | Empty state certificados |
| `download`          | `Download w-3.5 h-3.5` | Ação Download na tabela  |
| `delete`            | `Trash2 w-3.5 h-3.5`   | Ação Excluir na tabela   |

### Diff representativo — botão mais afetado

**Antes:**

```tsx
<button
  className={`flex h-8 w-8 items-center justify-center rounded-md ${
    item.tem_certificado
      ? 'bg-green-600 text-white hover:bg-green-700'
      : 'text-blue-600 hover:bg-blue-50 hover:text-blue-700'
  }`}
>
  <span className="material-symbols-outlined text-xl">workspace_premium</span>
</button>
```

**Depois:**

```tsx
<button
  className={`flex h-8 w-8 items-center justify-center rounded-md ${
    item.tem_certificado
      ? 'bg-green-600 text-white hover:bg-green-700'
      : 'text-blue-600 hover:bg-blue-50 hover:text-blue-700'
  }`}
>
  <Award className="w-5 h-5" />
</button>
```

SVG do Lucide tem `width` e `height` explícitos → não pode vazar do container.

### Mudanças nos arquivos de infraestrutura

**`src/react-app/main.tsx`** — import adicionado:

```typescript
// Material Symbols font — local bundle (removes CDN dependency)
import 'material-symbols/outlined.css';
```

**`index.html`** — CDN removida:

```diff
- <!-- Material Symbols Outlined -->
- <link
-   href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:..."
-   rel="stylesheet"
- />
+ <!-- Material Symbols Outlined: carregado via npm bundle -->
```

**`package.json`** — nova dependência:

```json
"material-symbols": "^0.40.2"
```

---

## 4. MÓDULOS AFETADOS ALÉM DE QUALIFICAÇÕES

Todos usam `material-symbols-outlined` via CDN — todos são corrigidos
pelo `import 'material-symbols/outlined.css'` em `main.tsx`:

| Arquivo                                | Ícones usados                                   | Fix       |
| -------------------------------------- | ----------------------------------------------- | --------- |
| `components/layout/Header.tsx`         | notifications, settings                         | npm local |
| `components/AppLayout.tsx`             | settings, notifications, logout                 | npm local |
| `pages/Funcionarios.tsx`               | search, view_column                             | npm local |
| `components/NotificacoesEscala.tsx`    | flight_takeoff, notifications_none              | npm local |
| `components/ProtectedRoute.tsx`        | block                                           | npm local |
| `components/modals/SessaoModal.tsx`    | close, add, delete, save                        | npm local |
| `components/modals/ModalAlertaEAD.tsx` | notifications_active, mail, chat, refresh, send | npm local |
| `components/SimuladoresLayout.tsx`     | `{action.icon}` (dinâmico)                      | npm local |
| `components/ImportarXLSX.tsx`          | info, description, refresh                      | npm local |
| `pages/ConfiguracoesPage.tsx`          | `{tab.icon}` (dinâmico)                         | npm local |

**Nota**: `SimuladoresLayout.tsx` e `ConfiguracoesPage.tsx` usam ícones
dinâmicos via string (`{action.icon}`, `{tab.icon}`), impossibilitando
migração estática para Lucide. O pacote npm cobre esses casos.

---

## 5. BADGE VERDE VAZANDO — ANÁLISE

**Causa**: `workspace_premium` é ligatura de 15 caracteres. Com font CDN
falhando, o texto renderiza em Arial/system-font (~160px largura). O botão
`h-8 w-8` (32px) não tem `overflow-hidden`, causando overflow visível sobre
células adjacentes, criando aparência de "badge verde saindo do lugar".

**Correção**: Substituição por `<Award className="w-5 h-5" />` — SVG tem
`width: 20px; height: 20px` fixo, não pode vazar.

---

## 6. TESTES

Todos 292 testes passando após a migração.

Validação manual necessária em produção:

- [ ] `airtrust.online/qualificacoes` → botões Edit/Delete mostram ícones SVG
- [ ] Botão certificate (verde quando `tem_certificado=true`) → ícone `Award` visível, **sem overflow**
- [ ] Tabs Histórico/Tipos/Categorias → ícones nas tabs funcionando
- [ ] Search box → ícone de lupa à esquerda do input
- [ ] Filtrar Status / Configurar Colunas → ícones nos botões
- [ ] Empty state (sem qualificações) → ícone `BadgeCheck` visível
- [ ] Modal de certificados → ícones de upload/download/delete
- [ ] Header → notifications/settings icons OK
- [ ] AppLayout sidebar → todos ícones OK

---

## 7. STATUS FINAL

| Critério                                        | Status |
| ----------------------------------------------- | ------ |
| Causa raiz identificada                         | ✅     |
| `Qualificacoes.tsx` migrado (36 ícones)         | ✅     |
| `ModalCertificados.tsx` migrado (6 ícones)      | ✅     |
| `material-symbols` npm instalado                | ✅     |
| CDN Google Fonts para Material Symbols removida | ✅     |
| `main.tsx` import local adicionado              | ✅     |
| Badge overflow corrigido                        | ✅     |
| 292 testes passando                             | ✅     |
| Build zero erros                                | ✅     |
| Deploy `065d0022`                               | ✅     |

**Impacto**: Nenhuma CDN externa para ícones — elimina dependência de
latência/disponibilidade de Google Fonts em produção para sempre.
