# Correção - Erro no Agendamento de Sessões (Aeronaves)

**Data:** 13/01/2026  
**Autor:** Copilot  
**Tipo:** Bugfix crítico

## 🐛 Problema Identificado

O modal de agendamento de sessões estava com erro **Internal Server Error** ao tentar criar novas sessões. O problema era causado por inconsistências entre:

1. Frontend enviando parâmetro `codigo_aeronave`
2. Backend esperando parâmetro `modelo_aeronave`
3. Interfaces usando campo `codigo` que não existe mais na tabela `aeronaves`

## 🔧 Correções Realizadas

### 1. ModalNovaSessao.tsx

✅ Corrigido parâmetro de query string:

- ❌ `codigo_aeronave=${aeronaveCodigo}`
- ✅ `modelo_aeronave=${aeronaveCodigo}`

✅ Atualizada interface Aeronave:

```typescript
interface Aeronave {
  id: number;
  modelo: string; // era: codigo
  prefixo?: string; // novo campo
  fabricante?: string;
}
```

✅ Corrigidas referências:

- `aeronave.codigo` → `aeronave.modelo`
- Função `handleAeronaveChange(id, codigo)` → `handleAeronaveChange(id, modelo)`
- Log de debug agora usa `modelo` em vez de `codigo`

### 2. ModalCadastrarSessao.tsx

✅ Atualizada interface Aeronave e ModeloSessao:

```typescript
interface Aeronave {
  id: number;
  modelo: string;
  prefixo?: string;
}

interface ModeloSessao {
  id: number;
  tema: string;
  tipo_sessao?: string;
  modelo_aeronave?: string; // era: codigo_aeronave
}
```

✅ Corrigido select:

- Option value: `a.modelo` (era: `a.codigo`)
- Option text: `{a.modelo} {a.prefixo ? '- ${a.prefixo}' : ''}` (era: `{a.codigo} - ${a.modelo}`)

### 3. QualificacoesFilters.tsx

✅ Corrigido select de aeronaves:

```tsx
{
  aeronave.modelo;
}
{
  aeronave.prefixo ? `- ${aeronave.prefixo}` : '';
}
```

### 4. Qualificacoes.tsx

✅ Corrigido filtro de aeronaves no select principal

### 5. crud-completo.tsx (Simuladores)

✅ Corrigido select de tipo de aeronave:

- Option value: `a.modelo`
- Option text: `{a.modelo}` apenas

### 6. Aeronaves.tsx (Página de gerenciamento)

✅ Interfaces completamente refatoradas:

```typescript
interface Aeronave {
  id: number;
  modelo: string;
  prefixo?: string;
  ano_fabricacao?: number;
  status?: string;
  observacoes?: string;
  created_at: string;
  updated_at: string;
}

interface AeronaveFormData {
  modelo: string;
  prefixo?: string;
  ano_fabricacao?: number;
  status?: string;
  observacoes?: string;
}
```

✅ Estado inicial atualizado:

```typescript
const [formData, setFormData] = useState<AeronaveFormData>({
  modelo: '',
  prefixo: '',
  ano_fabricacao: undefined,
  status: 'ATIVO',
  observacoes: '',
});
```

✅ StatCards atualizados:

- "Modelos Únicos": conta modelos únicos
- "Prefixos": conta prefixos únicos (era "Fabricantes")

## 🎯 Resultado

✅ **Build completo com sucesso** - sem erros TypeScript  
✅ **Todas as referências a `codigo` removidas**  
✅ **Frontend e backend agora consistentes**  
✅ **Agendamento de sessões deve funcionar corretamente**

## 📊 Arquivos Modificados

1. `src/react-app/components/modals/ModalNovaSessao.tsx`
2. `src/react-app/components/simuladores/ModalCadastrarSessao.tsx`
3. `src/react-app/pages/qualificacoes/components/QualificacoesFilters.tsx`
4. `src/react-app/pages/Qualificacoes.tsx`
5. `src/react-app/pages/simuladores/cadastros/simuladores/crud-completo.tsx`
6. `src/react-app/pages/Aeronaves.tsx`

## 🔍 Padrão de Correção

**Antes:**

```typescript
aeronave.codigo
codigo_aeronave
{a.codigo} - {a.modelo}
```

**Depois:**

```typescript
aeronave.modelo;
modelo_aeronave;
{
  a.modelo;
}
{
  a.prefixo ? `- ${a.prefixo}` : '';
}
```

## ⚠️ Próximos Passos

1. ✅ Build completo e validado
2. ⏭️ Testar agendamento de sessão no ambiente local
3. ⏭️ Deploy para produção
4. ⏭️ Validar em produção

## 📝 Notas

- A tabela `aeronaves` foi refatorada anteriormente (migrações 0150-0152)
- O campo `codigo` não existe mais - agora é `modelo` + `prefixo`
- `modelo_aeronave` é a chave para relacionamentos (tipo texto, não FK numérico)
- Backend já estava correto - problema era no frontend enviando parâmetros errados

---

**Status:** ✅ Corrigido e validado com build
