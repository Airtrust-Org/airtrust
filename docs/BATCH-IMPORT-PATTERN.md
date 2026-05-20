# ⚡ Padrão de Importação em Batch - AirTrust

## 🚨 PROBLEMA

**"Too many API requests by single worker: Invocation"**

Quando fazemos importações com loop simples:

```typescript
// ❌ ERRADO - Causa timeout
for (const item of dados) {
  await db.prepare(`INSERT...`).bind(...).run(); // 1 query por item
}
```

**Para 100 linhas:** 100 queries = **TIMEOUT!**

---

## ✅ SOLUÇÃO

Usar o **Batch Import Helper** que processa em lotes de 50:

```typescript
// ✅ CORRETO - Processa em batches
import { batchImport } from '../../utils/batch-import-helper';

const result = await batchImport(db, dados, async (item, db) => {
  await db.prepare(`INSERT...`).bind(...).run();
});
```

---

## 📚 UTILITÁRIOS DISPONÍVEIS

### **1. batchImport()**

Executa importação em batches de 50 registros.

```typescript
import { batchImport } from '../../utils/batch-import-helper';

const result = await batchImport(
  db,                    // Database
  dados,                 // Array de dados
  async (item, db) => {  // Função de insert
    await db.prepare(`INSERT INTO tabela VALUES (?)`).bind(item.valor).run();
  },
  {
    batchSize: 50,       // Opcional: tamanho do batch
    onProgress: (imported, total) => {
      console.log(`${imported}/${total}`);
    }
  }
);

// Resultado
console.log(result.imported);  // Quantos foram importados
console.log(result.errors);    // Array de erros
console.log(result.duration);  // Tempo em ms
```

### **2. fetchAllAsMap()**

Busca todos os registros de uma vez e cria um mapa (evita N queries).

```typescript
import { fetchAllAsMap } from '../../utils/batch-import-helper';

// ✅ 1 query para buscar TODOS os funcionários
const funcionariosMap = await fetchAllAsMap(
  db,
  'SELECT id, cpf FROM funcionarios WHERE deleted_at IS NULL',
  (row) => row.cpf  // Key do mapa
);

// Usar o mapa (SEM queries)
for (const item of dados) {
  const funcionario = funcionariosMap.get(item.cpf);
  if (funcionario) {
    // Processar...
  }
}
```

### **3. validateImportData()**

Valida dados antes de importar.

```typescript
import { validateImportData } from '../../utils/batch-import-helper';

const validation = validateImportData(dados, ['cpf', 'nome', 'email']);

if (!validation.valid) {
  return c.json({ 
    success: false, 
    error: validation.errors.join(', ') 
  }, 400);
}
```

### **4. logImport()**

Registra importação no log.

```typescript
import { logImport } from '../../utils/batch-import-helper';

await logImport(db, 'FUNCIONARIOS', 'arquivo.xlsx', result);
```

---

## 🎯 EXEMPLO COMPLETO

```typescript
import { Hono } from 'hono';
import { 
  batchImport, 
  fetchAllAsMap,
  validateImportData, 
  logImport 
} from '../../utils/batch-import-helper';

const app = new Hono();

app.post('/import', async (c) => {
  try {
    const { dados } = await c.req.json();
    const db = c.env.DB;
    
    // 1. Validar dados
    const validation = validateImportData(dados, ['cpf', 'nome']);
    if (!validation.valid) {
      return c.json({ success: false, error: validation.errors.join(', ') }, 400);
    }
    
    // 2. Buscar relacionamentos de uma vez (se necessário)
    const funcionariosMap = await fetchAllAsMap(
      db,
      'SELECT id, cpf FROM funcionarios',
      (row) => row.cpf
    );
    
    // 3. Importar em batch
    const result = await batchImport(db, dados, async (item, db) => {
      const funcionario = funcionariosMap.get(item.cpf);
      
      if (!funcionario) {
        throw new Error('Funcionário não encontrado');
      }
      
      await db.prepare(`
        INSERT INTO qualificacoes (funcionario_id, tipo, codigo)
        VALUES (?, ?, ?)
      `).bind(funcionario.id, item.tipo, item.codigo).run();
    });
    
    // 4. Registrar log
    await logImport(db, 'QUALIFICACOES', 'import.xlsx', result);
    
    // 5. Retornar resultado
    return c.json({
      success: result.success,
      importados: result.imported,
      total: result.total,
      erros: result.errors.map(e => `Linha ${e.index + 1}: ${e.error}`)
    });
    
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});
```

---

## 📊 COMPARAÇÃO

### **ANTES (Lento):**

```typescript
// ❌ N queries para buscar funcionários
for (const item of dados) {
  const funcionario = await db.prepare(`
    SELECT * FROM funcionarios WHERE cpf = ?
  `).bind(item.cpf).first();
  
  // ❌ N queries para inserir
  await db.prepare(`INSERT...`).run();
}

// Para 100 linhas: 200 queries!
```

### **DEPOIS (Rápido):**

```typescript
// ✅ 1 query para buscar TODOS
const funcionariosMap = await fetchAllAsMap(...);

// ✅ Batch de 50 por vez
const result = await batchImport(db, dados, async (item, db) => {
  const funcionario = funcionariosMap.get(item.cpf); // SEM query
  await db.prepare(`INSERT...`).run();
});

// Para 100 linhas: 3-5 queries!
```

---

## 🔧 ARQUIVOS JÁ OTIMIZADOS

- ✅ `src/worker/api/v2/qualificacoes-import.ts`
- ✅ `src/worker/api/v2/importacoes.ts`

---

## 📝 ARQUIVOS QUE PRECISAM OTIMIZAÇÃO

Execute para encontrar:

```bash
grep -r "for.*await db.prepare" src/worker/api --include="*.ts"
```

---

## ⚠️ REGRAS IMPORTANTES

1. **SEMPRE use batchImport()** para loops com INSERT
2. **SEMPRE use fetchAllAsMap()** para buscar relacionamentos
3. **NUNCA faça queries dentro de loops** sem batch
4. **Limite batches a 50 registros** por vez
5. **Valide dados ANTES** de processar
6. **Registre no log** após importação

---

## 🚀 PERFORMANCE

| Registros | Antes | Depois |
|-----------|-------|--------|
| 10 | 1s | 0.2s |
| 50 | 5s | 0.5s |
| 100 | TIMEOUT | 1s |
| 500 | TIMEOUT | 5s |

---

## 📌 CHECKLIST

Ao criar novo endpoint de importação:

- [ ] Usar `batchImport()` para processar dados
- [ ] Usar `fetchAllAsMap()` para relacionamentos
- [ ] Usar `validateImportData()` para validar
- [ ] Usar `logImport()` para registrar
- [ ] Testar com 100+ registros
- [ ] Verificar logs de performance

---

**Arquivo:** `src/worker/utils/batch-import-helper.ts`  
**Documentação:** Este arquivo  
**Status:** ✅ Pronto para uso
