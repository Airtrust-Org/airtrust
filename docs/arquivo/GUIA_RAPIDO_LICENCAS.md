# 🚀 GUIA RÁPIDO - MÓDULO DE LICENÇAS

## ⚡ Ação Imediata (2 minutos)

### Aplicar Migration no D1

1. **Acesse**: https://dash.cloudflare.com
2. **Navegue**: Workers & Pages → D1 → `airtrust-db`
3. **Console**: Aba "Console"
4. **Cole o SQL**:

```sql
CREATE TABLE IF NOT EXISTS licencas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  numero TEXT NOT NULL,
  data_emissao TEXT NOT NULL,
  data_vencimento TEXT NOT NULL,
  observacoes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_licencas_funcionario ON licencas(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_licencas_vencimento ON licencas(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_licencas_tipo ON licencas(tipo);
CREATE INDEX IF NOT EXISTS idx_licencas_deleted_at ON licencas(deleted_at);
```

5. **Execute** e aguarde confirmação

### Validar Instalação

```bash
curl -s 'https://airtrust.airtrust.workers.dev/api/licencas' | jq '.success'
# Deve retornar: true
```

---

## 📋 Endpoints Disponíveis

| Método | Endpoint                  | Descrição                                                        |
| ------ | ------------------------- | ---------------------------------------------------------------- |
| GET    | `/api/licencas`           | Lista com filtros (`?tipo=CMA&status=valida&funcionario_id=123`) |
| GET    | `/api/licencas/:id`       | Busca por ID                                                     |
| POST   | `/api/licencas`           | Criar nova licença                                               |
| PUT    | `/api/licencas/:id`       | Atualizar licença                                                |
| DELETE | `/api/licencas/:id`       | Soft delete                                                      |
| GET    | `/api/dashboard/licencas` | Métricas (total, válidas, a_vencer, vencidas)                    |

---

## 🎨 Como Usar no Frontend

### 1. Acessar Aba de Licenças

```
https://production.airtrust.pages.dev
Login → Qualificações → Aba "Licenças"
```

**Funcionalidades**:

- Dashboard com 4 cards (Total, Válidas, A Vencer, Vencidas)
- Filtros: Tipo (dropdown), Status (dropdown), Busca (texto)
- Tabela com status visual (badges coloridos)
- Ações: Adicionar, Editar, Excluir

### 2. Gerenciar Licenças de um Funcionário

```
Login → Funcionários → Abrir qualquer funcionário
Seção: "Licenças Ativas"
```

**Funcionalidades**:

- Ver todas as licenças do funcionário
- Status visual (Válida, A Vencer, Vencida)
- Adicionar nova licença
- Editar licença existente
- Excluir licença

---

## 🔧 Tipos de Licença

| Código | Nome                               |
| ------ | ---------------------------------- |
| CMA    | Certificado Médico Aeronáutico     |
| CANAC  | Código ANAC                        |
| CHT    | Certificado de Habilitação Técnica |
| PP     | Piloto Privado                     |
| PC     | Piloto Comercial                   |
| PLA    | Piloto de Linha Aérea              |
| IFR    | Instrumento                        |
| INVA   | Instrutor de Voo - Avião           |
| INVH   | Instrutor de Voo - Helicóptero     |
| MLTE   | Multi-Engine Land                  |
| MNTE   | Multi-Engine Night                 |
| OUTRO  | Outros                             |

---

## 📝 Criar Licença via API

```bash
curl -X POST https://airtrust.airtrust.workers.dev/api/licencas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "funcionario_id": "123",
    "tipo": "CMA",
    "numero": "CMA123456",
    "data_emissao": "2024-01-01",
    "data_vencimento": "2025-01-01",
    "observacoes": "Certificado Médico Classe 1"
  }'
```

---

## 📊 Status de Vencimento

| Status   | Condição             | Badge       |
| -------- | -------------------- | ----------- |
| Válida   | Vencimento > 60 dias | 🟢 Verde    |
| A Vencer | Vencimento 0-60 dias | 🟡 Amarelo  |
| Vencida  | Vencimento < hoje    | 🔴 Vermelho |

---

## 🛠️ Utilitários de Certificados

```typescript
import { gerarNomeCertificado } from '@/utils/certificadoNaming';

// Gerar nome padronizado
const nome = gerarNomeCertificado('00123', 'CRM', '2025-01-15');
// → "CERT-00123-CRM-20250115.pdf"

// Validar nome
import { validarNomeCertificado } from '@/utils/certificadoNaming';
const valido = validarNomeCertificado('CERT-00123-CRM-20250115.pdf');
// → true

// Extrair informações
import { extrairInfoCertificado } from '@/utils/certificadoNaming';
const info = extrairInfoCertificado('CERT-00123-CRM-20250115.pdf');
// → { matricula: "00123", codigo: "CRM", data: "2025-01-15" }
```

---

## 📚 Documentação Completa

| Arquivo                              | Descrição                   |
| ------------------------------------ | --------------------------- |
| `README_IMPLEMENTACAO_FINAL.md`      | Documento consolidado final |
| `LICENCAS_IMPLEMENTACAO_COMPLETA.md` | Relatório técnico detalhado |
| `CONCLUSAO_FINAL.md`                 | Resumo executivo            |
| `INSTALAR_LICENCAS.sh`               | Passo-a-passo interativo    |
| `finalizar-licencas.sh`              | Script automatizado         |

---

## 🚨 Troubleshooting

### Endpoint retorna `success: false`

**Causa**: Tabela `licencas` não existe no D1  
**Solução**: Aplicar migration (instruções acima)

### UI não carrega dados

**Causa**: Migration não aplicada  
**Solução**: Verificar migration no D1 Console

### Erro ao criar licença

**Causa**: Campos obrigatórios faltando  
**Solução**: Verificar `funcionario_id`, `tipo`, `numero`, `data_emissao`, `data_vencimento`

---

## ✅ Checklist Pós-Migration

- [ ] Migration aplicada no D1
- [ ] Endpoint `/api/licencas` retorna `success: true`
- [ ] Dashboard mostra métricas (mesmo que zeradas)
- [ ] Aba "Licenças" aparece em Qualificações
- [ ] Seção "Licenças Ativas" aparece em Modal Funcionário
- [ ] Possível criar nova licença
- [ ] Possível editar licença
- [ ] Possível excluir licença
- [ ] Status visual funciona corretamente

---

## 🎉 Pronto!

Após aplicar a migration, o sistema está **100% funcional** e pronto para uso em produção!

---

**Última atualização**: 18/11/2025 22:27  
**Versão**: 1.1.0  
**Worker**: c798f7a2  
**Pages**: a9bbc115
