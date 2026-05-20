# ⚡ GUIA RÁPIDO - INTEGRAÇÃO DE DADOS REFATORADOS

## 5 PASSOS PARA COMEÇAR

### 1️⃣ VERIFICAR IMPORTS

```bash
cd /Users/filipedaumas/Documents/airtrust
npm run build
```

Se tiver erros de importação, corrigir os paths em:

- `src/worker/api/v2/data.routes.ts` (linhas 12-14)
- `src/react-app/hooks/useDataLayer.ts` (linha 9)

---

### 2️⃣ REGISTRAR ROTAS NO WORKER

**Arquivo:** `src/worker/index.ts`

```typescript
// Adicionar no final (antes do export)
import createDataRoutes from './api/v2/data.routes';

// Depois das outras rotas:
app.route('/api/v2', createDataRoutes());

export default app;
```

---

### 3️⃣ USAR HOOKS NOS COMPONENTES

**Exemplo 1: Lista de Funcionários**

```typescript
// src/components/FuncionariosTable.tsx
import { useFuncionarios } from '@/hooks/useDataLayer';
import { FileText } from 'lucide-react';

export function FuncionariosTable() {
  const { data: funcionarios, loading, error } = useFuncionarios();

  if (loading) return <div>⏳ Carregando...</div>;
  if (error) return <div>❌ Erro: {error}</div>;

  return (
    <table className="w-full">
      <thead>
        <tr>
          <th>Matrícula</th>
          <th>Nome</th>
          <th>Função</th>
          <th>Base</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {funcionarios.map((f) => (
          <tr key={f.id}>
            <td>{f.matricula}</td>
            <td>{f.nome}</td>
            <td>{f.funcao}</td>
            <td>{f.base}</td>
            <td>{f.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

**Exemplo 2: Detalhes com Qualificações**

```typescript
// src/components/FuncionarioDetail.tsx
import { useFuncionarioComQualificacoes } from '@/hooks/useDataLayer';
import { Award } from 'lucide-react';

export function FuncionarioDetail({ funcionario_id }: { funcionario_id: number }) {
  const { data: funcionario, loading } = useFuncionarioComQualificacoes(funcionario_id);

  if (loading) return <div>Carregando...</div>;
  if (!funcionario) return <div>Não encontrado</div>;

  return (
    <div>
      <h2>{funcionario.nome}</h2>
      <p>Matrícula: {funcionario.matricula}</p>
      <p>Email: {funcionario.email}</p>

      <h3>Qualificações ({funcionario.qualificacoes.length})</h3>
      <ul>
        {funcionario.qualificacoes.map((q) => (
          <li key={q.id}>
            <Award size={16} />
            {q.nome} - {q.status} - Vence em {q.data_vencimento}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**Exemplo 3: Alertas de Vencimento**

```typescript
// src/components/VencimentoAlerts.tsx
import { useQualificacoesVencidas, useQualificacoesVencendo } from '@/hooks/useDataLayer';
import { AlertCircle, Clock } from 'lucide-react';

export function VencimentoAlerts() {
  const { data: vencidas } = useQualificacoesVencidas();
  const { data: vencendo } = useQualificacoesVencendo();

  return (
    <div>
      <div className="alert-danger">
        <AlertCircle />
        Vencidas: {vencidas.length}
      </div>
      <div className="alert-warning">
        <Clock />
        Vencendo em 30 dias: {vencendo.length}
      </div>
    </div>
  );
}
```

---

### 4️⃣ TESTAR ENDPOINTS

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Testar endpoints
curl http://localhost:8787/api/v2/funcionarios
curl http://localhost:8787/api/v2/qualificacoes
curl http://localhost:8787/api/v2/data/health
```

---

### 5️⃣ DEPLOY

```bash
npm run build
npm run deploy
```

Depois testar em produção:

```bash
curl https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/data/health
```

---

## 🧪 TESTES RÁPIDOS

### ✅ Testar Funcionarios

```typescript
async function testFuncionarios() {
  const response = await fetch('/api/v2/funcionarios');
  const data = await response.json();
  console.log('Total funcionários:', data.count);
  console.log('Primeiro:', data.data[0]);
}
```

### ✅ Testar Qualificações Vencidas

```typescript
async function testVencidas() {
  const response = await fetch('/api/v2/qualificacoes/vencidas');
  const data = await response.json();
  console.log('Vencidas encontradas:', data.count);
  data.data.forEach((q) => {
    console.log(`${q.nome} - venceu em ${q.data_vencimento}`);
  });
}
```

### ✅ Testar Health Check

```typescript
async function testHealth() {
  const response = await fetch('/api/v2/data/health');
  const data = await response.json();
  console.log('Saúde dos dados:', data);
  console.log('Órfãos encontrados:', {
    qualificacoes: data.orphans.qualificacoes,
    certificados: data.orphans.certificados,
  });
}
```

---

## 🐛 TROUBLESHOOTING

### ❌ Erro: "Cannot find module"

**Solução:** Verificar paths em `data.routes.ts`

```typescript
// Verificar se imports estão corretos:
import { DataService } from '../services/data.service'; // ✅ Correto
import { Logger } from '../utils/logger'; // ✅ Correto
import { securityHeaders } from '../middleware/security-headers'; // ✅ Correto
```

---

### ❌ Erro: "500 Internal Server Error"

**Verificar:**

1. Rotas registradas em `src/worker/index.ts`?
2. Banco D1 conectado?
3. Migrations aplicadas?

```bash
# Verificar migrations
wrangler d1 migrations list airtrust-db --remote

# Aplicar se necessário
wrangler d1 migrations apply airtrust-db --remote
```

---

### ❌ Erro: "No data returned"

**Verificar schema:**

```bash
# Verificar estrutura da tabela
wrangler d1 execute airtrust-db --remote --command "PRAGMA table_info(funcionarios);"
```

---

## 📚 REFERÊNCIA RÁPIDA

| Hook                                | Uso                         |
| ----------------------------------- | --------------------------- |
| `useFuncionarios()`                 | Lista todos                 |
| `useFuncionarioById(1)`             | Busca por ID                |
| `useFuncionarioByMatricula('123')`  | Busca por matrícula         |
| `useQualificacoes()`                | Lista todas                 |
| `useQualificacoesByFuncionario(1)`  | Por funcionário             |
| `useQualificacoesVencidas()`        | Apenas vencidas             |
| `useCertificados()`                 | Lista todos                 |
| `useFuncionarioComQualificacoes(1)` | Funcionário + Qualificações |

---

## 🎯 PRÓXIMAS MELHORIAS

- [ ] Adicionar paginação nos endpoints
- [ ] Adicionar filtros (status, data, etc)
- [ ] Adicionar cache (Redis)
- [ ] Adicionar rate limiting
- [ ] Adicionar testes unitários
- [ ] Gerar documentação OpenAPI

---

**Tudo pronto! Basta clonar os componentes acima e usar! 🚀**
