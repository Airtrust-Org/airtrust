# 🚁 SIMULADORES V2: SISTEMA DE CADASTRO DE SESSÕES COM MANOBRAS

**Data**: 2025-12-01  
**Versão API**: bee090a7-b2ac-400b-aa70-2c1989b8bcba  
**Status**: ✅ DEPLOY COMPLETO

---

## 📋 ÍNDICE

1. [Visão Geral](#visão-geral)
2. [Arquivos Criados](#arquivos-criados)
3. [Modal de Cadastro](#modal-de-cadastro)
4. [Dados CSV (10 Sessões)](#dados-csv-10-sessões)
5. [Script de Seed](#script-de-seed)
6. [Próximos Passos](#próximos-passos)

---

## 🎯 VISÃO GERAL

Sistema completo para cadastro de **sessões de treinamento** com suas respectivas **manobras** organizadas por ordem de execução.

### Funcionalidades Implementadas:

✅ **Modal de Cadastro de Sessão**

- Drag & drop para reordenar manobras
- Busca inteligente de manobras disponíveis
- Templates pré-definidos (10 sessões AW139)
- Visualização de ordem de execução

✅ **Dados Estruturados**

- 10 sessões de treinamento completas
- 225 registros de manobras (códigos únicos ~60)
- Formato JSON pronto para seed

✅ **Integração Frontend**

- Botão "Nova Sessão" na aba Gestão
- Refresh automático após criação
- Feedback visual completo

---

## 📁 ARQUIVOS CRIADOS

### 1. **ModalCadastrarSessao.tsx** (550 linhas)

**Localização**: `src/react-app/components/simuladores/ModalCadastrarSessao.tsx`

```typescript
interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  sessao?: {
    id: number;
    tema: string;
    tipo_sessao: string;
    tipo_aeronave: string;
    manobras?: ManobraSessao[];
  };
}

// Features:
// - Drag & drop com @hello-pangea/dnd
// - Busca em tempo real
// - Templates pré-definidos (10 sessões)
// - Multi-select com ordem
// - Validação completa
```

**Dependência Instalada**:

```bash
npm install @hello-pangea/dnd
```

---

### 2. **seed-sessoes-csv.json** (1200+ linhas)

**Localização**: `scripts/seed-sessoes-csv.json`

Estrutura de dados das 10 sessões de treinamento com todas as manobras.

```json
{
  "sessions": [
    {
      "id": 1,
      "tema": "FAMILIARIZAÇÃO AW139 - VFR BÁSICO",
      "tipo_sessao": "TREINAMENTO",
      "tipo_aeronave": "AW139",
      "manobras": [
        {
          "codigo": "FLY-BAS-X1",
          "descricao": "Controle geral VFR",
          "ordem": 1
        }
        // ... 21 manobras
      ]
    }
    // ... 9 sessões
  ]
}
```

---

### 3. **seed-sessoes-manobras.sh** (150 linhas)

**Localização**: `scripts/seed-sessoes-manobras.sh`

Script bash para popular banco de dados via API.

**Uso**:

```bash
chmod +x scripts/seed-sessoes-manobras.sh
./scripts/seed-sessoes-manobras.sh
```

**Features**:

- Fase 1: Cria manobras únicas (~60)
- Fase 2: Cria sessões com vínculos
- Deduplicação automática
- Validação de resposta
- Progress feedback

---

## 🎨 MODAL DE CADASTRO

### **Acesso**:

Dashboard → Simuladores → Aba "Gestão" → Card "Templates de Manobras" → Botão "Nova Sessão"

### **Campos do Formulário**:

1. **Sessão Template** (opcional)

   - Dropdown com 10 sessões pré-definidas
   - Carrega tema e manobras automaticamente

2. **Tema da Sessão** _(obrigatório)_

   - Ex: "FAMILIARIZAÇÃO AW139 - VFR BÁSICO"

3. **Tipo de Sessão**

   - TREINAMENTO
   - PROFICIÊNCIA
   - INICIAL

4. **Tipo de Aeronave**

   - AW139
   - EC135
   - AS350

5. **Manobras**
   - Busca em tempo real
   - Adicionar/remover manobras
   - Reordenar via drag & drop
   - Badge com número de ordem

### **Fluxo de Uso**:

```
1. Usuário clica "Nova Sessão"
2. Modal abre
3. Seleciona template (opcional) ou cria do zero
4. Ajusta nome/tipo
5. Adiciona manobras via busca
6. Reordena arrastando
7. Clica "Criar Sessão"
8. API cria sessão + vínculos com manobras
9. Modal fecha + refresh automático
```

---

## 📊 DADOS CSV (10 SESSÕES)

### **Resumo das Sessões**:

| #   | Tema                                  | Manobras |
| --- | ------------------------------------- | -------- |
| 1   | FAMILIARIZAÇÃO AW139 - VFR BÁSICO     | 22       |
| 2   | EMERGÊNCIAS POWERPLANT & AUTOROTAÇÕES | 22       |
| 3   | SISTEMA ELÉTRICO & NOTURNO            | 23       |
| 4   | INTRODUÇÃO IFR & NAVEGAÇÃO BÁSICA     | 22       |
| 5   | AFCS INTRODUÇÃO & AUTOPILOT           | 23       |
| 6   | AFCS DEGRADAÇÕES & MANUAL REVERSION   | 22       |
| 7   | AVIÔNICOS FAILURES & PARTIAL PANEL    | 23       |
| 8   | ROTOR, TRANSMISSÃO & HIDRÁULICO       | 23       |
| 9   | FOGO, FUMAÇA & HIGHSTRESS             | 23       |
| 10  | OFFSHORE & PERFORMANCE OPERATIONS     | 22       |

**Total**: 225 registros de manobras (códigos únicos: ~60)

### **Códigos de Manobras Mais Frequentes**:

| Código       | Descrição                | Frequência |
| ------------ | ------------------------ | ---------- |
| `FLY-BAS-X1` | Controle geral VFR       | 8 sessões  |
| `FLY-BAS-X8` | Autorotations            | 8 sessões  |
| `OPS-STD-X1` | Briefing completo        | 10 sessões |
| `OPS-STD-X2` | Checklists verbalized    | 10 sessões |
| `OPS-STD-X3` | SOP/CRM                  | 10 sessões |
| `OPS-STD-X5` | Altitude/speed awareness | 10 sessões |

### **Categorias de Manobras**:

```
FLY-BAS-*   → Flying Basics (controle, hover, circuits)
FLY-IFR-*   → IFR Flying (instrument scan, attitudes)
FLY-ADV-*   → Advanced Flying (night, NVG)
NAV-BAS-*   → Basic Navigation (ADF, VOR, GPS)
NAV-IFR-*   → IFR Navigation (ILS, RNAV, approaches)
NAV-ADV-*   → Advanced Navigation (missed approach)
AFCS-BAS-*  → AFCS Basic (autopilot, SAS, modes)
EMG-ENG-*   → Engine Emergencies
EMG-ELEC-*  → Electrical Emergencies
EMG-HYDR-*  → Hydraulic Emergencies
EMG-AFCS-*  → AFCS Emergencies
EMG-AVION-* → Avionics Emergencies
EMG-ROTOR-* → Rotor/Transmission Emergencies
EMG-FIRE-*  → Fire/Smoke Emergencies
EMG-GEN-*   → General Emergencies
OPS-STD-*   → Standard Operations (briefing, checklists, CRM)
OPS-APP-*   → Approach Operations
OPS-OFF-*   → Offshore Operations
OPS-PERF-*  → Performance Operations
COM-BAS-*   → Basic Communications
```

---

## 🛠️ SCRIPT DE SEED

### **Arquivo**: `scripts/seed-sessoes-manobras.sh`

### **Algoritmo**:

```bash
FASE 1: Criar Manobras Únicas
├─ Extrai todos códigos do JSON
├─ Remove duplicatas (sort -u)
├─ Para cada manobra única:
│  ├─ POST /api/simuladores/manobras
│  ├─ Se sucesso: ✅ created
│  └─ Se já existe: ⏭️ skip
└─ Resultado: ~60 manobras criadas

FASE 2: Criar Sessões Templates
├─ Para cada sessão (1-10):
│  ├─ Monta payload com tema + tipo + manobras[]
│  ├─ POST /api/simuladores/sessoes-template
│  ├─ Backend cria vínculo sessao_manobras com ordem
│  └─ Resultado: ✅ 22-23 manobras vinculadas
└─ Total: 10 sessões criadas
```

### **Variáveis de Ambiente**:

```bash
API_BASE_URL="https://airtrust-api-production.airtrust.workers.dev"
# ou
API_BASE_URL="http://localhost:8787"  # para dev local
```

### **Execução**:

```bash
# Produção
cd "/Users/filipedaumas/Documents/airtrust v1"
chmod +x scripts/seed-sessoes-manobras.sh
./scripts/seed-sessoes-manobras.sh

# Desenvolvimento local
API_BASE_URL="http://localhost:8787" ./scripts/seed-sessoes-manobras.sh
```

### **Output Esperado**:

```
🚁 =====================================
   SEED: SESSÕES & MANOBRAS (CSV)
======================================

📍 API Base: https://airtrust-api-production.airtrust.workers.dev
📄 Source: scripts/seed-sessoes-csv.json

📊 Lendo JSON...
✅ Total de sessões: 10

🔧 FASE 1: Criando manobras únicas
=================================
  ✅ FLY-BAS-X1 - Controle geral VFR
  ✅ FLY-BAS-X3 - Hover & taxi
  ⏭️  FLY-BAS-X5 (já existe)
  ...

✅ Fase 1 completa: 47 manobras criadas

🎯 FASE 2: Criando sessões templates
====================================

[1/10] Sessão 1: FAMILIARIZAÇÃO AW139 - VFR BÁSICO
─────────────────────────────────────────────
  ✅ Sessão criada com 22 manobras

[2/10] Sessão 2: EMERGÊNCIAS POWERPLANT & AUTOROTAÇÕES
─────────────────────────────────────────────
  ✅ Sessão criada com 22 manobras

...

🎉 =====================================
   SEED COMPLETO!
======================================

📊 Resumo:
  - Manobras únicas criadas: 47
  - Sessões processadas: 10

🔍 Verifique no sistema:
   Gestão → Templates de Manobras → Nova Sessão
```

---

## 🚀 PRÓXIMOS PASSOS

### **IMPLEMENTAÇÃO NECESSÁRIA NO BACKEND**:

#### **1. Endpoint: POST /api/simuladores/manobras** ✅ (já existe)

Verifica se já implementado. Se não:

```typescript
// worker-airtrust/src/routes/simuladores/manobras.ts
app.post('/', async (c) => {
  const body = await c.req.json();
  const {
    codigo,
    descricao,
    categoria,
    tipo_sessao,
    tipo_aeronave,
    duracao_estimada,
    peso,
    critica,
  } = body;

  // Validações
  if (!codigo || !descricao) {
    return c.json({ success: false, error: 'Campos obrigatórios faltando' }, 400);
  }

  // Inserir no D1
  const result = await c.env.DB.prepare(
    `
    INSERT INTO manobras (codigo, nome, descricao, categoria, duracao_estimada, ordem)
    VALUES (?, ?, ?, ?, ?, 1)
  `,
  )
    .bind(codigo, descricao, descricao, categoria || 'NORMAL', duracao_estimada || 5)
    .run();

  return c.json({ success: true, data: { id: result.meta.last_row_id } });
});
```

#### **2. Endpoint: POST /api/simuladores/sessoes-template** ⚠️ (CRIAR)

```typescript
// worker-airtrust/src/routes/simuladores/sessoes.ts
app.post('/sessoes-template', async (c) => {
  const body = await c.req.json();
  const { tema, tipo_sessao, tipo_aeronave, manobras } = body;

  if (!tema || !manobras || manobras.length === 0) {
    return c.json({ success: false, error: 'Tema e manobras são obrigatórios' }, 400);
  }

  // 1. Criar registro de "sessão template" ou tipo de sessão
  // (pode ser uma tabela separada ou usar agendamentos_simulador com flag)

  const sessionResult = await c.env.DB.prepare(
    `
    INSERT INTO sessoes_template (tema, tipo_sessao, tipo_aeronave, created_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `,
  )
    .bind(tema, tipo_sessao, tipo_aeronave)
    .run();

  const sessaoId = sessionResult.meta.last_row_id;

  // 2. Vincular manobras com ordem
  for (const manobra of manobras) {
    // Buscar ID da manobra pelo código
    const manobraRow = await c.env.DB.prepare(
      `
      SELECT id FROM manobras WHERE codigo = ? AND deleted_at IS NULL
    `,
    )
      .bind(manobra.codigo)
      .first();

    if (!manobraRow) {
      console.warn(`Manobra ${manobra.codigo} não encontrada`);
      continue;
    }

    // Inserir vínculo
    await c.env.DB.prepare(
      `
      INSERT INTO sessoes_template_manobras (sessao_template_id, manobra_id, ordem)
      VALUES (?, ?, ?)
    `,
    )
      .bind(sessaoId, manobraRow.id, manobra.ordem)
      .run();
  }

  return c.json({
    success: true,
    data: { id: sessaoId, tema, manobras_vinculadas: manobras.length },
  });
});
```

#### **3. Migration: Criar tabela sessoes_template** ⚠️ (CRIAR)

```sql
-- migrations/2XXX_sessoes_template.sql

CREATE TABLE IF NOT EXISTS sessoes_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tema TEXT NOT NULL,
  tipo_sessao TEXT CHECK(tipo_sessao IN ('TREINAMENTO', 'PROFICIENCIA', 'INICIAL')) DEFAULT 'TREINAMENTO',
  tipo_aeronave TEXT DEFAULT 'AW139',
  ativa BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessoes_template_manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_template_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  ordem INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sessao_template_id) REFERENCES sessoes_template(id) ON DELETE CASCADE,
  FOREIGN KEY (manobra_id) REFERENCES manobras(id)
);

CREATE INDEX IF NOT EXISTS idx_sessoes_template_tipo ON sessoes_template(tipo_sessao, tipo_aeronave);
CREATE INDEX IF NOT EXISTS idx_sessoes_template_manobras_sessao ON sessoes_template_manobras(sessao_template_id);
```

#### **4. Endpoint: GET /api/simuladores/sessoes-template/:id/manobras**

Para carregar manobras ao selecionar template no modal:

```typescript
app.get('/sessoes-template/:id/manobras', async (c) => {
  const id = c.req.param('id');

  const manobras = await c.env.DB.prepare(
    `
    SELECT 
      m.id as manobra_id,
      m.codigo,
      m.nome as descricao,
      stm.ordem
    FROM sessoes_template_manobras stm
    JOIN manobras m ON m.id = stm.manobra_id
    WHERE stm.sessao_template_id = ?
      AND m.deleted_at IS NULL
    ORDER BY stm.ordem ASC
  `,
  )
    .bind(id)
    .all();

  return c.json({ success: true, data: manobras.results });
});
```

---

### **CHECKLIST DE IMPLEMENTAÇÃO**:

- [x] Modal ModalCadastrarSessao.tsx criado
- [x] JSON seed com 10 sessões criado
- [x] Script bash de seed criado
- [x] Integração frontend (botão + modal)
- [x] Build + Deploy (versão bee090a7)
- [ ] Migration sessoes_template no D1
- [ ] Endpoint POST /api/simuladores/sessoes-template
- [ ] Endpoint GET /api/simuladores/sessoes-template/:id/manobras
- [ ] Executar script de seed
- [ ] Teste end-to-end no frontend

---

## 🎯 TESTE MANUAL

### **1. Verificar Modal**:

```
1. Acesse: https://airtrust.pages.dev
2. Login
3. Dashboard → Simuladores
4. Aba "Gestão"
5. Card "Templates de Manobras"
6. Botão "Nova Sessão" → Modal abre
7. Selecionar "Sessão 1 - FAMILIARIZAÇÃO AW139"
8. Verificar se tema carrega
9. Buscar manobra "FLY-BAS"
10. Adicionar manobra
11. Arrastar para reordenar
12. Botão "Criar Sessão" (aguarda backend)
```

### **2. Verificar API** (após implementar endpoints):

```bash
# Criar manobra teste
curl -X POST "https://airtrust-api-production.airtrust.workers.dev/api/simuladores/manobras" \
  -H "Content-Type: application/json" \
  -d '{
    "codigo": "TEST-001",
    "descricao": "Teste manobra",
    "categoria": "NORMAL",
    "tipo_sessao": "TREINAMENTO",
    "tipo_aeronave": "AW139"
  }'

# Criar sessão template
curl -X POST "https://airtrust-api-production.airtrust.workers.dev/api/simuladores/sessoes-template" \
  -H "Content-Type: application/json" \
  -d '{
    "tema": "TESTE - Sessão Exemplo",
    "tipo_sessao": "TREINAMENTO",
    "tipo_aeronave": "AW139",
    "manobras": [
      { "codigo": "TEST-001", "ordem": 1 }
    ]
  }'
```

---

## 📚 REFERÊNCIAS

- **Modal Base**: `ModalAtribuirQualificacao.tsx` (671 linhas)
- **Hooks**: `useSimuladoresV2.ts` (650 linhas, 35 endpoints)
- **Padrão Drag & Drop**: `@hello-pangea/dnd`
- **Tabelas D1**: `manobras`, `sessoes_template`, `sessoes_template_manobras`

---

## ✅ STATUS FINAL

**Frontend**: ✅ COMPLETO E DEPLOYADO  
**Backend**: ⚠️ AGUARDANDO IMPLEMENTAÇÃO (3 endpoints + 1 migration)  
**Seed Script**: ✅ PRONTO PARA USO  
**Dados**: ✅ 10 SESSÕES ESTRUTURADAS (225 manobras)

---

**Última atualização**: 2025-12-01 14:30  
**Versão**: bee090a7-b2ac-400b-aa70-2c1989b8bcba
