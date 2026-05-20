# TESTE E2E - Modal Editar Qualificação

## Data: 28/11/2025

### PROBLEMA RELATADO

- Usuário clica no botão de editar (lápis)
- Modal ERRADO abre (ModalAtribuirQualificacao)
- Modal CORRETO não abre (ModalEditarQualificacao)

### VERIFICAÇÕES NO CÓDIGO

#### 1. Import do ModalEditarQualificacao

**Arquivo:** `/src/react-app/pages/QualificacoesWrapper.tsx`
**Linha 55:**

```tsx
import ModalEditarQualificacao from '@/react-app/components/qualificacoes/ModalEditarQualificacao';
```

✅ Import está correto

#### 2. Estado modalEditarAberto

**Linha 115:**

```tsx
const [modalEditarAberto, setModalEditarAberto] = useState(false);
```

✅ Estado declarado corretamente

#### 3. Callback onEdit no HistoricoTab

**Linhas 300-319:**

```tsx
onEdit={(hab) => {
  console.log('🎯 [QualificacoesWrapper] onEdit CLICADO:', { hab, modalEditarAberto, modalNovaAberto });
  const registro = {
    id: hab.id,
    funcionario_nome: hab.funcionario_nome || '',
    qualificacao_nome: hab.qualificacao_nome || '',
    qualificacao_codigo: (hab as unknown as { qualificacao_codigo?: string }).qualificacao_codigo || '',
    data_vencimento: hab.data_vencimento || '',
  };
  setRegistroSelecionado(registro);
  setModalEditarAberto(true);
}}
```

✅ Callback chama `setModalEditarAberto(true)`

#### 4. Renderização do ModalEditarQualificacao

**Linhas 475-487:**

```tsx
<ModalEditarQualificacao
  aberto={modalEditarAberto && !!registroSelecionado}
  onFechar={() => {
    setModalEditarAberto(false);
    setRegistroSelecionado(null);
  }}
  qualificacaoId={registroSelecionado?.id?.toString() || '0'}
  onSalvar={() => { ... }}
/>
```

✅ Componente renderizado com prop `aberto`

#### 5. ModalEditarQualificacao - Condição de Renderização

**Arquivo:** `/src/react-app/components/qualificacoes/ModalEditarQualificacao.tsx`
**Linhas 62-68:**

```tsx
console.log('🚀🚀🚀 MODAL EDITAR V2 - VERSÃO SIMPLIFICADA CARREGADA 🚀🚀🚀');
console.log('🔍 [ModalEditarQualificacao] Props recebidas:', { aberto, qualificacaoId });
```

**Linhas 291-296:**

```tsx
if (!aberto) {
  console.log('🚫 [ModalEditarQualificacao] Modal FECHADO - não renderizando');
  return null;
}
console.log('✅ [ModalEditarQualificacao] Modal ABERTO - renderizando UI');
```

✅ Logs de debug adicionados

### HIPÓTESES

#### Hipótese 1: Cache do Navegador

- Browser está carregando versão antiga do bundle
- **Solução:** Hard reload (Cmd+Shift+R)

#### Hipótese 2: HMR não atualizou

- Vite HMR não recarregou o componente
- **Solução:** Restart dev server

#### Hipótese 3: Z-index

- Ambos os modais renderizando, ModalAtribuirQualificacao por cima
- **Evidência contra:** Logs mostram APENAS ModalAtribuirQualificacao

#### Hipótese 4: Estado não muda

- `modalEditarAberto` não está ficando `true`
- OU `registroSelecionado` fica `null`
- **Teste:** Logs de useEffect adicionados

#### Hipótese 5: Build desatualizado

- Dev server rodando bundle antigo
- **Solução:** npm run build

### LOGS DE DEBUG ADICIONADOS

1. **QualificacoesWrapper.tsx:**

   - 🔄 useEffect monitora mudanças nos estados dos modais
   - 🎯 onEdit callback com logs detalhados
   - 🔍 Logs antes de renderizar cada modal

2. **ModalEditarQualificacao.tsx:**

   - 🚀🚀🚀 Log no início da função (confirma versão)
   - 🔍 Log das props recebidas
   - 🚫 Log quando modal está fechado
   - ✅ Log quando modal vai renderizar

3. **ModalAtribuirQualificacao.tsx:**
   - 🟡 Log das props recebidas

### PRÓXIMOS PASSOS

1. ✅ Build realizado - bundle atualizado
2. ⏳ **AGUARDANDO:** Usuário fazer hard reload (Cmd+Shift+R)
3. ⏳ **AGUARDANDO:** Usuário clicar no lápis
4. ⏳ **AGUARDANDO:** Logs do console

### LOGS ESPERADOS (em ordem):

Ao carregar a página:

```
🔍 [QualificacoesWrapper] COMPONENT LOADED
🔄 [QualificacoesWrapper] Estado dos modais mudou: { modalNovaAberto: false, modalEditarAberto: false, ... }
```

Ao clicar no lápis:

```
🎯 [QualificacoesWrapper] onEdit CLICADO: { hab: {...}, modalEditarAberto: false, modalNovaAberto: false }
🎯 [QualificacoesWrapper] Definindo registroSelecionado: {...}
🎯 [QualificacoesWrapper] Abrindo modal de edição...
🎯 [QualificacoesWrapper] Modal definido como aberto
🔄 [QualificacoesWrapper] Estado dos modais mudou: { modalEditarAberto: true, registroSelecionado: {...} }
🔍 [QualificacoesWrapper] RENDERIZANDO ModalAtribuirQualificacao: { modalNovaAberto: false }
🔍 [QualificacoesWrapper] RENDERIZANDO ModalEditarQualificacao: { modalEditarAberto: true, registroSelecionado: {...}, condicao: true }
🚀🚀🚀 MODAL EDITAR V2 - VERSÃO SIMPLIFICADA CARREGADA 🚀🚀🚀
🔍 [ModalEditarQualificacao] Props recebidas: { aberto: true, qualificacaoId: "123" }
✅ [ModalEditarQualificacao] Modal ABERTO - renderizando UI
```

### DECISÃO APÓS LOGS

Baseado nos logs, identificar:

- ❌ Se `modalEditarAberto` não fica `true` → Problema no setState
- ❌ Se `registroSelecionado` fica `null` → Problema no mapeamento
- ❌ Se condição `modalEditarAberto && !!registroSelecionado` retorna `false` → Problema na lógica
- ❌ Se ModalEditarQualificacao não renderiza → Problema no import/bundle
- ❌ Se ModalAtribuirQualificacao abre junto → Problema de z-index

---

## ⚠️ PROBLEMA IDENTIFICADO: ARQUIVOS DUPLICADOS

### Descoberta (14:10)

Encontrados **3 arquivos** com o mesmo nome `ModalEditarQualificacao.tsx`:

1. ❌ `/react-app/src/components/modals/ModalEditarQualificacao.tsx` - **VERSÃO ANTIGA** (32 linhas)
2. ✅ `/src/react-app/components/qualificacoes/ModalEditarQualificacao.tsx` - **VERSÃO CORRETA** (402 linhas)
3. ❌ `/src/react-app/components/qualificacoes-historico/ModalEditarQualificacao.tsx` - **VERSÃO INTERMEDIÁRIA** (360 linhas)

### Causa do Problema

- Vite/TypeScript pode estar carregando o arquivo ERRADO devido a path resolution
- Bundle pode conter versão antiga em cache

### Solução Aplicada

```bash
rm react-app/src/components/modals/ModalEditarQualificacao.tsx
rm src/react-app/components/qualificacoes-historico/ModalEditarQualificacao.tsx
```

✅ Arquivos duplicados **REMOVIDOS**
✅ Build **CONCLUÍDO** (14:11)
✅ Apenas 1 versão agora existe: `/src/react-app/components/qualificacoes/ModalEditarQualificacao.tsx`

---

## 🧪 TESTE E2E - PASSO A PASSO

### Preparação

- [x] Arquivos duplicados removidos
- [x] Build realizado
- [x] Logs de debug no código
- [ ] **AGUARDANDO:** Dev server restart
- [ ] **AGUARDANDO:** Hard reload no navegador

### Passos do Teste

1. **Restartar Dev Server**

   ```bash
   # Matar processo antigo
   pkill -f "vite.*3000"

   # Iniciar novo
   npm run dev:all
   ```

2. **Abrir Console do Chrome**

   - Cmd+Option+I
   - Tab "Console"
   - Clear console (Cmd+K)

3. **Hard Reload da Página**

   - Cmd+Shift+R
   - Verificar logs iniciais:
     - ✓ `🔍 [QualificacoesWrapper] COMPONENT LOADED`
     - ✓ `🔄 [QualificacoesWrapper] Estado dos modais mudou`

4. **Navegar para Aba "Histórico Completo"**

   - Verificar se tabela carrega

5. **Clicar no Botão LÁPIS (Editar)**

   - Escolher qualquer registro da tabela
   - Clicar no ícone de lápis (Edit2)

6. **Verificar Logs do Console**

   - Logs esperados:
     ```
     🎯 [QualificacoesWrapper] onEdit CLICADO: {...}
     🔄 [QualificacoesWrapper] Estado dos modais mudou: { modalEditarAberto: true }
     🔍 [QualificacoesWrapper] RENDERIZANDO ModalEditarQualificacao: { modalEditarAberto: true, condicao: true }
     🚀🚀🚀 MODAL EDITAR V2 - VERSÃO SIMPLIFICADA CARREGADA 🚀🚀🚀
     🔍 [ModalEditarQualificacao] Props recebidas: { aberto: true, qualificacaoId: "123" }
     ✅ [ModalEditarQualificacao] Modal ABERTO - renderizando UI
     ```

7. **Verificar Modal Visual**

   - Modal deve ter título: "Editar Qualificação"
   - Deve ter:
     - ✓ Caixa azul com info do Funcionário e Qualificação (read-only)
     - ✓ Campo "Data de Conclusão" GRANDE e EDITÁVEL
     - ✓ Caixa verde com preview "Data de Vencimento"
     - ✓ Campo "Observações" (textarea)
     - ✓ Botão "Gerenciar Certificado"
     - ✓ Botão "Salvar"

8. **Testar Funcionalidade**
   - Alterar "Data de Conclusão"
   - Verificar se "Data de Vencimento" atualiza automaticamente
   - Adicionar texto em "Observações"
   - Clicar em "Salvar"
   - Verificar toast de sucesso

### Critérios de Sucesso

| Item               | Esperado                           | Status |
| ------------------ | ---------------------------------- | ------ |
| Modal correto abre | ✓ ModalEditarQualificacao          | ⏳     |
| Logs aparecem      | ✓ Todos os logs de debug           | ⏳     |
| Campos editáveis   | ✓ Data Conclusão, Observações      | ⏳     |
| Preview funciona   | ✓ Data Vencimento atualiza         | ⏳     |
| Botão certificado  | ✓ Visível e clicável               | ⏳     |
| Salvar funciona    | ✓ PUT /qualificacoes-historico/:id | ⏳     |
| Toast aparece      | ✓ "Qualificação atualizada"        | ⏳     |
| Tabela atualiza    | ✓ Dados refreshed                  | ⏳     |

---

## 📋 PRÓXIMA AÇÃO (APÓS TESTE)

Se teste **PASSAR** ✅:

- Adicionar botão "Incluir/Gerenciar Certificado" no modal
- Integrar com ModalCertificado existente
- Deploy para produção

Se teste **FALHAR** ❌:

- Analisar logs específicos
- Identificar ponto de falha exato
- Aplicar correção cirúrgica
