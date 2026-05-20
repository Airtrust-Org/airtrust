# Ficha de Sessão - Modelo Exato (22 Manobras)

**Data:** 30/11/2025  
**Baseado em:** Screenshots fornecidas pelo usuário

## 📋 Estrutura da Ficha

### 🔝 Seção Superior (Header)

```
┌─────────────────────────────────────────────────────────────┐
│ Ficha de Treinamento de Voo                                 │
│ Sessão: 03/12 - SISTEMA ELÉTRICO & NOTURNO                  │
│                                                              │
│ Tripulante: Carlos José Salgueiro de Castro                 │
│ Código ANAC: 688929                                          │
│                                                              │
│ Instrutor: Rubens Negreiros Silva.                          │
│ Código ANAC: 876615                                          │
│                                                              │
│ Data: 22/12/2025                                             │
│ Horário: Início: 08:00 / Fim: 10:00                         │
│                                                              │
│ Função: SIC                                                  │
│ Simulador: Simulador AW139 - CAE GRU (AW139)                │
│ Carga Horária: 2:00h (PF: 1:00h) (PM: 1:00h)               │
└─────────────────────────────────────────────────────────────┘
```

**Campos Mapeados:**

- `colaborador_id_aluno` → Tripulante (nome + código ANAC)
- `instrutor_id` → Instrutor (nome + código ANAC)
- `tipo_sessao` → Tipo de sessão (ex: RECURRENT, CHECK, etc)
- `tipo_aeronave` → Modelo do simulador (ex: B737-800, AW139)
- `data_sessao` → Data
- `duracao_minutos` → Horário (calculado ou vinculado a agendamento)
- `simulador_id` → Simulador usado (JOIN com tabela simuladores)

---

## 📊 Seção Central - Itens Avaliados (22 Manobras)

### Layout de 2 Colunas (11 + 11)

```
┌──────────────────────────────┬──────────────────────────────┐
│ COLUNA ESQUERDA (ordem 1-11) │ COLUNA DIREITA (ordem 12-22) │
├──────────────────────────────┼──────────────────────────────┤
│ 1. Dual DC GEN failure       │ 12. Circuito de tráfego      │
│    WAR-GEN-11            [4] │     OPS-NRM-X3           [8] │
│                              │                              │
│ 2. Main battery overheat     │ 13. Engine failure           │
│    WAR-BAT-14           [3.7]│     WAR-OUT-15           [8] │
│                              │                              │
│ 3. Aux battery overheat      │ 14. Autorrotação (entry+abor)│
│    WAR-AUX-14            [3] │     FLY-BAS-77           [8] │
│                              │                              │
│ 4. Single DC GEN failure     │ 15. Fuel low                 │
│    CAU-DCG-53           [3.7]│     CAU-FUG-73           [8] │
│                              │                              │
│ 5. Battery offline           │ 16. Rotor RPM low            │
│    CAU-BOF-55           [7.8]│     WAR-LOW-29           [9] │
│                              │                              │
│ 6. DC bus failure            │ 17. Rotor RPM high           │
│    CAU-DCB-56            [8] │     WAR-HIG-29           [9] │
│                              │                              │
│ 7. AC bus failure            │ 18. Hot start                │
│    CAU-ACB-57            [8] │     CAU-HOT-05           [9] │
│                              │                              │
│ 8. 28V DC failure            │ 19. OEI limit timer          │
│    CAU-28D-58            [8] │     CAU-LIC-60           [9] │
│                              │                              │
│ 9. Controle geral VFR        │ 20. Landing gear emergency   │
│    FLY-BAS-X1            [8] │     WAR-GER-27           [9] │
│                              │                              │
│ 10. Hover & taxi             │ 21. Hydraulic pressure low   │
│     FLY-BAS-X3           [8] │     CAU-HYD-77           [9] │
│                              │                              │
│ 11. Decolagens & pousos      │ 22. Procedimentos normais    │
│     OPS-NRM-X2           [8] │     OPS-NRM-X1           [9] │
└──────────────────────────────┴──────────────────────────────┘
```

**Campos Mapeados (fichas_sessao_manobras):**

- `codigo` → Código da manobra (ex: WAR-GEN-11)
- `descricao` → Descrição (ex: "Dual DC GEN failure")
- `categoria` → Categoria (ex: WAR, CAU, FLY, OPS)
- `ordem` → Posição (1-11 = esquerda, 12-22 = direita)
- `resultado` → Nota/Score (ex: 4, 8, 9)
- `observacoes` → Observações específicas por manobra

**Sistema de Scoring Visual:**

- 🔴 Vermelho: 1-5 (abaixo da média)
- 🟠 Laranja: 6-7 (satisfatório)
- 🟢 Verde: 8-10 (excelente)

---

## 📝 Seção Inferior - Observações e Assinaturas

```
┌─────────────────────────────────────────────────────────────┐
│ 📝 Observações Gerais                                        │
│                                                              │
│ A sessão foi muito boa. Parabéns!                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────────┬──────────────────────────────────┐
│ 👤 Tripulante            │ 👨‍✈️ Instrutor                      │
│                          │                                  │
│ Carlos José Salgueiro de │ Rubens Negreiros Silva.          │
│ Castro                   │                                  │
│                          │                                  │
│ ⏳ Aguardando assinatura │ ✅ Assinado digitalmente         │
│                          │ 26/10/2025, 21:23:44             │
│                          │                                  │
│ [Botão Assinar]          │ [Status: Assinado]               │
└──────────────────────────┴──────────────────────────────────┘

[Botão: ⬅️ Voltar aos Simuladores]  [Botão: 📄 Gerar PDF]
```

**Campos Mapeados:**

- `observacoes` → Observações gerais da ficha
- `status` → Estado do workflow:
  - `EM_PREENCHIMENTO` → Aguardando preenchimento
  - `ASSINADA_ALUNO` → Tripulante assinou (aguarda instrutor)
  - `ASSINADA_TOTAL` → Ambos assinaram (completo)
- `assinatura_aluno_ip` → IP do tripulante (auditoria)
- `assinatura_aluno_timestamp` → Data/hora assinatura aluno
- `assinatura_instrutor_ip` → IP do instrutor (auditoria)
- `assinatura_instrutor_timestamp` → Data/hora assinatura instrutor
- `aprovado` → 0 (reprovado) ou 1 (aprovado)
- `resultado_final` → APROVADO / REPROVADO
- `nota_final` → Média das 22 manobras (calculado)

---

## 🔄 Workflow de Assinatura

```
1. EM_PREENCHIMENTO
   ↓ Instrutor preenche 22 manobras
   ↓ Adiciona observações gerais

2. POST /fichas/:id/assinar { "tipo": "ALUNO" }
   → Status: ASSINADA_ALUNO
   → Registra IP + timestamp do aluno

3. POST /fichas/:id/assinar { "tipo": "INSTRUTOR" }
   → Status: ASSINADA_TOTAL
   → Registra IP + timestamp do instrutor
   → Ficha bloqueada para edição

4. POST /fichas-simulador/:id/gerar-qualificacao
   → Valida: status=ASSINADA_TOTAL + aprovado=1
   → Gera registro em qualificacoes_historico
   → Validade: +1 ano
```

---

## 🎯 Regras de Negócio - 22 Manobras

### ✅ Validações Implementadas

1. **Quantidade Exata:**

   - `POST /fichas-simulador/:id/popular-manobras`
   - Busca: `LIMIT 22` do `cadastro_manobras`
   - Rejeita se < 22 manobras disponíveis no catálogo
   - Renumera ordem: 1-22 (ignora ordem original do catálogo)

2. **Layout de Colunas:**

   - **Ordem 1-11:** Coluna esquerda
   - **Ordem 12-22:** Coluna direita
   - Frontend usa CSS Grid 2 colunas × 11 linhas

3. **Catálogo de Manobras:**
   - `cadastro_manobras` deve ter ≥22 manobras por combinação:
     - `tipo_sessao` (ex: RECURRENT)
     - `tipo_aeronave` (ex: B737-800)
   - Ordenado por `ordem` crescente

### 📊 Estrutura de Dados

**Tabela: fichas_sessao**

```sql
CREATE TABLE fichas_sessao (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  agendamento_slot_id INTEGER,
  colaborador_id_aluno INTEGER NOT NULL,
  instrutor_id INTEGER,
  tipo_sessao TEXT NOT NULL,
  tipo_aeronave TEXT,
  status TEXT DEFAULT 'EM_PREENCHIMENTO',
  resultado_final TEXT,
  nota_final REAL,
  aprovado INTEGER DEFAULT 0,
  assinatura_aluno_ip TEXT,
  assinatura_aluno_timestamp TEXT,
  assinatura_instrutor_ip TEXT,
  assinatura_instrutor_timestamp TEXT,
  data_sessao TEXT,
  observacoes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
```

**Tabela: fichas_sessao_manobras**

```sql
CREATE TABLE fichas_sessao_manobras (
  id INTEGER PRIMARY KEY,
  ficha_id INTEGER NOT NULL REFERENCES fichas_sessao(id),
  codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  categoria TEXT,
  ordem INTEGER NOT NULL,      -- 1-11 (esquerda) | 12-22 (direita)
  resultado REAL,              -- Score 0-10
  observacoes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
```

---

## 🧪 Teste Completo do Workflow

```bash
# 1. Criar ficha
curl -X POST https://airtrust-api-production.airtrust.workers.dev/api/simuladores/fichas \
  -H "Content-Type: application/json" \
  -d '{
    "colaborador_id_aluno": 1,
    "instrutor_id": 2,
    "tipo_sessao": "RECURRENT",
    "tipo_aeronave": "B737-800",
    "aprovado": 1
  }'
# → {"success":true,"id":18,"status":"EM_PREENCHIMENTO"}

# 2. Popular 22 manobras
curl -X POST https://airtrust-api-production.airtrust.workers.dev/api/simuladores/fichas-simulador/18/popular-manobras
# → {"success":true,"message":"22 manobras populadas (11 esquerda + 11 direita)","total":22,"layout":"11 manobras por coluna"}

# 3. Preencher manobras (exemplo: atualizar resultado da manobra 1)
curl -X PUT https://airtrust-api-production.airtrust.workers.dev/api/simuladores/fichas-simulador/18/manobras/1 \
  -d '{"resultado":8,"observacoes":"Ótimo desempenho"}'

# 4. Assinar como ALUNO
curl -X POST https://airtrust-api-production.airtrust.workers.dev/api/simuladores/fichas/18/assinar \
  -d '{"tipo":"ALUNO"}'
# → {"success":true,"status":"ASSINADA_ALUNO"}

# 5. Assinar como INSTRUTOR
curl -X POST https://airtrust-api-production.airtrust.workers.dev/api/simuladores/fichas/18/assinar \
  -d '{"tipo":"INSTRUTOR"}'
# → {"success":true,"status":"ASSINADA_TOTAL"}

# 6. Gerar qualificação
curl -X POST https://airtrust-api-production.airtrust.workers.dev/api/simuladores/fichas-simulador/18/gerar-qualificacao
# → {"success":true,"message":"Qualificação gerada","data":{"qualificacao_id":3846,"funcionario":"...","valida_ate":"2026-11-30"}}
```

---

## 📚 Endpoints Relacionados

| Endpoint                                   | Método | Descrição                              |
| ------------------------------------------ | ------ | -------------------------------------- |
| `/fichas`                                  | POST   | Criar nova ficha                       |
| `/fichas/:id`                              | GET    | Detalhes da ficha                      |
| `/fichas/:id`                              | PUT    | Atualizar ficha                        |
| `/fichas-simulador/:id/popular-manobras`   | POST   | Popular 22 manobras automáticas        |
| `/fichas-simulador/:id/manobras`           | GET    | Listar 22 manobras da ficha            |
| `/fichas-simulador/:id/manobras/:mid`      | PUT    | Atualizar resultado individual         |
| `/fichas/:id/assinar`                      | POST   | Assinar digitalmente (ALUNO/INSTRUTOR) |
| `/fichas-simulador/:id/gerar-qualificacao` | POST   | Gerar qualificação após aprovação      |

---

## ✅ Status de Implementação

- ✅ Endpoint `popular-manobras` limitado a 22 manobras
- ✅ Renumeração forçada 1-22 (ordem consistente)
- ✅ Validação: rejeita se catálogo tem <22 manobras
- ✅ Response inclui `layout: "11 manobras por coluna"`
- ✅ Workflow de assinaturas com auditoria (IP + timestamp)
- ✅ Geração de qualificação automática (+1 ano)
- 🔄 Frontend: Ajustar SimuladoresV2.tsx para layout 2 colunas
- 🔄 Frontend: Modal Preencher Ficha com 22 manobras (11+11)
- 🔄 Frontend: Modal Assinar com checkboxes de aceite

---

**Última Atualização:** 30/11/2025  
**Versão da API:** 71814a25-5df0-4629-9e00-c8658c9eb123  
**Arquivo de Implementação:** `worker-airtrust/src/routes/simuladores.ts` (linha 140-180)
