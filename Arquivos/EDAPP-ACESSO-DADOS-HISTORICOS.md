# 🔍 EdApp - Acesso a Dados Históricos

**Data:** 5 de Fevereiro de 2026  
**Pergunta:** Conseguimos acessar dados passados do EdApp ou só eventos futuros?

---

## ⚠️ SITUAÇÃO ATUAL

### ❌ O que NÃO temos acesso hoje:

**Apenas eventos via Webhook (tempo real)**

- ✅ Eventos **a partir da configuração do webhook**
- ❌ Conclusões de cursos **feitas antes** do webhook ser configurado
- ❌ Histórico completo de todos os funcionários

### 📝 Como funciona hoje:

```
┌─────────────────────────────────────────────────────┐
│  ANTES do Webhook (ex: 01/01/2026)                  │
│  ❌ Não registrado no AirTrust                      │
│                                                      │
│  Filipe completou curso "CRM" em 15/12/2025         │
│  → Webhook não existia                              │
│  → AirTrust não sabe disso                          │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  DEPOIS do Webhook (ex: 05/02/2026)                 │
│  ✅ Registrado automaticamente                      │
│                                                      │
│  Filipe completou curso "E6" em 05/02/2026          │
│  → EdApp envia webhook                              │
│  → AirTrust registra e cria qualificação ✅         │
└─────────────────────────────────────────────────────┘
```

---

## ✅ O que PODEMOS fazer (solução)

### 🔑 API do EdApp tem endpoints para dados históricos!

A API REST do EdApp fornece:

**1. GET `/v2/users/{userId}/courses`**

- Lista todos os cursos de um usuário
- Inclui status (completed/in_progress)
- Data de conclusão
- Score

**2. GET `/v2/courses/{courseId}/users`**

- Lista todos os usuários que fizeram um curso
- Inclui quem completou
- Datas de conclusão

**3. GET `/v2/users`**

- Lista todos os usuários cadastrados no EdApp
- IDs, emails, nomes

---

## 🚀 SOLUÇÃO PROPOSTA

### Feature: "Importar Histórico do EdApp"

Criar endpoint novo: `POST /integracoes/edapp/importar-historico`

**Fluxo:**

```typescript
1. Para cada usuário mapeado no AirTrust:
   ├─ Buscar edapp_user_id
   ├─ Chamar API: GET /v2/users/{edappUserId}/courses
   ├─ Filtrar cursos com status "completed"
   ├─ Para cada curso completado:
   │  ├─ Verificar se está mapeado
   │  ├─ Verificar se já existe qualificação no AirTrust
   │  └─ Se não existe: criar qualificação com data retroativa
   └─ Registrar no log de eventos

2. Resultado:
   ├─ X cursos encontrados no passado
   ├─ Y qualificações criadas
   └─ Z já existiam (ignorados)
```

### Código exemplo:

```typescript
// Endpoint: POST /integracoes/edapp/importar-historico
edappRouter.post('/importar-historico', async (c: Context) => {
  const db = c.env.DB;
  let totalImportados = 0;
  let totalIgnorados = 0;

  // 1. Buscar todos os usuários mapeados
  const usuarios = await db
    .prepare(
      `
      SELECT funcionario_id, edapp_user_id 
      FROM integracoes_edapp_usuarios 
      WHERE deleted_at IS NULL AND ativo = 1
    `,
    )
    .all();

  for (const usuario of usuarios.results) {
    // 2. Buscar cursos completados no EdApp
    const completions = await callEdAppAPI(
      c.env,
      'GET',
      `/v2/users/${usuario.edapp_user_id}/courses`,
    );

    for (const course of completions.filter((c) => c.status === 'completed')) {
      // 3. Verificar mapeamento do curso
      const mapping = await findQualificacaoByCourse(db, course.courseId);
      if (!mapping) continue;

      // 4. Verificar se já existe qualificação
      const existente = await db
        .prepare(
          `
          SELECT id FROM qualificacoes_historico
          WHERE funcionario_id = ?
            AND qualificacao_codigo = ?
            AND data_conclusao = ?
            AND deleted_at IS NULL
        `,
        )
        .bind(usuario.funcionario_id, mapping.qualificacao_codigo, course.completedAt.split('T')[0])
        .first();

      if (existente) {
        totalIgnorados++;
        continue;
      }

      // 5. Criar qualificação retroativa
      await createQualificacao(
        db,
        usuario.funcionario_id,
        mapping.qualificacao_codigo,
        `EdApp Import (histórico): ${course.courseName}`,
        course.completedAt,
      );

      totalImportados++;
    }
  }

  return c.json({
    success: true,
    data: {
      importados: totalImportados,
      ignorados: totalIgnorados,
      mensagem: `${totalImportados} qualificações importadas do histórico`,
    },
  });
});
```

---

## 📊 COMPARAÇÃO

| Aspecto              | Webhook (Atual)           | Importação Histórico (Proposta) |
| -------------------- | ------------------------- | ------------------------------- |
| **Quando funciona**  | ✅ Apenas eventos futuros | ✅ Dados passados + futuros     |
| **Automático**       | ✅ Sim, tempo real        | ❌ Manual (botão)               |
| **Dados históricos** | ❌ Não                    | ✅ Sim                          |
| **Performance**      | ⚡ Instantâneo            | 🐢 Lento (batch)                |
| **Uso recomendado**  | Operação diária           | Setup inicial ou recuperação    |

---

## 🎯 CASOS DE USO

### Cenário 1: Setup Inicial

```
Situação: Empresa já usa EdApp há 6 meses, agora integra com AirTrust

Solução:
1. ✅ Configurar webhook (eventos futuros)
2. ✅ Mapear usuários e cursos
3. ✅ Clicar "Importar Histórico" (buscar 6 meses de dados)
4. ✅ Pronto! Sistema completo
```

### Cenário 2: Novo Funcionário

```
Situação: Contratar funcionário que já usava EdApp antes

Solução:
1. ✅ Mapear funcionário novo
2. ✅ Clicar "Importar Histórico"
3. ✅ Sistema busca cursos passados dele automaticamente
```

### Cenário 3: Auditoria

```
Situação: Verificar se todas as qualificações do EdApp estão no AirTrust

Solução:
1. ✅ Clicar "Importar Histórico"
2. ✅ Sistema compara e importa o que falta
3. ✅ Relatório: "X importados, Y já existiam"
```

---

## 🔧 IMPLEMENTAÇÃO

### Prioridade: **ALTA** 🔴

**Por quê?**

- Vários funcionários podem ter completado cursos antes da integração
- Dados históricos são valiosos para compliance
- Facilita onboarding de novos funcionários

### Esforço estimado: **2-3 horas**

**Tarefas:**

1. ✅ Criar endpoint `/importar-historico` (1h)
2. ✅ Adicionar botão na interface EdApp Integration (30min)
3. ✅ Testar com dados reais (30min)
4. ✅ Criar relatório de importação (30min)
5. ✅ Documentação (30min)

### Riscos:

| Risco                       | Probabilidade | Impacto  | Mitigação                      |
| --------------------------- | ------------- | -------- | ------------------------------ |
| API EdApp rate limit        | 🟡 Média      | 🟡 Média | Adicionar delay entre requests |
| Duplicação de qualificações | 🟢 Baixa      | 🔴 Alta  | Verificar antes de criar       |
| Timeout (muitos usuários)   | 🟡 Média      | 🟡 Média | Processar em batches           |

---

## 🎬 PRÓXIMOS PASSOS

### Opção A: Implementar Agora (Recomendado)

```bash
1. Criar endpoint /importar-historico
2. Adicionar botão "Importar Histórico" na UI
3. Testar com 1 usuário primeiro
4. Executar para todos
```

### Opção B: Importação Manual (Temporário)

```bash
1. Acessar API EdApp manualmente
2. Exportar dados para CSV
3. Importar via SQL direto no D1
```

### Opção C: Aguardar (Não Recomendado)

```
❌ Perder dados históricos
❌ Qualificações incompletas
❌ Auditorias sem histórico completo
```

---

## ✅ CONCLUSÃO

**Resposta direta:**

| Pergunta                            | Resposta                                      |
| ----------------------------------- | --------------------------------------------- |
| Conseguimos acessar dados passados? | ❌ **NÃO hoje** (só webhook = futuro)         |
| A API EdApp tem esses dados?        | ✅ **SIM!** Endpoint `/v2/users/{id}/courses` |
| Podemos implementar?                | ✅ **SIM!** Em ~3 horas                       |
| Vale a pena?                        | ✅ **SIM!** Essencial para setup completo     |

**Recomendação:**
Implementar feature "Importar Histórico" para ter **visão completa** dos dados do EdApp (passado + futuro).

---

**Status Atual:**

- ✅ Webhook funcionando (eventos futuros)
- ❌ Sem acesso a dados históricos
- 🚀 Solução técnica disponível e documentada

**Quer que eu implemente agora?**
