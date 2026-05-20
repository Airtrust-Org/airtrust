# 🔄 Padrão de Dados Dinâmicos - AirTrust

## ⚠️ REGRA FUNDAMENTAL

**NUNCA use valores hardcoded para dados que existem no banco de dados.**

Dados que **SEMPRE** devem vir da API:

- Aeronaves (códigos, modelos)
- Simuladores
- Funcionários
- Modelos de Sessão
- Manobras
- Qualificações

---

## ✅ Onde Encontrar Constantes Centralizadas

### Arquivo: `src/react-app/constants/index.ts`

Contém todas as constantes estáticas do sistema:

- Estados brasileiros (`ESTADOS_BRASILEIROS`)
- Níveis ICAO (`NIVEIS_ICAO`)
- Status de Funcionário (`STATUS_FUNCIONARIO_OPTIONS`)
- Status de Ficha (`STATUS_FICHA_OPTIONS`)
- Status de Sessão (`STATUS_SESSAO_OPTIONS`)
- Status de Simulador (`STATUS_SIMULADOR_OPTIONS`)
- Funções na Sessão (`FUNCOES_SESSAO_OPTIONS`)
- Categorias de Qualificação (`CATEGORIAS_QUALIFICACAO_OPTIONS`)
- Cores padrão do sistema (`CORES_PADRAO`)

### Arquivo: `src/react-app/types/enums.ts`

Contém os enums TypeScript para type-checking:

- `StatusFuncionario`
- `StatusFicha`
- `StatusSessao`
- `StatusSimulador`
- `CategoriaQualificacao`
- etc.

---

## 📖 Como Usar

### 1. Importar Constantes

```tsx
import {
  ESTADOS_BRASILEIROS,
  NIVEIS_ICAO,
  STATUS_FUNCIONARIO_OPTIONS,
  getCorByString,
} from '@/react-app/constants';
```

### 2. Renderizar Selects Dinâmicos

```tsx
// ❌ ERRADO - Hardcoded
<select>
  <option value="ATIVO">Ativo</option>
  <option value="INATIVO">Inativo</option>
</select>

// ✅ CERTO - Usando constantes
<select>
  {STATUS_FUNCIONARIO_OPTIONS.map((opt) => (
    <option key={opt.value} value={opt.value}>
      {opt.label}
    </option>
  ))}
</select>
```

### 3. Estados Brasileiros

```tsx
// ❌ ERRADO
<option value="SP">SP - São Paulo</option>
<option value="RJ">RJ - Rio de Janeiro</option>
...27 options...

// ✅ CERTO
{ESTADOS_BRASILEIROS.map((e) => (
  <option key={e.sigla} value={e.sigla}>
    {e.sigla} - {e.nome}
  </option>
))}
```

### 4. Níveis ICAO

```tsx
// ❌ ERRADO
<option value="1">Nível 1</option>
<option value="2">Nível 2</option>
...

// ✅ CERTO
{NIVEIS_ICAO.map((nivel) => (
  <option key={nivel.nivel} value={String(nivel.nivel)}>
    Nível {nivel.nivel} - {nivel.nome}
  </option>
))}
```

---

## 🎨 Cores Dinâmicas para Aeronaves

### Hook: `useAeronavesConfig`

```tsx
import { useAeronavesConfig } from '@/react-app/hooks/useAeronavesConfig';

function MeuComponente() {
  const { getCoresByAeronave, aeronaves, loading } = useAeronavesConfig();

  // Obtém cores consistentes para qualquer aeronave
  const cores = getCoresByAeronave('AW139');

  return <div className={`${cores.bg} ${cores.border} ${cores.text}`}>Aeronave AW139</div>;
}
```

### Função Utilitária (fora de componentes)

```tsx
import { getCorByString } from '@/react-app/constants';

// Gera cor consistente baseada em qualquer string
const cores = getCorByString('AW139');
// Sempre retornará as mesmas cores para 'AW139'
```

---

## 📋 Dados que DEVEM Vir da API

### Aeronaves

```tsx
// ❌ ERRADO
<option value="AW139">AW139</option>
<option value="EC135">EC135</option>

// ✅ CERTO
const [aeronaves, setAeronaves] = useState([]);

useEffect(() => {
  api.get('/cadastros/aeronaves').then(res => setAeronaves(res.data || []));
}, []);

{aeronaves.map((a) => (
  <option key={a.id} value={a.codigo}>{a.codigo}</option>
))}
```

### Modelos de Sessão

```tsx
// ❌ ERRADO - Array hardcoded
const SESSOES = [
  { id: 1, tema: 'FAMILIARIZAÇÃO AW139' },
  // ...
];

// ✅ CERTO - Carregar da API
const [modelosSessao, setModelosSessao] = useState([]);

useEffect(() => {
  api.get('/simuladores/modelos-sessao').then((res) => setModelosSessao(res.data || []));
}, []);
```

---

## 🔗 Relações de Dados

### Cascata de Atualização

Quando alterar dados de uma entidade pai, as filhas devem ser atualizadas:

```
aeronaves.codigo
    ↓
simuladores.aeronave_codigo
    ↓
modelos_sessao.codigo_aeronave
    ↓
sessoes.tipo_aeronave
```

**IMPORTANTE**: Sempre que alterar `aeronaves.codigo`, verificar e atualizar todos os registros relacionados!

---

## 📁 Arquivos Relacionados

| Arquivo                                     | Descrição                       |
| ------------------------------------------- | ------------------------------- |
| `src/react-app/constants/index.ts`          | Constantes centralizadas        |
| `src/react-app/types/enums.ts`              | Enums TypeScript                |
| `src/react-app/hooks/useAeronavesConfig.ts` | Hook para cores de aeronaves    |
| `MAPEAMENTO_ENTIDADES_DEPENDENCIAS.md`      | Documentação de relacionamentos |

---

## ✅ Checklist para Novos Componentes

- [ ] Selects de status usam `*_OPTIONS` das constantes
- [ ] Estados BR usam `ESTADOS_BRASILEIROS`
- [ ] Níveis ICAO usam `NIVEIS_ICAO`
- [ ] Aeronaves são carregadas via API
- [ ] Simuladores são carregados via API
- [ ] Cores de aeronaves usam `getCorByString()` ou `useAeronavesConfig()`
- [ ] Nenhum valor de código de aeronave está hardcoded

---

**Data**: 2025-12-02
**Autor**: GitHub Copilot
**Válido para**: Todo o projeto AirTrust
